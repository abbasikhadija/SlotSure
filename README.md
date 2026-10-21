# SlotSure

Book your time. No clashes, no confusion.

SlotSure will help independent consultants and their customers replace manual scheduling messages with reliable appointment booking. The MVP is limited to one consultant, registered customers, one consultation type, 30-minute appointments, and a 14-day booking window.

## Current status

Milestone 0 foundation only: a React status page, Express health endpoint, PostgreSQL connectivity command, linting, formatting, and automated foundation checks. Authentication, booking, availability, cancellations, and PDF confirmations are planned, not available yet.

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

Edit `server/.env` to set your actual `DATABASE_URL`. Percent-encode reserved characters in URI passwords. The example uses PostgreSQL port 5432; use your instance's actual port. Keep `.env` private. Do not commit credentials. There are no migrations or application tables in Milestone 0.

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

Later milestones introduce users, weekly hours, blocked slots, bookings, and a PostgreSQL session store. Confirmed bookings will use a partial unique index on start times. Schedule mutations will share a transaction-scoped consultant-row lock, with business rules rechecked after acquiring it. These protections are **not implemented** in the foundation.

## Limitations

No authentication, appointments, PDFs, deployment, or demo accounts exist yet. Future authentication excludes email verification and password recovery; this MVP will not be presented as a production-ready commercial identity system. Public demonstrations must use synthetic data. No screenshots or deployment links are available.

See [engineering decisions](docs/DECISIONS.md). Milestone 1 requires explicit authorization.
