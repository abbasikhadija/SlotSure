# SlotSure

Book your time. No clashes, no confusion.

SlotSure will help independent consultants and their customers replace manual scheduling messages with reliable appointment booking. The MVP is limited to one consultant, registered customers, one consultation type, 30-minute appointments, and a 14-day booking window.

## Current status

Milestone 3 availability management is implemented: consultant weekly hours, individual blocks/unblocking, time-zone-aware availability, and customer date/time selection. Customer authentication and PostgreSQL-backed sessions remain available. Booking, cancellations, and PDF confirmations are planned; selecting a time does not reserve it.

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

Configure the session secret and apply migrations using the authentication setup instructions below before starting the API. Open [SlotSure locally](http://127.0.0.1:5173) to register or sign in. API liveness is also available at [the health endpoint](http://127.0.0.1:3000/api/health). Liveness does not check PostgreSQL; use `db:check` for that.

`PORT` defaults to 3000 and `HOST` to `127.0.0.1`; if changing the API port, update `client/vite.config.js` too. `CONSULTANT_TIME_ZONE` defaults to `Asia/Karachi` and is validated as an IANA zone. Appointment-time behavior is deferred. The backend reads `server/.env`; exported environment variables take precedence. No frontend environment file is needed.

### Instance prepared in this workspace

An isolated PostgreSQL 18.1 cluster exists in ignored `.local/postgres`, with the migrated `slotsure` database on loopback port **55432**. Its generated credentials are already in ignored `server/.env`. On this workspace, keep that file rather than copying over it. The database and both development servers were left running at handoff.

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
npm run test:db
npm run db:check
npm run lint
npm run format:check
npm run build
```

`npm test` checks actual HTTP liveness/404 behavior and invalid configuration. `db:check` separately requires real PostgreSQL and never substitutes a mock. `npm run build` creates `client/dist`; `npm run preview --workspace client` previews that static build. Preview does not proxy the API; use the Vite development server for the connected foundation page. Production hosting is deferred.

Use `npm run format` to format authored files. `PROJECT_SPEC.md` is preserved unchanged.

## Planned database and reliability

Migrations implement users, weekly hours, blocked slots, bookings, and PostgreSQL sessions. Confirmed bookings use a partial unique index on start times. Availability mutations now acquire a transaction-scoped lock on the consultant row, then recheck schedule-dependent rules on the same checked-out client. Future booking and cancellation mutations must use that protocol too. Full booking concurrency verification belongs to Milestone 4.

## Limitations

No booking/cancellation APIs, PDFs, deployment, or distributed default demo credentials exist yet. Authentication excludes email verification and password recovery; this MVP will not be presented as a production-ready commercial identity system. Public demonstrations must use synthetic data. No deployment link is available.

See [engineering decisions](docs/DECISIONS.md). Milestone 4 requires explicit authorization.

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
It has no HTTP endpoint. Password hashing and authentication are implemented in Milestone 2.

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

## Milestone 2 authentication setup

Before starting the API, configure `SESSION_SECRET` in `server/.env` with at least
32 random bytes. Generate it directly into that ignored file without printing it:

```powershell
node --input-type=module -e "import fs from 'node:fs'; import {randomBytes} from 'node:crypto'; const f='server/.env'; let s=fs.readFileSync(f,'utf8'); s=s.replace(/^SESSION_SECRET=.*$/m,'SESSION_SECRET='+randomBytes(32).toString('hex')); fs.writeFileSync(f,s);"
```

The example environment includes the placeholder line this command replaces. The
prepared workspace already has a generated secret; keep it. Changing it invalidates
existing cookies. Apply `npm run db:migrate` to create `user_sessions` before login.

`APP_ORIGIN` is the exact browser origin, default `http://127.0.0.1:5173`; use that
address consistently. Do not switch between localhost and 127.0.0.1. Production
requires `NODE_ENV=production`, an HTTPS APP_ORIGIN, and HTTPS access. Cookies are
HttpOnly, SameSite=Lax, host-only, and Secure in production, with an eight-hour
lifetime. `TRUST_PROXY=0` is the default. Use `TRUST_PROXY=1` only when deploying
behind exactly one trusted proxy that overwrites forwarded headers and is the only
route to the backend. HTTPS deployment has not been performed or verified.

The page provides customer registration, login, an account summary, and logout.
Registration creates a customer account and then asks the user to sign in. Names
are 1–100 characters, passwords 12–128 characters, and email addresses are trimmed
and lowercased. Passwords are salted and hashed using the Argon2id library defaults.
The server rejects client-supplied roles and extra account fields. Consultant accounts
still use the local seed command and genuine externally generated Argon2id hashes.

API flow: GET `/api/auth/csrf` before a mutation; send its token in `X-CSRF-Token`
and a JSON request body. POST `/api/auth/register`, `/api/auth/login`, and
`/api/auth/logout` are protected. Login regenerates the session ID and returns a new
CSRF token. GET `/api/auth/me` returns the current account or 401. Unsafe requests
with a supplied Origin must match APP_ORIGIN; clients without Origin still require
a session-bound CSRF token. There is no cross-origin CORS access. Auth responses
are not cacheable. Roles are read from PostgreSQL rather than trusted from the client
or a stale role stored in the session. The `/api/provider` namespace rejects
anonymous callers (401) and customers (403); consultants can now manage hours and blocks.

Login allows ten failed requests per IP per 15 minutes; successful requests are not
counted. Registration allows five requests per IP per 15 minutes. Excess requests
receive JSON 429 responses and Retry-After. These counters are process-local and
reset on restart; the MVP runs as a single API process. Sessions themselves persist
in PostgreSQL across application restarts and are deleted on logout. Email verification,
password recovery, MFA, and appointment functionality are outside this milestone.

Run `npm run test:db` for both schema and HTTP authentication integration tests
against real PostgreSQL. Run `npm test` for validation/configuration/foundation tests;
the three integration suites are explicitly skipped there unless TEST_DATABASE_URL is
exported. No mock session store is substituted for PostgreSQL.

## Milestone 3 availability workflow

Sign in as the locally seeded consultant to edit weekly working hours. Enable a
weekday and choose one continuous interval on the 30-minute grid. `24:00` is allowed
as an end boundary. Unchecked days are unavailable. Saving replaces the whole week
atomically. Existing confirmed reservations are preserved; a warning reports how
many future reservations fall outside the new hours. It never cancels them.

Use **Block an appointment** to select a date and available time, then block it.
Blocks disappear from availability immediately after refresh. **Blocked appointments**
lists the current booking window and allows unblocking, including blocks that no
longer fall inside the latest weekly hours. Blocking a booked or already blocked
appointment returns 409. Repeated deletion returns 404 without changing other rows.

Visitors and signed-in customers can choose a date and time. Selection is read-only;
there is no booking button or booking API in this milestone. Refresh clears stale
selections. All labels use the consultant's IANA time zone, including UTC offsets
that distinguish repeated daylight-saving times.

The booking window is exactly **14 consultant-local calendar dates: today through
13 days ahead**, inclusive. Starts at or before the current instant are excluded.
Appointments last 30 elapsed minutes. Luxon walks real instants within each local
day, avoiding nonexistent spring times and preserving distinct autumn occurrences.
No manual UTC offsets are added. Missing `date` defaults to the consultant's today
and returns server-computed date bounds so the browser does not assume its own zone.
Invalid dates and dates outside the window return 400. Availability is a snapshot,
not a reservation; Milestone 4 must revalidate it inside the booking transaction.

Availability API:

- GET `/api/availability?date=YYYY-MM-DD`: date, timeZone, minDate, maxDate,
  durationMinutes, and slots containing UTC startsAt/endsAt. No customer details.
- GET/PUT `/api/provider/hours`: PUT JSON `{ "hours": [{ "weekday": 1,
"startTime": "09:00", "endTime": "17:00" }] }`; omitted weekdays are unavailable.
  Responses include outsideHoursCount. Weekdays follow ISO Monday=1 through Sunday=7.
- GET `/api/provider/blocks`: blocks within the current 14-date window.
- POST `/api/provider/blocks`: JSON `{ "startsAt": "2026-10-22T09:00:00+05:00" }`
  (replace this example with a future in-window time from availability).
- DELETE `/api/provider/blocks/:id`: JSON `{}`. All mutations require a session-bound
  CSRF token and consultant authorization, as described above.

Availability executes one bounded SQL statement per requested day, reading hours,
confirmed reservations, and blocks from the same database snapshot. Generated slots
are never persisted. Hours replacement, blocking, and unblocking use one checked-out
client, a consultant-row FOR UPDATE lock, commit/rollback, and reliable release.
This serializes the single consultant's schedule writes; future booking writes must
participate in the same protocol. No advisory locks, ORM, or additional infrastructure.

`npm test` includes pure date/grid/window/DST tests. `npm run test:db` includes real
PostgreSQL schedule/API tests, rollback tests, concurrent duplicate blocks, and an
observed row-lock wait proving validation uses the hours committed while waiting.
Booking-versus-booking and booking-versus-block HTTP races remain Milestone 4 work.

For browser verification in this prepared workspace, a synthetic consultant was
created through the existing controlled seed. Its private credentials are in ignored
`.local/availability-demo.env`. Do not commit or publish that file. The demo schedule
has Thursday 09:00–10:00 in Asia/Karachi; other days are unavailable. Browser test
blocks were removed and no booking was created. Other checkouts must create their
own consultant using the documented seed command.
