import { app } from './app.js';
import { readConfig } from './config.js';

const { port, host } = readConfig();
const server = app.listen(port, host, () =>
  console.log(`SlotSure API listening at http://${host}:${port}`),
);
server.on('error', () => {
  console.error('API could not start. Check host and port configuration.');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close());
}
