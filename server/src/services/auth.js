import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { HttpError } from '../http-error.js';

export function validateCredentials(body, registration = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Enter your email and password.');
  }
  const allowed = registration
    ? ['name', 'email', 'password']
    : ['email', 'password'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, 'INVALID_INPUT', 'Unexpected account fields.');
  }
  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof body.password !== 'string' ||
    body.password.length < (registration ? 12 : 1) ||
    body.password.length > 128 ||
    (registration && (!name || name.length > 100))
  ) {
    throw new HttpError(
      400,
      'INVALID_INPUT',
      registration
        ? 'Enter a name (1–100 characters), valid email, and password (12–128 characters).'
        : 'Enter a valid email and password (up to 128 characters).',
    );
  }
  return { email, name, password: body.password };
}

export function createAuthService(pool) {
  // Unknown accounts still perform a real verification to reduce timing differences.
  let dummyHash;
  return {
    async register(body) {
      const { name, email, password } = validateCredentials(body, true);
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      try {
        const { rows } = await pool.query(
          `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'customer')
           RETURNING id, name, email, role`,
          [name, email, hash],
        );
        return rows[0];
      } catch (error) {
        if (error.code === '23505')
          throw new HttpError(
            409,
            'EMAIL_UNAVAILABLE',
            'An account with this email already exists. Try signing in.',
          );
        throw error;
      }
    },
    async login(body) {
      const { email, password } = validateCredentials(body);
      const { rows } = await pool.query(
        'SELECT id, name, email, role, password_hash FROM users WHERE email=$1',
        [email],
      );
      const account = rows[0];
      if (!account)
        dummyHash ??= argon2.hash(randomBytes(32), { type: argon2.argon2id });
      const verified = await argon2.verify(
        account?.password_hash ?? (await dummyHash),
        password,
      );
      if (!account || !verified)
        throw new HttpError(
          401,
          'INVALID_CREDENTIALS',
          'Email or password is incorrect.',
        );
      const { id, name, email: accountEmail, role } = account;
      return { id, name, email: accountEmail, role };
    },
  };
}
