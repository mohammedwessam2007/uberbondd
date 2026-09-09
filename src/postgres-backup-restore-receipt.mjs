import crypto from 'node:crypto';

export const POSTGRES_BACKUP_RESTORE_RECEIPT_VERSION = 'uberbond.postgres-backup-restore.v1';
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const text = (value, max = 500) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const integer = value => Number.isSafeInteger(value) ? value : null;
const unique = values => [...new Set(values.filter(Boolean))];
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function fail(reasons, extra = {}) {
  return {
    ok: false,
    schemaVersion: POSTGRES_BACKUP_RESTORE_RECEIPT_VERSION,
    status: 'POSTGRES_BACKUP_RESTORE_REHEARSAL_REFUSED',
    reasonCodes: unique(reasons),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

export function compilePostgresBackupRestoreReceipt(input = {}) {
  const reasons = [];
  const sourceCommit = text(input.sourceCommit, 40)?.toLowerCase() || null;
  const primaryDatabaseIdentity = text(input.primaryDatabaseIdentity);
  const restoreDatabaseIdentity = text(input.restoreDatabaseIdentity);
  const backupDigest = text(input.backupDigest, 80)?.toLowerCase() || null;
  const sourceFingerprint = text(input.sourceFingerprint, 80)?.toLowerCase() || null;
  const restoreFingerprint = text(input.restoreFingerprint, 80)?.toLowerCase() || null;
  const evidenceRef = text(input.evidenceRef);
  const observerRef = text(input.observerRef);
  const independentVerifierRef = text(input.independentVerifierRef);
  const runtimeIdentity = text(input.runtimeIdentity);
  const rollbackRef = text(input.rollbackRef);
  const dumpBytes = integer(input.dumpBytes);
  const dumpExitCode = integer(input.dumpExitCode);
  const restoreExitCode = integer(input.restoreExitCode);

  if (!sourceCommit || !SHA40.test(sourceCommit)) reasons.push('exact-source-commit-required');
  if (String(input.environment || '').toUpperCase() !== 'POSTGRES') reasons.push('postgres-environment-required');
  if (!primaryDatabaseIdentity) reasons.push('primary-database-identity-required');
  if (!restoreDatabaseIdentity) reasons.push('restore-database-identity-required');
  if (primaryDatabaseIdentity && restoreDatabaseIdentity && primaryDatabaseIdentity === restoreDatabaseIdentity) reasons.push('restore-must-target-isolated-database');
  if (!backupDigest || !SHA256.test(backupDigest)) reasons.push('backup-sha256-required');
  if (!sourceFingerprint || !SHA256.test(sourceFingerprint)) reasons.push('source-fingerprint-required');
  if (!restoreFingerprint || !SHA256.test(restoreFingerprint)) reasons.push('restore-fingerprint-required');
  if (sourceFingerprint && restoreFingerprint && sourceFingerprint !== restoreFingerprint) reasons.push('restored-state-fingerprint-mismatch');
  if (dumpBytes === null || dumpBytes <= 0) reasons.push('nonempty-backup-required');
  if (dumpExitCode !== 0) reasons.push('pg-dump-must-exit-zero');
  if (restoreExitCode !== 0) reasons.push('pg-restore-must-exit-zero');
  if (input.schemaMigrationsMatch !== true) reasons.push('schema-migrations-must-match');
  if (input.tableSetMatch !== true) reasons.push('restored-table-set-must-match');
  if (input.rowCountFingerprintMatch !== true) reasons.push('restored-row-count-fingerprint-must-match');
  if (input.boundedReadWriteVerified !== true) reasons.push('restored-bounded-read-write-required');
  if (input.primaryDatabaseMutated === true) reasons.push('rehearsal-must-not-mutate-primary-database');
  if (input.cleanupOk !== true) reasons.push('isolated-restore-cleanup-required');
  if (!runtimeIdentity) reasons.push('restore-runtime-identity-required');
  if (!rollbackRef) reasons.push('restore-rollback-reference-required');
  if (!evidenceRef) reasons.push('observed-evidence-reference-required');
  if (!observerRef) reasons.push('observer-reference-required');
  if (input.evidenceClass !== 'OBSERVED_RUNTIME') reasons.push('observed-runtime-evidence-class-required');
  if (input.businessEffectAuthority && input.businessEffectAuthority !== 'NONE') reasons.push('restore-rehearsal-cannot-create-business-authority');

  if (reasons.length) return fail(reasons, { sourceCommit });

  const independentlyVerified = Boolean(independentVerifierRef && independentVerifierRef !== observerRef);
  const receiptCore = {
    sourceCommit,
    primaryDatabaseIdentity,
    restoreDatabaseIdentity,
    backupDigest,
    dumpBytes,
    sourceFingerprint,
    restoreFingerprint,
    schemaMigrationsMatch: true,
    tableSetMatch: true,
    rowCountFingerprintMatch: true,
    boundedReadWriteVerified: true,
    primaryDatabaseMutated: false,
    cleanupOk: true,
    runtimeIdentity,
    rollbackRef,
    evidenceRef,
    observerRef,
    independentVerifierRef: independentVerifierRef || null
  };

  return {
    ok: true,
    schemaVersion: POSTGRES_BACKUP_RESTORE_RECEIPT_VERSION,
    status: independentlyVerified
      ? 'POSTGRES_BACKUP_RESTORE_REHEARSAL_INDEPENDENTLY_VERIFIED'
      : 'POSTGRES_BACKUP_RESTORE_REHEARSAL_OBSERVED_AWAITING_INDEPENDENT_VERIFICATION',
    ...receiptCore,
    receiptDigest: digest(receiptCore),
    independentlyVerified,
    c23RestoreReceipt: independentlyVerified ? {
      evidenceClass: 'OBSERVED_RUNTIME',
      receiptClass: 'RESTORE',
      evidenceRef,
      independentVerifierRef,
      manifestDigest: text(input.manifestDigest, 80),
      runtimeIdentity,
      checksumMatch: true,
      boundedWorkloadVerified: true,
      rollbackRef
    } : null,
    truthBoundary: 'This receipt proves only the named PostgreSQL dump/isolated restore rehearsal at the exact source commit. It does not prove provider independence, production cutover, future restoreability, customer outcomes, or elapsed autonomy.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
