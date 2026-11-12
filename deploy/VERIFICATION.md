# Blitz deployment preparation verification — 2026-11-12

One authorized deployment-preparation milestone. Existing application preserved;
no commits, pushes, repository settings changes or public deployment performed.

## Actual results

Windows, Node 22.14.0, npm 10.9.2, local real PostgreSQL 18.1. Container targets Node
24 / PostgreSQL 17 managed by Blitz; those target versions were not executed here.

| Command                                                 | Result                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| npm ci                                                  | Passed twice, including after lockfile remediation; 259 packages installed |
| npm run lint                                            | Passed                                                                     |
| npm test                                                | 20 passed, 0 failed, 5 explicitly skipped DB suites                        |
| npm run test:db                                         | 54 passed, 0 failed, 0 skipped, dedicated slotsure_test database           |
| npm run build                                           | Passed, Vite 8.3.5, 22 modules, compiled JS/CSS/HTML                       |
| npm audit --omit=dev                                    | 0 vulnerabilities after body-parser update                                 |
| docker build --platform linux/amd64 -t slotsure:blitz . | Blocked: docker command unavailable                                        |
| Container run/restart/image-layer audit                 | Not executed; depends on Docker                                            |
| Browser / real hosted TLS / proxy checks                | Not executed in this milestone                                             |
| Load and resource measurements                          | Not executed; bounded script and instructions supplied                     |

Formatting and git diff checks are recorded in context.md after final documentation.
Important HTTP/database coverage includes consultant login, customer registration,
session persistence/regeneration/logout, Secure cookie behavior with simulated proxy,
CSRF/origins, protected routes, customer ownership, working hours/blocks, booking races,
unique constraints, cancellation/history/rebooking, actual authorized PDF downloads,
migration rollback/repetition and release-start ordering. No mocked concurrency claims.
The new release test starts three real child processes against an isolated schema,
confirms readiness/migration tracking/account preservation and drops its own schema.
Windows child termination does not prove Linux graceful signal handling.

Initial issues: PostgreSQL was stopped and was restarted using the existing ignored
cluster. An early DB command used the wrong working directory; another was mistakenly
run while npm ci was replacing node_modules and failed imports. Those were execution
errors, not application defects; the final complete DB run above passed afterward.
An audit JSON read initially used the wrong Windows text encoding. Initial format
check flagged the new runbook before it was formatted. No failing check was hidden.

## Files and purpose

| File                             | Change / reason                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Dockerfile                       | Multi-stage workspace build, production dependencies, native Argon2 probe, non-root Node runtime, assets/font licenses, port/readiness |
| .dockerignore                    | Exclude secrets, local state, development artifacts and test/setup tools                                                               |
| .gitignore                       | Ignore named private *.env deployment files                                                                                            |
| package-lock.json                | Focused body-parser security fix; direct manifests unchanged                                                                           |
| server/src/config.js             | Production PostgreSQL/test separation and listener-host validation                                                                     |
| server/src/index.js              | Sanitized config failure, bounded/idempotent shutdown and cleanup errors                                                               |
| server/src/app.js                | Session-free DB/schema readiness; independent existing liveness                                                                        |
| server/src/release.js            | Explicit migration/initial-seed startup alternatives, never default                                                                    |
| server/src/db/seed-consultant.js | Real Argon2id hash parsing/verification, bounded costs; no overwrite                                                                   |
| server/src/db/test.js            | Include real release-start integration test                                                                                            |
| server/tests/deployment.test.js  | Config, readiness, secret-safe errors, invalid seed hash checks                                                                        |
| server/tests/release.test.js     | Real PostgreSQL first/repeated initialization and migration-only startup                                                               |
| server/scripts/benchmark.js      | Bounded loopback read-only latency/throughput/error metrics                                                                            |
| deploy/BLITZ_CLOUD.md            | Sourced platform procedure, env, migrations/seed, verification, updates/rollback                                                       |
| deploy/BENCHMARK.md              | Synthetic DB, concurrency correctness, query/memory measurement procedure                                                              |
| deploy/VERIFICATION.md           | This audit, file inventory, actual results and readiness classification                                                                |
| README.md, deploy/README.md      | Link the target-specific procedure                                                                                                     |
| docs/DECISIONS.md, context.md    | Architectural decisions and actual handoff                                                                                             |

No schema migration or booking/service/UI feature was removed or rewritten.

## Readiness assessment

| Requirement                                            | Classification                 | Evidence / remaining action                                                                         |
| ------------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Existing application audit                             | Verified                       | Workspaces, config, routes, services, migrations, auth, tests, assets and deployment files reviewed |
| Platform build/architecture/port/env/database workflow | Verified                       | Official sources linked in BLITZ_CLOUD.md; not proof of account setup                               |
| Proxy topology / safe trust setting                    | Blocked                        | Complete topology/header policy absent from reviewed official docs; obtain provider confirmation    |
| Dockerfile and ignore rules                            | Implemented but not tested     | Docker unavailable; Linux native probe runs when image builds                                       |
| Production env validation                              | Verified                       | HTTP/config tests; credentials must be supplied privately                                           |
| Migrations and initialization                          | Verified                       | Fresh/repeated/failed migrations and explicit release start on PostgreSQL 18                        |
| Managed PostgreSQL 17 behavior                         | Requires hosting configuration | Attach DB, execute initialization and verify on target                                              |
| Consultant initialization                              | Verified                       | Actual Argon2 validation, repeat/no-overwrite tests and consultant login                            |
| Auth/CSRF/session/ownership safeguards                 | Verified                       | Local real HTTP/DB suite; deployed TLS is separate                                                  |
| Deployed HTTPS/Secure cookies/domain                   | Requires hosting configuration | Assign khadija.prod.page, resolve proxy trust and run browser checks                                |
| Health/readiness                                       | Verified                       | Liveness independent of DB, readiness 503/200 and real release probe                                |
| Linux SIGTERM/SIGINT drain                             | Implemented but not tested     | Direct Node PID and bounded shutdown; Linux signal test pending                                     |
| Existing tests / production frontend build             | Verified                       | Results above                                                                                       |
| Container feature/restart/secret-layer verification    | Blocked                        | Docker not installed                                                                                |
| Benchmarks                                             | Implemented but not tested     | Script/instructions only; no measured metrics                                                       |
| Documentation/update/rollback route                    | Verified                       | Source-reviewed runbook; cloud operation not executed                                               |
| Actual hosting/public deployment                       | Requires hosting configuration | No account access or deployment performed                                                           |

Remaining risks: unknown proxy policy blocks safe authentication configuration;
unexecuted AMD64/native/container checks; PostgreSQL 17 target compatibility pending;
four moderate development-only ESLint/minimatch advisories; platform free sleep/trial
limits; Argon2/PDF peak memory unmeasured. Single API instance remains required for
process-local auth rate limiting. Existing identity limitations (no recovery/email
verification) and PDF snapshot/font limitations remain documented.
