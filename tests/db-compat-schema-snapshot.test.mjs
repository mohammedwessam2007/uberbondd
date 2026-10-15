import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgresStore } from '../src/store.mjs';
import { readSchemaSnapshot, schemaDigest, fullSnapshotDigest, diffSchemaSnapshots, summarizeSchemaSnapshot, SchemaSnapshotError } from '../src/db-compat/schema-snapshot.mjs';
import { createDisposableDatabase, dropDisposableDatabase } from '../src/db-compat/disposable-database.mjs';

const { Client } = pg;
const REAL_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!REAL_URL) {
  test('the catalog snapshot needs OMNIA_V9_TEST_DATABASE_URL',
    { skip: 'OMNIA_V9_TEST_DATABASE_URL not set -- catalog snapshot proof not run' }, () => {});
} else {
  // PostgresStore.migrate() reads migrations/ relative to the working directory.
  process.chdir(repoRoot);
  let handle;
  let store;
  let client;

  async function snapshot() {
    await client.query('BEGIN READ ONLY');
    try {
      return await readSchemaSnapshot(client);
    } finally {
      await client.query('ROLLBACK');
    }
  }

  test.before(async () => {
    handle = await createDisposableDatabase(REAL_URL, 'snap');
    store = new PostgresStore({ databaseUrl: handle.url, ssl: false });
    await store.init();
    client = new Client({ connectionString: handle.url, ssl: false });
    await client.connect();
  });

  test.after(async () => {
    await client?.end().catch(() => {});
    await store?.close().catch(() => {});
    if (handle) await dropDisposableDatabase(REAL_URL, handle.name);
  });

  test('a migrated database yields a substantial structural snapshot with the expected tables', async () => {
    const shot = await snapshot();
    const summary = summarizeSchemaSnapshot(shot);
    assert.ok(summary.tables >= 40, `expected at least 40 tables, saw ${summary.tables}`);
    assert.ok(summary.indexes > 0 && summary.constraints > 0);
    const prospects = shot.relations.find(r => r.name === 'prospects');
    assert.ok(prospects, 'prospects table is present');
    assert.ok(prospects.columns.some(c => c.name === 'domain' && c.notNull));
    assert.ok(shot.relations.some(r => r.name === 'schema_migrations'));
    assert.ok(shot.extensions.some(e => e.name === 'plpgsql'));
  });

  test('two reads of an unchanged database produce no differences and equal digests', async () => {
    const first = await snapshot();
    const second = await snapshot();
    assert.deepEqual(diffSchemaSnapshots(first, second), []);
    assert.equal(schemaDigest(first), schemaDigest(second));
    assert.equal(fullSnapshotDigest(first), fullSnapshotDigest(second));
  });

  test('row writes change neither the structural digest nor the full digest', async () => {
    const before = await snapshot();
    const stamp = new Date().toISOString();
    await store.upsert('prospects', { id: 'dbc-prospect-1', domain: 'prospect.example.invalid', status: 'new', createdAt: stamp, updatedAt: stamp });
    const after = await snapshot();
    assert.equal(schemaDigest(before), schemaDigest(after));
    assert.deepEqual(diffSchemaSnapshots(before, after), []);
  });

  test('advancing a sequence changes only the recorded position, never the structural digest', async () => {
    await client.query('CREATE SEQUENCE dbc_probe_seq');
    const before = await snapshot();
    await client.query("SELECT nextval('dbc_probe_seq')");
    const after = await snapshot();
    assert.equal(schemaDigest(before), schemaDigest(after));
    assert.deepEqual(diffSchemaSnapshots(before, after).map(f => f.code), ['SEQUENCE_POSITION_CHANGED']);
  });

  test('structural drift is reported under stable codes and changes the structural digest', async () => {
    const reference = await snapshot();
    await client.query('ALTER TABLE suppressions ADD COLUMN dbc_probe text');
    await client.query("ALTER TABLE prospects ALTER COLUMN status SET DEFAULT 'dbc'");
    await client.query('CREATE INDEX dbc_probe_idx ON suppressions (value)');
    await client.query('CREATE FUNCTION dbc_touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END; $$');
    await client.query('CREATE TRIGGER dbc_probe_trg BEFORE INSERT ON suppressions FOR EACH ROW EXECUTE FUNCTION dbc_touch()');
    await client.query('GRANT SELECT ON suppressions TO PUBLIC');
    const drifted = await snapshot();
    const codes = new Set(diffSchemaSnapshots(reference, drifted).map(f => f.code));
    for (const code of ['COLUMN_UNEXPECTED', 'COLUMN_DEFAULT_CHANGED', 'INDEX_UNEXPECTED', 'TRIGGER_UNEXPECTED', 'FUNCTION_UNEXPECTED', 'PRIVILEGE_UNEXPECTED']) {
      assert.ok(codes.has(code), `expected ${code}`);
    }
    assert.notEqual(schemaDigest(reference), schemaDigest(drifted));
    const probe = diffSchemaSnapshots(reference, drifted).find(f => f.code === 'COLUMN_UNEXPECTED');
    assert.equal(probe.object, 'public.suppressions.dbc_probe');
  });

  test('the snapshot runs under READ ONLY and cannot be used to write', async () => {
    await client.query('BEGIN READ ONLY');
    try {
      await readSchemaSnapshot(client);
      await assert.rejects(client.query('CREATE TABLE dbc_should_not_exist (x int)'), error => error.code === '25006');
    } finally {
      await client.query('ROLLBACK');
    }
    const exists = await client.query("SELECT to_regclass('dbc_should_not_exist') IS NOT NULL AS present");
    assert.equal(exists.rows[0].present, false);
  });

  test('an empty or malformed schema list is refused with a fixed code', async () => {
    await client.query('BEGIN READ ONLY');
    try {
      await assert.rejects(readSchemaSnapshot(client, { schemas: [] }), error => error instanceof SchemaSnapshotError && error.code === 'SCHEMA_LIST_INVALID');
      await assert.rejects(readSchemaSnapshot(client, { schemas: ['public', ''] }), error => error.code === 'SCHEMA_LIST_INVALID');
    } finally {
      await client.query('ROLLBACK');
    }
  });
}
