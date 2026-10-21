import { pathToFileURL } from 'node:url';
import { createPool } from './pool.js';

export async function seedConsultant(pool, { name, email, passwordHash }) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 100 ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof passwordHash !== 'string' ||
    !/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/.test(
      passwordHash,
    )
  ) {
    throw new Error(
      'Provide a name, email, and encoded Argon2id password hash.',
    );
  }
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'consultant')
     ON CONFLICT (role) WHERE role = 'consultant' DO NOTHING RETURNING id`,
    [name.trim(), email.trim().toLowerCase(), passwordHash],
  );
  return result.rowCount === 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const pool = createPool();
  try {
    const created = await seedConsultant(pool, {
      name: process.env.CONSULTANT_NAME,
      email: process.env.CONSULTANT_EMAIL,
      passwordHash: process.env.CONSULTANT_PASSWORD_HASH,
    });
    console.log(
      created ? 'Consultant created.' : 'Consultant already exists; unchanged.',
    );
  } catch {
    console.error(
      'Consultant seed failed. Check seed values, migrations, and database access.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
