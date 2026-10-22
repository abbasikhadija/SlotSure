# Milestone 5 handoff — 2026-10-22 (Asia/Karachi)

## Current status and boundaries

**Milestone 5 — Booking Management: implemented and verified through real HTTP and
PostgreSQL tests. STOPPED.** This section supersedes the retained historical handoffs.
Read PROJECT_SPEC.md, AGENTS.md, context.md and decisions before edits; initial Git
status was clean. Existing Milestone 4 implementation was preserved. No commits/pushes.
Milestone 6 (PDF) has not begun. MVP remains one consultant, customers, one type,
30-minute appointments, 14 consultant-local booking dates; same JS/React/Vite/Express/pg
stack, ignored environment files and existing schema. No dependencies/migrations added.

## Implemented architecture and API

- New server/src/services/booking-management.js handles listing and cancellation.
- GET /api/bookings/my: authenticated customer only; SQL filters authenticated owner.
- GET /api/provider/bookings: consultant only, includes customer name/email.
- Both accept only view=upcoming|history (default upcoming) and page=1..9999 (default 1).
  Upcoming = future confirmed, sorted starts_at/id ascending. History = canceled OR
  started/past, sorted descending. At most 50 rows returned, one extra row for hasMore.
  Response: bookings, view, page, hasMore, timeZone. Booking fields: id, reference,
  consultantName, startsAt, endsAt, durationMinutes, timeZone, status, canceledAt,
  canCancel; provider list additionally includes customer name/email. No password data.
- PATCH /api/bookings/:id/cancel: authenticated customer owner or consultant; JSON {},
  existing CSRF/origin/JSON protections. Validate decimal positive bigint; foreign and
  missing records share 404. Recheck current role/ownership/time after consultant lock.
  Future confirmed -> canceled with timestamp, 200 only after COMMIT. Started/past
  confirmed -> 409 BOOKING_STARTED for both roles. Repeated cancellation -> 200,
  unchanged timestamp, including after appointment start. Never delete history.
- Reuses withScheduleLock and parameterized SQL. Same schedule lock orders booking,
  cancellation, blocks and hours. Existing confirmed partial unique index allows
  rebooking while retaining canceled rows. Current hours/blocks still determine whether
  cancellation makes the time publicly available.
- New BookingDashboard.jsx serves both roles: Upcoming/History, refresh, pagination,
  cancellation feedback/disabled duplicate submissions, server-derived eligibility.
  Account-keyed unmount aborts requests. Main refresh revisions connect successful
  booking to dashboard and cancellation outcomes to dashboard/availability. Picker
  callback added without losing successful confirmation. Labels now include year.
- README and docs/DECISIONS.md document contracts, policy, and trade-offs.

## Commands and actual verification results

- Formatted only changed source/docs using installed Prettier.
- npm run test:db: PASS, 50 tests, 0 failed, 0 skipped, real PostgreSQL 18.1.
  Added nine management subtests to existing booking HTTP suite, reusing real
  authenticated sessions and isolated per-run schema. All existing suites still pass.
  Coverage: customer/provider reads, foreign/missing privacy, current owner permissions,
  anonymous/CSRF/role rejection, malformed IDs/body/query, bounded pagination,
  past/started rejection, timestamp-preserving repeats, history, availability release,
  rebooking, simultaneous owner/provider cancellation, cancellation versus rebooking
  and block races, time advancing while a lock waits, commit-failure rollback/retry,
  and unavailable canceled times when blocked or outside hours.
- npm run lint: PASS.
- Initial sandbox npm test: FAILED, foundation HTTP fetch blocked by loopback access
  (8 passed, 1 failed, 4 skipped). Reran with required escalation; no source workaround.
- Escalated npm test: PASS, 9 passed, 0 failed, 4 DB integration suites explicitly
  skipped. Mandatory DB command above separately ran them against PostgreSQL.
- npm run build: PASS, Vite 8.3.5, 21 modules, production bundle generated.
- Browser attempt: NOT VERIFIED. In-app browser opening http://127.0.0.1:5173 timed
  out (ERR_CONNECTION_TIMED_OUT), consistent with prior milestone's local limitation.
  No successful visual cancellation journey or screenshot claimed.
- npm run format:check: PASS after documentation updates.
- git diff --check: PASS; only configured LF/CRLF notices. git check-ignore confirms
  server/.env and .local remain ignored; git ls-files returns neither path.

## Files changed

New: server/src/services/booking-management.js; client/src/components/BookingDashboard.jsx.
Modified: server/src/app.js, server/src/routes/bookings.js, server/tests/bookings.test.js;
client/src/main.jsx, client/src/components/SlotPicker.jsx, client/src/lib/schedule.js,
client/src/styles.css; README.md, docs/DECISIONS.md, context.md.
No development data was inserted or removed by this milestone's tests: all new fixtures
live in the isolated test schema, which is removed after verification. No secrets printed.

## Known limitations and immediate next step

No known failing automated checks. Visual browser workflow remains unverified because
local browser access timed out. Offset pages may shift as records change; refresh.
Cancellation refresh remounts availability, resetting selected times and any unsaved
provider-hours draft. Other tabs require manual refresh. Eligibility in a displayed list
can age; the server rechecks on submission. Past appointments cannot be canceled by
either role. Confirmation screen is page-memory only, but persisted reservations can
now be recovered through My bookings. No persistent booking idempotency response replay.
Not run: Node 24, deployed HTTPS, mobile-width browser checks. PDFs are not implemented.
Next step: Milestone 6 — PDF Confirmation, only when explicitly authorized. Do not
start it automatically. Never commit/push without explicit user authorization.

---

# Milestone 4 handoff — 2026-10-22 (Asia/Karachi)

## Current milestone and boundaries

**Milestone 4 — Booking Engine: implementation complete; PostgreSQL verification passed. STOPPED.**
This supersedes historical handoffs below. Resumed after a usage interruption;
read PROJECT_SPEC.md, AGENTS.md, context.md, decisions and Git changes before edits.
Preserved the existing interrupted implementation rather than restarting it.
Milestone 5 has not begun. No commit or push was performed.

## Implementation and decisions

- POST /api/bookings requires a current authenticated customer and session CSRF.
  Accepts only startsAt; owner, duration and status are server-controlled.
- Booking uses the existing consultant-row FOR UPDATE transaction protocol and
  shared availability validator. Current time, grid, 14-date window, hours, blocks
  and confirmed occupancy are checked after waiting, on the transaction client.
- Parameterized INSERT; confirmed partial unique index remains defense in depth.
  Conflicts return 409, invalid input 400, authentication/role failures 401/403.
  Response is returned only after COMMIT. Rollback failure discards the client
  without replacing the original error. No dependencies or migrations added.
- Customer picker submits a booking, guards repeated clicks, refreshes on conflict,
  and shows consultant/date/time/zone/duration/reference/status confirmation.
  Account changes unmount the picker and abort its pending request. Uncertain
  network/server outcomes warn before retry; no automatic repeat POST.
- New real PostgreSQL booking suite covers authorization/CSRF, ownership, input,
  persistence, duplicates, two authenticated customer races, booking/block races,
  newly committed hours, time advancing during lock wait, commit-time rollback,
  and rebooking alongside canceled historical fixtures. No cancellation API added.
- See docs/DECISIONS.md and README.md for contracts and engineering trade-offs.

## Commands and actual results

- npm test: PASS, 9 passed, 0 failed, 4 database integration suites explicitly skipped.
- Initial resumed npm run test:db: FAILED, local PostgreSQL stopped (ECONNREFUSED).
  Restarted existing ignored .local/postgres using the README pg_ctl command.
- npm run test:db after restart: PASS, 41 passed, 0 failed, 0 skipped against real
  PostgreSQL 18.1. Observed two customer lock waiters, exactly one 201/one 409 and
  one confirmed row. Booking versus block cannot both succeed. Commit failure
  leaves zero rows and a subsequent request succeeds.
- npm run lint: PASS. An earlier no-useless-assignment test warning was corrected.
- npm run build: PASS, Vite production output, 20 modules.
- npm run format:check: PASS after final documentation formatting.
- git diff --check: PASS; only Git's configured LF/CRLF notices. Ignored server/.env
  and .local fixture files verified with git check-ignore; neither is tracked.
- Browser booking confirmation/conflict journey: NOT VERIFIED. Resumed in-app
  browser attempts timed out connecting to local Vite; CLI fixture API also timed
  out. Previous browser progress reached customer selection before interruption.
  Do not claim a successful browser booking or screenshot.
- Temporary synthetic block from interrupted browser work was cleaned by exact
  recorded id AND timestamp using parameterized SQL after API timeout. Development
  database count then: 0 blocks, 0 bookings. No customer/consultant data removed.

## Files and local state

New: server/src/services/bookings.js, server/src/routes/bookings.js,
server/tests/bookings.test.js, client/src/components/BookingConfirmation.jsx.
Updated: app wiring, customer middleware, shared availability validation and lock
helper, DB test runner, SlotPicker, main.jsx, styles.css, README, decisions, context.
Ignored environment/credentials preserved. Local PostgreSQL runs on port 55432;
API/Vite start commands were attempted on 3000/5173 but browser connectivity was
unavailable. Do not assume development listeners remain healthy after this session.
No Node 24, deployed HTTPS, mobile-width or production browser verification run.

## Remaining limitations and immediate next step

No known failing automated checks. Browser end-to-end confirmation remains unverified.
Confirmation is page-memory only: reload loses the screen, not the saved booking.
No persistent idempotency response recovery. Booking history, cancellation, and PDFs
remain outside Milestone 4. Keep the one-consultant, 30-minute, 14-date MVP boundary.
Next authorized milestone would be Milestone 5 — Booking Management; await user
instruction and do not begin it automatically.

---

# Milestone 3 handoff — 2026-10-22 (Asia/Karachi)

## Current milestone and boundaries

**Milestone 3 — Availability Management: implemented and verified. STOPPED.**
The user authorized continuing after Milestone 2. Milestone 4 has not begun.
This section supersedes the historical handoffs retained below.

MVP remains one consultant, customers, one consultation type, 30-minute appointments,
and a 14-day booking window. JavaScript, React/Vite, Express, PostgreSQL, pg and
parameterized SQL remain the stack. Existing authentication, sessions, security,
schema constraints, and useful frontend work were preserved. No booking/cancellation
API, reservation submission, confirmation screen, PDF, or excluded feature was added.

## Implemented architecture and behavior

- Added Luxon 3.7.2 to the server and updated the root lockfile. The existing configured
  IANA zone now reaches the availability service through index/createApp; default
  remains Asia/Karachi. Intl formats browser labels in that zone with UTC offsets.
- `services/slots.js`: shared pure date/window/grid/hour/overlap rules. The window is
  **14 consultant-local dates, today through today+13 inclusive**, with starts at or
  before now excluded. A final slot may end exactly at midnight. Slots last exactly
  30 elapsed minutes. No manual UTC offsets are added.
- Walk real instants within a local day rather than constructing ambiguous local
  times: spring gaps are absent, autumn repetitions retain distinct UTC instants.
  The first and final occupied instants must remain within the local working interval.
- `services/availability.js`: one domain SQL statement per requested date reads a
  consistent PostgreSQL snapshot of weekly hours and date-bounded blocked/confirmed
  instants. Session middleware may perform its own constant session-store queries.
  No per-slot queries or persistent generated slots. Canceled history is excluded
  from occupied times; overlapping occupied instants are handled defensively.
- GET `/api/availability?date=YYYY-MM-DD` is public and returns only date, timeZone,
  minDate, maxDate, durationMinutes, and slots with UTC startsAt/endsAt. Missing date
  defaults to consultant-local today so the browser obtains authoritative bounds.
  Invalid/repeated date parameters and out-of-window dates return safe 400 errors.
- GET/PUT `/api/provider/hours` supports full-week replacement of up to seven ISO
  weekday intervals, one per day. Omitted weekdays mean unavailable; boundaries
  must align to 00/30 minutes; 24:00 is supported only as an end; overnight/equal
  boundaries, duplicates, extra fields, and malformed inputs are rejected.
- GET/POST `/api/provider/blocks` and DELETE `/api/provider/blocks/:id`: list current
  window blocks, block valid future working slots, and unblock. Duplicate blocks
  and conflicts with confirmed reservations return 409; missing blocks return 404.
  Existing bookings are never canceled or modified. Existing blocks survive hours changes.
- `db/schedule-transaction.js`: actual shared helper for all three schedule mutations.
  Checks out one client, begins a transaction, obtains the consultant-row FOR UPDATE
  lock, executes the operation, commits/rolls back, and releases the client. Block
  time/grid/window/hours/occupancy checks happen after lock acquisition. Missing
  consultant returns controlled 503. Future booking/cancellation writes must join
  this same protocol and revalidate using their checked-out transaction client.
- Hours reads/saves return outsideHoursCount for existing future confirmed bookings.
  The consultant UI warns about that count while preserving all reservation records.
- React shares SlotPicker between visitors/customers and consultant blocking, with
  separate ConsultantAvailability weekly-hours and block-list management. Requests
  are aborted on replacement/unmount; date/refresh/schedule changes clear selections.
  Empty/loading/error/success states and labeled controls are provided. Date/time
  selection explicitly creates no reservation. Changing hours/unblocking resets the
  consultant picker to today; other tabs require a refresh for schedule updates.
- No schema migration was needed; the existing tables/indexes already support this
  milestone. The auth test now expects consultant hours GET to succeed rather than 404.

## Actual commands and verification

Executed with Node 22.14.0, npm 10.9.2, PostgreSQL 18.1:

- `npm install --workspace server luxon --fetch-retries=0 --fetch-timeout=15000`:
  passed after sandbox DNS failure and approved retry outside sandbox; one package
  added, audit reported 0 vulnerabilities (240 packages audited).
- `npm test`: passed **9 tests, 0 failures, 3 explicitly skipped integration suites**.
  Includes date parsing/window edges, local midnight, past exclusion, exact duration,
  overlap exclusion, weekly-hour validation, explicit-offset/grid validation,
  Kathmandu non-hour offset, midnight end, DST spring gap and autumn repeated times.
- `npm run test:db`: passed **28 tests, 0 failures, 0 skipped** using real PostgreSQL
  and HTTP. Includes all prior schema/auth tests plus availability metadata/privacy,
  consultant authorization and CSRF, valid/invalid week updates, one-query domain
  generation, invalid dates, blocking/unblocking, duplicate/conflict responses,
  canceled-history availability, reservation preservation and warning counts,
  rollback and missing-consultant handling, concurrent duplicate blocks, and an
  actual observed PostgreSQL row-lock wait with post-lock working-hour revalidation.
  Existing auth outage test intentionally logs the safe `API request failed.` line.
- `npm run db:check`: passed, real SELECT 1. Count-only browser-fixture check found
  one working weekday, zero blocks, zero bookings in development after verification.
- `npm run lint`: passed.
- `npm run format:check`: passed after writing and formatting this handoff.
- `npm run build`: passed after final UI change, Vite 8.3.5, 19 modules transformed.
- Actual in-app browser at its existing desktop viewport: consultant login; enabled
  Thursday 09:00–10:00; saved hours; selected/blocked 09:00; confirmed it disappeared
  while 09:30 remained; unblocked and confirmed 09:00 returned. Then signed in as the
  existing synthetic customer, changed date to 2026-10-29, selected 09:00, and saw
  the explicit no-reservation notice. Date changes cleared previous selection.
  Saved ignored screenshots `.local/availability-blocked.png` and
  `.local/availability-selection.png`; visually inspected both.
- `git diff --check`: passed after writing this handoff. Environment/fixture/screenshots
  remain ignored; no secrets were printed or tracked. No commits or pushes made.

No application-test failures occurred. Browser automation initially appended text
into an autofilled email field; replaced values and continued successfully. Its
first date-fill attempt did not change the date; native setValue did, and the final
AX state and screenshot verified the actual selected date and time. These were
interaction corrections rather than application workarounds. Tests and connectivity
used approved outside-sandbox execution because loopback restrictions were established.

## Local state, limitations, and next step

Existing development servers were reused at ports 3000/5173; PostgreSQL remains on 55432. Existing ignored server/.env was preserved. A synthetic consultant was seeded
only after confirming none existed, through the existing controlled seed function.
Private demo email/password are in ignored `.local/availability-demo.env`; they were
not printed. One browser-created customer from Milestone 2 remains. The demo week
has Thursday 09:00–10:00 only; browser test blocks were removed; no booking was made.
Disposable integration-test schemas and all contained fixtures were cleaned up.

Not run: Node 24, mobile viewport matrix, deployed HTTPS/production hosting, the full
customer booking/PDF journey, or booking-versus-booking / booking-versus-block HTTP
race tests. Those booking races require the real booking engine in Milestone 4.
Availability is a snapshot, not a reservation. Other tabs need refresh. Expired blocks
remain stored but are omitted from the current-window management list. No known
Milestone 3 blocker remains. See docs/DECISIONS.md for decisions and trade-offs.

**Immediate next step:** wait for authorization for **Milestone 4 — Booking Engine**.
Implement authenticated customer booking, server validation after acquiring the shared
consultant-row lock, persistence/conflicts, customer submission/confirmation UI,
duplicate-submission handling, and real PostgreSQL booking/booking and booking/block
races. Reuse the existing slot rules and perform every transaction query on the same
checked-out client. Do not begin booking management or PDFs in that milestone.

---

# Historical Milestone 2 handoff (retained)

# Milestone 2 handoff — 2026-10-22 (Asia/Karachi)

## Current milestone and scope

**Milestone 2 — Authentication: implemented and verified. STOPPED.**
The user authorized the next milestone after the verified Milestone 1 handoff.
Milestone 3 has not begun. This section supersedes the historical notes below.

SlotSure remains one consultant, customers, one consultation type, fixed 30-minute
appointments, and a 14-day booking window. React/Vite, Express, JavaScript, pg/raw
parameterized SQL, PostgreSQL, and same-origin frontend/API remain the agreed stack.
No availability, booking, cancellation, PDF, or other excluded feature was added.

## Implemented architecture and functionality

- `createApp({ pool, config })` constructs the app; index owns the bounded pool,
  listener, and shutdown. Health remains independent of database queries.
- Account validation and parameterized SQL live in `services/auth.js`; auth HTTP
  handling and rate limits live in `routes/auth.js`; middleware reads the current
  database user and role. Sessions store user ID and CSRF state, never passwords/roles.
- Customer registration creates only the customer role. Extra fields including role
  are rejected. Names are trimmed (1–100 characters), email is normalized lowercase
  (max 254), passwords are 12–128 characters and hashed with Argon2id defaults.
- POST register, login, logout; GET me and csrf. Registration returns 201 and requires
  a separate sign-in step. Login rotates and explicitly saves session/CSRF state.
  CSRF token retrieval saves before responding. Logout deletes server-side session
  state and clears the cookie; invalid credentials share a generic 401 response.
- `002_sessions.sql` creates user_sessions and expiry index for connect-pg-simple.
  Migration runner remains the only schema-creation mechanism. Existing migration
  001 was preserved. Session persistence is real PostgreSQL, including after app restart.
- HttpOnly, SameSite=Lax, host-only cookies with eight-hour lifetime; Secure in
  production. SESSION_SECRET requires at least 32 bytes; no default secret.
  APP_ORIGIN must be a single HTTP(S) origin and HTTPS in production. Proxy trust
  defaults off; TRUST_PROXY=1 is only for one trusted, exclusive reverse-proxy route.
- csrf-sync protects all unsafe API methods, including login/register/logout.
  Mismatched supplied Origin is rejected; missing Origin still requires a valid
  session-bound token. JSON-only mutations, 8 KiB body limit, no-store auth responses,
  and safe consistent JSON errors. No permissive CORS was added.
- express-rate-limit: ten failed login requests and five registration requests per
  IP per 15 minutes; successful logins are uncounted. JSON 429 and Retry-After.
  Counters are process-local and reset on restart; this MVP uses one API process.
- `/api/provider` namespace guard returns 401 for anonymous clients and 403 for
  customers. Consultants pass authorization and reach 404 because availability
  endpoints do not exist yet. No new redundant management endpoint was introduced.
- Existing consultant seed remains local-only and hash-based. Fixed its parameter
  regex to accept m,p,t as emitted by argon2 0.45.1, as well as earlier m,t,p order.
- React provides login/registration views, pending/error/success feedback, account
  summary and logout. It uses relative fetch URLs, a fresh CSRF request before
  mutations, no localStorage credentials, and aborts stale initial account fetches.

## Dependencies and significant decisions

Added argon2 0.45.1, express-session 1.19.0, connect-pg-simple 10.0.0,
csrf-sync 4.2.1, express-rate-limit 8.7.1 and updated the root lockfile. These implement
the specified password/session/security requirements without custom cryptography.
Read official documentation using the read-docs workflow and inspected installed
library APIs. See docs/DECISIONS.md for alternatives, rationale, and trade-offs.

## Actual verification results

Executed with Node 22.14.0, npm 10.9.2, and PostgreSQL 18.1:

- Dependency install: passed; 18 packages added, 0 audit vulnerabilities reported.
- `npm run db:migrate`: passed; new session migration applied to development DB;
  repeat run passed without duplicating tracked migrations.
- `npm run test:db`: final run passed **17 tests, 0 failures, 0 skipped**, real
  PostgreSQL and actual HTTP. Includes previous database integrity tests plus account
  registration/hashing, duplicate email, role-assignment rejection, anonymous access,
  CSRF missing/forged/cross-session/stale token rejection, mismatched/null origins,
  content type/invalid JSON/oversized body rejection, generic failed credentials,
  session/CSRF rotation, old cookie replay rejection, app-restart persistence,
  logout invalidation, consultant seed/login, role/deleted-user checks, session expiry,
  login/registration rate limits, production Secure cookie policy, and safe JSON
  after a real session-table outage. The outage emits the expected safe log line
  `API request failed.`; it does not indicate a failed test.
- `npm test`: passed **4 tests, 0 failures, 2 explicit integration-suite skips**.
  Integration suites were separately run with test:db as recorded above.
- `npm run db:check`: passed against real PostgreSQL (SELECT 1).
- `npm run build`: passed, Vite 8.3.5, 16 modules transformed.
- `npm run lint`: passed after fixing the error middleware's unused next argument
  by correctly delegating errors when headers are already sent.
- `npm run format:check`: passed after writing and formatting this handoff.
- Actual in-app browser: registration with synthetic customer data, invalid password
  feedback, successful login, authenticated reload, logout, and logged-out reload
  all passed. Inspected the account screen at the browser's existing narrow viewport.
  Screenshot of the verified signed-out screen: ignored `.local/auth-desktop.png`
  (filename does not imply a desktop-width test).
- `git diff --check`: passed after writing this handoff; local environment and screenshot
  remain ignored. No connection strings, passwords, or secrets were printed.

Initial npm installation could not resolve the registry inside the sandbox. Retried
outside the sandbox with approval and installation succeeded. PostgreSQL/HTTP tests
and dev servers ran outside the sandbox because loopback restrictions were already
established. One Firecrawl GitHub scrape failed; raw official README retrieval and
installed documentation supplied the needed API details. First integration run found
the seed parameter-order assumption; corrected it and reran successfully. No failed
checks remain after correction.

## Local state, limitations, and immediate next step

Ignored server/.env was preserved and extended with a random SESSION_SECRET and
APP_ORIGIN=http://127.0.0.1:5173; TEST_DATABASE_URL remains slotsure_test on port 55432.
Development migrations are applied. One synthetic browser-registration customer
remains in development; no default credentials or consultant were seeded there.
Integration test users/sessions exist only in disposable schemas, which were removed.
PostgreSQL and both dev servers are running on the existing documented ports.
No commits or pushes were made. README and .env.example document setup requirements.

Not run: Node 24, separate desktop/phone viewport matrix, deployed HTTPS/TLS, production
hosting, availability/booking races, booking management, or PDFs. Production cookie
flags were verified with simulated trusted forwarded HTTPS headers, not a TLS deployment.
Email verification, password recovery, and MFA are absent; this remains an MVP rather
than a commercial identity system. Other tabs can display stale account UI after
logout; backend authorization still rejects the destroyed session.

**Next:** wait for authorization for **Milestone 3 — Availability Management**.
Then implement consultant hours/blocks/unblocking, correct time-zone-aware slot
generation, read-only customer availability, minimal interfaces, and tests. Use the
required consultant-row transaction lock and preserve existing reservations. Do not
implement booking yet. No known Milestone 2 blocker remains.

---

# Historical Milestone 1 handoff (retained)

# Milestone 1 handoff — 2026-10-22 (Asia/Karachi)

## Current milestone

**Milestone 1 — Database Foundation: implemented and verified. STOPPED.**
The user explicitly authorized the next milestone. Milestone 2 has not begun.
This section supersedes the historical Milestone 0 notes retained below.

## Product, stack, and architecture

One consultant, customer accounts, one consultation type, fixed 30-minute appointments,
14-day booking window. All specification exclusions remain in force. Existing
React/Vite and Express JavaScript workspaces, pg/raw SQL, same-origin development
proxy, and foundation screen remain intact. Verified runtime: Node 22.14.0,
PostgreSQL 18.1. No dependencies added and no commits or pushes made.

## Implemented database foundation

- `server/migrations/001_initial.sql`: users, weekly_hours, blocked_slots, bookings.
- Lowercase trimmed unique email; customer/consultant roles; singleton consultant
  partial index; nonempty names; Argon2id hash prefix guard.
- ISO weekdays 1–7, one interval per day, aligned half-hour boundaries, no overnight
  intervals; absent weekday means unavailable; 24:00 allowed as interval end.
- TIMESTAMPTZ appointment instants with finite checks; unique blocks.
- Restrictive customer foreign key; confirmed/canceled states with cancellation
  timestamp consistency; customer/time index; confirmed-only unique start index.
- Migration runner uses one checked-out client, transaction, tracking table,
  rollback, and reliable release. Applied migrations are immutable. Run a single
  setup process; concurrent initial migration processes are not supported.
- Local-only consultant seed accepts name, normalized email, and an externally
  generated encoded Argon2id hash. Repeat seed preserves the existing account.
  No default consultant or plaintext password was created. Tests use synthetic
  hash fixtures solely for integrity checks; hashing/login remain Milestone 2.
- Dedicated test database setup never drops databases. Tests require an explicit
  TEST_DATABASE_URL ending in `_test`, create fresh per-run schemas, apply migrations,
  and clean up only those schemas. Explicit test:db fails when configuration is absent.

## Actual commands and final verification

- `npm run db:test:setup`: passed; created slotsure_test on existing local cluster.
- `npm run db:migrate` twice: passed; development schema applied, repeat run unchanged.
- `npm run test:db`: final run passed, 7 tests, 0 failures, 0 skipped, real PostgreSQL.
  Verified fresh and repeat migrations, rollback after failed DDL, seed repeatability,
  identity/role/singleton constraints, weekly-hour checks, duplicate block rejection,
  finite timestamps, foreign keys, confirmed uniqueness, cancellation history, and rebooking.
- `npm test`: passed, 2 foundation tests, 0 failures, 1 explicit database-suite skip.
  Database tests were separately executed using test:db as recorded above.
- `npm run db:check`: passed, real SELECT 1.
- `npm run build`: passed, Vite production assets generated (15 modules).
- `npm run lint` and `npm run format:check`: passed after handoff formatting.
- `git diff --check`: passed; local environment and cluster paths remain ignored.

Initial failures were investigated and corrected: sandbox loopback access denied;
escalated connection found the local database stopped, so restarted the existing
cluster with documented pg_ctl command. First suite expected SQLSTATE 23503 for
RESTRICT deletion; PostgreSQL 18 returns 23001 for that path, and the assertion now
accepts either valid restrictive-foreign-key result. Node default test discovery also
executed helper scripts named test/setup-test; test discovery is now limited to
`tests/*.test.js`. Final suites above passed after those corrections.

## Local state and limitations

Existing ignored server/.env preserved and extended with TEST_DATABASE_URL pointing
to slotsure_test on port 55432; no connection values were printed or tracked.
Local PostgreSQL is running. Development schema exists with no seeded account or
weekly hours. Frontend/API server processes were not started during this milestone.
README documents migration, seed, and test setup. See docs/DECISIONS.md for trade-offs.
The pre-existing context.md review entry was preserved in the history below.

Database constraints do not implement the booking service: customer-role checks,
consultant-local grid, time-zone handling, booking window, hours, cross-table
block/booking consistency, authorization, and the consultant-row lock protocol remain
for the authorized later milestones. Do not claim overlap or concurrency correctness
yet: confirmed start uniqueness requires later grid validation. No database triggers,
HTTP booking/auth APIs, session tables, or frontend booking features were added.

Not run: Node 24, browser verification (no UI changes), authenticated race tests,
password hashing/verification, production deployment. No known Milestone 1 blocker.

## Immediate next step

Wait for authorization for **Milestone 2 — Authentication**. Add established Argon2id
hashing, session persistence, CSRF protection, registration/login/logout, authorization,
minimal auth interfaces, and relevant tests. Do not implement booking yet.

---

# Historical Milestone 0 handoff (retained)

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

## Milestone 0 verification review — 2026-10-21

Read the specification, agent instructions, handoff, README, decision journal, configuration, frontend, backend, database-check code, and tests. Reviewed against all Milestone 0 tasks and acceptance criteria. No incomplete Milestone 0 requirements or application defects were identified. No application code, dependencies, configuration, or database schema were changed during this review. Milestone 1 remains unstarted.

Actual rerun results on the installed Node 22.14.0 / npm 10.9.2 environment:

- `npm test`: passed, 2 tests, 0 failures, 0 skipped; actual HTTP health/404 responses and configuration validation.
- `npm run lint`: passed.
- `npm run format:check`: passed before this review entry; checked again after updating this document.
- `npm run build`: passed with Vite 8.3.5; 15 modules transformed and frontend assets generated.
- `npm run db:check`: passed against the existing real PostgreSQL instance, reporting successful `SELECT 1` connectivity.
- Direct HTTP checks against the running backend: `/api/health` returned 200 and the expected status/service JSON; `/api/missing` returned 404 and the expected safe JSON error.
- Direct HTTP check through Vite: `http://127.0.0.1:5173/api/health` returned 200 and the expected health JSON.
- Actual browser opened the existing frontend on port 5173, rendered the React page, and displayed `API connected`. Reused running development servers rather than stopping or duplicating them.
- Git working tree was clean at review start. Existing foundation commit: `81af9a0` (`chore: initialize SlotSure project foundation`). This review did not create that commit or make any new commits. Local environment/cluster files and dependencies remain ignored; `git ls-files server/.env .local` returned no tracked paths.

No failed checks in this review. Network checks ran outside the sandbox because its loopback restrictions were established during initial implementation. Not rerun: fresh `npm ci` installation, Node 24 runtime verification, mobile browser testing, and database-cluster recreation. These verification limits do not represent missing Milestone 0 implementation. Database liveness remains deliberately separate from API liveness; future schema, authorization, and concurrency tests belong to later milestones.
