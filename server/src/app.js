import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { csrfSync } from 'csrf-sync';
import { authRouter } from './routes/auth.js';
import { requireUser, requireConsultant } from './middleware/auth.js';
import { HttpError, errorHandler } from './http-error.js';
import { createAvailabilityService } from './services/availability.js';
import { providerAvailabilityRouter } from './routes/availability.js';
import { createBookingService } from './services/bookings.js';
import { bookingsRouter } from './routes/bookings.js';

export function createApp({ pool, config, sessionSchema = 'public' }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', service: 'slotsure-api' }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('origin') && req.get('origin') !== config.appOrigin) {
        throw new HttpError(
          403,
          'ORIGIN_FORBIDDEN',
          'Request origin is not allowed.',
        );
      }
      if (!req.is('application/json'))
        throw new HttpError(
          415,
          'JSON_REQUIRED',
          'Send the request as application/json.',
        );
    }
    next();
  });
  app.use('/api', express.json({ limit: '8kb' }));
  const Store = connectPgSimple(session);
  const store = new Store({
    pool,
    schemaName: sessionSchema,
    tableName: 'user_sessions',
    createTableIfMissing: false,
    errorLog: () => console.error('Session store operation failed.'),
  });
  app.locals.sessionStore = store;
  const cookieName = 'slotsure.sid';
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
  };
  app.use(
    '/api',
    session({
      store,
      name: cookieName,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 },
    }),
  );
  const { generateToken, csrfSynchronisedProtection } = csrfSync();
  app.use('/api', csrfSynchronisedProtection);
  app.use(
    '/api/auth',
    authRouter({ pool, generateToken, cookieName, cookieOptions }),
  );
  const availability = createAvailabilityService({
    pool,
    timeZone: config.timeZone ?? 'Asia/Karachi',
  });
  app.get('/api/availability', async (req, res) =>
    res.json(await availability.availability(req.query.date)),
  );
  app.use(
    '/api/bookings',
    bookingsRouter({
      pool,
      service: createBookingService({
        pool,
        timeZone: config.timeZone ?? 'Asia/Karachi',
      }),
    }),
  );
  app.use(
    '/api/provider',
    requireUser(pool),
    requireConsultant,
    providerAvailabilityRouter(availability),
  );
  app.use((_req, res) =>
    res
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
  );
  app.use(errorHandler);
  return app;
}
