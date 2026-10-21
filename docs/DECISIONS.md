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
