import fs from 'node:fs/promises';
import path from 'node:path';
import { compareText, digestOf, sha256Hex } from './canonical.mjs';
import { analyzeMigrationSql, prepareMigrationStatements, MigrationError } from './migration-sql.mjs';

export const MIGRATION_MANIFEST_SCHEMA = 'uberbond-migration-manifest-1';
// Same key as PostgresStore.migrate(), so the two cannot run concurrently.
export const MIGRATION_LEDGER_LOCK = 'uberbond:schema-migrations';

export const MIGRATION_BLOCKING_CODES = Object.freeze([
  'APPLIED_MIGRATION_EDITED',
  'APPLIED_MIGRATION_FILE_MISSING',
  'MIGRATION_MANIFEST_DUPLICATE_VERSION',
  'MIGRATION_PENDING',
  'MIGRATION_SQL_REFUSED',
  'SCHEMA_MIGRATIONS_TABLE_MISSING'
]);

export const MIGRATION_WARNING_CODES = Object.freeze([
  'APPLIED_MIGRATION_UNVERIFIED',
  'UNRECORDED_MIGRATION_RERUNS_ON_BOOT'
]);

/**
 * Read-only manifest of migrations/*.sql: one sha256 per file, the same file
 * selection and ordering PostgresStore.migrate() uses, and per-file ledger facts.
 * Contents are not included, only digests and sizes.
 */
export async function buildMigrationManifest({ dir }) {
  const names = (await fs.readdir(dir)).filter(name => name.endsWith('.sql')).sort();
  const entries = [];
  const seen = new Set();
  const manifestReasons = new Set();
  for (const file of names) {
    const bytes = await fs.readFile(path.join(dir, file));
    const version = file.replace(/\.sql$/i, '');
    if (seen.has(version)) manifestReasons.add('MIGRATION_MANIFEST_DUPLICATE_VERSION');
    seen.add(version);
    const analysis = analyzeMigrationSql(bytes.toString('utf8'));
    entries.push({
      version,
      file,
      sha256: sha256Hex(bytes),
      bytes: bytes.length,
      selfRecorded: analysis.selfRecorded,
      recordedVersions: analysis.recordedVersions,
      transactionShape: analysis.transactionShape,
      reasonCodes: analysis.reasonCodes
    });
  }
  const body = { schema: MIGRATION_MANIFEST_SCHEMA, algorithm: 'sha256', entryCount: entries.length, entries };
  return {
    ...body,
    manifestDigest: digestOf(body),
    reasonCodes: [...manifestReasons].sort()
  };
}

/** Applied versions from schema_migrations, read on the caller's connection. */
export async function readMigrationLedger(client) {
  const present = await client.query("SELECT to_regclass('schema_migrations') IS NOT NULL AS present");
  if (!present.rows[0]?.present) return { tablePresent: false, versions: [] };
  const rows = await client.query('SELECT version FROM schema_migrations ORDER BY version');
  return { tablePresent: true, versions: rows.rows.map(row => row.version) };
}

/**
 * Compare a manifest with the applied ledger. Pure: no database access.
 *
 * `expectedManifest` is an earlier manifest (for example from a pre-cutover
 * receipt). The ledger stores only versions, so an edited applied file can be
 * detected only against a recorded digest. Without one, the finding is
 * APPLIED_MIGRATION_UNVERIFIED rather than a pass.
 *
 * A version that no migration file writes to the ledger is never in the ledger, so
 * PostgresStore.migrate() re-executes its file on every boot. A version written by a
 * later recording file counts as recorded, because applied files are never edited.
 */
export function checkMigrationState({ manifest, ledger, expectedManifest = null }) {
  const findings = [];
  const add = (code, version = null) => findings.push({ code, version });
  const fileByVersion = new Map(manifest.entries.map(entry => [entry.version, entry]));
  const expectedByVersion = expectedManifest
    ? new Map(expectedManifest.entries.map(entry => [entry.version, entry.sha256]))
    : null;
  const applied = new Set(ledger.versions);
  const recorded = new Set(manifest.entries.flatMap(entry => entry.recordedVersions ?? (entry.selfRecorded ? [entry.version] : [])));

  if (!ledger.tablePresent) add('SCHEMA_MIGRATIONS_TABLE_MISSING');
  for (const version of [...applied].sort()) {
    const entry = fileByVersion.get(version);
    if (!entry) {
      add('APPLIED_MIGRATION_FILE_MISSING', version);
      continue;
    }
    if (!expectedByVersion || !expectedByVersion.has(version)) add('APPLIED_MIGRATION_UNVERIFIED', version);
    else if (expectedByVersion.get(version) !== entry.sha256) add('APPLIED_MIGRATION_EDITED', version);
  }
  for (const entry of manifest.entries) {
    if (entry.reasonCodes.length > 0) add('MIGRATION_SQL_REFUSED', entry.version);
    if (!recorded.has(entry.version)) add('UNRECORDED_MIGRATION_RERUNS_ON_BOOT', entry.version);
    else if (!applied.has(entry.version)) add('MIGRATION_PENDING', entry.version);
  }
  for (const code of manifest.reasonCodes) add(code);

  findings.sort((a, b) => (a.code === b.code ? compareText(a.version, b.version) : compareText(a.code, b.code)));
  const blocking = findings.filter(f => MIGRATION_BLOCKING_CODES.includes(f.code));
  const warnings = findings.filter(f => MIGRATION_WARNING_CODES.includes(f.code));
  const count = code => findings.filter(f => f.code === code).length;
  return {
    ok: blocking.length === 0,
    findings,
    reasonCodes: [...new Set(findings.map(f => f.code))].sort(),
    blockingCount: blocking.length,
    warningCount: warnings.length,
    appliedCount: [...applied].filter(version => fileByVersion.has(version)).length,
    pendingCount: count('MIGRATION_PENDING'),
    unrecordedCount: count('UNRECORDED_MIGRATION_RERUNS_ON_BOOT'),
    editedCount: count('APPLIED_MIGRATION_EDITED'),
    missingFileCount: count('APPLIED_MIGRATION_FILE_MISSING')
  };
}

/**
 * Apply one migration file in its own transaction on a dedicated connection.
 *
 * The file's own leading BEGIN and trailing COMMIT are stripped and replaced by
 * this transaction, so an error anywhere leaves no partial effect, including the
 * ledger row and the ledger table. Files with other transaction control, or with
 * statements that cannot run in a transaction, are refused before BEGIN.
 *
 * The caller must pass a connection that is not already inside a transaction.
 */
export async function applyMigrationFileTransactionally({ client, version, source, expectedSha256 = null }) {
  if (!/^[A-Za-z0-9_.-]{1,200}$/.test(String(version || ''))) throw new MigrationError('MIGRATION_VERSION_INVALID');
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(String(source), 'utf8');
  const sha256 = sha256Hex(bytes);
  if (expectedSha256 !== null && expectedSha256 !== sha256) throw new MigrationError('MIGRATION_CHECKSUM_MISMATCH', { version });
  const plan = prepareMigrationStatements(bytes.toString('utf8'));

  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [MIGRATION_LEDGER_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const existing = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return { version, status: 'ALREADY_RECORDED', sha256, statementCount: 0, transactionShape: plan.transactionShape };
    }
    for (const statement of plan.bodyStatements) await client.query(statement);
    await client.query('INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING', [version]);
    await client.query('COMMIT');
    return { version, status: 'APPLIED', sha256, statementCount: plan.bodyStatements.length, transactionShape: plan.transactionShape };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* the original failure is the one to report */ }
    throw new MigrationError('MIGRATION_FAILED', { version, sqlstate: error?.code || null });
  }
}
