import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { DateTime } from 'luxon';
import pg from 'pg';
import argon2 from 'argon2';
import { migrate } from '../src/db/migrate.js';
import { seedConsultant } from '../src/db/seed-consultant.js';
import { withScheduleLock } from '../src/db/schedule-transaction.js';
import { createAvailabilityService } from '../src/services/availability.js';
import { createApp } from '../src/app.js';
import { readAuthConfig } from '../src/config.js';

test(
  'availability and consultant schedule management with real PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.match(url.pathname, /_test$/);
    const schema = `availability_${process.pid}_${Date.now()}`;
    const admin = new pg.Pool({
      connectionString: url.href,
      connectionTimeoutMillis: 5000,
    });
    const timeZone = 'Asia/Karachi';
    const at = DateTime.utc();
    const tomorrow = at.setZone(timeZone).startOf('day').plus({ days: 1 });
    const date = tomorrow.toISODate();
    const instant = (hour, minute = 0) =>
      tomorrow.set({ hour, minute }).toUTC().toISO();
    const week = Array.from({ length: 7 }, (_, i) => ({
      weekday: i + 1,
      startTime: '09:00',
      endTime: '12:00',
    }));
    const password = randomBytes(24).toString('hex');
    const config = {
      ...readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex') }),
      timeZone,
    };
    let pool, app, server, base, service;
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
    async function signIn(email) {
      const csrf = await request('/api/auth/csrf');
      const login = await request('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        cookie: csrf.cookie,
        token: csrf.data.csrfToken,
      });
      assert.equal(login.status, 200);
      return { cookie: login.cookie, token: login.data.csrfToken };
    }
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      pool = new pg.Pool({
        connectionString: url.href,
        options: `-c search_path=${schema}`,
        max: 5,
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
      const customerId = (
        await pool.query(
          "INSERT INTO users (name,email,password_hash) VALUES ('Demo Customer','customer@example.test',$1) RETURNING id",
          [hash],
        )
      ).rows[0].id;
      service = createAvailabilityService({ pool, timeZone, now: () => at });
      app = createApp({ pool, config, sessionSchema: schema });
      server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      base = `http://127.0.0.1:${server.address().port}`;
      const consultant = await signIn('consultant@example.test');
      const customer = await signIn('customer@example.test');
      await t.test(
        'empty public availability includes server date bounds and no private data',
        async () => {
          const result = await request('/api/availability');
          assert.equal(result.status, 200);
          assert.equal(result.data.timeZone, timeZone);
          assert.equal(result.data.durationMinutes, 30);
          assert.equal(
            result.data.maxDate,
            DateTime.fromISO(result.data.minDate)
              .plus({ days: 13 })
              .toISODate(),
          );
          assert.deepEqual(result.data.slots, []);
          assert.deepEqual(Object.keys(result.data).sort(), [
            'date',
            'durationMinutes',
            'maxDate',
            'minDate',
            'slots',
            'timeZone',
          ]);
        },
      );
      await t.test(
        'consultant-only reads and writes reject anonymous/customers; CSRF is enforced',
        async () => {
          assert.equal((await request('/api/provider/hours')).status, 401);
          for (const path of ['/api/provider/hours', '/api/provider/blocks'])
            assert.equal((await request(path, customer)).status, 403);
          for (const [path, method, body] of [
            ['/api/provider/hours', 'PUT', { hours: week }],
            ['/api/provider/blocks', 'POST', { startsAt: instant(9) }],
            ['/api/provider/blocks/1', 'DELETE', {}],
          ]) {
            assert.equal(
              (await request(path, { ...customer, method, body })).status,
              403,
            );
          }
          assert.equal(
            (
              await request('/api/provider/hours', {
                ...consultant,
                token: '',
                method: 'PUT',
                body: { hours: week },
              })
            ).data.error.code,
            'CSRF_INVALID',
          );
        },
      );
      await t.test(
        'weekly hours are atomically configured and invalid replacements preserve them',
        async () => {
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
          const valid = await service.getHours();
          assert.deepEqual(valid.hours, week);
          for (const hours of [
            [week[0], week[0]],
            [{ weekday: 1, startTime: '09:15', endTime: '17:00' }],
            [{ weekday: 1, startTime: '17:00', endTime: '09:00' }],
          ]) {
            assert.equal(
              (
                await request('/api/provider/hours', {
                  ...consultant,
                  method: 'PUT',
                  body: { hours },
                })
              ).status,
              400,
            );
            assert.deepEqual((await service.getHours()).hours, week);
          }
        },
      );
      await t.test(
        'one bounded real SQL statement generates a whole day; malformed dates are rejected',
        async () => {
          let queryCount = 0;
          const counted = createAvailabilityService({
            pool: {
              query: (...args) => {
                queryCount++;
                return pool.query(...args);
              },
            },
            timeZone,
            now: () => at,
          });
          const result = await counted.availability(date);
          assert.equal(queryCount, 1);
          assert.equal(result.slots.length, 6);
          assert.equal(result.slots[0].startsAt, instant(9));
          for (const invalid of [
            'bad',
            '2026-02-30',
            tomorrow.minus({ days: 2 }).toISODate(),
            tomorrow.plus({ days: 13 }).toISODate(),
          ])
            assert.equal(
              (await request(`/api/availability?date=${invalid}`)).status,
              400,
            );
          assert.equal(
            (await request(`/api/availability?date=${date}&date=${date}`))
              .status,
            400,
          );
        },
      );
      let blockId;
      await t.test(
        'blocks hide slots; duplicate, past, off-grid and outside-hours blocks fail',
        async () => {
          const created = await request('/api/provider/blocks', {
            ...consultant,
            method: 'POST',
            body: { startsAt: instant(9) },
          });
          assert.equal(created.status, 201);
          blockId = created.data.block.id;
          assert.equal((await service.availability(date)).slots.length, 5);
          assert.equal(
            (
              await request('/api/provider/blocks', {
                ...consultant,
                method: 'POST',
                body: { startsAt: instant(9) },
              })
            ).status,
            409,
          );
          for (const startsAt of [
            instant(8),
            instant(9, 15),
            tomorrow.minus({ days: 2 }).toUTC().toISO(),
            instant(9).replace('Z', ''),
          ])
            assert.equal(
              (
                await request('/api/provider/blocks', {
                  ...consultant,
                  method: 'POST',
                  body: { startsAt },
                })
              ).status,
              400,
            );
          assert.equal(
            (await request('/api/provider/blocks', consultant)).data.blocks
              .length,
            1,
          );
        },
      );
      let bookingId;
      await t.test(
        'confirmed reservations stay hidden, canceled history does not; blocks never cancel reservations',
        async () => {
          bookingId = (
            await pool.query(
              'INSERT INTO bookings (customer_id,starts_at) VALUES ($1,$2) RETURNING id',
              [customerId, instant(10)],
            )
          ).rows[0].id;
          await pool.query(
            "INSERT INTO bookings (customer_id,starts_at,status,canceled_at) VALUES ($1,$2,'canceled',clock_timestamp())",
            [customerId, instant(9, 30)],
          );
          const available = await request(`/api/availability?date=${date}`);
          assert.equal(available.data.slots.length, 4);
          assert.ok(
            available.data.slots.some(
              (slot) => slot.startsAt === instant(9, 30),
            ),
          );
          const conflict = await request('/api/provider/blocks', {
            ...consultant,
            method: 'POST',
            body: { startsAt: instant(10) },
          });
          assert.equal(conflict.status, 409);
          assert.equal(conflict.data.error.code, 'BOOKING_CONFLICT');
          assert.equal(
            (
              await pool.query('SELECT status FROM bookings WHERE id=$1', [
                bookingId,
              ])
            ).rows[0].status,
            'confirmed',
          );
          assert.equal(
            (await request('/api/provider/blocks', consultant)).data.blocks
              .length,
            1,
          );
        },
      );
      await t.test(
        'hours changes warn about existing reservations, retain blocks, and unblocking restores availability',
        async () => {
          const hours = [
            { weekday: tomorrow.weekday, startTime: '09:00', endTime: '09:30' },
          ];
          const updated = await request('/api/provider/hours', {
            ...consultant,
            method: 'PUT',
            body: { hours },
          });
          assert.equal(updated.status, 200);
          assert.equal(updated.data.outsideHoursCount, 1);
          assert.equal((await service.availability(date)).slots.length, 0);
          assert.equal(
            (
              await pool.query('SELECT status FROM bookings WHERE id=$1', [
                bookingId,
              ])
            ).rows[0].status,
            'confirmed',
          );
          assert.equal(
            (
              await request(`/api/provider/blocks/${blockId}`, {
                ...consultant,
                method: 'DELETE',
                body: {},
              })
            ).status,
            200,
          );
          assert.equal((await service.availability(date)).slots.length, 1);
          assert.equal(
            (
              await request(`/api/provider/blocks/${blockId}`, {
                ...consultant,
                method: 'DELETE',
                body: {},
              })
            ).status,
            404,
          );
          for (const id of ['bad', '0', '999999999999999999999'])
            assert.equal(
              (
                await request(`/api/provider/blocks/${id}`, {
                  ...consultant,
                  method: 'DELETE',
                  body: {},
                })
              ).status,
              400,
            );
          await service.setHours({ hours: [] });
          assert.equal((await service.availability(date)).slots.length, 0);
          assert.equal((await service.getHours()).outsideHoursCount, 1);
        },
      );
      await t.test(
        'transaction failures roll back and missing consultant returns a controlled error',
        async () => {
          await service.setHours({ hours: week });
          await assert.rejects(
            withScheduleLock(pool, async (client) => {
              await client.query('DELETE FROM weekly_hours');
              throw new Error('intentional rollback');
            }),
            /intentional rollback/,
          );
          assert.deepEqual((await service.getHours()).hours, week);
          await pool.query(
            "UPDATE users SET role='customer' WHERE email='consultant@example.test'",
          );
          try {
            await assert.rejects(service.setHours({ hours: [] }), {
              status: 503,
            });
          } finally {
            await pool.query(
              "UPDATE users SET role='consultant' WHERE email='consultant@example.test'",
            );
          }
        },
      );
      await t.test(
        'block waits for consultant row lock and rechecks working hours after acquiring it',
        async () => {
          const holder = await pool.connect();
          let pending;
          try {
            await holder.query('BEGIN');
            const pid = (await holder.query('SELECT pg_backend_pid() AS pid'))
              .rows[0].pid;
            await holder.query(
              "SELECT id FROM users WHERE role='consultant' FOR UPDATE",
            );
            await holder.query(
              "UPDATE weekly_hours SET start_time='10:00' WHERE weekday=$1",
              [tomorrow.weekday],
            );
            pending = service.block({ startsAt: instant(9) }).then(
              (value) => ({ value }),
              (error) => ({ error }),
            );
            let waiting = false;
            const deadline = Date.now() + 2000;
            while (!waiting && Date.now() < deadline) {
              waiting = (
                await pool.query(
                  'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS waiting',
                  [pid],
                )
              ).rows[0].waiting;
              if (!waiting) await setTimeout(10);
            }
            assert.equal(
              waiting,
              true,
              'Observed an actual PostgreSQL row-lock wait',
            );
            await holder.query('COMMIT');
            assert.equal((await pending).error.code, 'OUTSIDE_HOURS');
          } finally {
            await holder.query('ROLLBACK');
            holder.release();
            if (pending) await pending;
          }
          assert.equal(
            (await pool.query('SELECT count(*)::int AS n FROM blocked_slots'))
              .rows[0].n,
            0,
          );
        },
      );
      await t.test(
        'concurrent duplicate blocks serialize and preserve a single row',
        async () => {
          await service.setHours({ hours: week });
          const attempts = await Promise.allSettled([
            service.block({ startsAt: instant(11) }),
            service.block({ startsAt: instant(11) }),
          ]);
          assert.equal(
            attempts.filter((item) => item.status === 'fulfilled').length,
            1,
          );
          assert.equal(
            attempts.find((item) => item.status === 'rejected').reason.status,
            409,
          );
          assert.equal(
            (await pool.query('SELECT count(*)::int AS n FROM blocked_slots'))
              .rows[0].n,
            1,
          );
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
