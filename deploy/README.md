# Deployment runbook

This configuration is prepared, not deployed. No target host/domain/database or hosting
credentials were supplied. Caddy is not installed in the verification environment, so
its template was checked against documentation but not executed. No public URL exists.

## Topology

One server runs Caddy as the only public TLS reverse proxy, Node/Express on loopback
127.0.0.1:3000, and PostgreSQL locally or at an explicitly configured provider.
Express serves the built React UI and /api from the same origin. Vite is build-time
tooling, never the production server. Keep exactly one API process: login rate counters
are in memory. PostgreSQL contains both domain records and sessions.

## Prepare and start

1. Install Node 24 LTS, npm and PostgreSQL access. Check out the reviewed source.
2. Run `npm ci`, then all verification commands from README against a separate test
   database. Run `npm run build` while development dependencies are available.
3. Copy production.env.example into a private server/.env or supply those variables
   through the host's secret configuration. Replace every placeholder. Generate an
   independent random SESSION_SECRET (README command); the CHANGE_ME value fails
   validation. APP_ORIGIN must exactly match the real HTTPS origin.
4. Configure the application database/login and the provider's verified TLS settings
   where applicable. Run `npm run db:check`, then `npm run db:migrate` once. Migrations
   are explicit release steps, never automatic on application startup. Back up existing
   data before schema changes; there is no automatic migration downgrade.
5. Seed the one consultant using docs/DEMO_SETUP.md and a private encoded Argon2id hash.
   The seed will not replace an existing consultant. Configure hours after signing in.
6. Keep client/dist, server/src, server/migrations, server/assets/fonts and installed
   runtime dependencies in the release. The font license must remain with the font.
   `npm prune --omit=dev` may remove development dependencies after build/test;
   tests and rebuilding need the development dependencies again.
7. Run `npm start` under the host's process manager, with working directory at the
   repository root. NODE_ENV=production serves the compiled UI automatically and
   requires HTTPS for Secure cookies. Startup fails if client/dist/index.html is absent.
8. Replace slotsure.example.com in Caddyfile with the domain you control. Configure
   DNS and the host's normal TLS/proxy installation; run `caddy validate --config
deploy/Caddyfile --adapter caddyfile` before using that configuration. Expose only
   the TLS proxy publicly; the Node listener must remain loopback-only.

TRUST_PROXY=1 is appropriate only for this one trusted proxy which overwrites supplied
forwarded headers. Do not reuse it unchanged behind a different proxy topology.
Caddy's documented reverse_proxy defaults set X-Forwarded-Proto/For/Host and ignore
incoming client values for those fields; see the [official reference](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Do not serve the repository root, server/.env, node_modules, or private demo fixtures
as static content. Express exposes only client/dist; unknown API routes stay JSON.
The compiled client has a same-origin CSP, nosniff, and same-origin referrer policy.

## Verify the actual deployment

- Load the HTTPS UI and its JS/CSS assets; check that no CSP errors appear.
- Verify /api/health separately from real db:check connectivity.
- Register/sign in; verify HttpOnly/SameSite=Lax/Secure cookies and rejected foreign
  origins/missing CSRF. Verify the Node port is inaccessible publicly.
- Book a future available time; verify confirmation, dashboard, PDF download, logout,
  cancellation/history, consultant hours and block/unblock flows using synthetic data.
- Confirm wrong-owner access is rejected and canceled PDFs are truthful. Run the real
  PostgreSQL suite against the separate test database; never against production data.
- Record the actual URL, host/runtime, release identifier, commands and results only
  after these checks pass. The current report does not claim any of them passed remotely.

## Operation

Keep the session secret stable across restarts. SIGINT/SIGTERM closes the listener,
session-store maintenance and pool. The host process manager should restart failures.
Keep database backups, private environment configuration and TLS renewal under the
host's normal operations. Logs deliberately omit passwords and connection strings.
The application has no file-upload, notification, payment or permanent PDF store.
