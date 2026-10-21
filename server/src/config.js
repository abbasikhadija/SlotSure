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
