// Regression proof for the migration ledger gap. PostgresStore.migrate() records a
// version only when the migration file itself inserts into schema_migrations. A file
// without that insert is never counted as applied, so every start executes it again.
// These tests pin the corrected behavior on real PostgreSQL from withDisposablePostgres:
// every repository migration records itself once, repeat startup applies nothing, and
// the ledger lists every file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgresStore } from '../src/store.mjs';
import { splitSqlStatements } from '../src/db-compat/migration-sql.mjs';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';

const { Client } = pg;
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoMigrationsDir = path.join(repoRoot, 'migrations');

async function migrationNames(dir) {
  return (await fs.readdir(dir)).filter(name => name.endsWith('.sql')).sort();
}

// Version literals written by executable INSERT INTO schema_migrations statements.
// Comments and quoted text are masked by the splitter before the keyword is matched.
function selfRecordedVersions(sql) {
  const versions = [];
  for (const statement of splitSqlStatements(sql)) {
    if (!/\bINSERT\s+INTO\s+schema_migrations\b/.test(statement.code)) continue;
    for (const match of statement.text.matchAll(/'([^']*)'/g)) versions.push(match[1]);
  }
  return versions;
}

async function ledgerRows(url) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query('SELECT version, applied_at::text AS applied_at FROM schema_migrations ORDER BY version');
    return result.rows;
  } finally {
    await client.end();
  }
}

// Captures the text of every statement the store sends on a checked-out connection.
function captureSql(store) {
  const sent = [];
  const connect = store.pool.connect.bind(store.pool);
  store.pool.connect = async (...args) => {
    const client = await connect(...args);
    const query = client.query.bind(client);
    client.query = (text, ...rest) => {
      sent.push(typeof text === 'string' ? text : text?.text);
      return query(text, ...rest);
    };
    return client;
  };
  return sent;
}

async function runMigrations(url, migrationsDir, { capture = false } = {}) {
  const store = new PostgresStore({ databaseUrl: url, ssl: false, migrationsDir });
  const sent = capture ? captureSql(store) : [];
  try {
    await store.migrate();
  } finally {
    await store.close();
  }
  return sent;
}

test('every repository migration version is written to schema_migrations by some migration file', async () => {
  // A version no migration file writes is never counted as applied, so its file re-runs on every start.
  // Applied files are never edited, so a version can be recorded by its own file or by a later recording file.
  const recorded = new Set();
  for (const name of await migrationNames(repoMigrationsDir)) {
    const sql = await fs.readFile(path.join(repoMigrationsDir, name), 'utf8');
    for (const version of selfRecordedVersions(sql)) recorded.add(version);
  }
  const missing = (await migrationNames(repoMigrationsDir))
    .map(name => name.replace(/\.sql$/i, ''))
    .filter(version => !recorded.has(version));
  assert.deepEqual(missing, [], 'these migration versions are never recorded, so their files re-run on every start');
});

test('a real database records every migration once, and repeat startup applies nothing new', async () => {
  await withDisposablePostgres(async url => {
    const names = await migrationNames(repoMigrationsDir);
    const expectedVersions = names.map(name => name.replace(/\.sql$/i, '')).sort();
    const nameByText = new Map();
    for (const name of names) nameByText.set(await fs.readFile(path.join(repoMigrationsDir, name), 'utf8'), name);

    await runMigrations(url, repoMigrationsDir);
    const afterFirst = await ledgerRows(url);
    assert.deepEqual(afterFirst.map(row => row.version).sort(), expectedVersions, 'the ledger must hold exactly one row per migration file');

    const sent = await runMigrations(url, repoMigrationsDir, { capture: true });
    const reexecuted = sent.filter(text => nameByText.has(text)).map(text => nameByText.get(text));
    assert.deepEqual(reexecuted, [], 'repeat startup must not execute any migration file again');
    assert.deepEqual(await ledgerRows(url), afterFirst, 'repeat startup must leave the ledger unchanged');
  });
});

test('numeric and date-prefixed files are keyed by basename, and a file without its own insert re-runs on every start', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-ledger-styles-'));
  try {
    await fs.writeFile(path.join(dir, '100_numeric_style.sql'),
      "CREATE TABLE IF NOT EXISTS numeric_style_probe (id int);\nINSERT INTO schema_migrations(version) VALUES ('100_numeric_style') ON CONFLICT DO NOTHING;\n");
    await fs.writeFile(path.join(dir, '20261008_date_style.sql'),
      "CREATE TABLE IF NOT EXISTS date_style_probe (id int);\nINSERT INTO schema_migrations(version) VALUES ('20261008_date_style') ON CONFLICT DO NOTHING;\n");
    const unrecordedSql = 'CREATE TABLE IF NOT EXISTS no_ledger_insert_probe (id int);\n';
    await fs.writeFile(path.join(dir, '20261009_no_ledger_insert.sql'), unrecordedSql);
    await withDisposablePostgres(async url => {
      await runMigrations(url, dir);
      assert.deepEqual((await ledgerRows(url)).map(row => row.version), ['100_numeric_style', '20261008_date_style']);
      const sent = await runMigrations(url, dir, { capture: true });
      assert.ok(sent.includes(unrecordedSql), 'the runner never records a version on the file\'s behalf, so the file runs again');
      assert.equal(sent.filter(text => text.includes('numeric_style_probe') || text.includes('date_style_probe')).length, 0,
        'self-recorded files are skipped on repeat startup');
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
