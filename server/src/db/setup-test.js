import { createPool } from './pool.js';

// Creates only this fixed, separate database; never drops or clears any database.
const pool = createPool();
try {
  const exists = await pool.query(
    'SELECT 1 FROM pg_database WHERE datname=$1',
    ['slotsure_test'],
  );
  if (!exists.rowCount) await pool.query('CREATE DATABASE slotsure_test');
  console.log(
    'Dedicated slotsure_test database is ready. Set TEST_DATABASE_URL before running test:db.',
  );
} catch {
  console.error(
    'Test database setup failed. Ask your PostgreSQL administrator to create slotsure_test owned by the application role.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
