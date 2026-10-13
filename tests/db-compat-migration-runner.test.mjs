import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { applyMigrationFileTransactionally, MIGRATION_LEDGER_LOCK } from '../src/db-compat/migrations.mjs';
import { createDisposableDatabase, dropDisposableDatabase } from '../src/db-compat/disposable-database.mjs';

const { Client } = pg;
const REAL_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

// Needs a real PostgreSQL. The runner's whole claim is what a failing statement
// leaves behind, and no in-memory fake can answer that.
if (!REAL_URL) {
  test('the transactional migration runner needs OMNIA_V9_TEST_DATABASE_URL',
    { skip: 'OMNIA_V9_TEST_DATABASE_URL not set -- transactional migration proof not run' }, () => {});
} else {
  let handle;
  let client;

  const existsRelation = async name => (await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [name])).rows[0].present;
  const recordedVersions = async () => {
    if (!(await existsRelation('schema_migrations'))) return [];
    return (await client.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(row => row.version);
  };

  test.before(async () => {
    handle = await createDisposableDatabase(REAL_URL, 'runner');
    client = new Client({ connectionString: handle.url, ssl: false });
    await client.connect();
  });

  test.after(async () => {
    await client?.end().catch(() => {});
    if (handle) await dropDisposableDatabase(REAL_URL, handle.name);
  });

  test('a failing migration leaves zero partial effects: no table, no row, no ledger, no ledger table', async () => {
    const sql = [
      'BEGIN;',
      'CREATE TABLE dbc_partial_probe (id text PRIMARY KEY);',
      "INSERT INTO dbc_partial_probe VALUES ('SYNTHETIC-ROW-VALUE');",
      'CREATE INDEX dbc_partial_probe_idx ON dbc_partial_probe (id);',
      'SELECT * FROM dbc_table_that_does_not_exist;',
      'COMMIT;'
    ].join('\n');
    await assert.rejects(
      applyMigrationFileTransactionally({ client, version: '900_partial_probe', source: sql }),
      error => error.name === 'MigrationError' && error.code === 'MIGRATION_FAILED' && error.sqlstate === '42P01'
    );
    assert.equal(await existsRelation('dbc_partial_probe'), false);
    assert.equal(await existsRelation('schema_migrations'), false, 'the ledger table is created inside the rolled-back transaction');
    assert.deepEqual(await recordedVersions(), []);
    const locks = await client.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted");
    assert.equal(locks.rows[0].n, 0, 'a failed run holds no advisory lock, unlike PostgresStore.migrate() after a failed wrapped file');
    const state = await client.query('SELECT 1 AS ok');
    assert.equal(state.rows[0].ok, 1, 'the connection is usable after rollback');
  });

  test('a failure after a wrapped file\'s inner COMMIT is still rolled back as one unit', async () => {
    const sql = "BEGIN;\nCREATE TABLE dbc_wrapped_probe (x int);\nINSERT INTO dbc_wrapped_probe VALUES (1);\nINSERT INTO dbc_wrapped_probe VALUES ('not-an-int');\nCOMMIT;\n";
    await assert.rejects(applyMigrationFileTransactionally({ client, version: '901_wrapped_probe', source: sql }), error => error.code === 'MIGRATION_FAILED');
    assert.equal(await existsRelation('dbc_wrapped_probe'), false);
    assert.deepEqual(await recordedVersions(), []);
  });

  test('the error carries a fixed code only, never the statement text or the data it rejected', async () => {
    const sql = "CREATE TABLE dbc_message_probe (x int);\nINSERT INTO dbc_message_probe VALUES ('SYNTHETIC-SECRET-DATA');";
    await assert.rejects(applyMigrationFileTransactionally({ client, version: '902_message_probe', source: sql }), error => {
      assert.equal(error.message, 'MIGRATION_FAILED');
      assert.ok(!String(error.stack).includes('SYNTHETIC-SECRET-DATA'));
      assert.equal(error.sqlstate, '22P02');
      return true;
    });
  });

  test('a valid file applies once, records its ledger row, and a second run is a no-op', async () => {
    const sql = "BEGIN;\nCREATE TABLE dbc_good_probe (id text PRIMARY KEY, n int NOT NULL DEFAULT 0);\nINSERT INTO dbc_good_probe (id) VALUES ('row-a');\nCOMMIT;\n";
    const first = await applyMigrationFileTransactionally({ client, version: '903_good_probe', source: Buffer.from(sql, 'utf8') });
    assert.equal(first.status, 'APPLIED');
    assert.equal(first.transactionShape, 'WRAPPED');
    assert.equal(first.statementCount, 2);
    assert.equal(await existsRelation('dbc_good_probe'), true);
    assert.deepEqual(await recordedVersions(), ['903_good_probe']);
    const second = await applyMigrationFileTransactionally({ client, version: '903_good_probe', source: sql });
    assert.equal(second.status, 'ALREADY_RECORDED');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM dbc_good_probe')).rows[0].n, 1);
    assert.deepEqual(await recordedVersions(), ['903_good_probe']);
  });

  test('a refused file is rejected before BEGIN and changes nothing', async () => {
    await assert.rejects(
      applyMigrationFileTransactionally({ client, version: '904_refused_probe', source: 'CREATE TABLE dbc_refused_probe (x int);\nCREATE INDEX CONCURRENTLY dbc_refused_idx ON dbc_refused_probe (x);\n' }),
      error => error.code === 'NON_TRANSACTIONAL_STATEMENT'
    );
    assert.equal(await existsRelation('dbc_refused_probe'), false);
    assert.equal((await client.query('SELECT now() IS NOT NULL AS ok')).rows[0].ok, true);
  });

  test('a checksum that does not match the expected digest is refused before BEGIN', async () => {
    await assert.rejects(
      applyMigrationFileTransactionally({ client, version: '905_checksum_probe', source: 'CREATE TABLE dbc_checksum_probe (x int);', expectedSha256: '0'.repeat(64) }),
      error => error.code === 'MIGRATION_CHECKSUM_MISMATCH'
    );
    assert.equal(await existsRelation('dbc_checksum_probe'), false);
  });

  test('an invalid version string is refused', async () => {
    await assert.rejects(applyMigrationFileTransactionally({ client, version: "x'); DROP TABLE schema_migrations; --", source: 'SELECT 1;' }), error => error.code === 'MIGRATION_VERSION_INVALID');
  });

  test('the runner and the store use the same migration advisory-lock key', () => {
    assert.equal(MIGRATION_LEDGER_LOCK, 'uberbond:schema-migrations');
  });
}
