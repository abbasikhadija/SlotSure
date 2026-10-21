import { DateTime } from 'luxon';
import { HttpError } from '../http-error.js';
import { withScheduleLock } from '../db/schedule-transaction.js';
import {
  bookingWindow,
  requestedDay,
  generateSlots,
  validateHours,
  parseSlot,
  fitsHours,
  overlaps,
  SLOT_MINUTES,
} from './slots.js';

function serializeHours(hours) {
  return hours.map((rule) => ({
    weekday: rule.weekday,
    startTime: rule.startTime.slice(0, 5),
    endTime: rule.endTime.slice(0, 5),
  }));
}

async function hoursState(db, timeZone, now) {
  const { rows } = await db.query(
    `SELECT
    COALESCE((SELECT json_agg(h ORDER BY weekday) FROM
      (SELECT weekday, start_time::text AS "startTime", end_time::text AS "endTime" FROM weekly_hours) h), '[]'::json) AS hours,
    ARRAY(SELECT starts_at FROM bookings WHERE status='confirmed' AND starts_at > $1) AS appointments`,
    [now.toUTC().toISO()],
  );
  const hours = serializeHours(rows[0].hours);
  const outsideHoursCount = rows[0].appointments.filter((value) => {
    const start = DateTime.fromJSDate(value, { zone: timeZone });
    return !fitsHours(
      start,
      hours.find((rule) => rule.weekday === start.weekday),
    );
  }).length;
  return { timeZone, hours, outsideHoursCount };
}

async function dayState(db, day) {
  // A single statement sees one PostgreSQL snapshot; no per-slot queries.
  const { rows } = await db.query(
    `SELECT
    (SELECT row_to_json(h) FROM (SELECT weekday, start_time::text AS "startTime", end_time::text AS "endTime"
      FROM weekly_hours WHERE weekday=$1) h) AS hours,
    ARRAY(SELECT starts_at FROM blocked_slots WHERE starts_at >= $2::timestamptz - interval '30 minutes' AND starts_at < $3) AS blocked,
    ARRAY(SELECT starts_at FROM bookings WHERE status='confirmed' AND starts_at >= $2::timestamptz - interval '30 minutes' AND starts_at < $3) AS booked`,
    [day.weekday, day.toUTC().toISO(), day.plus({ days: 1 }).toUTC().toISO()],
  );
  return rows[0];
}

export function createAvailabilityService({
  pool,
  timeZone,
  now = () => DateTime.utc(),
}) {
  return {
    async availability(date) {
      const at = now();
      const window = bookingWindow(at, timeZone);
      // Missing date selects today, allowing the UI to obtain server-side bounds.
      const day = requestedDay(
        date === undefined ? window.minDate : date,
        timeZone,
        at,
      );
      const state = await dayState(pool, day);
      return {
        date: day.toISODate(),
        timeZone,
        minDate: window.minDate,
        maxDate: window.maxDate,
        durationMinutes: SLOT_MINUTES,
        slots: generateSlots(day, state.hours, at, [
          ...state.blocked,
          ...state.booked,
        ]),
      };
    },
    getHours() {
      return hoursState(pool, timeZone, now());
    },
    async setHours(body) {
      const hours = validateHours(body);
      return withScheduleLock(pool, async (client) => {
        await client.query('DELETE FROM weekly_hours');
        // At most seven writes, one per weekly rule (never one query per slot).
        for (const rule of hours)
          await client.query(
            'INSERT INTO weekly_hours (weekday,start_time,end_time) VALUES ($1,$2,$3)',
            [rule.weekday, rule.startTime, rule.endTime],
          );
        return hoursState(client, timeZone, now());
      });
    },
    async getBlocks() {
      const at = now();
      const window = bookingWindow(at, timeZone);
      const today = DateTime.fromISO(window.minDate, { zone: timeZone });
      const { rows } = await pool.query(
        'SELECT id, starts_at FROM blocked_slots WHERE starts_at >= $1 AND starts_at < $2 ORDER BY starts_at',
        [today.toUTC().toISO(), window.end.toUTC().toISO()],
      );
      return {
        timeZone,
        blocks: rows.map((row) => ({
          id: row.id,
          startsAt: row.starts_at.toISOString(),
        })),
      };
    },
    async block(body) {
      return withScheduleLock(pool, async (client) => {
        // Time/window and schedule checks happen after waiting for the lock.
        const start = parseSlot(body, timeZone, now());
        const state = await dayState(client, start.startOf('day'));
        if (overlaps(start, state.booked))
          throw new HttpError(
            409,
            'BOOKING_CONFLICT',
            'This appointment is already booked. Existing reservations were not changed.',
          );
        if (overlaps(start, state.blocked))
          throw new HttpError(
            409,
            'BLOCK_CONFLICT',
            'This appointment is already blocked.',
          );
        if (!fitsHours(start, state.hours))
          throw new HttpError(
            400,
            'OUTSIDE_HOURS',
            'Choose an appointment within the current working hours.',
          );
        const { rows } = await client.query(
          'INSERT INTO blocked_slots (starts_at) VALUES ($1) RETURNING id, starts_at',
          [start.toUTC().toISO()],
        );
        return {
          block: { id: rows[0].id, startsAt: rows[0].starts_at.toISOString() },
        };
      });
    },
    async unblock(id) {
      if (
        typeof id !== 'string' ||
        !/^[1-9]\d{0,18}$/.test(id) ||
        BigInt(id) > 9223372036854775807n
      )
        throw new HttpError(
          400,
          'INVALID_ID',
          'Choose a valid blocked appointment.',
        );
      return withScheduleLock(pool, async (client) => {
        const { rowCount } = await client.query(
          'DELETE FROM blocked_slots WHERE id=$1',
          [id],
        );
        if (!rowCount)
          throw new HttpError(
            404,
            'BLOCK_NOT_FOUND',
            'This blocked appointment no longer exists.',
          );
        return { message: 'Appointment unblocked.' };
      });
    },
  };
}
