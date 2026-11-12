export function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const timeZone = env.CONSULTANT_TIME_ZONE ?? 'Asia/Karachi';
  new Intl.DateTimeFormat('en', { timeZone });
  if (env.HOST !== undefined && (!env.HOST.trim() || /[\s/]/.test(env.HOST))) {
    throw new Error('HOST must be a nonempty listener hostname or IP address');
  }
  if (env.NODE_ENV === 'production') {
    let database;
    try {
      database = new URL(env.DATABASE_URL);
    } catch {
      throw new Error('DATABASE_URL must be a PostgreSQL URL in production');
    }
    if (
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      !database.hostname ||
      database.pathname.length < 2 ||
      /(?:_test|_benchmark)$/.test(database.pathname) ||
      env.TEST_DATABASE_URL
    ) {
      throw new Error(
        'Production requires a PostgreSQL application database and no TEST_DATABASE_URL',
      );
    }
  }
  return {
    port,
    host: env.HOST ?? '127.0.0.1',
    timeZone,
    databaseUrl: env.DATABASE_URL,
  };
}

export function readAuthConfig(env = process.env) {
  if (!env.SESSION_SECRET || Buffer.byteLength(env.SESSION_SECRET) < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes');
  }
  const production = env.NODE_ENV === 'production';
  const origin = new URL(env.APP_ORIGIN ?? 'http://127.0.0.1:5173');
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (production && origin.protocol !== 'https:')
  ) {
    throw new Error(
      'APP_ORIGIN must be a single HTTP origin (HTTPS in production)',
    );
  }
  if (env.TRUST_PROXY !== undefined && !['0', '1'].includes(env.TRUST_PROXY)) {
    throw new Error('TRUST_PROXY must be 0 or 1');
  }
  if (
    env.SERVE_CLIENT !== undefined &&
    !['0', '1'].includes(env.SERVE_CLIENT)
  ) {
    throw new Error('SERVE_CLIENT must be 0 or 1');
  }
  return {
    sessionSecret: env.SESSION_SECRET,
    appOrigin: origin.origin,
    secureCookies: production,
    trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
    serveClient: production || env.SERVE_CLIENT === '1',
  };
}
