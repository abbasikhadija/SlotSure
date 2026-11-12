import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { readConfig, readAuthConfig } from '../src/config.js';
import { seedConsultant } from '../src/db/seed-consultant.js';

test('production rejects missing, malformed and test database configuration without leaking values', () => {
  for (const DATABASE_URL of [
    undefined,
    'secret-not-a-url',
    'https://example.test/db',
    'postgresql://localhost/app_test',
  ]) {
    assert.throws(() => readConfig({ NODE_ENV: 'production', DATABASE_URL }));
  }
  assert.throws(() =>
    readConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/app',
      TEST_DATABASE_URL: 'configured',
    }),
  );
  assert.equal(
    readConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://localhost/app',
      PORT: '8080',
      HOST: '0.0.0.0',
    }).port,
    8080,
  );
});

test('readiness reports database failure safely while liveness stays independent', async () => {
  let available = false;
  let queries = 0;
  const pool = {
    async query() {
      queries++;
      if (!available) throw new Error('PRIVATE_CONNECTION_DETAILS');
      return { rows: [] };
    },
  };
  const app = createApp({
    pool,
    config: readAuthConfig({
      SESSION_SECRET: 'test-only-secret-with-at-least-32-bytes',
    }),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal(queries, 0);
    const failed = await fetch(base + '/api/ready');
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { status: 'unavailable' });
    assert.equal(failed.headers.get('set-cookie'), null);
    available = true;
    const ready = await fetch(base + '/api/ready');
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: 'ready' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.locals.sessionStore.close();
  }
});

test('seed rejects malformed Argon2id and excessive parameters before SQL', async () => {
  const pool = {
    query() {
      assert.fail('Invalid hash must not reach SQL');
    },
  };
  for (const passwordHash of [
    'plaintext-password',
    '$argon2id$v=19$m=999999999,t=3,p=1$c2FsdA$aGFzaA',
    '$argon2id$v=19$m=65536,t=3,p=1$YQ$YQ',
  ]) {
    await assert.rejects(
      seedConsultant(pool, {
        name: 'Test',
        email: 'test@example.test',
        passwordHash,
      }),
    );
  }
});
