import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../src/db-compat/canonical.mjs';
import { splitSqlStatements, analyzeMigrationSql, prepareMigrationStatements, MigrationError } from '../src/db-compat/migration-sql.mjs';
import { buildMigrationManifest, checkMigrationState, MIGRATION_BLOCKING_CODES } from '../src/db-compat/migrations.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'migrations');

test('the splitter ignores semicolons inside comments, literals, identifiers and dollar quotes', () => {
  const texts = s => splitSqlStatements(s).map(x => x.text);
  assert.deepEqual(texts('SELECT 1; -- a; b\nSELECT 2;'), ['SELECT 1', '-- a; b\nSELECT 2']);
  assert.deepEqual(texts('/* x /* nested ; */ still ; */ SELECT 3;'), ['/* x /* nested ; */ still ; */ SELECT 3']);
  assert.deepEqual(texts("INSERT INTO t VALUES ('a;b''c'); SELECT E'x\\'y;z';"), ["INSERT INTO t VALUES ('a;b''c')", "SELECT E'x\\'y;z'"]);
  assert.deepEqual(texts('SELECT "a;b" FROM "x;y"; SELECT 6;'), ['SELECT "a;b" FROM "x;y"', 'SELECT 6']);
  assert.deepEqual(texts('CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; SELECT 4;'),
    ['CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql', 'SELECT 4']);
  assert.deepEqual(texts('CREATE FUNCTION g() RETURNS int AS $b$ x; $b$ LANGUAGE sql; SELECT 5;'),
    ['CREATE FUNCTION g() RETURNS int AS $b$ x; $b$ LANGUAGE sql', 'SELECT 5']);
  assert.deepEqual(texts('SELECT 1;;;   ;'), ['SELECT 1']);
});

test('a leading BEGIN and trailing COMMIT are recognised as the file wrapper, not as body statements', () => {
  const wrapped = analyzeMigrationSql('BEGIN;\nCREATE TABLE a (x int);\nCOMMIT;\n');
  assert.equal(wrapped.transactionShape, 'WRAPPED');
  assert.deepEqual(wrapped.reasonCodes, []);
  assert.deepEqual(wrapped.bodyStatements, ['CREATE TABLE a (x int)']);
  const none = analyzeMigrationSql('CREATE TABLE a (x int);');
  assert.equal(none.transactionShape, 'NONE');
});

test('transaction control that cannot be wrapped is refused, and so is a non-transactional statement', () => {
  assert.deepEqual(analyzeMigrationSql('BEGIN;\nCREATE TABLE a (x int);').reasonCodes, ['EMBEDDED_TRANSACTION_CONTROL_UNSUPPORTED']);
  assert.deepEqual(analyzeMigrationSql('SELECT 1; ROLLBACK;').reasonCodes, ['EMBEDDED_TRANSACTION_CONTROL_UNSUPPORTED']);
  assert.deepEqual(analyzeMigrationSql('CREATE INDEX CONCURRENTLY i ON a (x);').reasonCodes, ['NON_TRANSACTIONAL_STATEMENT']);
  assert.deepEqual(analyzeMigrationSql('VACUUM a;').reasonCodes, ['NON_TRANSACTIONAL_STATEMENT']);
  assert.throws(() => prepareMigrationStatements('CREATE INDEX CONCURRENTLY i ON a (x);'), error => error instanceof MigrationError && error.code === 'NON_TRANSACTIONAL_STATEMENT');
  // The word inside a comment or a string is not a statement.
  assert.deepEqual(analyzeMigrationSql("-- CONCURRENTLY\nSELECT 'VACUUM';").reasonCodes, []);
});

test('self-recording is detected from executable code only', () => {
  assert.equal(analyzeMigrationSql("INSERT INTO schema_migrations(version) VALUES ('x');").selfRecorded, true);
  assert.equal(analyzeMigrationSql("-- INSERT INTO schema_migrations(version) VALUES ('x');\nSELECT 1;").selfRecorded, false);
  assert.equal(analyzeMigrationSql("SELECT 'INSERT INTO schema_migrations';").selfRecorded, false);
});

test('recorded versions are the literals of executable ledger inserts, with comments removed first', () => {
  assert.deepEqual(analyzeMigrationSql("INSERT INTO schema_migrations(version) VALUES ('b'), ('a') ON CONFLICT DO NOTHING;").recordedVersions, ['a', 'b']);
  assert.deepEqual(analyzeMigrationSql("-- INSERT INTO schema_migrations(version) VALUES ('ghost');\nSELECT 1;").recordedVersions, []);
  assert.deepEqual(analyzeMigrationSql("-- note 'not-a-version'\nINSERT INTO schema_migrations(version) VALUES ('real');").recordedVersions, ['real']);
  assert.deepEqual(analyzeMigrationSql("CREATE TABLE t (x text DEFAULT 'a');").recordedVersions, []);
});

test('the manifest covers every migrations/*.sql with its sha256 and a stable digest', async () => {
  const manifest = await buildMigrationManifest({ dir: migrationsDir });
  const names = (await fs.readdir(migrationsDir)).filter(name => name.endsWith('.sql')).sort();
  assert.equal(manifest.entryCount, names.length);
  assert.deepEqual(manifest.entries.map(e => e.file), names);
  for (const entry of manifest.entries) {
    const bytes = await fs.readFile(path.join(migrationsDir, entry.file));
    assert.equal(entry.sha256, sha256Hex(bytes));
    assert.equal(entry.version, entry.file.replace(/\.sql$/i, ''));
  }
  const again = await buildMigrationManifest({ dir: migrationsDir });
  assert.equal(manifest.manifestDigest, again.manifestDigest);
  assert.deepEqual(manifest.reasonCodes, []);
});

test('every repository migration is recorded in the ledger, by its own file or by a later recording file', async () => {
  const manifest = await buildMigrationManifest({ dir: migrationsDir });
  const recorded = new Set(manifest.entries.flatMap(e => e.recordedVersions));
  const unrecorded = manifest.entries.map(e => e.version).filter(version => !recorded.has(version)).sort();
  assert.deepEqual(unrecorded, [], 'no migration may be re-executed on every boot');
  // 100_cost_stage_fulfill_learn and 20261008_phoenix_owner_vault never inserted their own row. Applied files are never
  // edited, so the next file in the sorted order records both versions.
  const byVersion = new Map(manifest.entries.map(e => [e.version, e]));
  assert.equal(byVersion.get('100_cost_stage_fulfill_learn').selfRecorded, false);
  assert.equal(byVersion.get('20261008_phoenix_owner_vault').selfRecorded, false);
  assert.deepEqual(byVersion.get('20261014_record_unrecorded_ledger_versions').recordedVersions,
    ['100_cost_stage_fulfill_learn', '20261008_phoenix_owner_vault', '20261014_record_unrecorded_ledger_versions']);
  for (const entry of manifest.entries) assert.deepEqual(entry.reasonCodes, [], `${entry.version} must be runnable by the transactional runner`);
});

function ledgerFor(manifest, { omit = [], extra = [] } = {}) {
  const versions = [...new Set(manifest.entries.flatMap(e => e.recordedVersions))].filter(version => !omit.includes(version));
  return { tablePresent: true, versions: [...versions, ...extra].sort() };
}

test('a fully recorded ledger has no blocking findings and no re-run warning', async () => {
  const manifest = await buildMigrationManifest({ dir: migrationsDir });
  const state = checkMigrationState({ manifest, ledger: ledgerFor(manifest) });
  assert.equal(state.ok, true);
  assert.equal(state.blockingCount, 0);
  assert.equal(state.pendingCount, 0);
  assert.equal(state.unrecordedCount, 0);
  assert.ok(!state.reasonCodes.includes('UNRECORDED_MIGRATION_RERUNS_ON_BOOT'));
  assert.ok(state.reasonCodes.includes('APPLIED_MIGRATION_UNVERIFIED'));
});

test('a version that no migration file records is a warning that names the re-run on every boot', async () => {
  const manifest = await buildMigrationManifest({ dir: migrationsDir });
  // Remove the recording file's ledger rows from the manifest, as if no file recorded the two earlier versions.
  const withoutRecorder = {
    ...manifest,
    entries: manifest.entries.map(e => (e.version === '20261014_record_unrecorded_ledger_versions' ? { ...e, recordedVersions: [e.version] } : e))
  };
  const state = checkMigrationState({ manifest: withoutRecorder, ledger: ledgerFor(manifest) });
  assert.equal(state.ok, true, 'a re-run is a warning, not a blocking finding');
  assert.equal(state.unrecordedCount, 2);
  for (const version of ['100_cost_stage_fulfill_learn', '20261008_phoenix_owner_vault']) {
    assert.ok(state.findings.some(f => f.code === 'UNRECORDED_MIGRATION_RERUNS_ON_BOOT' && f.version === version), version);
  }
});

test('a self-recorded migration missing from the ledger is pending and blocks', async () => {
  const manifest = await buildMigrationManifest({ dir: migrationsDir });
  const state = checkMigrationState({ manifest, ledger: ledgerFor(manifest, { omit: ['20261013_unlinked_replies'] }) });
  assert.equal(state.ok, false);
  assert.ok(state.findings.some(f => f.code === 'MIGRATION_PENDING' && f.version === '20261013_unlinked_replies'));
});

test('a ledger row without a file is detected as a missing applied migration', async () => {
  const manifest = await buildMigrationManifest({ dir: migrationsDir });
  const state = checkMigrationState({ manifest, ledger: ledgerFor(manifest, { extra: ['999_removed_file'] }) });
  assert.equal(state.ok, false);
  assert.ok(state.findings.some(f => f.code === 'APPLIED_MIGRATION_FILE_MISSING' && f.version === '999_removed_file'));
  assert.equal(state.missingFileCount, 1);
});

test('an applied migration whose file digest differs from the recorded expectation is edited and blocks', async () => {
  const manifest = await buildMigrationManifest({ dir: migrationsDir });
  const expected = structuredClone(manifest);
  expected.entries.find(e => e.version === '001_initial').sha256 = '0'.repeat(64);
  const state = checkMigrationState({ manifest, ledger: ledgerFor(manifest), expectedManifest: expected });
  assert.equal(state.ok, false);
  assert.ok(state.findings.some(f => f.code === 'APPLIED_MIGRATION_EDITED' && f.version === '001_initial'));
  assert.equal(state.editedCount, 1);
  const matching = checkMigrationState({ manifest, ledger: ledgerFor(manifest), expectedManifest: manifest });
  assert.equal(matching.ok, true);
  assert.equal(matching.reasonCodes.includes('APPLIED_MIGRATION_EDITED'), false);
});

test('a missing ledger table is blocking, and the state check never reads the database', async () => {
  const manifest = await buildMigrationManifest({ dir: migrationsDir });
  const state = checkMigrationState({ manifest, ledger: { tablePresent: false, versions: [] } });
  assert.equal(state.ok, false);
  assert.ok(state.findings.some(f => f.code === 'SCHEMA_MIGRATIONS_TABLE_MISSING'));
  assert.ok(MIGRATION_BLOCKING_CODES.includes('SCHEMA_MIGRATIONS_TABLE_MISSING'));
});

test('a migration file the runner would refuse is reported as MIGRATION_SQL_REFUSED', async () => {
  const dir = await fs.mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'dbc-migrations-'));
  try {
    await fs.writeFile(path.join(dir, '001_bad.sql'), 'CREATE INDEX CONCURRENTLY i ON t (x);\n');
    await fs.writeFile(path.join(dir, '002_good.sql'), "BEGIN;\nCREATE TABLE g (x int);\nINSERT INTO schema_migrations(version) VALUES ('002_good');\nCOMMIT;\n");
    await fs.writeFile(path.join(dir, 'notes.txt'), 'ignored');
    const manifest = await buildMigrationManifest({ dir });
    assert.deepEqual(manifest.entries.map(e => e.version), ['001_bad', '002_good']);
    const state = checkMigrationState({ manifest, ledger: { tablePresent: true, versions: [] } });
    assert.ok(state.findings.some(f => f.code === 'MIGRATION_SQL_REFUSED' && f.version === '001_bad'));
    assert.ok(state.findings.some(f => f.code === 'MIGRATION_PENDING' && f.version === '002_good'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
