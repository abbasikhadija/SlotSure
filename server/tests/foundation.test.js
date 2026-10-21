import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { app } from '../src/app.js';
import { readConfig } from '../src/config.js';

test('health responds over HTTP; unknown routes return safe JSON', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'slotsure-api',
    });
    const missing = await fetch(`${base}/api/missing`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), {
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('configuration rejects invalid ports and time zones', () => {
  assert.equal(readConfig({}).timeZone, 'Asia/Karachi');
  for (const port of ['0', '65536', 'abc', '1.5'])
    assert.throws(() => readConfig({ PORT: port }));
  assert.throws(() => readConfig({ CONSULTANT_TIME_ZONE: 'invalid/timezone' }));
});
