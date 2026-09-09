import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseIdentity, runPostgresBackupRestoreRehearsal } from '../src/postgres-backup-restore-runner.mjs';

const COMMIT = 'a'.repeat(40);
const PRIMARY = 'postgresql://owner:secret@example.test:5432/uberbond';
const RESTORE = 'postgresql://owner:secret@example.test:5432/uberbond_restore';
const H = ch => `sha256:${ch.repeat(64)}`;
const fingerprint = Object.freeze({ migrationFingerprint: H('1'), tableFingerprint: H('2'), rowCountFingerprint: H('3') });

function adapter(overrides = {}) {
  const calls = [];
  const base = {
    calls,
    async fingerprint(url) { calls.push(['fingerprint', url]); return structuredClone(fingerprint); },
    async dump(url) { calls.push(['dump', url]); return { exitCode: 0, bytes: 4096, sha256: H('4'), path: '/tmp/not-secret.dump' }; },
    async createIsolatedDatabase(url, name) { calls.push(['create', url, name]); return { databaseUrl: RESTORE }; },
    async restore(url, dump) { calls.push(['restore', url, dump.sha256]); return { exitCode: 0 }; },
    async boundedReadWrite(url) { calls.push(['bounded', url]); return { ok: true, rolledBack: true }; },
    async dropIsolatedDatabase(url, name) { calls.push(['drop', url, name]); return { ok: true }; },
    async cleanupDump(dump) { calls.push(['cleanupDump', dump.path]); }
  };
  return Object.assign(base, overrides);
}

const input = adapterInstance => ({
  sourceCommit: COMMIT,
  primaryDatabaseUrl: PRIMARY,
  runtimeIdentity: 'runtime://host-a/revision-a',
  observerRef: 'observer://runtime-rehearsal',
  evidenceRef: 'evidence://postgres/rehearsal-1',
  rollbackRef: 'procedure://isolated-restore-drop',
  adapter: adapterInstance,
  restoreName: 'uberbond_restore_test'
});

test('database identity excludes credentials while binding host port and database', () => {
  const identity = databaseIdentity(PRIMARY);
  assert.match(identity, /^sha256:[0-9a-f]{64}$/);
  assert.equal(identity.includes('owner'), false);
  assert.equal(identity.includes('secret'), false);
  assert.notEqual(identity, databaseIdentity('postgresql://other:other@example.test:5432/another'));
});

test('observed dump isolated restore fingerprint and rollback produce observer-only receipt', async () => {
  const a = adapter();
  const result = await runPostgresBackupRestoreRehearsal(input(a));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'POSTGRES_BACKUP_RESTORE_REHEARSAL_OBSERVED_AWAITING_INDEPENDENT_VERIFICATION');
  assert.equal(result.independentlyVerified, false);
  assert.equal(result.independentVerifierRef, null);
  assert.equal(result.c23RestoreReceipt, null);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.deepEqual(a.calls.map(row => row[0]), ['fingerprint', 'dump', 'create', 'restore', 'fingerprint', 'bounded', 'fingerprint', 'drop', 'cleanupDump']);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('postgresql://'), false);
});

test('restore mismatch refuses instead of laundering a successful pg_restore exit', async () => {
  let fingerprints = 0;
  const a = adapter({ async fingerprint() { fingerprints += 1; return fingerprints === 2 ? { ...fingerprint, rowCountFingerprint: H('9') } : structuredClone(fingerprint); } });
  const result = await runPostgresBackupRestoreRehearsal(input(a));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('restored-state-fingerprint-mismatch'));
});

test('primary mutation refuses even when restored state matched the pre-dump source', async () => {
  let fingerprints = 0;
  const a = adapter({ async fingerprint() { fingerprints += 1; return fingerprints === 3 ? { ...fingerprint, tableFingerprint: H('8') } : structuredClone(fingerprint); } });
  const result = await runPostgresBackupRestoreRehearsal(input(a));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('rehearsal-must-not-mutate-primary-database'));
});

test('bounded write must be rolled back on the isolated database', async () => {
  const result = await runPostgresBackupRestoreRehearsal(input(adapter({ async boundedReadWrite() { return { ok: true, rolledBack: false }; } })));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('restored-bounded-read-write-required'));
});

test('failed isolated cleanup prevents a positive receipt', async () => {
  const result = await runPostgresBackupRestoreRehearsal(input(adapter({ async dropIsolatedDatabase() { throw new Error('cleanup failed'); } })));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('isolated-restore-cleanup-required'));
});

test('failed pg_restore still drops the isolated database and cleans dump', async () => {
  const a = adapter({ async restore(url, dump) { a.calls.push(['restore', url, dump.sha256]); return { exitCode: 1 }; } });
  const result = await runPostgresBackupRestoreRehearsal(input(a));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('observed-successful-pg-restore-required'));
  assert.ok(a.calls.some(row => row[0] === 'drop'));
  assert.ok(a.calls.some(row => row[0] === 'cleanupDump'));
});

test('unsafe caller-chosen restore database name is refused before any database call', async () => {
  const a = adapter();
  const result = await runPostgresBackupRestoreRehearsal({ ...input(a), restoreName: 'prod; DROP DATABASE prod' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('safe-isolated-restore-name-required'));
  assert.equal(a.calls.length, 0);
});

test('missing adapter method fails closed rather than silently skipping a proof step', async () => {
  const a = adapter();
  delete a.restore;
  const result = await runPostgresBackupRestoreRehearsal(input(a));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('adapter-restore-required'));
});
