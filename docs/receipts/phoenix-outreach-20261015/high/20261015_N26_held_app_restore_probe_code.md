# PHOENIX N26/E1 | actual app held restore boot integration candidate

Date: 2026-10-15. Source base: 15a43485cf5adc5873bc5e4f6bdd97fc5563817b (previous hosted H09 CI/Night green).
Proof class: SOURCE_PREPARED; **not** protected runtime boot until real Neon + original key + read-only credential test.

## Change
Only restore-specific startup hardening in server-core.mjs and server.mjs; new isolated verifier and hostile tests. Default production behavior remains unchanged unless PHOENIX_HELD_RESTORE_PROBE=1. Special mode enforces exact Neon v2 database host/name, production/web-only role, no scheduler/outbound, outbound emergency stop, original key and strong admin; refuses privileged database role/any public table write grants, schema write grants, stale 57-table/20-migration coverage, and non-decryptable full six account tokens. Under probe mode, normal store.init() migrations are **not run**. App binds localhost only and serves GET /api/health and GET /api/summary; all other methods/routes are denied by both wrapper and core. Separate exact local HTTP smoke checks real boot and authenticated summary.

## Existing recovery reality
Protected Astra Work issue #1188: fresh encrypted original Render source snapshot 2026-10-15 06:23:09Z; verified isolated Neon v2 57/57 tables and 1270/1270 rows, original key TRUE; helper sensitive access revoked and suspended. Source original Render PG expires 2026-10-16 23:22:29Z. Database rescue helper has never booted app. This code does not cut over, import mailboxes, warm mailboxes or send prospect mail.

## Work only after reviewed hosted tests
1. Verify exact source SHA/CI and no protected key in logs.
2. Arrange a SELECT-only database role against existing isolated Neon v2 (do not alter source; no new snapshot into nonempty v2). Include public table SELECT, schema_migrations SELECT, account tokens SELECT, but NO INSERT/UPDATE/DELETE/TRUNCATE/CREATE/REFERENCES/TRIGGER privileges. Its credential remains in protected account UI only.
3. Run isolated app process with PHOENIX_HELD_RESTORE_PROBE=1, NODE_ENV=production, PROCESS_ROLE=web, STORE_BACKEND=postgres, AUTOPILOT_ENABLED=false, OUTBOUND_ENABLED=false, OUTBOUND_DRY_RUN=true, OUTBOUND_EMERGENCY_STOP=true, PUBLIC_AUDIT_ENABLED=false, AGENT_RELAY_ENABLED=false, original TOKEN_ENCRYPTION_KEY bound without disclosure, valid ADMIN_TOKEN, HTTPS APP_BASE_URL, exact v2 DATABASE_URL and PORT. Do not grant external provider API keys or worker role.
4. Confirm startup PHOENIX_HELD_RESTORE_ADMISSION is TRUE, run node scripts/phoenix-held-restore-http-smoke.mjs inside same protected runtime, save sanitized receipts; stop app, revoke temporary secrets and role when safe. Fail closed on schema mismatch rather than changing tests/source/data.
5. Separately assess source writes since snapshot and one-writer cutover/rollback; this probe cannot prove ongoing replication.

## SAFETY
SEND_SET=[]; no production change, no outbound authority, no sender import, no source PostgreSQL public networking, no billing, no cutover. Strict data and runtime provenance.
