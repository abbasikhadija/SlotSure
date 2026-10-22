import { spawnSync } from 'node:child_process';

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required; database tests were not run.');
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      'tests/database.test.js',
      'tests/auth.test.js',
      'tests/availability.test.js',
      'tests/bookings.test.js',
    ],
    { stdio: 'inherit', env: process.env },
  );
  process.exitCode = result.status ?? 1;
}
