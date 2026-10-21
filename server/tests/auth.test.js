import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { readAuthConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { seedConsultant } from '../src/db/seed-consultant.js';

test(
  'authentication over HTTP with real PostgreSQL sessions',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    assert.match(url.pathname, /_test$/);
    const schema = `auth_${process.pid}_${Date.now()}`;
    const admin = new pg.Pool({
      connectionString: url.href,
      connectionTimeoutMillis: 5000,
    });
    let pool;
    let server;
    let app;
    let base;
    const secret = randomBytes(32).toString('hex');
    const config = readAuthConfig({ SESSION_SECRET: secret });
    const password = randomBytes(24).toString('base64');
    const customer = {
      name: 'Demo Customer',
      email: 'CUSTOMER@example.test',
      password,
    };
    async function stop() {
      if (server)
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      if (app) await app.locals.sessionStore.close();
      server = undefined;
    }
    async function start(authConfig = config) {
      app = createApp({ pool, config: authConfig, sessionSchema: schema });
      server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      base = `http://127.0.0.1:${server.address().port}`;
    }
    function browser() {
      let cookie = '';
      let token;
      return {
        get cookie() {
          return cookie;
        },
        get token() {
          return token;
        },
        async request(path, { method = 'GET', body, headers = {}, raw } = {}) {
          const response = await fetch(base + path, {
            method,
            headers: {
              ...(cookie ? { Cookie: cookie } : {}),
              ...(method === 'GET'
                ? {}
                : {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': token ?? '',
                    Origin: config.appOrigin,
                  }),
              ...headers,
            },
            body:
              raw ?? (body === undefined ? undefined : JSON.stringify(body)),
          });
          const setCookie = response.headers.get('set-cookie');
          if (setCookie) cookie = setCookie.split(';')[0];
          const data = await response.json();
          if (data.csrfToken) token = data.csrfToken;
          return { status: response.status, data, headers: response.headers };
        },
        async csrf() {
          return this.request('/api/auth/csrf');
        },
      };
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
      await start();
      const client = browser();
      await t.test(
        'anonymous requests, CSRF, origins, content types, and safe errors',
        async () => {
          assert.equal((await client.request('/api/auth/me')).status, 401);
          assert.equal(
            (await client.request('/api/provider/hours')).status,
            401,
          );
          const csrf = await client.csrf();
          assert.equal(csrf.status, 200);
          assert.equal(csrf.headers.get('cache-control'), 'no-store');
          assert.match(csrf.headers.get('set-cookie'), /HttpOnly/i);
          assert.match(csrf.headers.get('set-cookie'), /SameSite=Lax/i);
          assert.doesNotMatch(csrf.headers.get('set-cookie'), /; Secure/i);
          const post = (headers) =>
            client.request('/api/auth/register', {
              method: 'POST',
              body: customer,
              headers,
            });
          assert.equal(
            (await post({ 'X-CSRF-Token': '' })).data.error.code,
            'CSRF_INVALID',
          );
          assert.equal((await post({ 'X-CSRF-Token': 'forged' })).status, 403);
          assert.equal(
            (await post({ Origin: 'https://attacker.example' })).data.error
              .code,
            'ORIGIN_FORBIDDEN',
          );
          assert.equal((await post({ Origin: 'null' })).status, 403);
          assert.equal(
            (await post({ 'Content-Type': 'text/plain' })).status,
            415,
          );
          assert.equal(
            (
              await client.request('/api/auth/register', {
                method: 'POST',
                raw: '{',
              })
            ).data.error.code,
            'INVALID_JSON',
          );
          assert.equal(
            (
              await client.request('/api/auth/register', {
                method: 'POST',
                raw: JSON.stringify({ padding: 'x'.repeat(9000) }),
              })
            ).status,
            413,
          );
          const other = browser();
          await other.csrf();
          assert.equal(
            (
              await other.request('/api/auth/logout', {
                method: 'POST',
                body: {},
                headers: { 'X-CSRF-Token': client.token },
              })
            ).status,
            403,
          );
          assert.equal(
            (await pool.query('SELECT count(*)::int AS n FROM users')).rows[0]
              .n,
            0,
          );
        },
      );
      await t.test(
        'registration assigns only customer and stores a salted Argon2id hash',
        async () => {
          const role = await client.request('/api/auth/register', {
            method: 'POST',
            body: { ...customer, role: 'consultant' },
          });
          assert.equal(role.status, 400);
          const registered = await client.request('/api/auth/register', {
            method: 'POST',
            body: customer,
          });
          assert.equal(registered.status, 201);
          assert.equal(registered.data.user.role, 'customer');
          assert.equal(
            registered.data.user.email,
            customer.email.toLowerCase(),
          );
          assert.equal(registered.data.user.password_hash, undefined);
          assert.equal((await client.request('/api/auth/me')).status, 401);
          const stored = (await pool.query('SELECT password_hash FROM users'))
            .rows[0].password_hash;
          assert.match(stored, /^\$argon2id\$/);
          assert.equal(await argon2.verify(stored, password), true);
          assert.equal(await argon2.verify(stored, 'incorrect'), false);
          assert.notEqual(stored, await argon2.hash(password));
          const duplicate = await client.request('/api/auth/register', {
            method: 'POST',
            body: { ...customer, email: customer.email.toLowerCase() },
          });
          assert.equal(duplicate.status, 409);
          assert.equal(
            (await pool.query('SELECT count(*)::int AS n FROM users')).rows[0]
              .n,
            1,
          );
        },
      );
      let staleCookie;
      let staleToken;
      await t.test(
        'login rejects invalid credentials and rotates session and CSRF token',
        async () => {
          const wrong = await client.request('/api/auth/login', {
            method: 'POST',
            body: { email: customer.email, password: 'incorrect' },
          });
          const missing = await client.request('/api/auth/login', {
            method: 'POST',
            body: { email: 'missing@example.test', password },
          });
          assert.equal(wrong.status, 401);
          assert.deepEqual(wrong.data, missing.data);
          staleCookie = client.cookie;
          staleToken = client.token;
          const loggedIn = await client.request('/api/auth/login', {
            method: 'POST',
            body: { email: customer.email, password },
          });
          assert.equal(loggedIn.status, 200);
          assert.notEqual(client.cookie, staleCookie);
          assert.notEqual(client.token, staleToken);
          assert.equal(
            (await client.request('/api/auth/me')).data.user.role,
            'customer',
          );
          const replay = await fetch(base + '/api/auth/me', {
            headers: { Cookie: staleCookie },
          });
          assert.equal(replay.status, 401);
          assert.equal(
            (
              await client.request('/api/auth/logout', {
                method: 'POST',
                body: {},
                headers: { 'X-CSRF-Token': staleToken },
              })
            ).status,
            403,
          );
          assert.equal(
            (await client.request('/api/provider/hours')).status,
            403,
          );
          const stored = (
            await pool.query(
              "SELECT sess FROM user_sessions WHERE sess->>'userId' IS NOT NULL",
            )
          ).rows;
          assert.equal(stored.length, 1);
          assert.equal(stored[0].sess.password, undefined);
          assert.equal(stored[0].sess.role, undefined);
        },
      );
      await t.test(
        'session survives application restart; logout invalidates replay',
        async () => {
          await stop();
          await start();
          assert.equal((await client.request('/api/auth/me')).status, 200);
          const savedCookie = client.cookie;
          const logout = await client.request('/api/auth/logout', {
            method: 'POST',
            body: {},
          });
          assert.equal(logout.status, 200);
          assert.match(
            logout.headers.get('set-cookie'),
            /Expires=Thu, 01 Jan 1970/i,
          );
          assert.equal((await client.request('/api/auth/me')).status, 401);
          assert.equal(
            (
              await fetch(base + '/api/auth/me', {
                headers: { Cookie: savedCookie },
              })
            ).status,
            401,
          );
          assert.equal(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM user_sessions WHERE sess->>'userId' IS NOT NULL",
              )
            ).rows[0].n,
            0,
          );
        },
      );
      await t.test(
        'seeded consultant authenticates and role checks use current database state',
        async () => {
          await seedConsultant(pool, {
            name: 'Demo Consultant',
            email: 'consultant@example.test',
            passwordHash: await argon2.hash(password),
          });
          const consultant = browser();
          await consultant.csrf();
          assert.equal(
            (
              await consultant.request('/api/auth/login', {
                method: 'POST',
                body: { email: 'consultant@example.test', password },
              })
            ).data.user.role,
            'consultant',
          );
          // Consultant authorization now reaches the implemented hours endpoint.
          assert.equal(
            (await consultant.request('/api/provider/hours')).status,
            200,
          );
          await pool.query(
            "UPDATE users SET role='customer' WHERE email='consultant@example.test'",
          );
          assert.equal(
            (await consultant.request('/api/provider/hours')).status,
            403,
          );
          await pool.query(
            "DELETE FROM users WHERE email='consultant@example.test'",
          );
          assert.equal((await consultant.request('/api/auth/me')).status, 401);
        },
      );
      await t.test(
        'session-store failure returns safe JSON instead of an unusable CSRF token',
        async () => {
          await pool.query(
            'ALTER TABLE user_sessions RENAME TO unavailable_sessions',
          );
          try {
            const failed = await browser().csrf();
            assert.equal(failed.status, 500);
            assert.deepEqual(failed.data, {
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Something went wrong. Please try again.',
              },
            });
          } finally {
            await pool.query(
              'ALTER TABLE unavailable_sessions RENAME TO user_sessions',
            );
          }
        },
      );
      await t.test('expired sessions are rejected', async () => {
        const client = browser();
        await client.csrf();
        await client.request('/api/auth/login', {
          method: 'POST',
          body: { email: customer.email, password },
        });
        await pool.query(
          "UPDATE user_sessions SET expire=now()-interval '1 minute'",
        );
        assert.equal((await client.request('/api/auth/me')).status, 401);
      });
      await t.test(
        'login and registration attempts are rate limited',
        async () => {
          await stop();
          await start();
          const attempts = browser();
          await attempts.csrf();
          for (let i = 0; i < 10; i++) {
            assert.equal(
              (
                await attempts.request('/api/auth/login', {
                  method: 'POST',
                  body: { email: 'missing@example.test', password },
                })
              ).status,
              401,
            );
          }
          const limited = await attempts.request('/api/auth/login', {
            method: 'POST',
            body: { email: customer.email, password },
          });
          assert.equal(limited.status, 429);
          assert.equal(limited.data.error.code, 'RATE_LIMITED');
          assert.ok(limited.headers.get('retry-after'));
          for (let i = 0; i < 5; i++)
            assert.equal(
              (
                await attempts.request('/api/auth/register', {
                  method: 'POST',
                  body: {},
                })
              ).status,
              400,
            );
          assert.equal(
            (
              await attempts.request('/api/auth/register', {
                method: 'POST',
                body: {},
              })
            ).status,
            429,
          );
        },
      );
      await t.test(
        'production session cookies require HTTPS and use Secure',
        async () => {
          await stop();
          await start(
            readAuthConfig({
              SESSION_SECRET: secret,
              NODE_ENV: 'production',
              APP_ORIGIN: 'https://example.test',
              TRUST_PROXY: '1',
            }),
          );
          const response = await fetch(base + '/api/auth/csrf', {
            headers: { 'X-Forwarded-Proto': 'https' },
          });
          assert.match(response.headers.get('set-cookie'), /; Secure/i);
          const insecure = await fetch(base + '/api/auth/csrf');
          assert.equal(insecure.headers.get('set-cookie'), null);
        },
      );
    } finally {
      await stop();
      if (pool) await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
