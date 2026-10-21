# SlotSure project handoff

Last updated: 2026-10-21 (Asia/Karachi).

## Product purpose and boundaries

SlotSure helps one independent consultant and registered customers schedule consultations without conflicting reservations. Read `PROJECT_SPEC.md` completely before development. MVP: customer and consultant roles only, one appointment type, exactly 30 minutes, 14-day advance window, weekly hours, individual blocks, booking/cancellation, and on-demand PDF confirmations. No payments, notifications, multiple consultants, calendar integration, or other excluded scope.

## Current milestone

**Milestone 0 — Project Foundation: implemented and verified. STOPPED.**

Milestone 1 has not begun. Do not begin it until the developer explicitly authorizes it.

## Agreed stack and current architecture

- JavaScript ES modules; React 19 / Vite 8 in `client/`; Node.js / Express 5 in `server/`.
- PostgreSQL through `pg`, raw parameterized SQL for future user-controlled values; no ORM.
- npm workspaces and one root lockfile. Node 24 LTS recommended (`.nvmrc`); installed Node 22.14.0 used and verified under the specification's environment exception. Node 24 execution not run locally.
- Browser fetches relative `/api/health`; Vite on 127.0.0.1:5173 proxies `/api` to Express on 127.0.0.1:3000. No cross-origin deployment or CORS package.
- Express app is separate from the listener so HTTP tests can use an ephemeral port.
- `/api/health` is liveness only, returns `{ "status": "ok", "service": "slotsure-api" }`. Unknown routes return a JSON error with HTTP 404.
- `server/src/config.js` validates the port and consultant IANA time zone. Defaults: 3000, loopback host, Asia/Karachi.
- `server/src/db/pool.js` creates a bounded pool only for database access; `db:check` performs real `SELECT 1`, always closes the pool, and returns nonzero on failure. Public errors do not print credentials.
- Node built-in environment file support, watch mode, and test runner avoid extra runtime tooling. ESLint with React Hooks rules and Prettier provide basic checks.

## Database design summary

**Implemented:** connection configuration and a connectivity command only. Empty local database; no domain schema, migrations, seed accounts, sessions, or booking tables.

**Planned:** users, weekly hours, blocked slots, bookings; appropriate checks/foreign keys; unique email; one consultant; partial unique index for confirmed start times. Booking/availability mutations will acquire a transaction-scoped consultant-row lock using one checked-out client, recheck rules, and reliably roll back/release. These are requirements, not completed functionality. See `docs/DECISIONS.md`.

## Implemented and verified functionality

- Inspected initial repository: only `PROJECT_SPEC.md`; no existing code or Git repository. Initialized Git without staging, committing, or pushing.
- Created client/server workspace packages, lockfile, environment example, ignore rules, ESLint/Prettier configuration, README, agent rules, and decision journal. Original specification preserved.
- React foundation screen renders in an actual in-app browser, displays `API connected`, and explains that booking arrives later. Screenshot inspected at normal desktop size.
- Frontend and backend development commands start successfully.
- Health and unknown-route behavior tested over actual HTTP. Configuration rejects invalid ports/time zones.
- Real PostgreSQL 18.1 connectivity verified using the application command. No mocked database verification.
- Generated local credentials and cluster files are excluded by Git ignore rules.

## Verification results

Executed on Windows, Node 22.14.0, npm 10.9.2, PostgreSQL 18.1:

| Command/check                                                                  | Actual result                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `npm install`                                                                  | Passed; 218 packages added; installation audit reported 0 vulnerabilities.      |
| `npm run format`                                                               | Passed; authored files formatted, specification excluded.                       |
| `npm run lint`                                                                 | Passed.                                                                         |
| `npm test`                                                                     | Final run passed: 2 tests, 0 failures (HTTP health/404 and config validation).  |
| `npm run build`                                                                | Passed; Vite produced `client/dist`.                                            |
| `npm run dev:server`                                                           | Passed; API listening on port 3000.                                             |
| `npm run dev:client`                                                           | Passed; Vite listening on port 5173.                                            |
| `npm run db:check`                                                             | Passed against real PostgreSQL: `PostgreSQL connectivity verified (SELECT 1).`  |
| Browser                                                                        | Passed: page rendered and showed `API connected`; desktop screenshot inspected. |
| `git check-ignore server/.env .local/pg-password .local/postgres node_modules` | Passed; all paths ignored. No commits made.                                     |

Final `npm run format:check` passed: all matched files use Prettier code style. Final lint also passed after writing the handoff documents. Offline lockfile metadata refresh passed with 0 reported vulnerabilities.

Initial attempts encountered environmental failures: npm DNS was blocked in the sandbox; HTTP fetch and PostgreSQL loopback access were denied; browser access to sandboxed servers timed out. Retried required network/install/test/server/database commands outside the sandbox with approval. Initial HTTP test was 1 pass / 1 failure; final rerun was 2 passes. Restart attempts briefly collided with old development processes; stopped owned processes and restarted successfully. No application workaround weakened security or replaced a real database test.

Not run: Node 24 runtime verification, mobile browser testing, future authentication/availability/booking/concurrency/PDF tests, production deployment. `npm ci` is documented for future checkouts; this session installed dependencies with `npm install`.

## Local state and commands

- Ignored `server/.env` already configured; do not print or commit it.
- Isolated, password-authenticated PostgreSQL cluster: `.local/postgres`; loopback port 55432; database `slotsure`; local development role `slotsure`. No system service was changed.
- Both development servers and PostgreSQL were left running at handoff. Ctrl+C stops the app servers. See README for cluster start/stop commands after a reboot; `.local` and `.env` are not portable setup artifacts.
- `npm run dev:server` and `npm run dev:client` in separate terminals. Open http://127.0.0.1:5173.
- Checks: `npm test`, `npm run db:check`, `npm run lint`, `npm run format:check`, `npm run build`.

## Important decisions

See `docs/DECISIONS.md` for the required decision/problem/alternatives/reasoning/trade-off records. Minimal workspaces, same-origin development proxy, explicit database connectivity separate from API liveness, supported existing runtime, and deferred schema are deliberate choices. Dependencies serve the specified stack and basic checks; no authentication, date-time, PDF, or migration dependencies were installed prematurely.

## Work in progress, bugs, and pending tasks

- No known foundation application bugs. Final formatting and lint checks passed after writing the handoff documents.
- No work in progress beyond Milestone 0 handoff. No production hosting, Fast Refresh plugin, or domain functionality yet.
- A live API health response does not prove database availability. Use the separate database check.
- Future authentication excludes email verification/password recovery; public demonstrations must use synthetic data. Do not claim a commercial production-ready identity system.
- Future database and concurrency requirements remain unimplemented and untested by design.

## Immediate next step

Wait for explicit authorization for **Milestone 1 — Database Foundation**. Then implement minimum schema, migrations, controlled consultant seeding, test database setup, and real PostgreSQL integrity tests. Do not implement authentication in that milestone.
