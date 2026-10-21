import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPool } from './pool.js';

export async function migrate(
  pool,
  directory = new URL('../../migrations/', import.meta.url),
) {
  const files = (await readdir(directory))
    .filter((file) => /^\d+_[a-z_]+\.sql$/.test(file))
    .sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize migration runners without advisory locks or extra dependencies.
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    await client.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const applied = new Set(
      (await client.query('SELECT name FROM schema_migrations')).rows.map(
        (row) => row.name,
      ),
    );
    for (const file of files) {
      if (applied.has(file)) continue;
      await client.query(await readFile(new URL(file, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        file,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pool = createPool();
  try {
    await migrate(pool);
    console.log('Database migrations applied.');
  } catch {
    console.error(
      'Database migration failed. Check database access and migration files.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
