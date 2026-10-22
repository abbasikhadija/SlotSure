import { HttpError } from '../http-error.js';

export function requireUser(pool) {
  return async (req, _res, next) => {
    if (!req.session.userId)
      throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');
    const { rows } = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id=$1',
      [req.session.userId],
    );
    if (!rows[0])
      throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in to continue.');
    req.user = rows[0];
    next();
  };
}

export function requireConsultant(req, _res, next) {
  if (req.user.role !== 'consultant')
    throw new HttpError(
      403,
      'FORBIDDEN',
      'This action is only available to the consultant.',
    );
  next();
}

export function requireCustomer(req, _res, next) {
  if (req.user.role !== 'customer')
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Only customer accounts can book consultations.',
    );
  next();
}
