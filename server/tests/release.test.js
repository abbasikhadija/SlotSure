import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import argon2 from 'argon2';

test(
  'explicit release startup migrates and seeds safely before HTTP, repeat preserves account',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.match(url.pathname, /_test$/);
    const admin = new pg.Pool({ connectionString: url.href });
    const schema = `release_${process.pid}_${Date.now()}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const pool = new pg.Pool({ connectionString: url.href });
    const hash = await argon2.hash('synthetic-release-test-password', {
      type: argon2.argon2id,
    });
    try {
      for (const mode of [
        'initialize-start',
        'initialize-start',
        'migrate-start',
      ]) {
        const holder = createServer();
        holder.listen(0, '127.0.0.1');
        await once(holder, 'listening');
        const port = holder.address().port;
        await new Promise((resolve) => holder.close(resolve));
        const child = spawn(
          process.execPath,
          [fileURLToPath(new URL('../src/release.js', import.meta.url)), mode],
          {
            env: {
              ...process.env,
              NODE_ENV: 'test',
              SERVE_CLIENT: '0',
              HOST: '127.0.0.1',
              PORT: String(port),
              DATABASE_URL: url.href,
              SESSION_SECRET: 'synthetic-test-only-secret-at-least-32-bytes',
              APP_ORIGIN: `http://127.0.0.1:${port}`,
              TRUST_PROXY: '0',
              CONSULTANT_NAME:
                mode === 'migrate-start' ? '' : 'Original Consultant',
              CONSULTANT_EMAIL: 'release@example.test',
              CONSULTANT_PASSWORD_HASH: mode === 'migrate-start' ? '' : hash,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );
        let output = '';
        child.stderr.resume();
        const closed = once(child, 'close');
        try {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('Release listener did not start')),
              10000,
            );
            child.stdout.on('data', (data) => {
              output += data;
              if (output.includes('SlotSure listening')) {
                clearTimeout(timer);
                resolve();
              }
            });
            child.once('exit', () => {
              clearTimeout(timer);
              reject(new Error('Release exited before listener'));
            });
          });
          assert.equal(
            (await fetch(`http://127.0.0.1:${port}/api/ready`)).status,
            200,
          );
          assert.equal(
            (
              await pool.query(
                'SELECT count(*)::int AS count FROM schema_migrations',
              )
            ).rows[0].count,
            2,
          );
          const users = (
            await pool.query('SELECT name, password_hash FROM users')
          ).rows;
          assert.equal(users.length, 1);
          assert.equal(users[0].name, 'Original Consultant');
          assert.equal(users[0].password_hash, hash);
        } finally {
          child.kill();
          await closed;
        }
      }
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
