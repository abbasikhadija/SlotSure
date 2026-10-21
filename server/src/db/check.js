import { createPool } from './pool.js';

let pool;
try {
  pool = createPool();
  await pool.query('SELECT 1 AS connected');
  console.log('PostgreSQL connectivity verified (SELECT 1).');
} catch {
  console.error(
    'PostgreSQL connectivity failed. Check DATABASE_URL and ensure PostgreSQL is running.',
  );
  process.exitCode = 1;
} finally {
  await pool?.end();
}
