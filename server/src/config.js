export function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const timeZone = env.CONSULTANT_TIME_ZONE ?? 'Asia/Karachi';
  new Intl.DateTimeFormat('en', { timeZone });
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
