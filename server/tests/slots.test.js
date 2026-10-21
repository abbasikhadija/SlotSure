import assert from 'node:assert/strict';
import test from 'node:test';
import { DateTime } from 'luxon';
import {
  bookingWindow,
  requestedDay,
  generateSlots,
  validateHours,
  parseSlot,
  fitsHours,
} from '../src/services/slots.js';

const zone = 'Asia/Karachi';
const at = DateTime.fromISO('2026-10-22T09:00:00', { zone });
const day = requestedDay('2026-10-22', zone, at);
const rule = { weekday: day.weekday, startTime: '09:00', endTime: '11:00' };

test('date parsing, consultant-local boundaries, past exclusion, and last booking date', () => {
  assert.deepEqual(bookingWindow(at, zone).minDate, '2026-10-22');
  assert.equal(bookingWindow(at, zone).maxDate, '2026-11-04');
  for (const value of [
    '',
    null,
    [],
    '2026-02-30',
    '2026-10-22T00:00Z',
    '2026-10-21',
    '2026-11-05',
  ])
    assert.throws(() => requestedDay(value, zone, at), { status: 400 });
  assert.equal(requestedDay('2026-11-04', zone, at).toISODate(), '2026-11-04');
  const slots = generateSlots(day, rule, at);
  assert.equal(slots.length, 3);
  assert.equal(slots[0].startsAt, '2026-10-22T04:30:00.000Z');
  assert.equal(generateSlots(day, null, at).length, 0);
  const beforeMidnightUtc = DateTime.fromISO('2026-10-21T20:00:00Z');
  assert.equal(bookingWindow(beforeMidnightUtc, zone).minDate, '2026-10-22');
});

test('slots exclude overlapping occupied instants and stay exactly 30 elapsed minutes', () => {
  const slots = generateSlots(day, rule, at, ['2026-10-22T04:45:00Z']);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].startsAt, '2026-10-22T05:30:00.000Z');
  for (const slot of slots)
    assert.equal(
      Date.parse(slot.endsAt) - Date.parse(slot.startsAt),
      1_800_000,
    );
  assert.equal(fitsHours(day.set({ hour: 10, minute: 30 }), rule), true);
  assert.equal(fitsHours(day.set({ hour: 11 }), rule), false);
  assert.equal(fitsHours(day.set({ hour: 10, minute: 15 }), rule), false);
  assert.equal(
    fitsHours(day.set({ hour: 23, minute: 30 }), {
      ...rule,
      startTime: '23:30',
      endTime: '24:00',
    }),
    true,
  );
});

test('weekly hours reject duplicate days, overnight or off-grid intervals and unexpected fields', () => {
  assert.deepEqual(validateHours({ hours: [] }), []);
  assert.deepEqual(validateHours({ hours: [rule] }), [rule]);
  for (const body of [
    null,
    [],
    {},
    { hours: [rule, rule] },
    { hours: [{ ...rule, weekday: 0 }] },
    { hours: [{ ...rule, startTime: '09:15' }] },
    { hours: [{ ...rule, startTime: '11:00' }] },
    { hours: [{ ...rule, endTime: '08:00' }] },
    { hours: [{ ...rule, endTime: '11:00:00' }] },
    { hours: [rule], extra: true },
  ])
    assert.throws(() => validateHours(body), { status: 400 });
});

test('slot instants need an explicit offset, consultant-local grid, and a future date', () => {
  assert.equal(
    parseSlot({ startsAt: '2026-10-22T09:30:00+05:00' }, zone, at).hour,
    9,
  );
  for (const startsAt of [
    '2026-10-22T09:30:00',
    '2026-10-22T04:30:01Z',
    '2026-10-22T04:30:00.001Z',
    '2026-10-22T04:15:00Z',
    '2026-10-22T04:00:00Z',
    '2026-11-05T04:30:00Z',
    'invalid',
  ])
    assert.throws(() => parseSlot({ startsAt }, zone, at), { status: 400 });
  // Kathmandu's 45-minute offset means a local grid does not equal a UTC grid.
  const kathmandu = parseSlot(
    { startsAt: '2026-10-22T04:15:00Z' },
    'Asia/Kathmandu',
    at,
  );
  assert.equal(kathmandu.hour, 10);
  assert.equal(kathmandu.minute, 0);
});

test('DST spring gap has no nonexistent times and autumn repeats have distinct instants', () => {
  const zone = 'America/New_York';
  for (const [date, count] of [
    ['2026-03-08', 6],
    ['2026-11-01', 10],
  ]) {
    const start = DateTime.fromISO(date, { zone });
    const slots = generateSlots(
      start,
      { weekday: 7, startTime: '00:00', endTime: '04:00' },
      start.minus({ days: 1 }),
    );
    assert.equal(slots.length, count);
    assert.equal(new Set(slots.map((slot) => slot.startsAt)).size, count);
    for (const slot of slots)
      assert.equal(
        Date.parse(slot.endsAt) - Date.parse(slot.startsAt),
        1_800_000,
      );
    const labels = slots.map((slot) =>
      DateTime.fromISO(slot.startsAt, { zone }).toFormat('HH:mm'),
    );
    if (date.includes('03-08'))
      assert.equal(
        labels.some((label) => label.startsWith('02:')),
        false,
      );
    else assert.equal(labels.filter((label) => label === '01:30').length, 2);
  }
});
