// Bounded read-only benchmark; intentionally limited to an isolated local instance.
import { performance } from 'node:perf_hooks';

const origin = new URL(process.env.BENCHMARK_ORIGIN ?? 'http://127.0.0.1:8080');
const path = process.env.BENCHMARK_PATH ?? '/api/ready';
const count = Number(process.env.BENCHMARK_REQUESTS ?? 200);
const concurrency = Number(process.env.BENCHMARK_CONCURRENCY ?? 4);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
  origin.username ||
  origin.password ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  !/^\/api\/(health|ready|availability(?:\?date=\d{4}-\d{2}-\d{2})?)$/.test(
    path,
  ) ||
  !Number.isInteger(count) ||
  count < 1 ||
  count > 2000 ||
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 16
) {
  throw new Error(
    'Use a loopback benchmark instance, allowed read-only API path, 1–2000 requests and 1–16 workers.',
  );
}
let next = 0;
let errors = 0;
const latencies = [];
const start = performance.now();
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next++ < count) {
      const before = performance.now();
      try {
        const response = await fetch(new URL(path, origin), {
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        });
        await response.arrayBuffer();
        if (!response.ok) errors++;
      } catch {
        errors++;
      }
      latencies.push(performance.now() - before);
    }
  }),
);
const seconds = (performance.now() - start) / 1000;
latencies.sort((a, b) => a - b);
const percentile = (p) => latencies[Math.max(0, Math.ceil(p * count) - 1)];
console.log(
  JSON.stringify(
    {
      requests: count,
      concurrency,
      seconds,
      requestsPerSecond: count / seconds,
      averageMs: latencies.reduce((a, b) => a + b, 0) / count,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      errors,
      errorRate: errors / count,
    },
    null,
    2,
  ),
);
if (errors) process.exitCode = 1;
