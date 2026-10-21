import { createApp } from './app.js';
import { readConfig, readAuthConfig } from './config.js';
import { createPool } from './db/pool.js';

const { port, host } = readConfig();
const config = readAuthConfig();
const pool = createPool();
const app = createApp({ pool, config });
const server = app.listen(port, host, () =>
  console.log(`SlotSure API listening at http://${host}:${port}`),
);
server.on('error', () => {
  console.error('API could not start. Check host and port configuration.');
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
