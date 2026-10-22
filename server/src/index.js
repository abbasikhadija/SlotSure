import { createApp } from './app.js';
import { readConfig, readAuthConfig } from './config.js';
import { createPool } from './db/pool.js';
import { access } from 'node:fs/promises';

const { port, host, timeZone } = readConfig();
const config = { ...readAuthConfig(), timeZone };
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
server.on('error', async () => {
  console.error('API could not start. Check host and port configuration.');
  await app.locals.sessionStore.close();
  await pool.end();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () =>
    server.close(async () => {
      await app.locals.sessionStore.close();
      await pool.end();
    }),
  );
}
