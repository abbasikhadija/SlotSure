import { HttpError } from '../http-error.js';

export async function withScheduleLock(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      "SELECT id FROM users WHERE role='consultant' FOR UPDATE",
    );
    if (!rowCount)
      throw new HttpError(
        503,
        'CONSULTANT_UNAVAILABLE',
        'The consultant account is not configured yet.',
      );
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
