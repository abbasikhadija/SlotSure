# Controlled SlotSure benchmarks

No public production load test has been run. No measured capacity or latency is
claimed. Use an isolated local container with a dedicated synthetic database, or a
separate staging deployment/database with written operator authorization. Never use
khadija.prod.page or its database for stress tests. Blitz free only permits one DB;
use local PostgreSQL or a separate paid staging allocation, never share production.

## Throughput and latency

Create a dedicated local `slotsure_benchmark` database, migrate/seed it with synthetic
data using administrative commands under NODE_ENV=development, and configure hours.
Run the image with NODE_ENV=development, SERVE_CLIENT=1, APP_ORIGIN=http://127.0.0.1:8080,
PORT=8080 and independent session secret, binding only loopback. Production mode
deliberately rejects benchmark/test database names. Warm up once before recording.
Record commit/image digest, Node/PostgreSQL versions, CPU/memory limits, dataset size,
path, workers and request count. Example from repository root, PowerShell:

```powershell
$env:BENCHMARK_ORIGIN = 'http://127.0.0.1:8080'
$env:BENCHMARK_PATH = '/api/ready'
$env:BENCHMARK_REQUESTS = '200'
$env:BENCHMARK_CONCURRENCY = '4'
node server/scripts/benchmark.js
```

Repeat with `/api/health` and `/api/availability?date=YYYY-MM-DD` using tomorrow's
Karachi date. The script permits only loopback/read-only endpoints, at most 2,000
requests and 16 workers; no redirects should be configured on this isolated listener.
It reports completed requests/second, average milliseconds, nearest-rank P50/P95/P99,
error count and error fraction; failures and timeouts are included in latency samples.
It exits nonzero on errors. Loopback hostname alone cannot prove the operator chose
a synthetic database: verify configuration before running. A remote staging benchmark
requires a reviewed adaptation; the supplied tool intentionally refuses public URLs.
Increase workers 1 → 2 → 4 → 8 only while error rate is zero and resource usage is safe.
Do not infer end-to-end booking capacity from liveness/readiness throughput.

## Booking correctness under concurrency

Use the existing real database suite, with TEST_DATABASE_URL pointing to a separate
database ending `_test`, never the running app's database:

```sh
npm run test:db
```

The authenticated booking tests create synthetic users and isolated schemas, race
two customers for one slot and a booking against a block, check exact success/conflict
counts and persisted state, then clean their schemas. They also test cancellation,
authorization, commit rollback and real PDF downloads. This is a bounded correctness
test, not a requests/second benchmark. Repeat a few times for confidence, not an
unbounded stress loop. Never relax CSRF or rate limiting to measure auth throughput.

## PostgreSQL and memory

Against the synthetic benchmark database only, use the actual parameterized queries
in server/src/services/availability.js and booking-management.js with representative
parameters and `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. Inspect planning/execution
time, row estimates, index usage and buffers. ANALYZE executes the query: use SELECT
only. Record realistic synthetic booking counts; a tiny table's sequential scan is
not evidence of an absent index. Do not add speculative indexes without measurements.
Measure lock wait separately during the real concurrency tests; consultant writes
intentionally serialize on one row. Use pg_stat_statements only if already supported
by the isolated database; do not assume Blitz exposes it or change production settings.

```sh
docker stats --no-stream slotsure-blitz
```

Sample stats before, during and after a bounded run; record peak container memory and
CPU, the configured limit, and idle baseline. Track memory during concurrent synthetic
login (Argon2 uses substantial memory) and PDF downloads separately. `docker stats`
measures the container, whereas the Node script's own memory would measure the load
generator. Blitz memory/dashboard observations need later target execution. Stop on
OOM, timeouts, nonzero errors or sustained DB saturation. Delete the disposable
benchmark database/container only after verifying their identities.
