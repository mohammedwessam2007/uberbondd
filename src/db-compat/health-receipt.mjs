import { readSchemaSnapshot, schemaDigest, summarizeSchemaSnapshot } from './schema-snapshot.mjs';
import { readMigrationLedger, checkMigrationState, MIGRATION_WARNING_CODES } from './migrations.mjs';

export const DB_COMPAT_RECEIPT_SCHEMA = 'uberbond-db-compat-receipt-1';

// Codes that do not block a cutover decision by themselves. Everything else is blocking.
const NON_BLOCKING_CODES = new Set([
  ...MIGRATION_WARNING_CODES,
  'ENCRYPTION_KEY_NOT_CHECKED',
  'RUNTIME_CONFIG_NOT_CHECKED',
  'SCHEMA_DIFF_NOT_CHECKED'
]);

const quoteIdent = name => `"${String(name).replace(/"/g, '""')}"`;

/**
 * Read-only health collection on one connection, inside a single READ ONLY
 * transaction that is always rolled back. It reads catalogs, the migration
 * ledger and per-table row counts. It never writes, and it does not run
 * migrations. The returned `snapshot` is for diffing and is not part of the receipt.
 *
 * The caller must pass a connection that is not already inside a transaction.
 */
export async function collectDatabaseHealth(client, { manifest, expectedManifest = null, schemas = ['public'] } = {}) {
  await client.query('BEGIN READ ONLY');
  try {
    const snapshot = await readSchemaSnapshot(client, { schemas });
    const ledger = await readMigrationLedger(client);
    const rowCounts = {};
    for (const relation of snapshot.relations) {
      if (relation.kind !== 'table' && relation.kind !== 'partitioned_table') continue;
      const result = await client.query(`SELECT count(*)::text AS n FROM ${quoteIdent(relation.schema)}.${quoteIdent(relation.name)}`);
      rowCounts[`${relation.schema}.${relation.name}`] = Number(result.rows[0].n);
    }
    const migrationState = checkMigrationState({ manifest, ledger, expectedManifest });
    return {
      snapshot,
      schemaDigest: schemaDigest(snapshot),
      schemaSummary: summarizeSchemaSnapshot(snapshot),
      ledgerTablePresent: ledger.tablePresent,
      migrationState,
      rowCounts,
      totalRows: Object.values(rowCounts).reduce((total, count) => total + count, 0)
    };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
  }
}

function countByCode(findings) {
  const counts = {};
  for (const finding of findings) counts[finding.code] = (counts[finding.code] || 0) + 1;
  return Object.fromEntries(Object.keys(counts).sort().map(code => [code, counts[code]]));
}

/**
 * Counts, digests and fixed reason codes only. No row values, no definitions,
 * no key material and no connection details. The encryption key appears only
 * as its keyed fingerprint.
 *
 * status: BLOCKED if any blocking code is present, WARN if only warning codes
 * are present, PASS otherwise.
 */
export function buildHealthReceipt({
  health,
  manifest,
  schemaDiffFindings = null,
  encryptionKey = null,
  runtimeConfig = null,
  generatedAt = null
}) {
  const codes = new Set(health.migrationState.reasonCodes);
  if (schemaDiffFindings) {
    if (schemaDiffFindings.length > 0) codes.add('SCHEMA_DIFFERS_FROM_REFERENCE');
  } else {
    // Absence of a schema comparison is never a pass.
    codes.add('SCHEMA_DIFF_NOT_CHECKED');
  }
  if (!encryptionKey) {
    codes.add('ENCRYPTION_KEY_NOT_CHECKED');
  } else if (!encryptionKey.ok) {
    for (const code of encryptionKey.reasonCodes) codes.add(code);
  }
  if (!runtimeConfig) {
    codes.add('RUNTIME_CONFIG_NOT_CHECKED');
  } else if (!runtimeConfig.ok) {
    for (const code of runtimeConfig.reasonCodes) codes.add(code);
  }
  const reasonCodes = [...codes].sort();
  const blocked = reasonCodes.some(code => !NON_BLOCKING_CODES.has(code));
  const state = health.migrationState;
  return {
    schema: DB_COMPAT_RECEIPT_SCHEMA,
    generatedAt,
    status: blocked ? 'BLOCKED' : (reasonCodes.length > 0 ? 'WARN' : 'PASS'),
    reasonCodes,
    readOnly: true,
    schemaDigest: health.schemaDigest,
    schemaSummary: health.schemaSummary,
    schemaDiff: schemaDiffFindings ? { count: schemaDiffFindings.length, codes: countByCode(schemaDiffFindings) } : null,
    migrations: {
      manifestDigest: manifest.manifestDigest,
      manifestEntryCount: manifest.entryCount,
      ledgerTablePresent: health.ledgerTablePresent,
      appliedCount: state.appliedCount,
      pendingCount: state.pendingCount,
      unrecordedCount: state.unrecordedCount,
      editedCount: state.editedCount,
      missingFileCount: state.missingFileCount
    },
    rowCounts: health.rowCounts,
    totalRows: health.totalRows,
    encryptionKey: encryptionKey
      ? { status: encryptionKey.status, keyFingerprint: encryptionKey.keyFingerprint }
      : { status: 'NOT_CHECKED', keyFingerprint: null },
    runtimeConfig: runtimeConfig
      ? { ok: runtimeConfig.ok, mode: runtimeConfig.mode, reasonCodes: runtimeConfig.reasonCodes }
      : { status: 'NOT_CHECKED' }
  };
}
