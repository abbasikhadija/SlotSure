import assert from 'node:assert/strict';
import test from 'node:test';
import { readAuthConfig } from '../src/config.js';
import { validateCredentials } from '../src/services/auth.js';

test('account validation normalizes identity and rejects role assignment and malformed input', () => {
  const valid = {
    name: ' Demo ',
    email: ' CUSTOMER@Example.test ',
    password: 'long unique test passphrase',
  };
  assert.deepEqual(validateCredentials(valid, true), {
    ...valid,
    name: 'Demo',
    email: 'customer@example.test',
  });
  for (const body of [
    null,
    [],
    {},
    { ...valid, role: 'consultant' },
    { ...valid, name: ' ' },
    { ...valid, email: 'bad' },
    { ...valid, password: 'short' },
    { ...valid, password: 'x'.repeat(129) },
    { ...valid, password: {} },
  ]) {
    assert.throws(() => validateCredentials(body, true), { status: 400 });
  }
});

test('session configuration requires a secret and validates production origin and proxy trust', () => {
  const secret = 'test-only-secret-with-at-least-32-bytes';
  assert.throws(() => readAuthConfig({}));
  assert.throws(() => readAuthConfig({ SESSION_SECRET: 'short' }));
  for (const APP_ORIGIN of [
    'https://example.test/path',
    'https://user:password@example.test',
    'file:///tmp',
    'https://example.test/?x=1',
  ]) {
    assert.throws(() => readAuthConfig({ SESSION_SECRET: secret, APP_ORIGIN }));
  }
  assert.throws(() =>
    readAuthConfig({ SESSION_SECRET: secret, NODE_ENV: 'production' }),
  );
  assert.throws(() =>
    readAuthConfig({ SESSION_SECRET: secret, TRUST_PROXY: 'true' }),
  );
  assert.equal(readAuthConfig({ SESSION_SECRET: secret }).secureCookies, false);
  const production = readAuthConfig({
    SESSION_SECRET: secret,
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://example.test',
    TRUST_PROXY: '1',
  });
  assert.equal(production.secureCookies, true);
  assert.equal(production.trustProxy, 1);
});
