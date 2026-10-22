# Engineering decisions

## 2026-10-21 — Foundation structure and runtime

**Decision:** Use npm workspaces for separate `client` and `server` packages, ordinary JavaScript with ES modules, and Node's built-in environment-file support and test runner. Recommend Node 24 LTS; support the existing Node 22.14 environment.

**Problem:** Establish independently runnable frontend/backend packages with reproducible dependency management.

**Alternatives:** Separate lockfiles, a monorepo framework, a process supervisor, or replacing the installed runtime.

**Reasoning:** One lockfile and workspace commands provide enough coordination. Existing Node 22.14 satisfies the selected packages' engine requirements, so no machine-wide runtime change is needed.

**Trade-off:** Development uses two terminals. Node 24 execution must be verified separately if unavailable locally.

## 2026-10-21 — Same-origin development API

**Decision:** Vite proxies `/api` to the loopback Express server on port 3000. React uses relative request URLs. No router, CORS middleware, UI kit, or global state dependency.

**Problem:** Verify that the frontend can reach the API without creating unnecessary origin configuration.

**Alternatives:** Cross-origin requests with a CORS allowlist, or serving compiled assets from Express immediately.

**Reasoning:** Vite already provides the development proxy. React state and effects suffice for a single status screen. Vite handles JSX without an extra React plugin; Fast Refresh is deferred.

**Trade-off:** Changing the backend port also requires changing the proxy target. Production hosting is deferred.

## 2026-10-21 — Database connectivity separate from liveness

**Decision:** `/api/health` reports API liveness; `npm run db:check` performs a real PostgreSQL `SELECT 1` using a bounded `pg.Pool`, then closes it. The database URL exists only in the backend environment.

**Problem:** Verify database configuration without implementing the domain schema or coupling API startup to database availability.

**Alternatives:** Querying the database on every health request, an ORM, or implementing migrations now.

**Reasoning:** An explicit command proves connectivity and exits nonzero on failure. `pg` directly supports the chosen raw-SQL architecture ([official connection documentation](https://node-postgres.com/features/connecting)). Pool timeouts bound connection/query failures, and error messages omit credentials.

**Trade-off:** A healthy liveness endpoint does not imply database readiness. No domain database guarantees exist until later milestones.

## Required future concurrency design (planned, not implemented)

**Decision:** Follow the specification's transaction-scoped consultant-row lock plus a partial unique index on confirmed booking start times when those milestones are authorized.

**Problem:** Booking and availability mutations must not produce conflicting states under concurrency.

**Alternatives:** Application-only checks, advisory/distributed locks, or serializable isolation.

**Reasoning:** A shared row-lock protocol and database uniqueness fit one consultant and fixed aligned appointment slots. Recheck rules after locking and use one checked-out client per transaction with rollback and reliable release.

**Trade-off:** Schedule mutations serialize for this consultant. Real PostgreSQL race tests remain mandatory in Milestone 4. No schema or locking code is part of Milestone 0.

## 2026-10-22 — Database foundation

**Decision:** Use numbered SQL migrations with a tracking table and a checked-out client. Apply pending files and tracking records in one transaction. Keep applied migrations immutable and run one setup process at a time.

**Problem:** Reproduce the schema on fresh databases and safely repeat setup without losing existing data.

**Alternatives:** An ORM migration framework or untracked schema scripts.

**Reasoning:** The four-table model is small; native PostgreSQL DDL transactions and pg provide the required behavior without another dependency. Integration tests verify fresh application, repeat application, and rollback of failed DDL.

**Trade-off:** No automatic downgrade or applied-file checksum verification. Concurrent initial migration processes are not supported.

**Decision:** Store normalized lowercase email, use a partial unique consultant-role index, ISO weekday primary keys, finite appointment instants, and status/cancellation consistency checks. Use a restrictive customer foreign key and index customer/time lookups. Duration remains implicit at 30 minutes.

**Problem:** Invalid stored states and conflicting confirmed starts must be rejected independently of HTTP validation.

**Alternatives:** Application-only validation, persisted generated slots, or triggers enforcing all future booking rules.

**Reasoning:** Declarative constraints enforce stable row-level facts. The confirmed-only unique index preserves canceled history while allowing rebooking. Time-zone-dependent grid checks, customer-role checks, and cross-table schedule consistency belong in later transactional services, following the required consultant-row lock protocol.

**Trade-off:** The schema alone does not yet make bookings safe or implement availability. Uniqueness prevents identical confirmed starts, but overlap prevention also depends on enforcing the aligned 30-minute grid later.

**Decision:** Seed consultants only through a local command taking an existing encoded Argon2id hash. Seed is repeatable without overwriting an existing account. Use an explicit separate test database and disposable per-run schemas.

**Problem:** Provision the singleton account and test integrity without adding authentication early or clearing development data.

**Alternatives:** Public seed API, hard-coded passwords, installing hashing dependencies now, or destructive shared-database tests.

**Reasoning:** No plaintext secret or default account is introduced. Real hashing and verification will be implemented in Milestone 2. The test command requires explicit test configuration and refuses database names without the `_test` suffix.

**Trade-off:** Seed users must supply a genuine library-generated hash; format validation does not prove password strength. Test setup needs database creation permission or administrator assistance. Synthetic hashes are used solely for integrity fixtures, never usable demo credentials.

## 2026-10-22 — Authentication and session boundaries

**Decision:** Use argon2 (Argon2id defaults), express-session, connect-pg-simple, csrf-sync, and express-rate-limit. Add a versioned session-table migration; reuse the bounded application pool. Split credential service, HTTP routing, and authorization middleware; construct the app explicitly with its pool and validated configuration.

**Problem:** Store passwords safely and persist authenticated state without implementing cryptography or an authentication protocol.

**Alternatives:** JWT/browser token storage, an in-memory session store, or handwritten CSRF tokens and password hashing.

**Reasoning:** These maintained libraries implement the required stack with focused responsibilities. The cookie carries a signed opaque session ID; user ID and CSRF state live in PostgreSQL. Login regenerates and saves the session before responding. Logout destroys it and clears the cookie. Authorization reads the current user and role from PostgreSQL on each protected request. See official [session API](https://github.com/expressjs/session), [PostgreSQL store](https://github.com/voxpelli/node-connect-pg-simple), [CSRF synchronizer](https://github.com/Psifi-Solutions/csrf-sync), [Argon2](https://github.com/ranisalt/node-argon2), and [rate limiter](https://github.com/express-rate-limit/express-rate-limit) documentation. Installed versions were also inspected locally and behavior tested on Node 22.14.

**Trade-off:** Protected requests query PostgreSQL. Argon2 work has a deliberate memory/CPU cost. Process-local rate counters fit one API process but reset on restart and do not coordinate multiple instances. No email verification, password reset, or commercial identity-system claim.

**Decision:** Register accounts separately from login, force the customer role, reject unexpected fields, normalize email, and use long passwords (12–128 characters). Keep only non-sensitive account fields in JSON. Retain the controlled consultant hash-based seed and accept both parameter orders emitted by established Argon2 libraries.

**Problem:** Avoid role escalation and ambiguous outcomes when account creation succeeds but session persistence fails.

**Alternatives:** Automatic login during registration or a transaction spanning account/session creation.

**Reasoning:** Separate steps have clear outcomes and avoid coupling password/account storage to session-store internals. Real PostgreSQL integration tests revealed that argon2 0.45.1 emits m,p,t parameter ordering, while the earlier seed assumed m,t,p; both are now accepted and seeded consultant login is verified.

**Trade-off:** Registration needs a separate sign-in action. Duplicate registration reports email unavailable, so account existence is not confidential; rate limits reduce abuse. Unknown-account login still performs Argon2 verification and returns the same credential error.

**Decision:** Require a configured random session secret; use HttpOnly/SameSite=Lax cookies, Secure in production, an eight-hour lifetime, JSON bodies, a no-store policy, and session-bound CSRF tokens on all unsafe API methods including login/logout/register. Reject mismatched supplied origins. Default proxy trust is off; allow a single explicitly trusted proxy for future HTTPS hosting.

**Problem:** Browser cookies are sent automatically and can otherwise authorize cross-site requests; session fixation and stale account roles must not grant access.

**Alternatives:** SameSite alone, permissive CORS, or custom security token code.

**Reasoning:** An established synchronizer-token middleware works with the chosen server-side session store. Exact-origin checks supplement it; clients without Origin still need a valid token. React fetches a token before each mutation, holds no bearer credentials in browser storage, and cancels stale initial account requests. Tests verify missing/forged/cross-session tokens, old-session replay, expiry, cookie flags, and role checks after database changes.

**Trade-off:** Other tabs can have stale UI after logout; the backend remains authoritative. Production cookie configuration is tested behind simulated forwarded HTTPS headers; real TLS deployment remains unverified. Endpoint/body limits and rate limiting are intentionally small for this MVP.

## 2026-10-22 — Availability rules, snapshots, and serialized writes

**Decision:** Use Luxon for server-side IANA-zone arithmetic, and Intl for browser display. Define the window as 14 consultant-local calendar dates (today through today+13), excluding starts at or before now. Require explicit-offset instants for blocks. Iterate elapsed 30-minute intervals within the local day, checking the first and final occupied instants against local weekly hours.

**Problem:** Calendar days, UTC instants, and wall-clock grid boundaries differ, particularly across DST or non-hour offsets.

**Alternatives:** Adding a hard-coded Karachi offset, assuming every local day lasts 24 hours, or constructing ambiguous local wall times directly.

**Reasoning:** Calendar-day addition establishes date bounds; minute addition preserves exact appointment duration. Walking the real timeline avoids fabricated spring times and preserves both autumn occurrences. Labels include offsets. Luxon's [official zone documentation](https://github.com/moment/luxon/blob/master/docs/zones.md) explains elapsed-unit versus calendar-unit arithmetic. Tests exercise Karachi local midnight, Kathmandu's 45-minute offset, spring gaps, autumn repeats, midnight interval ends, and exact 30-minute durations.

**Trade-off:** Today is one of the 14 dates, so the final date is today+13 rather than a rolling 336-hour horizon. An appointment crossing a clock change may have a surprising displayed end time but still lasts exactly 30 elapsed minutes. Changing the configured zone reinterprets weekly hours; persisted appointment instants remain unchanged.

**Decision:** Derive a day's availability with one parameterized SQL statement returning its weekly rule and date-bounded occupied instants. Exclude both confirmed reservations and blocks, including overlaps; canceled history does not occupy a time. Default missing date to the consultant's today and return calendar bounds in the same response.

**Problem:** Avoid inconsistent multi-query snapshots, private-customer leakage, one query per generated slot, and browser-local date assumptions.

**Alternatives:** Persisting generated slots, N+1 queries, or adding an extra configuration/metadata endpoint.

**Reasoning:** PostgreSQL gives a single statement a consistent snapshot. Existing time indexes bound the occupied-time scans. A small pure function generates the day's slots without persistent slot rows. The metadata is sufficient for both consultant and customer date selection.

**Trade-off:** Availability can change after the response. Selection is explicitly read-only in Milestone 3; Milestone 4 must revalidate after acquiring the schedule lock before inserting a booking. No booking APIs were implemented here.

**Decision:** Implement the required consultant-row locking protocol now for weekly-hours replacement, block creation, and unblock deletion. Share a focused withScheduleLock helper used by all three actual mutations. Use one checked-out client and recheck time, grid, hours, and occupied-time rules after lock acquisition.

**Problem:** Concurrent schedule changes must not validate against stale working hours or silently alter existing reservations.

**Alternatives:** Uncoordinated writes, advisory locks, serializable isolation, or application-only checks.

**Reasoning:** One consultant makes row-lock serialization a practical, understandable choice. Replace the week atomically, retain bookings/blocks, and return a count of future reservations outside the new hours. Real PostgreSQL tests observe a blocking PID, change hours while holding the lock, then verify the waiting block request rejects the newly invalid time. Concurrent duplicate blocks produce one row and one conflict. Rollback tests verify state recovery.

**Trade-off:** Writes serialize for this consultant. The protocol only coordinates participants; all future booking/cancellation writes must reuse it. Booking race guarantees are still unverified until Milestone 4. Expired block rows are retained in storage and omitted from the current-window management list.

**Decision:** Reuse one slot picker for public/customer selection and consultant blocking, with a separate weekly-hours editor and blocked list. Abort replaced availability requests and clear selections on date/refresh/schedule changes. Keep React built-in state and existing styling.

**Problem:** Provide the milestone's actual workflows without premature booking UI or a generic component framework.

**Alternatives:** Duplicate calendars, a date-picker dependency, a router/state framework, or a disabled booking scaffold.

**Reasoning:** Native date and half-hour select controls suffice. The same response drives the actual shared picker. Provider schedule mutations remount the picker to refresh current hours and occupancy; successful blocking refreshes its date and the block list.

**Trade-off:** Changing weekly hours or unblocking resets the consultant picker to today. Other browser tabs require refresh for changed availability; no live-update infrastructure was added.

## Milestone 4 — Booking engine (2026-10-22)

**Decision:** Reuse the consultant-row transaction lock for customer booking and
share assertSlotAvailable with provider blocking. Parse time/window rules after
acquiring the lock, derive ownership from the authenticated customer, and use the
same checked-out pg client for validation and INSERT. Return confirmation only
after COMMIT. Preserve the original error on rollback failure and discard that
client. Keep the existing partial unique index as a final booking safeguard.

**Reasoning:** An availability response is a snapshot. Locking all schedule writers
makes their validation and mutation sequential, including cross-table block races.
A unique booking index alone cannot coordinate bookings with blocked_slots or hours
changes. This uses existing schema and dependencies; no migration or ORM is needed.
Real HTTP tests observe both contenders waiting on PostgreSQL locks before release.
They verify one 201, one 409, and one confirmed row, plus booking-versus-block races.
A deferred constraint trigger proves commit failure rolls back without confirmation.

**Alternative:** Persistent idempotency tokens could replay a successful response
following a lost connection. For this milestone use a synchronous UI submission
guard plus server conflicts. This prevents duplicates but cannot recover a lost
response; the UI warns about uncertain outcomes and never retries POST automatically.

**Decision:** Keep confirmation in the account-keyed slot picker, with accessible
heading focus and server-supplied consultant/time/reference/status. Unmount aborts
pending requests. The SS-prefixed database ID is a display reference, not a secret
or authorization token. Reload loses the displayed response, while the reservation
persists. Booking history/recovery and PDFs remain later milestones.

## 2026-10-22 — Milestone 5 booking management

**Decision:** Add one management service for customer/provider lists and the shared
PATCH cancellation endpoint. Enforce ownership in SQL; foreign and missing IDs both
return 404. Read the current actor role again after acquiring the consultant lock.
Cancel only future confirmed appointments for either role; past records are history.
Repeated cancellation returns 200 with the original canceledAt, even after the start.

**Problem:** Release a reservation safely without losing history, granting access to
another customer, or racing with booking/block/hour mutations.

**Alternatives:** Hard deletion, separate provider cancellation logic, or rejecting
all repeat cancellations as conflicts.

**Reasoning:** Updating confirmed to canceled preserves the existing schema and
partial unique index semantics. The shared lock orders all schedule writers; time
is checked after waiting. Timestamp uses clock_timestamp bounded below by created_at.
Response returns only after commit. PostgreSQL tests verify authorization, lock waits,
repeat cancellation, rebooking/block races, and rollback after a deferred commit failure.

**Trade-off:** All consultant writes serialize. Both roles are deliberately prohibited
from rewriting past confirmed appointments. There is no cancellation deadline beyond
appointment start, notification, refund, or new status. No new dependency or migration.

**Decision:** Serve upcoming/history views with deterministic starts_at/id ordering,
50-record pages, validated page numbers (1–9999), and a 51st-row hasMore probe. Customer
responses omit customer identity; consultant responses include name/email for actual
appointment management. Use one React dashboard with abortable reads/mutations,
server-derived canCancel, disabled repeat submission, and visible feedback.

**Problem:** History can grow indefinitely and stale browser responses must not expose
previous-account bookings or leave availability occupied after cancellation.

**Alternatives:** An unbounded list, cursor tokens, a frontend router/state dependency,
or live updates across browser tabs.

**Reasoning:** Bounded offset pagination and React state suffice for this small MVP.
Dashboard refreshes after booking; cancellation refreshes dashboard and availability,
including uncertain outcomes. Account-keyed unmount aborts old requests. Year is added
to appointment labels so historical dates are unambiguous.

**Trade-off:** Concurrent changes can shift offset pages; refresh to reconcile. The
availability remount resets selections and provider unsaved hours drafts. Other tabs
need manual refresh. Full visual verification was unavailable (local browser timeout);
real HTTP/database behavior and the production bundle were verified.
