import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgresStore } from '../src/store.mjs';
import { buildHealthReceipt, collectDatabaseHealth, DB_COMPAT_RECEIPT_SCHEMA } from '../src/db-compat/health-receipt.mjs';
import { buildMigrationManifest, readMigrationLedger, checkMigrationState } from '../src/db-compat/migrations.mjs';
import { checkEncryptionKeyCompatibility } from '../src/db-compat/key-compat.mjs';
import { validateRuntimeConfig } from '../src/db-compat/runtime-config.mjs';
import { createDisposableDatabase, dropDisposableDatabase } from '../src/db-compat/disposable-database.mjs';
import { encryptJson } from '../src/crypto.mjs';

const { Client } = pg;
const REAL_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'migrations');
const KEY = crypto.randomBytes(32).toString('hex');
const SECRET = 'SYNTHETIC-UNSUBSCRIBE-SECRET-VALUE-0123456789';

function healthFixture(overrides = {}) {
  return {
    schemaDigest: 'a'.repeat(64),
    schemaSummary: { relations: 2, tables: 2, views: 0, columns: 4, indexes: 1, constraints: 1, triggers: 0, sequences: 0, extensions: 1, functions: 0, privileges: 1 },
    ledgerTablePresent: true,
    migrationState: { ok: true, reasonCodes: [], appliedCount: 2, pendingCount: 0, unrecordedCount: 0, editedCount: 0, missingFileCount: 0 },
    rowCounts: { 'public.prospects': 1, 'public.suppressions': 0 },
    totalRows: 1,
    ...overrides
  };
}
const manifestFixture = { manifestDigest: 'b'.repeat(64), entryCount: 2 };
const okKey = () => checkEncryptionKeyCompatibility({ keyHex: KEY, blob: encryptJson({ v: 1 }, KEY) });

test('a clean state with a verified key and runtime config receipts PASS', () => {
  const receipt = buildHealthReceipt({
    health: healthFixture(),
    manifest: manifestFixture,
    schemaDiffFindings: [],
    encryptionKey: okKey(),
    runtimeConfig: validateRuntimeConfig({ DATABASE_URL: 'postgresql://u@127.0.0.1:5432/d' }, { mode: 'test', databaseAllowlist: ['127.0.0.1:5432/d'] })
  });
  assert.equal(receipt.schema, DB_COMPAT_RECEIPT_SCHEMA);
  assert.equal(receipt.status, 'PASS');
  assert.deepEqual(receipt.reasonCodes, []);
  assert.equal(receipt.readOnly, true);
  assert.equal(receipt.generatedAt, null);
});

test('only warning codes receipt WARN, and missing checks are named rather than assumed', () => {
  const receipt = buildHealthReceipt({
    health: healthFixture({ migrationState: { ok: true, reasonCodes: ['UNRECORDED_MIGRATION_RERUNS_ON_BOOT'], appliedCount: 2, pendingCount: 0, unrecordedCount: 2, editedCount: 0, missingFileCount: 0 } }),
    manifest: manifestFixture
  });
  assert.equal(receipt.status, 'WARN');
  assert.deepEqual(receipt.reasonCodes, ['ENCRYPTION_KEY_NOT_CHECKED', 'RUNTIME_CONFIG_NOT_CHECKED', 'SCHEMA_DIFF_NOT_CHECKED', 'UNRECORDED_MIGRATION_RERUNS_ON_BOOT']);
  assert.deepEqual(receipt.encryptionKey, { status: 'NOT_CHECKED', keyFingerprint: null });
});

test('a pending migration, a schema difference, a key mismatch or a refused config each block', () => {
  const pending = buildHealthReceipt({ health: healthFixture({ migrationState: { ok: false, reasonCodes: ['MIGRATION_PENDING'], appliedCount: 1, pendingCount: 1, unrecordedCount: 0, editedCount: 0, missingFileCount: 0 } }), manifest: manifestFixture });
  assert.equal(pending.status, 'BLOCKED');
  const drift = buildHealthReceipt({ health: healthFixture(), manifest: manifestFixture, schemaDiffFindings: [{ code: 'COLUMN_UNEXPECTED', object: 'x' }, { code: 'COLUMN_UNEXPECTED', object: 'y' }] });
  assert.equal(drift.status, 'BLOCKED');
  assert.deepEqual(drift.schemaDiff, { count: 2, codes: { COLUMN_UNEXPECTED: 2 } });
  assert.ok(drift.reasonCodes.includes('SCHEMA_DIFFERS_FROM_REFERENCE'));
  const wrongKey = checkEncryptionKeyCompatibility({ keyHex: crypto.randomBytes(32).toString('hex'), blob: encryptJson({ v: 1 }, KEY) });
  const mismatch = buildHealthReceipt({ health: healthFixture(), manifest: manifestFixture, encryptionKey: wrongKey });
  assert.equal(mismatch.status, 'BLOCKED');
  assert.ok(mismatch.reasonCodes.includes('KEY_MISMATCH'));
  const refused = buildHealthReceipt({ health: healthFixture(), manifest: manifestFixture, runtimeConfig: validateRuntimeConfig({}, { mode: 'production', databaseAllowlist: [] }) });
  assert.equal(refused.status, 'BLOCKED');
  assert.ok(refused.reasonCodes.includes('DATABASE_URL_MISSING'));
});

test('the receipt carries counts, digests, fixed codes and a keyed fingerprint, and never key or secret material', () => {
  const runtime = validateRuntimeConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://app:SYNTHETIC-PW@db.example.invalid:5432/prod', TOKEN_ENCRYPTION_KEY: KEY, UNSUBSCRIBE_SECRET: SECRET }, { mode: 'production', databaseAllowlist: ['other.example.invalid/prod'] });
  const receipt = buildHealthReceipt({ health: healthFixture(), manifest: manifestFixture, encryptionKey: okKey(), runtimeConfig: runtime, generatedAt: '2026-10-13T00:00:00.000Z' });
  const text = JSON.stringify(receipt);
  for (const forbidden of [KEY, KEY.toUpperCase(), SECRET, 'SYNTHETIC-PW', 'db.example.invalid']) {
    assert.ok(!text.includes(forbidden), 'receipt must not contain key, secret, password or host');
  }
  assert.match(receipt.encryptionKey.keyFingerprint, /^[0-9a-f]{16}$/);
  assert.equal(receipt.generatedAt, '2026-10-13T00:00:00.000Z');
});

if (!REAL_URL) {
  test('health collection needs OMNIA_V9_TEST_DATABASE_URL',
    { skip: 'OMNIA_V9_TEST_DATABASE_URL not set -- read-only health collection proof not run' }, () => {});
} else {
  process.chdir(repoRoot);
  test('read-only health collection on a migrated database leaves the database unchanged', async () => {
    const handle = await createDisposableDatabase(REAL_URL, 'health');
    const store = new PostgresStore({ databaseUrl: handle.url, ssl: false });
    const client = new Client({ connectionString: handle.url, ssl: false });
    try {
      await store.init();
      await store.upsert('prospects', { id: 'dbc-health-1', domain: 'health.example.invalid', status: 'new', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      await client.connect();
      const manifest = await buildMigrationManifest({ dir: migrationsDir });
      const before = await collectDatabaseHealth(client, { manifest });
      const after = await collectDatabaseHealth(client, { manifest, expectedManifest: manifest });
      assert.equal(before.schemaDigest, after.schemaDigest);
      assert.equal(before.rowCounts['public.prospects'], 1);
      assert.equal(before.totalRows, after.totalRows);
      // Every version is recorded by its own file or by 20261014_record_unrecorded_ledger_versions, so nothing re-runs on boot.
      assert.equal(before.migrationState.unrecordedCount, 0);
      assert.equal(before.migrationState.pendingCount, 0);
      assert.equal(before.migrationState.ok, true);
      const receipt = buildHealthReceipt({ health: after, manifest, schemaDiffFindings: [] });
      assert.equal(receipt.status, 'WARN');
      assert.deepEqual(receipt.reasonCodes, ['ENCRYPTION_KEY_NOT_CHECKED', 'RUNTIME_CONFIG_NOT_CHECKED']);
      assert.equal(receipt.migrations.manifestEntryCount, manifest.entryCount);
      const ledger = await readMigrationLedger(client);
      assert.equal(checkMigrationState({ manifest, ledger, expectedManifest: manifest }).ok, true);
    } finally {
      await client.end().catch(() => {});
      await store.close().catch(() => {});
      await dropDisposableDatabase(REAL_URL, handle.name);
    }
  });
}
