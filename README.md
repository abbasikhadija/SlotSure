# SlotSure

Book your time. No clashes, no confusion.

SlotSure will help independent consultants and their customers replace manual scheduling messages with reliable appointment booking. The MVP is limited to one consultant, registered customers, one consultation type, 30-minute appointments, and a 14-day booking window.

## Current status

Milestone 1 database foundation implemented, alongside a React status page, Express health endpoint, PostgreSQL connectivity command, linting, formatting, and automated foundation checks. Authentication, booking, availability, cancellations, and PDF confirmations are planned, not available yet.

Read [PROJECT_SPEC.md](PROJECT_SPEC.md) for requirements and [context.md](context.md) for the verified handoff.

## Stack and structure

- `client/`: React, Vite, JavaScript, CSS.
- `server/`: Node.js, Express, `pg`; Node's built-in test runner.
- Root npm workspaces share one dependency lockfile; ESLint and Prettier cover both packages.
- In development, browser → Vite `/api` proxy → Express → PostgreSQL when explicitly requested.
- Backend-only `DATABASE_URL` is never a `VITE_` variable.

## Local setup

Use Node **24 LTS** and npm; the existing Node **22.14.0** environment is also supported. Install PostgreSQL (verified with version 18). No Docker is required.

From the repository root:

```powershell
npm ci
Copy-Item server/.env.example server/.env
```

Using your PostgreSQL administrator account, create a local login and empty database (replace the placeholder password):

```sql
CREATE ROLE slotsure LOGIN PASSWORD 'YOUR_LOCAL_PASSWORD';
CREATE DATABASE slotsure OWNER slotsure;
```

Edit `server/.env` to set your actual `DATABASE_URL`. Percent-encode reserved characters in URI passwords. The example uses PostgreSQL port 5432; use your instance's actual port. Keep `.env` private. Do not commit credentials. Apply the database migrations using the Milestone 1 instructions below.

```powershell
npm run db:check
```

Expected: `PostgreSQL connectivity verified (SELECT 1).` A failure returns a nonzero exit code; check that PostgreSQL is running and that the URL, user, password, port, and database are correct.

Start two terminals from the repository root:

```powershell
npm run dev:server
```

```powershell
npm run dev:client
```

Open [SlotSure locally](http://127.0.0.1:5173). The page should report `API connected`. API liveness is also available at [the health endpoint](http://127.0.0.1:3000/api/health). Liveness does not check PostgreSQL; use `db:check` for that.

`PORT` defaults to 3000 and `HOST` to `127.0.0.1`; if changing the API port, update `client/vite.config.js` too. `CONSULTANT_TIME_ZONE` defaults to `Asia/Karachi` and is validated as an IANA zone. Appointment-time behavior is deferred. The backend reads `server/.env`; exported environment variables take precedence. No frontend environment file is needed.

### Instance prepared in this workspace

For foundation verification, an isolated PostgreSQL 18.1 cluster was initialized in ignored `.local/postgres`, with an empty `slotsure` database on loopback port **55432**. Its generated credentials are already in ignored `server/.env`. On this workspace, keep that file rather than copying over it. The database and both development servers were left running at handoff.

After restarting the machine, start this local cluster from the repository root:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D .local/postgres -l .local/postgres.log -o '-h 127.0.0.1 -p 55432 -c shared_buffers=16MB' -w start
```

To stop it:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe' -D .local/postgres -m fast -w stop
```

This disposable development cluster uses password authentication and is not a production database configuration. It is not included in Git. Other checkouts should follow the ordinary setup above. Stop frontend/backend terminals with Ctrl+C before starting another copy on the same ports.

## Verification commands

```powershell
npm test
npm run db:check
npm run lint
npm run format:check
npm run build
```

`npm test` checks actual HTTP liveness/404 behavior and invalid configuration. `db:check` separately requires real PostgreSQL and never substitutes a mock. `npm run build` creates `client/dist`; `npm run preview --workspace client` previews that static build. Preview does not proxy the API; use the Vite development server for the connected foundation page. Production hosting is deferred.

Use `npm run format` to format authored files. `PROJECT_SPEC.md` is preserved unchanged.

## Planned database and reliability

Later milestones introduce users, weekly hours, blocked slots, bookings, and a PostgreSQL session store. Confirmed bookings will use a partial unique index on start times. Schedule mutations will share a transaction-scoped consultant-row lock, with business rules rechecked after acquiring it. The partial unique index is implemented; transactional schedule services remain planned.

## Limitations

No authentication, appointment APIs, PDFs, deployment, or demo accounts exist yet. Future authentication excludes email verification and password recovery; this MVP will not be presented as a production-ready commercial identity system. Public demonstrations must use synthetic data. No screenshots or deployment links are available.

See [engineering decisions](docs/DECISIONS.md). Milestone 1 requires explicit authorization.

## Milestone 1 database setup

Run `npm run db:migrate` after configuring `server/.env`. SQL migrations in
`server/migrations/` run in filename order in one transaction; `schema_migrations`
records applied files, so repeat runs leave existing data intact. Do not edit applied
migrations; add a new numbered SQL file. Run one migration process during setup.
No default weekly hours or consultant credentials are installed.

For controlled consultant creation, place `CONSULTANT_NAME`, `CONSULTANT_EMAIL`,
and `CONSULTANT_PASSWORD_HASH` in ignored `server/.env`, then run `npm run db:seed`.
The hash must be a complete encoded Argon2id hash generated with an established
password-hashing library, using a randomly salted password chosen locally. Quote
it with single quotes in the environment file to preserve its dollar signs. Never
use the synthetic test hash as an account credential. The seed accepts no plaintext
password, creates at most one consultant, and leaves an existing consultant unchanged.
It has no HTTP endpoint. Password hashing and authentication are Milestone 2 work.

Run `npm run db:test:setup` to create `slotsure_test` without dropping any database.
This requires CREATEDB permission; alternatively ask the database administrator to
create that database owned by the application role. Set `TEST_DATABASE_URL` in
`server/.env` to the same local connection settings with database `slotsure_test`.
Then run `npm run test:db`. This command fails if the variable is absent, and tests
reject database names that do not end in `_test`. Each run migrates an empty unique
schema and removes only that schema afterward. The development database is never
cleared. `npm test` runs foundation tests and explicitly skips database tests unless
TEST_DATABASE_URL is exported; run `test:db` for mandatory database verification.

Schema conventions: ISO weekdays 1–7; absent weekly-hours rows mean unavailable;
24:00 is allowed only as an interval end. Appointment duration is implicit at 30
minutes. Instants use TIMESTAMPTZ. Customer email must be trimmed lowercase before
insertion; a unique constraint prevents duplicates. Bookings retain canceled rows
and use a partial unique index for confirmed start times. The customer foreign key
prevents deleting referenced users. Future services must enforce customer role,
consultant-local slot alignment, the booking window, working hours, and cross-table
booking/block conflicts using the specified consultant-row locking protocol. These
business rules are not yet implemented by the schema alone.
