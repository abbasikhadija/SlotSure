import { DateTime } from 'luxon';
import { HttpError } from '../http-error.js';

export const SLOT_MINUTES = 30;

export function bookingWindow(now, timeZone) {
  const today = now.setZone(timeZone).startOf('day');
  return {
    minDate: today.toISODate(),
    maxDate: today.plus({ days: 13 }).toISODate(),
    end: today.plus({ days: 14 }),
  };
}

export function requestedDay(date, timeZone, now) {
  const day =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? DateTime.fromISO(date, { zone: timeZone }).startOf('day')
      : null;
  if (!day?.isValid || day.toISODate() !== date)
    throw new HttpError(
      400,
      'INVALID_DATE',
      'Choose a valid date in YYYY-MM-DD format.',
    );
  const { minDate, maxDate } = bookingWindow(now, timeZone);
  if (date < minDate || date > maxDate)
    throw new HttpError(
      400,
      'OUTSIDE_WINDOW',
      'Choose a date from today through 13 days ahead in the consultant’s time zone.',
    );
  return day;
}

const minuteOfDay = (date) => date.hour * 60 + date.minute;
const timeMinutes = (time) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function fitsHours(start, hours) {
  if (
    !hours ||
    start.weekday !== hours.weekday ||
    start.minute % 30 ||
    start.second ||
    start.millisecond
  )
    return false;
  const last = start.plus({ minutes: SLOT_MINUTES }).minus({ milliseconds: 1 });
  const min = timeMinutes(hours.startTime);
  const max = timeMinutes(hours.endTime);
  // Half-open intervals allow a slot ending at midnight. Checking the final
  // occupied instant also handles slots ending exactly at a DST transition.
  return (
    last.toISODate() === start.toISODate() &&
    minuteOfDay(start) >= min &&
    minuteOfDay(start) < max &&
    minuteOfDay(last) >= min &&
    minuteOfDay(last) < max
  );
}

export function overlaps(start, occupied) {
  const first = start.toMillis();
  const end = start.plus({ minutes: SLOT_MINUTES }).toMillis();
  return occupied.some((value) => {
    const other = new Date(value).getTime();
    return first < other + SLOT_MINUTES * 60_000 && other < end;
  });
}

export function generateSlots(day, hours, now, occupied = []) {
  const slots = [];
  const end = day.plus({ days: 1 });
  // Walk real instants: spring gaps never appear; repeated autumn times retain
  // distinct UTC instants. Candidate work is bounded to one local calendar day.
  for (
    let start = day;
    start < end;
    start = start.plus({ minutes: SLOT_MINUTES })
  ) {
    if (start <= now || !fitsHours(start, hours) || overlaps(start, occupied))
      continue;
    slots.push({
      startsAt: start.toUTC().toISO(),
      endsAt: start.plus({ minutes: SLOT_MINUTES }).toUTC().toISO(),
    });
  }
  return slots;
}

export function validateHours(body) {
  if (
    !body ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== 'hours') ||
    !Array.isArray(body.hours) ||
    body.hours.length > 7
  ) {
    throw new HttpError(
      400,
      'INVALID_HOURS',
      'Provide up to seven weekly working intervals.',
    );
  }
  const seen = new Set();
  for (const rule of body.hours) {
    if (
      !rule ||
      Array.isArray(rule) ||
      Object.keys(rule).some(
        (key) => !['weekday', 'startTime', 'endTime'].includes(key),
      ) ||
      !Number.isInteger(rule.weekday) ||
      rule.weekday < 1 ||
      rule.weekday > 7 ||
      seen.has(rule.weekday) ||
      typeof rule.startTime !== 'string' ||
      !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(rule.startTime) ||
      typeof rule.endTime !== 'string' ||
      !/^(?:(?:[01]\d|2[0-3]):(?:00|30)|24:00)$/.test(rule.endTime) ||
      rule.startTime >= rule.endTime
    ) {
      throw new HttpError(
        400,
        'INVALID_HOURS',
        'Use one interval per weekday (1–7), with half-hour boundaries and an end after the start.',
      );
    }
    seen.add(rule.weekday);
  }
  return body.hours;
}

export function parseSlot(body, timeZone, now) {
  const value = body?.startsAt;
  if (
    !body ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== 'startsAt') ||
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    throw new HttpError(
      400,
      'INVALID_SLOT',
      'Provide an appointment instant with an explicit UTC offset.',
    );
  }
  const start = DateTime.fromISO(value, { setZone: true }).setZone(timeZone);
  if (!start.isValid || start.minute % 30 || start.second || start.millisecond)
    throw new HttpError(
      400,
      'INVALID_SLOT',
      'Choose an aligned 30-minute appointment time.',
    );
  requestedDay(start.toISODate(), timeZone, now);
  if (start <= now)
    throw new HttpError(400, 'PAST_SLOT', 'Choose a future appointment time.');
  return start;
}
