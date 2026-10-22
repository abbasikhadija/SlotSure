# Final engineering verification — Milestone 8

Date: 2026-10-22. Initial Git status was clean. Milestones 0–7 were preserved.
Local portfolio delivery is complete; no public deployment is claimed. No commits
or pushes were made. Public hosting/domain/database credentials were not supplied.

## Delivery changes

- Express serves only client/dist when NODE_ENV=production. Optional SERVE_CLIENT=1
  supports a local compiled preview. Production always retains Secure cookies and
  HTTPS origin validation; the preview flag cannot disable production protections.
- Unknown /api routes terminate with JSON before static middleware. Private dotfiles,
  source paths, missing assets/pages and foreign-origin mutations are tested.
- Compiled serving sends a same-origin CSP, nosniff and same-origin referrer policy.
  The UI uses fragment navigation, so no wildcard HTML fallback is needed.
- Startup fails clearly if the compiled index is absent. Port collisions close
  resources, exit nonzero, and no longer emit a false successful listener message.
- Root npm start, deployment environment/Caddy templates, a deployment runbook,
  consolidated README, private demo setup, and real synthetic-data screenshots supplied.

## Executed automated checks

| Check                                              | Actual result                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Initial npm test on installed Node 22.14           | 14 passed, 0 failed, 4 DB suites skipped                                                              |
| Initial npm run test:db                            | 53 passed, 0 failed, 0 skipped, real PostgreSQL 18.1                                                  |
| npm run db:check                                   | Passed SELECT 1                                                                                       |
| Focused new production/startup tests on Node 22.14 | 3 passed, 0 failed                                                                                    |
| Full tests on bundled Node 24.19.0                 | 17 passed, 0 failed, 4 DB suites skipped                                                              |
| Full DB suite on Node 24.19.0                      | 53 passed, 0 failed, 0 skipped                                                                        |
| npm run build on Node 22.14                        | Passed, Vite 8.3.5, 22 modules                                                                        |
| Vite build on Node 24.19.0                         | Passed, same compiled assets                                                                          |
| Production dependency audit                        | 0 known vulnerabilities reported by npm audit --omit=dev                                              |
| Top-level dependency review                        | Every runtime dependency maps to an implemented feature; no additions                                 |
| Compiled-file inspection                           | Referenced HTML JS/CSS assets exist                                                                   |
| Configured-secret scan                             | Actual DATABASE_URL/TEST_DATABASE_URL/SESSION_SECRET absent from unignored source and compiled output |

Node 24 commands used the executable returned by the bundled workspace runtime,
without changing the user's system Node installation. From server/, the commands were
`node --test tests/*.test.js` and `node --env-file-if-exists=.env src/db/test.js` with
that executable. The DB runner launches its test children with the same Node runtime.
From client/, its Node executable ran `../node_modules/vite/bin/vite.js build`.

All DB suites create unique empty schemas, apply the actual migrations, and clean up
only their own schemas. Migration tests verify fresh application, repeat application,
rollback after invalid DDL, and both migration tracking entries. The development
database was not cleared. Expected fault-injection tests log only generic API errors.

## Authorization and security review

| Boundary                 | Evidence                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Customer ownership       | SQL filters authenticated owner for lists, cancellation and PDF; foreign/missing IDs share 404             |
| Consultant role          | Middleware reloads current DB role; customer registration rejects role assignment                          |
| Session lifecycle        | Argon2id hashes, regenerated login session/CSRF, persisted PostgreSQL sessions, logout/replay/expiry tests |
| Browser mutations        | JSON-only, 8 KiB body limit, session CSRF, exact supplied Origin; rejected forged/cross-session tokens     |
| Production cookies/proxy | HttpOnly, SameSite=Lax, Secure and HTTPS origin required; real PG test simulates one forwarded TLS hop     |
| Rate limits              | Failed login and registration limited; process-local counters documented for one API instance              |
| Error handling           | Safe JSON without stack/credentials; rollback, session outage and PDF DB-failure tests                     |
| Static delivery          | Public build root only, no unknown API HTML fallback, private files/source unavailable                     |

The new production static tests use an owned temporary public directory and real
HTTP. They do not require a mocked database or pretend to test browser rendering.
Source and runtime tests retain the prior domain/security guarantees.

## Database/query review

- All supplied values remain SQL parameters. List ordering/filter fragments are
  chosen from fixed validated options; owner filters are not client-controlled.
- Bookings, blocks, unblock, hours changes and cancellation share the consultant-row
  transaction lock, revalidate after waiting, use one client, and reliably release it.
- Confirmed-only start uniqueness is a database safeguard alongside the aligned
  30-minute rule. Customer foreign key/status/timestamp checks preserve history.
- Availability uses one day-bounded snapshot; existing indexes cover starts and owner
  lookups. Lists return 50 records plus a hasMore probe. No performance numbers are
  claimed; offset scans may cost more as history grows, a documented MVP trade-off.
- Two authenticated customers racing receive one 201/one 409 with one confirmed row.
  Booking/block and cancellation races, changed hours/time after lock wait, and
  commit-time rollback remain tested against PostgreSQL, not simulated arrays.
- PDFs use a single owner-filtered read snapshot and in-memory output; canceled
  documents are explicit and never resurrect reservations or persist generated files.

## Browser and deployment limits

The latest completed customer/consultant browser journeys are the Milestone 7 review
in docs/UX_REVIEW.md, including real confirmed/canceled downloads, cancellation,
conflict recovery, block/unblock, keyboard focus and 320–1280px viewport checks.
README screenshots are those real synthetic-data captures, not new deployment proof.

For Milestone 8, a compiled-client local HTTP smoke server was started on port 3001.
Browser navigation to that origin was declined by the permission gate. It was not
retried through another browser, origin or workaround. Compiled-client browser/CSP
execution and click-to-download are therefore **not verified** in this milestone.
The temporary server is stopped at handoff; ordinary development settings are preserved.

Production file-serving/security/startup are verified over automated HTTP. Actual
deployed TLS, proxy behavior, public URL and remote database access remain unverified:
no hosting target was configured. Caddy is unavailable locally; its minimal template
was checked against official documentation but not validated by the Caddy binary.
See deploy/README.md for the deployment gates and commands.

No fresh npm ci, physical-device matrix, comprehensive screen-reader/WCAG assessment,
or performance/load benchmark was run in this milestone. npm audit is a point-in-time
known-vulnerability check, not a complete security certification. Remaining product
limits (email recovery, idempotency replay, PDF font coverage, stale other tabs) are
listed in README. No new product feature or excluded scope was introduced.
