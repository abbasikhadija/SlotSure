// Explicit administrative start-command alternative for hosts without one-off jobs.
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { seedConsultant } from './db/seed-consultant.js';
import { readConfig, readAuthConfig } from './config.js';

const mode = process.argv[2];
if (!['migrate-start', 'initialize-start'].includes(mode)) {
  console.error('Choose migrate-start or initialize-start.');
  process.exitCode = 1;
} else {
  let pool;
  try {
    readConfig();
    readAuthConfig();
    pool = createPool();
    await migrate(pool);
    console.log('Database migrations applied.');
    if (mode === 'initialize-start') {
      const created = await seedConsultant(pool, {
        name: process.env.CONSULTANT_NAME,
        email: process.env.CONSULTANT_EMAIL,
        passwordHash: process.env.CONSULTANT_PASSWORD_HASH,
      });
      console.log(
        created
          ? 'Consultant created.'
          : 'Consultant already exists; unchanged.',
      );
    }
  } catch {
    console.error(
      'Release initialization failed. Check configuration, database access, migrations and consultant seed values.',
    );
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
  if (!process.exitCode) await import('./index.js');
}
