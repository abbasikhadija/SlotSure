# Controlled consultant and demo setup

Use synthetic identities for demonstrations. There are no public default credentials
and no consultant-creation HTTP endpoint. Customers register through the UI.

## Consultant

Configure DATABASE_URL and SESSION_SECRET, then run migrations as described in README.
The existing `npm run db:seed` accepts CONSULTANT_NAME, CONSULTANT_EMAIL and a complete
encoded CONSULTANT_PASSWORD_HASH (Argon2id) from ignored server/.env. It creates the
singleton consultant, or leaves an existing consultant unchanged.

To create a hash without printing a password or embedding one in shell history:

1. Create `.local/consultant-input.env` in your editor (the directory is ignored):

   ```dotenv
   DEMO_PASSWORD=CHANGE_ME
   ```

2. Replace that placeholder with your chosen password; do not reuse it elsewhere.
   From repository root run:

   ```powershell
   node --env-file=.local/consultant-input.env --input-type=module -e "import fs from 'node:fs/promises'; import argon2 from 'argon2'; const p=process.env.DEMO_PASSWORD; if (!p || p.length<12 || p.length>128) throw new Error('Choose a password of 12 to 128 characters'); await fs.writeFile('.local/consultant-hash.txt',await argon2.hash(p,{type:argon2.argon2id}));"
   ```

3. Read the hash in your editor and add these settings to ignored server/.env:

   ```dotenv
   CONSULTANT_NAME=Demo Consultant
   CONSULTANT_EMAIL=consultant@example.test
   CONSULTANT_PASSWORD_HASH='PASTE_THE_COMPLETE_ENCODED_HASH_HERE'
   ```

   Preserve the single quotes around the hash, including its dollar signs. Never
   use this placeholder as a hash. Remove the temporary plaintext input file once
   you have stored the chosen password securely.

4. Run `npm run db:seed`, then sign in with that email and chosen password. Configure
   weekly hours in the consultant UI. No hours are seeded automatically.

For a public demo, provision deliberate synthetic accounts in the target database;
do not copy this workspace's private environment, sessions, or local database.

## Existing workspace

The original consultant's private credentials are in ignored
`.local/availability-demo.env`. A separate customer used in Milestone 7 is described
in ignored `.local/m7-browser.env`. Preserve those files; they are not portable demo
defaults and must not be committed or published. Thursday 09:00–10:00 is the local
demo schedule. Earlier synthetic canceled bookings remain for history checks.

The integration tests create independently authenticated synthetic users with random
passwords in disposable schemas. They do not depend on these local demo accounts.
