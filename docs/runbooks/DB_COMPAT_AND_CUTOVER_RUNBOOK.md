# Database compatibility and cutover runbook

Status: **INSTRUCTIONS ONLY.** Nothing in this document has been executed. No cutover is approved. `DATABASE_URL` must not be changed by following this document until the owner gates in section 2 are recorded.

Scope: moving production PostgreSQL from Render to a target (currently an isolated Neon project holding a point-in-time copy, database `uberbond_render_rescue`, PostgreSQL 16). The helpers live in `src/db-compat/`. They are read-only except the transactional migration runner, which is never called by the application boot path.

## 1. What the helpers do

| Need | Function (module) |
|---|---|
| Structural snapshot of catalogs, no row data | `readSchemaSnapshot(client, { schemas })` (`schema-snapshot.mjs`) |
| Stable digest of structure (excludes owner names and sequence positions) | `schemaDigest(snapshot)` |
| Every structural difference, with stable codes | `diffSchemaSnapshots(reference, candidate)` |
| sha256 manifest of `migrations/*.sql` | `buildMigrationManifest({ dir })` (`migrations.mjs`) |
| Applied versions from the ledger | `readMigrationLedger(client)` |
| Manifest versus ledger, edited or missing files | `checkMigrationState({ manifest, ledger, expectedManifest })` |
| One migration file in one transaction, zero partial effects on failure | `applyMigrationFileTransactionally({ client, version, source, expectedSha256 })` |
| Whether a key opens a sampled stored blob (`OK`, `KEY_MISMATCH`, `MALFORMED_KEY`, `MALFORMED_BLOB`) | `checkEncryptionKeyCompatibility({ keyHex, blob })` (`key-compat.mjs`) |
| Env-like configuration check for `production`, `staging` or `test` | `validateRuntimeConfig(env, { mode, databaseAllowlist })` (`runtime-config.mjs`) |
| Read-only health in one READ ONLY transaction | `collectDatabaseHealth(client, { manifest, expectedManifest })` (`health-receipt.mjs`) |
| Receipt of counts, digests and fixed codes | `buildHealthReceipt({ health, manifest, schemaDiffFindings, encryptionKey, runtimeConfig, generatedAt })` |

Every output is limited to counts, digests, fixed reason codes, versions and table names. Nothing prints a key, a password, a connection string, a row value or a decrypted value. Keys appear only as a 16-character keyed fingerprint (HMAC-SHA256 with a fixed label).

Use a dedicated connection for `collectDatabaseHealth` and `applyMigrationFileTransactionally`. Neither may be called on a connection already inside a transaction.

## 2. Owner approval gates

Each gate is an explicit, recorded decision by the owner. This document grants none of them.

- **G1** Read-only access to the Render production database for the final dump.
- **G2** Freeze of writers (web and worker stopped, or maintenance mode) for the final sync window.
- **G3** Changing `DATABASE_URL` to the target. This is the cutover.
- **G4** Starting or resuming web and worker processes against the target.
- **G5** Rollback, including any reconciliation of writes made on the target.
- **G6** Any write to the production or target schema, including recording an unrecorded migration in `schema_migrations`.
- **G7** Any provider-side change in Neon, Render or Vercel beyond the steps listed here.
- **G8** Decommissioning or write-locking the source.

The owner enters secrets (`DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `UNSUBSCRIBE_SECRET`) directly in the platform secret store. Secrets are never pasted into chat, tickets, logs or the repository.

## 3. Pre-cutover checks (read-only; no G-gate needed beyond G1 for the read)

1. **Pin the code.** Refresh `main`. Record the commit SHA that will be deployed. Build the manifest from that commit:
   `buildMigrationManifest({ dir: 'migrations' })`. Record `manifestDigest` and `entryCount`.
2. **Health of the candidate.** On a dedicated read-only connection to the candidate, run `collectDatabaseHealth` with the manifest. Expected:
   - no blocking codes;
   - `UNRECORDED_MIGRATION_RERUNS_ON_BOOT` for `100_cost_stage_fulfill_learn` and `20261008_phoenix_owner_vault`. Both lack a ledger self-record and are idempotent DDL today, so `PostgresStore.migrate()` re-runs them on every boot;
   - `APPLIED_MIGRATION_UNVERIFIED` for every applied version unless an earlier manifest is supplied as `expectedManifest`.
   Any `APPLIED_MIGRATION_EDITED`, `APPLIED_MIGRATION_FILE_MISSING`, `MIGRATION_PENDING` or `SCHEMA_MIGRATIONS_TABLE_MISSING` stops the cutover.
3. **Schema comparison.** Take `readSchemaSnapshot` of the source and of the candidate. Run `diffSchemaSnapshots(source, candidate)`. Every finding must be explained and accepted in writing. `TABLE_OWNER_CHANGED` is expected when provider role names differ; it does not change `schemaDigest`.
4. **Encryption key.** For each encrypted table, sample one stored blob and run `checkEncryptionKeyCompatibility({ keyHex, blob })` with the owner-held production key. Expected status: `OK`. Record the keyed fingerprint only.
   - `KEY_MISMATCH`: stop. Do not write anything. Check for a staging or wrong key in the environment.
   - `MALFORMED_BLOB`: stop. The sampled row is not in the expected format.
5. **Runtime configuration.** Run `validateRuntimeConfig(env, { mode: 'production', databaseAllowlist })`. The allowlist must contain exactly the approved target as `host:port/database`. Expected: `ok: true`. Any reason code stops the cutover. The validator is stricter than `config.mjs` in one respect: production requires `TOKEN_ENCRYPTION_KEY` to be present.
6. **Restore rehearsal.** Dump the source with `pg_dump --format=custom --no-owner` (use `--no-privileges` only after reviewing the privilege diff from step 3, because it drops grants). Restore into a disposable database, not the target. Run `PostgresStore.init()` on the copy and confirm that `schemaDigest`, the ledger and every row count are unchanged. The rehearsal in `tests/db-compat-boot.test.mjs` does exactly this on a disposable PostgreSQL 16 cluster.
7. **Receipt.** `buildHealthReceipt` must produce `PASS`, or `WARN` with only the codes accepted in steps 2 and 6. `BLOCKED` stops the cutover.

## 4. Final-sync freeze (requires G1 and G2)

1. Announce the freeze window. Stop the web and worker processes, or enable maintenance mode. Confirm there are no in-flight jobs by reading queue stats; any running job must be reconciled before the dump.
2. Take the final dump from Render with `pg_dump --format=custom --no-owner`. Record the dump's SHA-256 and the per-table counts in the cutover record. Keep the dump file out of the repository.
3. Restore the dump into a fresh target database. Compare `schemaDigest`, row counts and the ledger with the source. They must match exactly.
4. Re-run `buildHealthReceipt` against the restored target. Status must not be `BLOCKED`.
5. Record the freeze start and end times.

## 5. Cutover (requires G3 and G4)

1. The owner changes `DATABASE_URL` to the target in the platform secret store.
2. Start one web process first. Confirm it is ready and that a read-only query succeeds. Then start the workers.
3. Run the post-cutover health receipt on the target. It must match the final-sync counts exactly before any new write is accepted.
4. Make the source read-only at the role level (owner decision) so that any stray writer fails loudly rather than diverging silently.
5. Lift the freeze only after step 3 passes and the owner confirms.

## 6. Rollback (requires G5)

Trigger conditions: a `BLOCKED` receipt after cutover, a count or digest mismatch, a key or provider failure, or an owner decision.

1. Stop writers on the target.
2. The owner restores `DATABASE_URL` to the source. The source received no writes during the freeze, so no reverse sync is needed for that window.
3. Writes that reached the target after cutover must be enumerated (counts by table and identifiers only) and reconciled manually under G5. Nothing is replayed automatically.
4. Run the health receipt against the source. Expect `PASS` or `WARN`.
5. Lift the freeze.
6. Record the rollback reason codes and timestamps.

## 7. Migration rules

- The application boot path (`PostgresStore.migrate()`) is unchanged by this work. `applyMigrationFileTransactionally` is not wired into it.
- The runner refuses before `BEGIN` any file that contains `CONCURRENTLY`, `VACUUM`, database-level or tablespace-level statements, or transaction control other than one leading `BEGIN` and one trailing `COMMIT`.
- Never edit an applied migration. Add a new file.
- Recording `100_cost_stage_fulfill_learn` and `20261008_phoenix_owner_vault` in the ledger is a G6 decision. It is not needed for correctness today, but each boot re-executes them until the ledger records them.

## 8. Evidence to retain (no secrets)

- Manifest digest and entry count.
- Schema digest and the summary counts.
- Migration state codes and counts.
- Key status and keyed fingerprint.
- Runtime configuration reason codes.
- Dump SHA-256 and per-table counts.
- Freeze start and end times, and the owner approval references.

## 9. Prohibited without a recorded owner decision

- Changing `DATABASE_URL`, or pointing any process at a database outside the allowlist.
- Running any migration against production or the target.
- Dumping production beyond the read-only steps above.
- Printing, pasting or committing secrets or key material.
- Setting `ALLOW_TEST_PAYMENT_UNLOCK`.
- Deleting or write-locking the source (G8).

## 10. Known findings (verified while building this package)

1. **Ledger gap.** `PostgresStore.migrate()` records a migration only when the file itself inserts into `schema_migrations`. `100_cost_stage_fulfill_learn` and `20261008_phoenix_owner_vault` do not, so they re-run on every boot. Both are `IF NOT EXISTS` DDL today. A restored copy re-initialised by the store showed no schema, ledger or row change.
2. **Failed wrapped migration leaves the pool dirty (verified).** If a migration file with its own `BEGIN` fails inside `migrate()`, the error is thrown, but the `finally` block cannot unlock because the transaction is aborted. The connection is released to the pool in state `idle in transaction (aborted)` and keeps the migration advisory lock. Probe results: the next pool query fails with `25P02`; another session cannot take the lock (`pg_try_advisory_lock` returns false); in one probe run a second migrator waited for the full five-second observation window; in an earlier probe a second migrator instead returned error 22012. The second-migrator behaviour is not yet pinned down, but the lock is verifiably held. Mitigation for the code owner (not changed here): issue `ROLLBACK` before unlocking, or destroy the client on error. `applyMigrationFileTransactionally` already rolls back and holds only a transaction-scoped lock, and a test asserts no advisory lock survives its failure.
3. **Embedded test server is PostgreSQL 18.** Production is PostgreSQL 16 and the system `pg_dump` is 16, which refuses a newer server. The dump and restore proof therefore runs on a disposable PostgreSQL 16 cluster started from `/usr/lib/postgresql/16/bin`.
4. **Snapshot coverage gaps.** The snapshot covers tables, views, columns, indexes, constraints, triggers, sequences (parameters and position), extensions, functions (definition digest), and table and schema privileges. It does not cover types and enums, row-level security policies, column-level privileges, default privileges, comments, publications, or role attributes and memberships. Review those separately before cutover.
5. **Pre-cutover counts.** `collectDatabaseHealth` runs `count(*)` on every table. On large tables, run it in a quiet window.
