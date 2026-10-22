import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import pg from 'pg';
import { createApp } from '../src/app.js';
import { readAuthConfig } from '../src/config.js';

test('production serves only compiled public files and keeps API/auth/error boundaries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'slotsure-client-'));
  const pool = new pg.Pool();
  const config = readAuthConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'test-only-secret-with-at-least-32-bytes',
    APP_ORIGIN: 'https://example.test',
  });
  assert.equal(config.serveClient, true);
  const app = createApp({ pool, config, clientDirectory: directory });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await mkdir(join(directory, 'assets'));
    await mkdir(join(directory, 'api'));
    await writeFile(
      join(directory, 'index.html'),
      '<!doctype html><html><body>SlotSure compiled client</body></html>',
    );
    await writeFile(
      join(directory, 'assets', 'app.js'),
      'console.log("compiled");',
    );
    await writeFile(join(directory, '.env'), 'PRIVATE_FIXTURE');
    await writeFile(join(directory, 'api', 'missing'), 'NOT_AN_API_RESPONSE');
    const index = await fetch(base);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.match(await index.text(), /compiled client/);
    assert.equal(index.headers.get('set-cookie'), null);
    assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
    assert.match(
      index.headers.get('content-security-policy'),
      /frame-ancestors 'none'/,
    );
    assert.ok(
      !index.headers.get('content-security-policy').includes('unsafe-inline'),
    );
    assert.equal(index.headers.get('referrer-policy'), 'same-origin');
    const asset = await fetch(`${base}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type'), /javascript/);
    for (const path of [
      '/api/missing',
      '/.env',
      '/server/.env',
      '/src/app.js',
      '/assets/missing.js',
      '/missing-page',
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 404, path);
      assert.match(
        response.headers.get('content-type'),
        /application\/json/,
        path,
      );
      assert.equal((await response.json()).error.code, 'NOT_FOUND');
    }
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/bookings/my`)).status, 401);
    const foreign = await fetch(`${base}/api/bookings`, {
      method: 'POST',
      headers: {
        Origin: 'https://foreign.test',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).error.code, 'ORIGIN_FORBIDDEN');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await app.locals.sessionStore.close();
    await pool.end();
    assert.equal(dirname(await realpath(directory)), await realpath(tmpdir()));
    assert.ok(basename(directory).startsWith('slotsure-client-'));
    await rm(directory, { recursive: true });
  }
});

test('compiled-client flag validates values without weakening production cookies', () => {
  const env = { SESSION_SECRET: 'test-only-secret-with-at-least-32-bytes' };
  assert.equal(readAuthConfig(env).serveClient, false);
  assert.equal(readAuthConfig({ ...env, SERVE_CLIENT: '1' }).serveClient, true);
  assert.throws(() => readAuthConfig({ ...env, SERVE_CLIENT: 'true' }));
  const production = readAuthConfig({
    ...env,
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://example.test',
    SERVE_CLIENT: '0',
  });
  assert.equal(production.serveClient, true);
  assert.equal(production.secureCookies, true);
});

test('startup on an occupied port exits without reporting a false successful listener', async () => {
  const holder = createServer();
  holder.listen(0, '127.0.0.1');
  await once(holder, 'listening');
  try {
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        [fileURLToPath(new URL('../src/index.js', import.meta.url))],
        {
          timeout: 5000,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            SERVE_CLIENT: '0',
            PORT: String(holder.address().port),
            HOST: '127.0.0.1',
            SESSION_SECRET: 'test-only-secret-with-at-least-32-bytes',
            APP_ORIGIN: 'http://127.0.0.1:5173',
            TRUST_PROXY: '0',
            DATABASE_URL: 'postgresql://unused@127.0.0.1:1/unused',
          },
        },
      ),
      (error) =>
        error.code === 1 &&
        !error.stdout.includes('listening') &&
        error.stderr.includes('API could not start.'),
    );
  } finally {
    await new Promise((resolve) => holder.close(resolve));
  }
});
