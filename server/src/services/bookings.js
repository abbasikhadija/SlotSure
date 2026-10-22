import { DateTime } from 'luxon';
import { withScheduleLock } from '../db/schedule-transaction.js';
import { HttpError } from '../http-error.js';
import { assertSlotAvailable } from './availability.js';
import { parseSlot, SLOT_MINUTES } from './slots.js';

export function createBookingService({
  pool,
  timeZone,
  now = () => DateTime.utc(),
}) {
  return {
    async book(customerId, body) {
      try {
        return await withScheduleLock(pool, async (client, consultant) => {
          const start = parseSlot(body, timeZone, now());
          const { rows: customers } = await client.query(
            "SELECT id FROM users WHERE id=$1 AND role='customer'",
            [customerId],
          );
          if (!customers.length)
            throw new HttpError(
              403,
              'FORBIDDEN',
              'A current customer account is required to book.',
            );
          await assertSlotAvailable(client, start);
          const { rows } = await client.query(
            `INSERT INTO bookings (customer_id, starts_at) VALUES ($1,$2)
             RETURNING id, starts_at, status`,
            [customerId, start.toUTC().toISO()],
          );
          const booking = rows[0];
          return {
            id: booking.id,
            reference: `SS-${booking.id.padStart(6, '0')}`,
            consultantName: consultant.name,
            startsAt: booking.starts_at.toISOString(),
            endsAt: start.plus({ minutes: SLOT_MINUTES }).toUTC().toISO(),
            durationMinutes: SLOT_MINUTES,
            timeZone,
            status: booking.status,
          };
        });
      } catch (error) {
        // The partial unique index remains a final safeguard, independent of
        // the shared lock protocol and the availability check above.
        if (
          error.code === '23505' &&
          error.constraint === 'one_confirmed_booking_per_time'
        ) {
          throw new HttpError(
            409,
            'BOOKING_CONFLICT',
            'This appointment is already booked. Choose another time.',
          );
        }
        if (
          error.code === '23503' &&
          error.constraint === 'bookings_customer_id_fkey'
        ) {
          throw new HttpError(
            401,
            'AUTH_REQUIRED',
            'Please sign in to continue.',
          );
        }
        throw error;
      }
    },
  };
}
