import { createApp } from './app.js';
import { readConfig, readAuthConfig } from './config.js';
import { createPool } from './db/pool.js';
import { access } from 'node:fs/promises';

let port, host, config;
try {
  const settings = readConfig();
  ({ port, host } = settings);
  config = { ...readAuthConfig(), timeZone: settings.timeZone };
} catch {
  console.error(
    'Invalid startup configuration. Check PORT, HOST, CONSULTANT_TIME_ZONE, APP_ORIGIN, SESSION_SECRET, DATABASE_URL and deployment flags.',
  );
  process.exit(1);
}
if (config.serveClient) {
  try {
    await access(new URL('../../client/dist/index.html', import.meta.url));
  } catch {
    console.error(
      'Compiled client is missing. Run npm run build before starting.',
    );
    process.exit(1);
  }
}
const pool = createPool();
const app = createApp({ pool, config });
const server = app.listen(port, host, (error) => {
  if (!error) console.log(`SlotSure listening at http://${host}:${port}`);
});
let stopping = false;
async function closeResources() {
  await app.locals.sessionStore.close();
  await pool.end();
}
server.on('error', async () => {
  console.error('API could not start. Check host and port configuration.');
  try {
    await closeResources();
  } catch {
    console.error('Resource cleanup failed.');
  }
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      console.error('Graceful shutdown deadline exceeded.');
      process.exit(1);
    }, 10000);
    deadline.unref();
    server.close(async () => {
      try {
        await closeResources();
      } catch {
        console.error('Resource cleanup failed.');
        process.exitCode = 1;
      } finally {
        clearTimeout(deadline);
      }
    });
  });
}
