import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../../client/src/lib/api.js';

test('browser API retains server conflict status and message for recovery UI', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({ error: { message: 'Choose another time.' } }),
        { status: 409 },
      ),
  );
  await assert.rejects(
    api('/api/availability'),
    (error) => error.status === 409 && error.message === 'Choose another time.',
  );
});

test('browser API reports connection and malformed-response failures without parser internals', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('internal network diagnostic');
  });
  await assert.rejects(api('/api/availability'), /Could not reach SlotSure/);
  fetch.mock.mockImplementation(
    async () => new Response('<html>gateway failure</html>', { status: 502 }),
  );
  await assert.rejects(api('/api/availability'), /unexpected response/);
});

test('browser API does not submit after CSRF preparation failure and preserves aborts', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{}', { status: 503 }),
  );
  await assert.rejects(
    api('/api/bookings', { method: 'POST', body: { startsAt: 'unused' } }),
    /prepare a secure request/,
  );
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/auth/csrf');
  const aborted = new DOMException('Canceled', 'AbortError');
  fetch.mock.mockImplementation(async () => {
    throw aborted;
  });
  await assert.rejects(api('/api/availability'), (error) => error === aborted);
});
