import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { DateTime } from 'luxon';
import argon2 from 'argon2';
import pg from 'pg';
import { migrate } from '../src/db/migrate.js';
import { seedConsultant } from '../src/db/seed-consultant.js';
import { createBookingService } from '../src/services/bookings.js';
import { createApp } from '../src/app.js';
import { readAuthConfig } from '../src/config.js';

test(
  'booking correctness and authenticated HTTP races with real PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.match(url.pathname, /_test$/);
    const schema = `bookings_${process.pid}_${Date.now()}`;
    const admin = new pg.Pool({
      connectionString: url.href,
      connectionTimeoutMillis: 5000,
    });
    const timeZone = 'Asia/Karachi';
    const tomorrow = DateTime.utc()
      .setZone(timeZone)
      .startOf('day')
      .plus({ days: 1 });
    const instant = (hour, minute = 0) =>
      tomorrow.set({ hour, minute }).toUTC().toISO();
    const password = randomBytes(24).toString('hex');
    const week = Array.from({ length: 7 }, (_, i) => ({
      weekday: i + 1,
      startTime: '09:00',
      endTime: '18:00',
    }));
    const config = {
      ...readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex') }),
      timeZone,
    };
    let pool, app, server, base, firstId, secondId;
    async function request(
      path,
      { method = 'GET', body, cookie = '', token = '' } = {},
    ) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Cookie: cookie,
          ...(method === 'GET'
            ? {}
            : {
                'Content-Type': 'application/json',
                'X-CSRF-Token': token,
                Origin: config.appOrigin,
              }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return {
        status: response.status,
        data: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    async function session(email) {
      const csrf = await request('/api/auth/csrf');
      const result = await request('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        cookie: csrf.cookie,
        token: csrf.data.csrfToken,
      });
      assert.equal(result.status, 200);
      return { cookie: result.cookie, token: result.data.csrfToken };
    }
    const book = (account, startsAt, extra = {}) =>
      request('/api/bookings', {
        ...account,
        method: 'POST',
        body: { startsAt, ...extra },
      });
    async function occupancy(startsAt) {
      return (
        await pool.query(
          `SELECT
      (SELECT count(*)::int FROM bookings WHERE starts_at=$1 AND status='confirmed') AS bookings,
      (SELECT count(*)::int FROM blocked_slots WHERE starts_at=$1) AS blocks,
      (SELECT count(*)::int FROM bookings WHERE starts_at=$1) AS total`,
          [startsAt],
        )
      ).rows[0];
    }
    async function waitForWriters(count) {
      const deadline = Date.now() + 3000;
      let waiting;
      do {
        waiting = (
          await pool.query(
            `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE application_name=$1 AND state='active' AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'`,
            [schema],
          )
        ).rows[0].n;
        if (waiting >= count) return;
        await setTimeout(10);
      } while (Date.now() < deadline);
      assert.fail(
        `Expected ${count} real row-lock waiters; observed ${waiting}`,
      );
    }
    // Queue requests behind a real row lock, observe that both reached PostgreSQL,
    // then release them together. No in-memory simulation of the booking race.
    async function race(jobs) {
      const holder = await pool.connect();
      let pending;
      try {
        await holder.query('BEGIN');
        await holder.query(
          "SELECT id FROM users WHERE role='consultant' FOR UPDATE",
        );
        pending = Promise.allSettled(jobs.map((job) => job()));
        await waitForWriters(jobs.length);
        await holder.query('COMMIT');
        const results = await pending;
        for (const result of results) assert.equal(result.status, 'fulfilled');
        return results.map((result) => result.value);
      } finally {
        await holder.query('ROLLBACK');
        holder.release();
        if (pending) await pending;
      }
    }
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      pool = new pg.Pool({
        connectionString: url.href,
        options: `-c search_path=${schema}`,
        application_name: schema,
        max: 8,
        connectionTimeoutMillis: 5000,
        statement_timeout: 5000,
      });
      await migrate(pool);
      const hash = await argon2.hash(password);
      await seedConsultant(pool, {
        name: 'Demo Consultant',
        email: 'consultant@example.test',
        passwordHash: hash,
      });
      for (const email of ['first@example.test', 'second@example.test']) {
        const { rows } = await pool.query(
          "INSERT INTO users (name,email,password_hash) VALUES ('Demo Customer',$1,$2) RETURNING id",
          [email, hash],
        );
        if (!firstId) firstId = rows[0].id;
        else secondId = rows[0].id;
      }
      app = createApp({ pool, config, sessionSchema: schema });
      server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      base = `http://127.0.0.1:${server.address().port}`;
      const first = await session('first@example.test');
      const second = await session('second@example.test');
      const consultant = await session('consultant@example.test');
      assert.equal(
        (
          await request('/api/provider/hours', {
            ...consultant,
            method: 'PUT',
            body: { hours: week },
          })
        ).status,
        200,
      );

      await t.test(
        'authentication, customer role, CSRF, and server-derived ownership are enforced',
        async () => {
          const anonymous = await request('/api/auth/csrf');
          assert.equal(
            (
              await book(
                { cookie: anonymous.cookie, token: anonymous.data.csrfToken },
                instant(9),
              )
            ).status,
            401,
          );
          assert.equal((await book(consultant, instant(9))).status, 403);
          assert.equal(
            (await book({ ...first, token: '' }, instant(9))).data.error.code,
            'CSRF_INVALID',
          );
          assert.equal(
            (await book(first, instant(9), { customerId: secondId })).status,
            400,
          );
          assert.equal(
            (await book(first, instant(9), { status: 'confirmed' })).status,
            400,
          );
          assert.deepEqual(await occupancy(instant(9)), {
            bookings: 0,
            blocks: 0,
            total: 0,
          });
        },
      );
      await t.test(
        'valid booking persists the authenticated customer and returns truthful confirmation fields',
        async () => {
          const result = await book(first, instant(9));
          assert.equal(result.status, 201);
          const booking = result.data.booking;
          assert.equal(booking.consultantName, 'Demo Consultant');
          assert.equal(booking.status, 'confirmed');
          assert.equal(booking.timeZone, timeZone);
          assert.equal(booking.durationMinutes, 30);
          assert.equal(booking.reference, `SS-${booking.id.padStart(6, '0')}`);
          assert.equal(booking.startsAt, instant(9));
          assert.equal(
            Date.parse(booking.endsAt) - Date.parse(booking.startsAt),
            1_800_000,
          );
          assert.equal(booking.customerId, undefined);
          const stored = (
            await pool.query(
              'SELECT customer_id, status, canceled_at FROM bookings WHERE id=$1',
              [booking.id],
            )
          ).rows[0];
          assert.deepEqual(stored, {
            customer_id: firstId,
            status: 'confirmed',
            canceled_at: null,
          });
          const availability = await request(
            `/api/availability?date=${tomorrow.toISODate()}`,
          );
          assert.equal(
            availability.data.slots.some(
              (slot) => slot.startsAt === instant(9),
            ),
            false,
          );
          assert.equal(
            JSON.stringify(availability.data).includes('first@example.test'),
            false,
          );
        },
      );
      await t.test(
        'sequential duplicate submissions return 409 and create no additional records',
        async () => {
          for (const account of [first, second]) {
            const repeated = await book(account, instant(9));
            assert.equal(repeated.status, 409);
            assert.equal(repeated.data.error.code, 'BOOKING_CONFLICT');
            assert.equal(repeated.data.booking, undefined);
          }
          assert.deepEqual(await occupancy(instant(9)), {
            bookings: 1,
            blocks: 0,
            total: 1,
          });
        },
      );
      await t.test(
        'invalid dates, past/off-grid/out-of-window/outside-hours requests leave no partial booking',
        async () => {
          const before = (
            await pool.query('SELECT count(*)::int AS n FROM bookings')
          ).rows[0].n;
          const invalid = [
            'bad',
            '2026-02-30T09:00:00Z',
            tomorrow.minus({ days: 2 }).set({ hour: 9 }).toUTC().toISO(),
            instant(9, 15),
            instant(9).replace('.000Z', '.001Z'),
            instant(9).replace('Z', ''),
            tomorrow.plus({ days: 13 }).set({ hour: 9 }).toUTC().toISO(),
            instant(8),
            instant(18),
          ];
          for (const startsAt of invalid)
            assert.equal((await book(first, startsAt)).status, 400);
          assert.equal(
            (
              await request('/api/bookings', {
                ...first,
                method: 'POST',
                body: {},
              })
            ).status,
            400,
          );
          assert.equal(
            (await pool.query('SELECT count(*)::int AS n FROM bookings'))
              .rows[0].n,
            before,
          );
        },
      );
      await t.test(
        'stale displayed availability is rejected after a consultant block',
        async () => {
          const startsAt = instant(9, 30);
          const displayed = await request(
            `/api/availability?date=${tomorrow.toISODate()}`,
          );
          assert.ok(
            displayed.data.slots.some((slot) => slot.startsAt === startsAt),
          );
          assert.equal(
            (
              await request('/api/provider/blocks', {
                ...consultant,
                method: 'POST',
                body: { startsAt },
              })
            ).status,
            201,
          );
          const stale = await book(first, startsAt);
          assert.equal(stale.status, 409);
          assert.equal(stale.data.error.code, 'BLOCK_CONFLICT');
          assert.deepEqual(await occupancy(startsAt), {
            bookings: 0,
            blocks: 1,
            total: 0,
          });
        },
      );
      await t.test(
        'two authenticated customers racing receive one 201, one 409, and exactly one confirmed row',
        async () => {
          const startsAt = instant(10);
          const results = await race([
            () => book(first, startsAt),
            () => book(second, startsAt),
          ]);
          assert.deepEqual(
            results.map((result) => result.status).sort(),
            [201, 409],
          );
          assert.equal(
            results.find((result) => result.status === 409).data.error.code,
            'BOOKING_CONFLICT',
          );
          const rows = (
            await pool.query(
              'SELECT customer_id,status FROM bookings WHERE starts_at=$1',
              [startsAt],
            )
          ).rows;
          assert.equal(rows.length, 1);
          assert.equal(rows[0].status, 'confirmed');
          assert.ok([firstId, secondId].includes(rows[0].customer_id));
          assert.deepEqual(await occupancy(startsAt), {
            bookings: 1,
            blocks: 0,
            total: 1,
          });
        },
      );
      await t.test(
        'simultaneous repeat submissions by one customer still create one booking',
        async () => {
          const startsAt = instant(10, 30);
          const results = await race([
            () => book(first, startsAt),
            () => book(first, startsAt),
          ]);
          assert.deepEqual(
            results.map((result) => result.status).sort(),
            [201, 409],
          );
          assert.deepEqual(await occupancy(startsAt), {
            bookings: 1,
            blocks: 0,
            total: 1,
          });
        },
      );
      await t.test(
        'authenticated booking-versus-block races cannot create contradictory successes',
        async () => {
          for (const [minute, reverse] of [
            [0, false],
            [30, true],
          ]) {
            const startsAt = instant(11, minute);
            const jobs = [
              () => book(first, startsAt),
              () =>
                request('/api/provider/blocks', {
                  ...consultant,
                  method: 'POST',
                  body: { startsAt },
                }),
            ];
            const results = await race(reverse ? jobs.reverse() : jobs);
            assert.deepEqual(
              results.map((result) => result.status).sort(),
              [201, 409],
            );
            const state = await occupancy(startsAt);
            assert.equal(state.bookings + state.blocks, 1);
            assert.equal(state.total, state.bookings);
            const failure = results.find((result) => result.status === 409);
            assert.equal(
              failure.data.error.code,
              state.bookings ? 'BOOKING_CONFLICT' : 'BLOCK_CONFLICT',
            );
          }
        },
      );
      await t.test(
        'booking waits and revalidates newly committed working hours',
        async () => {
          const holder = await pool.connect();
          let pending;
          try {
            await holder.query('BEGIN');
            await holder.query(
              "SELECT id FROM users WHERE role='consultant' FOR UPDATE",
            );
            await holder.query(
              "UPDATE weekly_hours SET start_time='13:00' WHERE weekday=$1",
              [tomorrow.weekday],
            );
            pending = book(first, instant(12));
            await waitForWriters(1);
            await holder.query('COMMIT');
            const result = await pending;
            assert.equal(result.status, 400);
            assert.equal(result.data.error.code, 'OUTSIDE_HOURS');
          } finally {
            await holder.query('ROLLBACK');
            holder.release();
            if (pending) await pending;
          }
          assert.deepEqual(await occupancy(instant(12)), {
            bookings: 0,
            blocks: 0,
            total: 0,
          });
          await request('/api/provider/hours', {
            ...consultant,
            method: 'PUT',
            body: { hours: week },
          });
        },
      );
      await t.test(
        'time is rechecked after lock acquisition, not before waiting',
        async () => {
          let clock = tomorrow.set({ hour: 12 });
          const service = createBookingService({
            pool,
            timeZone,
            now: () => clock,
          });
          const holder = await pool.connect();
          let pending;
          try {
            await holder.query('BEGIN');
            await holder.query(
              "SELECT id FROM users WHERE role='consultant' FOR UPDATE",
            );
            pending = service.book(firstId, { startsAt: instant(12, 30) }).then(
              (value) => ({ value }),
              (error) => ({ error }),
            );
            await waitForWriters(1);
            clock = tomorrow.set({ hour: 12, minute: 30 });
            await holder.query('COMMIT');
            assert.equal((await pending).error.code, 'PAST_SLOT');
          } finally {
            await holder.query('ROLLBACK');
            holder.release();
            if (pending) await pending;
          }
          assert.deepEqual(await occupancy(instant(12, 30)), {
            bookings: 0,
            blocks: 0,
            total: 0,
          });
        },
      );
      await t.test(
        'a real commit-time failure rolls back the insert and does not return a confirmation',
        async () => {
          await pool.query(`CREATE FUNCTION reject_test_booking() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'intentional test commit failure'; END $$;
        CREATE CONSTRAINT TRIGGER reject_test_booking AFTER INSERT ON bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_test_booking()`);
          try {
            const failed = await book(first, instant(13));
            assert.equal(failed.status, 500);
            assert.deepEqual(failed.data, {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Something went wrong. Please try again.',
              },
            });
            assert.deepEqual(await occupancy(instant(13)), {
              bookings: 0,
              blocks: 0,
              total: 0,
            });
          } finally {
            await pool.query(
              'DROP TRIGGER reject_test_booking ON bookings; DROP FUNCTION reject_test_booking()',
            );
          }
          assert.equal(
            (await book(first, instant(13))).status,
            201,
            'Transaction client is usable after rollback',
          );
        },
      );
      await t.test(
        'canceled history allows rebooking and a closed weekday cannot be booked',
        async () => {
          await pool.query(
            "INSERT INTO bookings (customer_id,starts_at,status,canceled_at) VALUES ($1,$2,'canceled',clock_timestamp())",
            [firstId, instant(14)],
          );
          assert.equal((await book(second, instant(14))).status, 201);
          const history = (
            await pool.query(
              'SELECT status FROM bookings WHERE starts_at=$1 ORDER BY id',
              [instant(14)],
            )
          ).rows;
          assert.deepEqual(history, [
            { status: 'canceled' },
            { status: 'confirmed' },
          ]);
          await request('/api/provider/hours', {
            ...consultant,
            method: 'PUT',
            body: { hours: [] },
          });
          assert.equal((await book(first, instant(15))).status, 400);
          assert.deepEqual(await occupancy(instant(15)), {
            bookings: 0,
            blocks: 0,
            total: 0,
          });
        },
      );
    } finally {
      if (server)
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      if (app) await app.locals.sessionStore.close();
      if (pool) await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
