import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrate } from '../src/db/migrate.js';
import { seedConsultant } from '../src/db/seed-consultant.js';

// Explicit opt-in: the ordinary test command must not access the development DB.
test(
  'real PostgreSQL schema, migration, seed, and booking integrity',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.match(
      url.pathname,
      /_test$/,
      'Use a dedicated database ending in _test',
    );
    const schema = `test_${process.pid}_${Date.now()}`;
    const admin = new pg.Pool({ connectionString: url.href });
    let pool;
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      pool = new pg.Pool({
        connectionString: url.href,
        options: `-c search_path=${schema}`,
        max: 5,
      });
      await migrate(pool);
      await migrate(pool);
      await t.test(
        'failed migration rolls back DDL and migration tracking',
        async () => {
          const directory = await mkdtemp(
            join(tmpdir(), 'slotsure-migrations-'),
          );
          try {
            await writeFile(
              join(directory, '002_failure.sql'),
              'CREATE TABLE rollback_probe (id INT); SELECT * FROM missing_migration_table;',
            );
            await assert.rejects(
              migrate(pool, pathToFileURL(directory + '/')),
              { code: '42P01' },
            );
            assert.equal(
              (
                await pool.query(
                  "SELECT to_regclass('rollback_probe') AS table_name",
                )
              ).rows[0].table_name,
              null,
            );
          } finally {
            await rm(directory, { recursive: true });
          }
        },
      );
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM schema_migrations',
          )
        ).rows[0].count,
        2,
      );
      const hash =
        '$argon2id$v=19$m=65536,t=3,p=1$c3ludGhldGljc2FsdA$c3ludGhldGljdGVzdGhhc2g';
      const user = {
        name: 'Demo Consultant',
        email: 'CONSULTANT@example.test',
        passwordHash: hash,
      };
      await t.test(
        'controlled seed is repeatable and does not overwrite the consultant',
        async () => {
          assert.equal(await seedConsultant(pool, user), true);
          assert.equal(
            await seedConsultant(pool, { ...user, name: 'Replacement' }),
            false,
          );
          assert.equal(
            (await pool.query("SELECT name FROM users WHERE role='consultant'"))
              .rows[0].name,
            user.name,
          );
          await assert.rejects(
            seedConsultant(pool, { ...user, passwordHash: 'plaintext' }),
          );
        },
      );
      const insertUser = (email, role = 'customer') =>
        pool.query(
          'INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id',
          ['Demo Customer', email, hash, role],
        );
      const customer = (await insertUser('customer@example.test')).rows[0].id;
      const rejects = async (sql, values, code) =>
        assert.rejects(pool.query(sql, values), (error) => error.code === code);
      await t.test(
        'user identity, roles, and singleton constraints',
        async () => {
          await assert.rejects(insertUser('customer@example.test'), {
            code: '23505',
          });
          await assert.rejects(insertUser('other@example.test', 'consultant'), {
            code: '23505',
          });
          await assert.rejects(insertUser('other@example.test', 'admin'), {
            code: '23514',
          });
          await assert.rejects(insertUser('UPPER@example.test'), {
            code: '23514',
          });
          await rejects(
            'INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3)',
            ['', 'empty@example.test', hash],
            '23514',
          );
        },
      );
      await t.test(
        'weekly interval boundaries and unique weekdays',
        async () => {
          await pool.query(
            "INSERT INTO weekly_hours VALUES (1,'09:00','17:00'), (7,'23:30','24:00')",
          );
          await rejects(
            "INSERT INTO weekly_hours VALUES (1,'09:00','17:00')",
            [],
            '23505',
          );
          for (const [day, start, end] of [
            [0, '09:00', '17:00'],
            [2, '09:15', '17:00'],
            [2, '09:00', '17:00:01'],
            [2, '17:00', '09:00'],
            [2, '09:00', '09:00'],
          ]) {
            await rejects(
              'INSERT INTO weekly_hours VALUES ($1,$2,$3)',
              [day, start, end],
              '23514',
            );
          }
        },
      );
      await t.test('blocks are unique and timestamps are finite', async () => {
        await pool.query(
          "INSERT INTO blocked_slots (starts_at) VALUES ('2030-01-01T09:00Z')",
        );
        await rejects(
          "INSERT INTO blocked_slots (starts_at) VALUES ('2030-01-01T14:00+05:00')",
          [],
          '23505',
        );
        await rejects(
          "INSERT INTO blocked_slots (starts_at) VALUES ('infinity')",
          [],
          '23514',
        );
      });
      await t.test(
        'confirmed uniqueness, history, rebooking, foreign keys, and cancellation consistency',
        async () => {
          const insert = () =>
            pool.query(
              "INSERT INTO bookings (customer_id,starts_at) VALUES ($1,'2030-01-02T09:00Z') RETURNING id",
              [customer],
            );
          const booking = (await insert()).rows[0].id;
          await assert.rejects(insert(), { code: '23505' });
          await rejects(
            "INSERT INTO bookings (customer_id,starts_at) VALUES (999999,'2030-01-03T09:00Z')",
            [],
            '23503',
          );
          await rejects(
            "UPDATE bookings SET status='pending' WHERE id=$1",
            [booking],
            '23514',
          );
          await rejects(
            "UPDATE bookings SET status='canceled' WHERE id=$1",
            [booking],
            '23514',
          );
          await pool.query(
            "UPDATE bookings SET status='canceled', canceled_at=clock_timestamp() WHERE id=$1",
            [booking],
          );
          const second = (await insert()).rows[0].id;
          await pool.query(
            "UPDATE bookings SET status='canceled', canceled_at=clock_timestamp() WHERE id=$1",
            [second],
          );
          await insert();
          const { rows } = await pool.query(
            'SELECT status, count(*)::int AS count FROM bookings GROUP BY status ORDER BY status',
          );
          assert.deepEqual(rows, [
            { status: 'canceled', count: 2 },
            { status: 'confirmed', count: 1 },
          ]);
          await assert.rejects(
            pool.query('DELETE FROM users WHERE id=$1', [customer]),
            (error) => ['23503', '23001'].includes(error.code),
          );
        },
      );
    } finally {
      if (pool) await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
