import { HttpError } from '../http-error.js';

export async function withScheduleLock(pool, operation) {
  const client = await pool.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      "SELECT id, name FROM users WHERE role='consultant' FOR UPDATE",
    );
    if (!rows.length)
      throw new HttpError(
        503,
        'CONSULTANT_UNAVAILABLE',
        'The consultant account is not configured yet.',
      );
    const result = await operation(client, rows[0]);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      releaseError = rollbackError;
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}
