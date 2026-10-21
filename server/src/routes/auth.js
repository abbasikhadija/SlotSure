import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { promisify } from 'node:util';
import { createAuthService } from '../services/auth.js';
import { requireUser } from '../middleware/auth.js';

export function authRouter({ pool, generateToken, cookieName, cookieOptions }) {
  const router = Router();
  const service = createAuthService(pool);
  const limitOptions = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please try again in 15 minutes.',
      },
    },
  };
  const loginLimit = rateLimit({
    ...limitOptions,
    limit: 10,
    skipSuccessfulRequests: true,
  });
  const registerLimit = rateLimit({ ...limitOptions, limit: 5 });
  router.get('/csrf', async (req, res) => {
    const csrfToken = generateToken(req);
    await promisify(req.session.save).call(req.session);
    res.json({ csrfToken });
  });
  router.get('/me', requireUser(pool), (req, res) =>
    res.json({ user: req.user }),
  );
  router.post('/register', registerLimit, async (req, res) => {
    const user = await service.register(req.body);
    // Registration and login are separate: session-store failure cannot make a
    // successful account insert appear to have failed.
    res.status(201).json({ user });
  });
  router.post('/login', loginLimit, async (req, res) => {
    const user = await service.login(req.body);
    await promisify(req.session.regenerate).call(req.session);
    req.session.userId = user.id;
    const csrfToken = generateToken(req);
    await promisify(req.session.save).call(req.session);
    res.json({ user, csrfToken });
  });
  router.post('/logout', async (req, res) => {
    await promisify(req.session.destroy).call(req.session);
    res.clearCookie(cookieName, cookieOptions);
    res.json({ message: 'Signed out.' });
  });
  return router;
}
