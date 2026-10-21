import pg from 'pg';
import { readConfig } from '../config.js';

export function createPool() {
  const { databaseUrl } = readConfig();
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required for database access');
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  pool.on('error', () =>
    console.error('Unexpected idle database connection error.'),
  );
  return pool;
}
