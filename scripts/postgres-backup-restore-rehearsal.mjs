#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { runPostgresBackupRestoreRehearsal } from '../src/postgres-backup-restore-runner.mjs';
import { createPostgresBackupRestorePgAdapter } from '../src/postgres-backup-restore-pg-adapter.mjs';

function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

const databaseUrl = process.env.DATABASE_URL || process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const sourceCommit = process.env.UBERBOND_SOURCE_COMMIT || gitHead();
const runtimeIdentity = process.env.UBERBOND_RUNTIME_IDENTITY || `runtime://local/${os.hostname()}`;
const observerRef = process.env.UBERBOND_RESTORE_OBSERVER_REF || `observer://postgres-restore/${os.hostname()}`;
const evidenceRef = process.env.UBERBOND_RESTORE_EVIDENCE_REF || `evidence://postgres-restore/${sourceCommit || 'unknown'}`;
const rollbackRef = process.env.UBERBOND_RESTORE_ROLLBACK_REF || 'procedure://isolated-restore-database-drop';
const manifestDigest = process.env.UBERBOND_CONTINUITY_MANIFEST_DIGEST || null;

if (!databaseUrl) {
  console.error(JSON.stringify({ ok: false, status: 'POSTGRES_BACKUP_RESTORE_REHEARSAL_NOT_RUN', reasonCodes: ['DATABASE_URL_REQUIRED'], businessEffectAuthority: 'NONE' }));
  process.exit(2);
}

const result = await runPostgresBackupRestoreRehearsal({
  sourceCommit,
  primaryDatabaseUrl: databaseUrl,
  runtimeIdentity,
  observerRef,
  evidenceRef,
  rollbackRef,
  manifestDigest,
  adapter: createPostgresBackupRestorePgAdapter()
});

const safeResult = structuredClone(result);
const output = process.env.UBERBOND_RESTORE_RECEIPT_PATH || path.join('artifacts', 'runtime', 'postgres-backup-restore-latest.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(safeResult, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: safeResult.ok,
  status: safeResult.status,
  sourceCommit: safeResult.sourceCommit || sourceCommit,
  receiptDigest: safeResult.receiptDigest || null,
  independentlyVerified: safeResult.independentlyVerified === true,
  output,
  truthBoundary: 'OBSERVED_REHEARSAL_ONLY__NOT_INDEPENDENT_HOST_OR_PROVIDER_PROOF',
  businessEffectAuthority: 'NONE'
}));
process.exit(safeResult.ok ? 0 : 1);
