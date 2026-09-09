import crypto from 'node:crypto';
import { compilePostgresBackupRestoreReceipt } from './postgres-backup-restore-receipt.mjs';

export const POSTGRES_BACKUP_RESTORE_RUNNER_VERSION = 'uberbond.postgres-backup-restore-runner.v1';
const SHA40 = /^[0-9a-f]{40}$/;
const ZERO_EFFECTS = Object.freeze({ customerMessages: 0, providerCalls: 0, spendCents: 0, deployments: 0, dnsChanges: 0, credentialChanges: 0, paymentMutations: 0, productionMutations: 0 });
const digest = value => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const safeText = (value, max = 500) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    schemaVersion: POSTGRES_BACKUP_RESTORE_RUNNER_VERSION,
    status: 'POSTGRES_BACKUP_RESTORE_RUNNER_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

export function databaseIdentity(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    if (!/^postgres(?:ql)?:$/.test(url.protocol)) return null;
    const database = url.pathname.replace(/^\//, '');
    if (!url.hostname || !database) return null;
    return digest(`${url.hostname.toLowerCase()}:${url.port || '5432'}/${database}`);
  } catch {
    return null;
  }
}

/**
 * Execute one real dump -> isolated restore -> comparison rehearsal.
 *
 * The adapter owns provider/CLI mechanics. This parent owns ordering, cleanup,
 * exact-source binding and the truth boundary. It never independently verifies
 * its own observation and never serializes a connection string.
 */
export async function runPostgresBackupRestoreRehearsal({
  sourceCommit,
  primaryDatabaseUrl,
  runtimeIdentity,
  observerRef,
  evidenceRef,
  rollbackRef,
  manifestDigest = null,
  adapter,
  restoreName = null
} = {}) {
  const reasons = [];
  const commit = safeText(sourceCommit, 40)?.toLowerCase() || null;
  const primaryIdentity = databaseIdentity(primaryDatabaseUrl);
  const runtime = safeText(runtimeIdentity);
  const observer = safeText(observerRef);
  const evidence = safeText(evidenceRef);
  const rollback = safeText(rollbackRef);
  if (!commit || !SHA40.test(commit)) reasons.push('exact-source-commit-required');
  if (!primaryIdentity) reasons.push('valid-postgres-primary-url-required');
  if (!runtime) reasons.push('runtime-identity-required');
  if (!observer) reasons.push('observer-reference-required');
  if (!evidence) reasons.push('evidence-reference-required');
  if (!rollback) reasons.push('rollback-reference-required');
  for (const method of ['fingerprint', 'dump', 'createIsolatedDatabase', 'restore', 'boundedReadWrite', 'dropIsolatedDatabase']) {
    if (typeof adapter?.[method] !== 'function') reasons.push(`adapter-${method}-required`);
  }
  if (reasons.length) return fail(reasons, { sourceCommit: commit });

  const generatedRestoreName = restoreName || `uberbond_restore_${commit.slice(0, 10)}_${crypto.randomBytes(4).toString('hex')}`;
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(generatedRestoreName)) return fail(['safe-isolated-restore-name-required'], { sourceCommit: commit });

  let isolatedCreated = false;
  let cleanupOk = false;
  let dump = null;
  let receiptInput = null;
  let executionFailure = null;

  try {
    const beforePrimary = await adapter.fingerprint(primaryDatabaseUrl);
    dump = await adapter.dump(primaryDatabaseUrl);
    if (!dump || dump.exitCode !== 0 || !Number.isSafeInteger(dump.bytes) || dump.bytes <= 0 || !/^sha256:[0-9a-f]{64}$/.test(String(dump.sha256 || ''))) {
      executionFailure = fail(['observed-nonempty-successful-pg-dump-required'], { sourceCommit: commit });
    } else {
      const isolated = await adapter.createIsolatedDatabase(primaryDatabaseUrl, generatedRestoreName);
      isolatedCreated = true;
      const restoreIdentity = databaseIdentity(isolated?.databaseUrl);
      if (!restoreIdentity || restoreIdentity === primaryIdentity) {
        executionFailure = fail(['isolated-restore-database-required'], { sourceCommit: commit });
      } else {
        const restored = await adapter.restore(isolated.databaseUrl, dump);
        if (!restored || restored.exitCode !== 0) {
          executionFailure = fail(['observed-successful-pg-restore-required'], { sourceCommit: commit });
        } else {
          const afterRestore = await adapter.fingerprint(isolated.databaseUrl);
          const bounded = await adapter.boundedReadWrite(isolated.databaseUrl);
          const afterPrimary = await adapter.fingerprint(primaryDatabaseUrl);

          const sourceFingerprint = digest(JSON.stringify(beforePrimary));
          const restoreFingerprint = digest(JSON.stringify(afterRestore));
          const primaryAfterFingerprint = digest(JSON.stringify(afterPrimary));
          const primaryUnchanged = sourceFingerprint === primaryAfterFingerprint;
          const stateMatches = sourceFingerprint === restoreFingerprint;

          receiptInput = {
            sourceCommit: commit,
            environment: 'POSTGRES',
            primaryDatabaseIdentity: primaryIdentity,
            restoreDatabaseIdentity: restoreIdentity,
            backupDigest: dump.sha256,
            dumpBytes: dump.bytes,
            dumpExitCode: dump.exitCode,
            restoreExitCode: restored.exitCode,
            sourceFingerprint,
            restoreFingerprint,
            schemaMigrationsMatch: stateMatches && beforePrimary?.migrationFingerprint === afterRestore?.migrationFingerprint,
            tableSetMatch: stateMatches && beforePrimary?.tableFingerprint === afterRestore?.tableFingerprint,
            rowCountFingerprintMatch: stateMatches && beforePrimary?.rowCountFingerprint === afterRestore?.rowCountFingerprint,
            boundedReadWriteVerified: bounded?.ok === true && bounded?.rolledBack === true,
            primaryDatabaseMutated: !primaryUnchanged,
            runtimeIdentity: runtime,
            rollbackRef: rollback,
            evidenceRef: evidence,
            observerRef: observer,
            evidenceClass: 'OBSERVED_RUNTIME',
            manifestDigest,
            businessEffectAuthority: 'NONE'
          };
        }
      }
    }
  } catch (error) {
    executionFailure = fail(['postgres-backup-restore-rehearsal-threw'], { sourceCommit: commit, errorClass: String(error?.name || 'Error') });
  } finally {
    if (isolatedCreated) {
      try {
        await adapter.dropIsolatedDatabase(primaryDatabaseUrl, generatedRestoreName);
        cleanupOk = true;
      } catch {
        cleanupOk = false;
      }
    }
    try { if (dump && typeof adapter.cleanupDump === 'function') await adapter.cleanupDump(dump); } catch { /* best effort; never upgrades proof */ }
  }

  if (executionFailure) {
    if (isolatedCreated && !cleanupOk) {
      return fail([...executionFailure.reasonCodes, 'isolated-restore-cleanup-failed'], { sourceCommit: commit });
    }
    return executionFailure;
  }
  if (!receiptInput) return fail(['restore-receipt-input-not-produced'], { sourceCommit: commit });

  const receipt = compilePostgresBackupRestoreReceipt({ ...receiptInput, cleanupOk });
  return {
    ...receipt,
    runnerVersion: POSTGRES_BACKUP_RESTORE_RUNNER_VERSION,
    independentVerifierRef: null,
    truthBoundary: receipt.ok
      ? `${receipt.truthBoundary} This producer is the observer and therefore cannot independently verify its own rehearsal.`
      : undefined
  };
}
