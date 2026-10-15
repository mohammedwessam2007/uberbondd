# N26 exact protected boot execution contract | 2026-10-15

**Engineering source SHA for review:** `b7cd96a9992a18d9032589f8be741f93807ac0a9`, reviewed tree after official source-bound canon regeneration `14e73f1ca47faf46fb8ee87b776c0dc6f55f3d9c`. No runtime source modifications between these commits. Final protected invocation MUST pin exact Git checkout SHA `14e73f1ca47faf46fb8ee87b776c0dc6f55f3d9c` or a later commit verified to change only receipts/documentation. Owner authorized existing zero-cost, non-destructive protected rescue; actual app boot and source-delta cutover remain distinct.

**Target:** existing Neon project `misty-moon-35132124`, branch `br-orange-wave-baqrfil7`, isolated NONEMPTY restored database `uberbond_phoenix_rehearsal_20261014_v2`, verified direct host `ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech`. Existing authenticated protected original production `TOKEN_ENCRYPTION_KEY` must be rebound through secret facility only; never copied to GitHub, logs or chat. Never use original Render source DSN, pooler host, or Neon database owner credentials as probe login.

**Protected account-only prerequisite:** create an independent temporary LOGIN role with CONNECT to the v2 database, USAGE on `public`, SELECT-only privileges for restored public tables (including `accounts`, `schema_migrations`) and **no** INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, CREATE, CREATEDB, CREATEROLE, SUPERUSER, BYPASSRLS. Prove role via the verifier. A role creation attempt from connected Neon tool was blocked by platform safety checks; it was NOT created. Protected account operator may create the scoped role through an authorized account UI; do not bypass guardrail using privileged generic SQL from this chat.

**Start in one isolated, nonpublic ephemeral account runtime, only after independent SHA/security review.** Populate ONLY the following env entries from approved protected account bindings. Do not export keys in terminal history. Do not load broad production env groups:

```sh
PHOENIX_HELD_RESTORE_PROBE=1
NODE_ENV=production
PROCESS_ROLE=web
STORE_BACKEND=postgres
DATABASE_SSL=true
DATABASE_URL=<protected v2 SELECT-ONLY role DSN, exact pinned host>
TOKEN_ENCRYPTION_KEY=<original key read from protected secret binding>
ADMIN_TOKEN=<protected independent >=32-character value>
APP_BASE_URL=https://held-restore.invalid
PORT=28994
AUTOPILOT_ENABLED=false
OUTBOUND_ENABLED=false
OUTBOUND_DRY_RUN=true
OUTBOUND_EMERGENCY_STOP=true
PUBLIC_AUDIT_ENABLED=false
AGENT_RELAY_ENABLED=false
ALLOW_TEST_PAYMENT_UNLOCK=false
NODE_TLS_REJECT_UNAUTHORIZED=1
```

Ensure no `WINNR_*`, `UBERMIND_*`, `INFINITE_OPUS_*` background flags, no open application ingress, no model or SMTP/IMAP credentials. Process: `node server.mjs`. Actual app binds **127.0.0.1 only**. In same private environment: `node scripts/phoenix-held-restore-http-smoke.mjs`, must report authenticated GET health+summary success, unauthenticated GET summary refusal and all write/admin route refusal. Inspect `PHOENIX_HELD_RESTORE_ADMISSION` for strict read-only role, exactly 57 tables/20 migrations/6 tokens, key compatibility TRUE; verify outgoing network denied and no provider effects or migrations in runtime instrumentation. Do **not** infer source DB writes from the stored v2 snapshot.

**Abort and rollback:** On any unexpected network, certificate, role grant, migration, scope, count or key issue: kill app, revoke ephemeral role/credential, preserve v2 and original intact, mark FAILED with redacted error code. Never weaken TLS, switch to owner role, broaden network, rerun archived backup helper, or launch provider dispatch. After clean probe shut down app and revoke ephemeral grants. A read-only app probe **does not authorize** production cutover or send.

**Post-boot separate, still held:** Original source Render PostgreSQL `dpg-dali9dbl550s73bcf520-a` expires `2026-10-16T23:22:29Z`. Before any cutover, quiesce exact existing writers with reversible control, prove their stopped state, take a NEW final consistent snapshot into a NEW empty destination (never overwrite nonempty v2), reconcile all writes since 2026-10-15T06:23:09Z, run exact schema/rows/sequences/token/boot+auth verifiers, record source and destination DSNs as protected identities without values, one-writer cutover plan, operator rollback. Founder approval for the exact live cutover remains separate. SEND_SET=[].

**Verification at drafting:** Hosted focused actual-entrypoint & TLS synthetic tests 14/14 success, job 116425411113, workflow 38736023973. Official canon regeneration successful, job 116425411156 / workflow 38736023801. Full exact new-head CI/Night/Postal/PG/browser check at this time ongoing; independent Astra security approval on corrected source pending. No live app boot has occurred.
