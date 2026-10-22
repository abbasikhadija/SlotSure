import { DateTime } from 'luxon';
import { withScheduleLock } from '../db/schedule-transaction.js';
import { HttpError } from '../http-error.js';
import { SLOT_MINUTES } from './slots.js';

function bookingId(value) {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    throw new HttpError(400, 'INVALID_ID', 'Choose a valid booking reference.');
  return value;
}

export function createBookingManagement({
  pool,
  timeZone,
  now = () => DateTime.utc(),
}) {
  function present(row, current, consultant = false) {
    return {
      id: row.id,
      reference: `SS-${row.id.padStart(6, '0')}`,
      consultantName: row.consultant_name,
      startsAt: row.starts_at.toISOString(),
      endsAt: DateTime.fromJSDate(row.starts_at)
        .plus({ minutes: SLOT_MINUTES })
        .toUTC()
        .toISO(),
      durationMinutes: SLOT_MINUTES,
      timeZone,
      status: row.status,
      canceledAt: row.canceled_at?.toISOString() ?? null,
      canCancel:
        row.status === 'confirmed' &&
        row.starts_at.getTime() > current.toMillis(),
      ...(consultant
        ? { customer: { name: row.customer_name, email: row.customer_email } }
        : {}),
    };
  }
  return {
    async list(user, query) {
      const { view = 'upcoming', page = '1' } = query;
      if (
        Object.keys(query).some((key) => !['view', 'page'].includes(key)) ||
        !['upcoming', 'history'].includes(view) ||
        typeof page !== 'string' ||
        !/^[1-9]\d{0,3}$/.test(page)
      )
        throw new HttpError(
          400,
          'INVALID_QUERY',
          'Choose upcoming or history and a page from 1 to 9999.',
        );
      const current = now();
      const consultant = user.role === 'consultant';
      // Only fixed, validated SQL fragments are interpolated. Values remain parameters.
      const condition =
        view === 'upcoming'
          ? "b.status='confirmed' AND b.starts_at > $1"
          : "(b.status='canceled' OR b.starts_at <= $1)";
      const direction = view === 'upcoming' ? 'ASC' : 'DESC';
      const { rows } = await pool.query(
        `SELECT b.id,b.starts_at,b.status,b.canceled_at,
          provider.name AS consultant_name${consultant ? ',customer.name AS customer_name,customer.email AS customer_email' : ''}
         FROM bookings b CROSS JOIN users provider
         ${consultant ? 'JOIN users customer ON customer.id=b.customer_id' : ''}
         WHERE provider.role='consultant' AND ${condition}
           AND ($2::bigint IS NULL OR b.customer_id=$2)
         ORDER BY b.starts_at ${direction},b.id ${direction} LIMIT 51 OFFSET $3`,
        [
          current.toUTC().toISO(),
          consultant ? null : user.id,
          (Number(page) - 1) * 50,
        ],
      );
      return {
        bookings: rows
          .slice(0, 50)
          .map((row) => present(row, current, consultant)),
        view,
        page: Number(page),
        hasMore: rows.length > 50,
        timeZone,
      };
    },
    async cancel(actorId, id, body) {
      bookingId(id);
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length
      )
        throw new HttpError(
          400,
          'INVALID_BODY',
          'Send an empty JSON object to cancel.',
        );
      return withScheduleLock(pool, async (client, consultant) => {
        const { rows: actors } = await client.query(
          'SELECT role FROM users WHERE id=$1',
          [actorId],
        );
        if (!actors.length)
          throw new HttpError(
            401,
            'AUTH_REQUIRED',
            'Please sign in to continue.',
          );
        const { rows } = await client.query(
          `SELECT id,customer_id,starts_at,status,canceled_at FROM bookings
           WHERE id=$1 AND ($2::boolean OR customer_id=$3)`,
          [id, actors[0].role === 'consultant', actorId],
        );
        if (!rows.length)
          throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
        const row = rows[0];
        const current = now();
        // Repeated cancellation preserves the first timestamp, including after the start.
        if (row.status === 'confirmed') {
          if (row.starts_at.getTime() <= current.toMillis())
            throw new HttpError(
              409,
              'BOOKING_STARTED',
              'Past or started appointments cannot be canceled.',
            );
          const { rows: updated } = await client.query(
            `UPDATE bookings SET status='canceled',canceled_at=GREATEST(clock_timestamp(),created_at)
             WHERE id=$1 RETURNING id,starts_at,status,canceled_at`,
            [id],
          );
          Object.assign(row, updated[0]);
        }
        return {
          booking: present(
            { ...row, consultant_name: consultant.name },
            current,
          ),
        };
      });
    },
  };
}
