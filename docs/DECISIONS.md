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
