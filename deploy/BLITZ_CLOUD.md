# SlotSure on blitz.cloud

Prepared 2026-11-12. This is a deployment procedure, not a claim of a public deployment.
Deploy one Express instance serving React and `/api`; use managed PostgreSQL for
records and sessions. No persistent app folders are needed. Do not deploy Vite.

## Official platform evidence

Reviewed the [documentation index](https://blitz.cloud/docs/),
[GitHub deployment](https://blitz.cloud/docs/deploy-from-github/),
[Docker deployment](https://blitz.cloud/docs/deploy-docker-image/),
[databases](https://blitz.cloud/docs/databases/),
[environment settings](https://blitz.cloud/docs/settings-and-files/),
[addresses and HTTPS](https://blitz.cloud/docs/addresses-and-https/), and
[limits](https://blitz.cloud/docs/limits/).

- Root Dockerfile is detected and built; keep build folder at repository root,
  because client and server are npm workspaces sharing one lockfile.
- Runtime is Linux AMD64. Blitz sets PORT=8080 and also reads image EXPOSE.
- Environment values are encrypted at rest and applied on restart (64 per app).
- PostgreSQL 17 is managed, private to the account, attached through DATABASE_URL.
  Laptop access to that database is unavailable; do not use a local migration command
  against its internal hostname. Database backups are nightly, retained 7 nights free,
  30 on Pro. The database page documents Download a copy; older settings/pricing
  prose contradicts this, so verify the current dashboard before relying on export.
- HTTPS certificates and HTTP-to-HTTPS redirects are automatic. An app can use the
  account's main address, so assign this app to **khadija.prod.page** after claiming
  that account address. Availability/ownership has not been checked.
- GitHub branch pushes automatically deploy when connected. Root Dockerfile and
  start command can be selected in Advanced settings. A start command replaces CMD
  while preserving the base image ENTRYPOINT.
- Multi-part apps document a pre-version step that can run migrations. A shell,
  one-off job, and exact pre-version configuration for a single-part app are not
  documented in the reviewed pages. Use the explicit start-command fallback below
  unless the dashboard/support confirms a dedicated release step.
- Free: 5 apps, 512 MB reserved memory, one database (PostgreSQL reserves 128 MB),
  10 GB storage, 300 build minutes/month, one build at once. Apps sleep after 15
  idle minutes; programmatic requests do not wake them. Free accounts outside
  EU/EEA/UK/Switzerland last 7 days, then pause. Choose an always-awake paid setting
  for reliable public API service. Measure Argon2/PDF memory before selecting size.
- Pasted Docker images get a TCP startup check, not an automatic HTTP recovery
  monitor. Do not assume the image HEALTHCHECK is honored by Blitz.

## Security gate: proxy trust

The reviewed documentation does **not** specify the complete reverse-proxy chain,
the immediate peer address, whether forwarded headers are overwritten, or whether
all routes to the container have the same hop count. Do not blindly set TRUST_PROXY=1.
Default is 0; Secure cookies intentionally will not be issued through plain backend
HTTP until the actual TLS proxy is trusted. This blocks production authentication
until hosting configuration is verified; do not disable Secure cookies to bypass it.

Ask Blitz support to confirm: the container has no direct untrusted ingress; the
last proxy overwrites X-Forwarded-Proto and sanitizes X-Forwarded-For; and trusting
one hop is safe on every ingress path. Only if confirmed, set TRUST_PROXY=1. If
trust requires a different hop count or an IP/CIDR policy, implement that verified
policy before rollout (the current app accepts only 0 or 1). Do not add a public
debug-header endpoint. Verify Secure/HttpOnly/SameSite=Lax cookies over real HTTPS,
session continuity and correct rate-limit client identity. Simulated proxy tests
are not evidence of Blitz's real topology.

## Build and review locally

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run test:db
npm run build
docker build --platform linux/amd64 -t slotsure:blitz .
```

`test:db` needs an ignored server/.env TEST_DATABASE_URL ending in `_test`. It creates
unique schemas, uses real PostgreSQL and removes its own schemas. Never point tests
at production. See README for setup. Node 24 is the container runtime; local Node 22
checks do not prove Linux/native-module compatibility.

The multi-stage image uses the same Debian/glibc Node 24 base for dependencies and
runtime; npm ci honors the lockfile, Vite builds once, and npm prune removes dev
packages. A build-stage Argon2id hash/verify probe checks the native library. PDFKit,
server assets, DejaVuSans.ttf and LICENSE.txt are included. No environment/secret
build args are used. USER node and direct Node CMD allow signal delivery. Floating
Node 24 tags receive updates; record the resolved base/image digests for exact
release provenance and pin a reviewed digest if byte-identical rebuilds are needed.

Use an isolated local PostgreSQL database and private `blitz-local.env` (ignored by
Git), reachable from the container (Docker Desktop: host.docker.internal). It must
contain synthetic data, independent credentials, APP_ORIGIN=https://khadija.prod.page,
and the variables below. Do not export TEST_DATABASE_URL into a production container.

```sh
docker run --name slotsure-blitz -d -p 127.0.0.1:8080:8080 --env-file blitz-local.env slotsure:blitz node server/src/release.js initialize-start
curl --fail http://127.0.0.1:8080/api/health
curl --fail http://127.0.0.1:8080/api/ready
curl --fail http://127.0.0.1:8080/
docker restart slotsure-blitz
docker logs slotsure-blitz
docker stats --no-stream slotsure-blitz
docker image history --no-trunc slotsure:blitz
docker run --rm --entrypoint sh slotsure:blitz -c 'id; test -f server/assets/fonts/DejaVuSans.ttf; test -f server/assets/fonts/LICENSE.txt; test -f client/dist/index.html; test ! -e server/.env'
```

For the complete local browser journey use a local TLS proxy with verified trust,
or a separate NODE_ENV=development compiled preview with SERVE_CLIENT=1 and a local
HTTP APP_ORIGIN; that HTTP preview does not verify production cookies. Never turn
off production cookie protections. Verify actual JS/CSS assets, registration/login,
hours, booking, same-time conflict, PDF, cancellation and unchanged records after
restart. Use the DB suite for wrong-owner/CSRF/concurrency proofs. Container checks
are pending until Docker is available. Review image layers and logs locally without
sharing secrets; never publish `docker inspect` environment output.

## Dashboard checklist

1. Review/test changes and authorize a commit/push separately. No changes have been
   committed or pushed by the agent. Connect GitHub with read access to
   `abbasikhadija/SlotSure` (or paste the public repository URL).
2. Host something new → My own code → repository. Choose **main** after the reviewed
   changes reach it, root folder, root **Dockerfile**, HTTP **8080**, single app.
   Do not enable the optional GitHub Actions writer without separately reviewing
   its repository-write permissions. Consider disabling automatic deployments while
   initialization is configured.
3. On Databases create/attach PostgreSQL. Verify DATABASE_URL is injected for this
   app; do not copy another app's connection. Do not add volumes for PostgreSQL inside
   the web container. Keep the app at one API instance (rate limits are process-local).
4. Set the Environment tab values below. The first launch may fail closed until
   these are supplied; do not insert placeholder secrets merely to make it green.
5. Configure initialization below, restart, and check logs/readiness. Assign the app
   to the main address **khadija.prod.page**, not an extra app subdomain. Wait for TLS.
6. Complete the proxy security gate before testing authentication. Keep the stable
   session secret across updates. Do not publish the deployment until HTTPS checks pass.

| Variable                 | Value / rule                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| NODE_ENV                 | production                                                            |
| HOST                     | 0.0.0.0                                                               |
| PORT                     | 8080                                                                  |
| APP_ORIGIN               | https://khadija.prod.page                                             |
| CONSULTANT_TIME_ZONE     | Asia/Karachi                                                          |
| DATABASE_URL             | Platform-injected managed PostgreSQL URL; never hardcode              |
| SESSION_SECRET           | Independent random secret of at least 32 bytes                        |
| TRUST_PROXY              | 0 until the above topology gate is resolved; 1 only if confirmed safe |
| CONSULTANT_NAME          | Required for initial seed only, 1–100 characters                      |
| CONSULTANT_EMAIL         | Required for initial seed only, valid email                           |
| CONSULTANT_PASSWORD_HASH | Required for initial seed only, valid encoded Argon2id v19 hash       |

Do not set TEST_DATABASE_URL in production. Production rejects missing/malformed
PostgreSQL URLs and names ending `_test` or `_benchmark`. APP_ORIGIN must be a bare
HTTPS origin, without credentials, path, query or fragment. CONSULTANT_* credentials
are intentionally required only by the administrative seed, not every app restart.
Generate a session secret locally with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"`
and paste it privately. Never capture it in shared logs.

## Migrations and the initial consultant

Preferred, if Blitz exposes a release/pre-version step for this app: run
`node server/src/db/migrate.js` there, exactly one runner, with app database variables.
Use `node server/src/db/seed-consultant.js` once in a confirmed administrative job.
Default image CMD `node server/src/index.js` then starts only the web app.

Portable single-part fallback, supported by the documented Start command setting:

1. Before first initialization, set consultant variables privately, then set Start
   command to **`node server/src/release.js initialize-start`**. It validates config,
   migrates, seeds, closes the administrative pool and starts Express only on success.
   Failure is nonzero and does not open the HTTP port. This does not expose an admin API.
2. Confirm logs say migrations applied and consultant created (or already exists).
   Log in and configure weekly hours. Fresh schema intentionally has no default hours.
3. Immediately replace Start command with **`node server/src/index.js`**, remove the
   three consultant seed variables, and restart. Seeding will not run on later restarts.
4. For an update with pending migrations and no dedicated release step, back up first,
   temporarily use **`node server/src/release.js migrate-start`**, deploy and verify,
   then restore the normal command. It never seeds. If intentionally left enabled,
   restarts only apply unapplied tracked migrations; existing migrations are not rerun.

The existing migration runner applies tracked SQL in one transaction and locks the
tracking table. Do not launch concurrent first-time runners: initial CREATE TABLE IF
NOT EXISTS is not a general cross-process bootstrap lock. Keep one deployment runner.
No reset/drop/truncate or automatic downgrade is introduced. Do not edit applied
migrations. Current SQL preserves booking indexes/constraints and session schema.
Future schema changes must be reviewed for old/new app overlap during rolling deploys;
take maintenance downtime if they cannot remain backward compatible. Never restore a
database backup merely because a code rollback was requested.

Generate the consultant hash locally using installed argon2 and a hidden password
prompt; store only the resulting hash in the hosting secret field. For example in
PowerShell at the repository root:

```powershell
$seedPassword = Read-Host 'Consultant password (12–128 characters)' -AsSecureString
$env:SLOTSURE_SEED_PASSWORD = [System.Net.NetworkCredential]::new('', $seedPassword).Password
try {
  node --input-type=module -e "import argon2 from 'argon2'; const p=process.env.SLOTSURE_SEED_PASSWORD; if(p.length<12||p.length>128) process.exit(1); console.log(await argon2.hash(p,{type:argon2.argon2id,memoryCost:65536,timeCost:3,parallelism:1}));"
} finally {
  Remove-Item Env:SLOTSURE_SEED_PASSWORD
  $seedPassword.Dispose()
}
```

Treat even hash output as sensitive; do not put it in source, command arguments or
build layers. Paste the entire `$argon2id$...` value without interpolation. Seed
validation uses the real Argon2 parser, bounds memory to 256 MiB, passes to 1–10,
parallelism to 1–16, and never stores plaintext. Singleton ON CONFLICT leaves the
existing account unchanged; changing seed values does not rotate its credentials.

## Verify, diagnose, update and recover

- At https://khadija.prod.page load UI and JS/CSS; inspect browser console for CSP
  errors. `/api/health` is liveness independent of PostgreSQL. `/api/ready` verifies
  DB access and essential migrated tables and returns only ready/unavailable.
- Authenticate consultant, set hours, register two synthetic customers, log in,
  book one slot concurrently, require one success/one 409, download authorized PDF,
  reject another customer's PDF/cancel, cancel, rebook, logout and reject old session.
  Verify CSRF/foreign-origin rejection, secure cookie attributes and session continuity
  across app restarts; compare stored booking records across restart.
- Build failure: confirm root folder, lockfile/manifests and Linux AMD64; inspect
  Argon2 build probe failure rather than copying Windows node_modules into the image.
- Starting/crash: check PORT/HOST, missing env, migration/seed log, database awake and
  attached. Readiness 503 is not healthy just because TCP accepts. No cookies over
  HTTPS usually means proxy trust is unresolved; do not weaken cookie settings.
- No slots: configure consultant weekly hours; verify Karachi date, 14-day window,
  blocks and reservations. Seed does not configure availability.
- Before each update: test a dedicated DB, record current version/image digest,
  obtain a backup/export, review migration compatibility and deploy reviewed main.
  Never use `npm audit fix --force` as an unreviewed deployment step.
- Roll back code from Activity → **Put this version back** (last 10 live versions).
  Blitz also documents keeping the previous version during build and reverting when
  a new version fails to start within ten minutes. Restore the normal start command
  explicitly; a code rollback does not undo schema changes or environment edits.
- Restore data only with an explicit recovery decision: pause writes, choose a known
  good database backup on Databases/Backups, understand loss since that backup, restore,
  choose compatible code and reverify. Documented Undo preserves the pre-restore copy.
- SIGTERM/SIGINT drain HTTP, stop session maintenance and close the pool; a 10-second
  deadline bounds shutdown. Public TLS, Linux image, real proxy behavior and resource
  limits must be verified on target; none is claimed as executed here.

See [BENCHMARK.md](BENCHMARK.md) for controlled performance measurements.
