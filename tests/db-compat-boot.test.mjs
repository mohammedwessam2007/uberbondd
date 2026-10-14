import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { PostgresStore } from '../src/store.mjs';
import { readSchemaSnapshot, schemaDigest, diffSchemaSnapshots } from '../src/db-compat/schema-snapshot.mjs';
import { buildMigrationManifest, readMigrationLedger } from '../src/db-compat/migrations.mjs';
import { collectDatabaseHealth, buildHealthReceipt } from '../src/db-compat/health-receipt.mjs';
import { validateRuntimeConfig } from '../src/db-compat/runtime-config.mjs';
import { checkEncryptionKeyCompatibility } from '../src/db-compat/key-compat.mjs';
import { createDisposableDatabase, dropDisposableDatabase } from '../src/db-compat/disposable-database.mjs';
import { encryptJson } from '../src/crypto.mjs';

// Dump and restore run against a disposable PostgreSQL 16 cluster, not the
// embedded PostgreSQL 18 server: pg_dump refuses a newer server, and production
// is PostgreSQL 16. The cluster is started as the `postgres` account when this
// process is root, because initdb refuses root. It is torn down in `after`.
const { Client } = pg;
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_BIN = process.env.DB_COMPAT_PG16_BIN_DIR || '/usr/lib/postgresql/16/bin';

function postgresAccount() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return { uid: undefined, gid: undefined };
  const line = fs.readFileSync('/etc/passwd', 'utf8').split('\n').find(entry => entry.startsWith('postgres:'));
  if (!line) return null;
  const [, , uid, gid] = line.split(':');
  return { uid: Number(uid), gid: Number(gid) };
}

const account = postgresAccount();
const binariesPresent = ['initdb', 'pg_ctl', 'pg_dump', 'pg_restore'].every(name => fs.existsSync(path.join(PG_BIN, name)));
const skipReason = !binariesPresent
  ? `PostgreSQL 16 binaries not found at ${PG_BIN} -- dump and restore proof not run`
  : (account === null ? 'running as root without a postgres account -- dump and restore proof not run' : null);

// Client-side tools never need the cluster's account.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));

function runTool(binary, args, { asClusterOwner = false, cwd }) {
  const result = spawnSync(path.join(PG_BIN, binary), args, {
    encoding: 'utf8',
    cwd,
    uid: asClusterOwner ? account.uid : undefined,
    gid: asClusterOwner ? account.gid : undefined,
    env: { ...cleanEnv(), LANG: 'C', LC_ALL: 'C' },
    timeout: 180000
  });
  // Report the tool and its status only: its output can contain paths or values.
  if (result.error || result.status !== 0) throw new Error(`${binary} exited with status ${result.status ?? 'none'}`);
  return result.stdout;
}

if (skipReason) {
  test('the read-only boot proof needs a PostgreSQL 16 cluster', { skip: skipReason }, () => {});
} else {
  process.chdir(repoRoot);
  const state = {};

  const connect = async database => {
    const client = new Client({ host: '127.0.0.1', port: state.port, user: 'postgres', database, ssl: false });
    await client.connect();
    return client;
  };
  const urlFor = database => `postgresql://postgres@127.0.0.1:${state.port}/${database}`;

  async function snapshotOf(database) {
    const client = await connect(database);
    try {
      await client.query('BEGIN READ ONLY');
      const shot = await readSchemaSnapshot(client);
      await client.query('ROLLBACK');
      return shot;
    } finally {
      await client.end();
    }
  }

  async function countsOf(database) {
    const client = await connect(database);
    try {
      const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).rows.map(row => row.tablename);
      const counts = {};
      for (const table of tables) {
        counts[table] = (await client.query(`SELECT count(*)::int AS n FROM "${table.replace(/"/g, '""')}"`)).rows[0].n;
      }
      return counts;
    } finally {
      await client.end();
    }
  }

  async function ledgerOf(database) {
    const client = await connect(database);
    try {
      return await readMigrationLedger(client);
    } finally {
      await client.end();
    }
  }

  test.before(async () => {
    state.root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-dbc-pg16-'));
    state.dumpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-dbc-dump-'));
    if (account.uid !== undefined) fs.chownSync(state.root, account.uid, account.gid);
    state.dataDir = path.join(state.root, 'data');
    state.port = 30000 + Math.floor(Math.random() * 20000);
    runTool('initdb', ['-D', state.dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C', '-N'], { asClusterOwner: true, cwd: state.root });
    runTool('pg_ctl', [
      '-D', state.dataDir,
      '-l', path.join(state.root, 'server.log'),
      '-w', '-t', '90',
      '-o', `-F -p ${state.port} -k ${state.root} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
      'start'
    ], { asClusterOwner: true, cwd: state.root });
    state.started = true;
  });

  test.after(async () => {
    if (state.started) {
      try {
        runTool('pg_ctl', ['-D', state.dataDir, '-m', 'fast', '-w', '-t', '60', 'stop'], { asClusterOwner: true, cwd: state.root });
      } catch { /* reported by the tests that needed the server */ }
    }
    if (state.root) fs.rmSync(state.root, { recursive: true, force: true });
    if (state.dumpRoot) fs.rmSync(state.dumpRoot, { recursive: true, force: true });
  });

  test('the cluster is PostgreSQL 16, the same major version as production and as pg_dump', async () => {
    const client = await connect('postgres');
    try {
      const version = Number((await client.query("SELECT current_setting('server_version_num') AS v")).rows[0].v);
      assert.ok(version >= 160000 && version < 170000, `expected PostgreSQL 16, saw server_version_num ${version}`);
    } finally {
      await client.end();
    }
    const dumpVersion = runTool('pg_dump', ['--version'], { cwd: state.root });
    assert.match(dumpVersion, /pg_dump \(PostgreSQL\) 16\./);
  });

  test('a seeded source migrates, dumps and restores to a copy with an identical structural digest and row counts', async () => {
    const source = await createDisposableDatabase(urlFor('postgres'), 'bootsrc');
    state.source = source.name;
    const store = new PostgresStore({ databaseUrl: source.url, ssl: false });
    try {
      await store.init();
      const stamp = new Date().toISOString();
      await store.upsert('prospects', { id: 'dbc-boot-p1', domain: 'boot-one.example.invalid', status: 'new', createdAt: stamp, updatedAt: stamp });
      await store.upsert('prospects', { id: 'dbc-boot-p2', domain: 'boot-two.example.invalid', status: 'contacted', createdAt: stamp, updatedAt: stamp });
      await store.add('suppressions', { id: 'dbc-boot-s1', value: 'optout.example.invalid', createdAt: stamp, updatedAt: stamp });
      await store.setSetting('dbcFixture', { note: 'synthetic-fixture' });
      await store.log('dbc.fixture', { seeded: 3 });
    } finally {
      await store.close();
    }
    state.sourceSnapshot = await snapshotOf(source.name);
    state.sourceCounts = await countsOf(source.name);
    assert.equal(state.sourceCounts.prospects, 2);
    assert.equal(state.sourceCounts.suppressions, 1);

    state.dumpFile = path.join(state.dumpRoot, 'source.dump');
    runTool('pg_dump', ['-h', '127.0.0.1', '-p', String(state.port), '-U', 'postgres', '-w', '--format=custom', '--no-owner', '--no-privileges', '-f', state.dumpFile, source.name], { cwd: state.root });

    const copy = await createDisposableDatabase(urlFor('postgres'), 'bootcopy');
    state.copy = copy.name;
    state.copyUrl = copy.url;
    runTool('pg_restore', ['-h', '127.0.0.1', '-p', String(state.port), '-U', 'postgres', '-w', '--no-owner', '--no-privileges', '--exit-on-error', '-d', copy.name, state.dumpFile], { cwd: state.root });

    const copySnapshot = await snapshotOf(copy.name);
    assert.deepEqual(diffSchemaSnapshots(state.sourceSnapshot, copySnapshot), []);
    assert.equal(schemaDigest(state.sourceSnapshot), schemaDigest(copySnapshot));
    assert.deepEqual(await countsOf(copy.name), state.sourceCounts);
    state.copyDigestBeforeInit = schemaDigest(copySnapshot);
    state.copyCountsBeforeInit = await countsOf(copy.name);
    state.copyLedgerBeforeInit = await ledgerOf(copy.name);
  });

  test('store init on the restored copy changes no schema, no ledger row and no row count', async () => {
    const store = new PostgresStore({ databaseUrl: state.copyUrl, ssl: false });
    try {
      await store.init();
    } finally {
      await store.close();
    }
    const after = await snapshotOf(state.copy);
    assert.equal(schemaDigest(after), state.copyDigestBeforeInit);
    assert.deepEqual(await countsOf(state.copy), state.copyCountsBeforeInit);
    assert.deepEqual(await ledgerOf(state.copy), state.copyLedgerBeforeInit);
  });

  test('read-only queries through the store against the copy leave every count and the schema digest unchanged', async () => {
    const store = new PostgresStore({ databaseUrl: state.copyUrl, ssl: false });
    try {
      const prospects = await store.list('prospects', { orderBy: 'createdAt', direction: 'asc' });
      assert.equal(prospects.length, 2);
      assert.equal(await store.count('suppressions'), 1);
      assert.equal((await store.getSettings()).dbcFixture.note, 'synthetic-fixture');
      assert.ok((await store.list('auditLog', { limit: 5 })).length >= 1);
    } finally {
      await store.close();
    }
    assert.equal(schemaDigest(await snapshotOf(state.copy)), state.copyDigestBeforeInit);
    assert.deepEqual(await countsOf(state.copy), state.copyCountsBeforeInit);
  });

  test('the health receipt for the copy has no unrecorded migration, no blocking finding and a PASS status', async () => {
    const manifest = await buildMigrationManifest({ dir: path.join(repoRoot, 'migrations') });
    // Every migration version is recorded by its own file or by a later recording file, so none re-runs on boot.
    const recorded = new Set(manifest.entries.flatMap(e => e.recordedVersions));
    const unrecordedFromFiles = manifest.entries.map(e => e.version).filter(version => !recorded.has(version)).sort();
    assert.deepEqual(unrecordedFromFiles, []);
    const client = await connect(state.copy);
    let health;
    try {
      health = await collectDatabaseHealth(client, { manifest, expectedManifest: manifest });
    } finally {
      await client.end();
    }
    assert.equal(health.migrationState.blockingCount, 0);
    assert.equal(health.migrationState.unrecordedCount, 0);
    const keyHex = 'c'.repeat(64);
    const key = checkEncryptionKeyCompatibility({ keyHex, blob: encryptJson({ check: 'synthetic' }, keyHex) });
    const runtime = validateRuntimeConfig({ DATABASE_URL: urlFor(state.copy) }, { mode: 'test', databaseAllowlist: [`127.0.0.1:${state.port}/${state.copy}`] });
    const receipt = buildHealthReceipt({ health, manifest, schemaDiffFindings: [], encryptionKey: key, runtimeConfig: runtime, generatedAt: null });
    assert.equal(receipt.status, 'PASS');
    assert.deepEqual(receipt.reasonCodes, []);
    assert.equal(receipt.encryptionKey.status, 'OK');
    assert.equal(receipt.runtimeConfig.ok, true);
    assert.equal(receipt.rowCounts['public.prospects'], 2);
    assert.equal(receipt.totalRows, health.totalRows);
    assert.equal(receipt.schemaDigest, state.copyDigestBeforeInit);
  });

  test('a copy target outside the allowlist is refused by the runtime check, even when the copy itself is healthy', () => {
    const result = validateRuntimeConfig(
      { DATABASE_URL: urlFor(state.copy) },
      { mode: 'test', databaseAllowlist: [`127.0.0.1:${state.port}/${state.source}`] }
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasonCodes, ['DATABASE_TARGET_NOT_ALLOWLISTED']);
  });

  test('cleanup removes the disposable copies it created', async () => {
    await dropDisposableDatabase(urlFor('postgres'), state.copy);
    await dropDisposableDatabase(urlFor('postgres'), state.source);
    const client = await connect('postgres');
    try {
      const left = await client.query("SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE 'uberbond_dbc_%'");
      assert.equal(left.rows[0].n, 0);
    } finally {
      await client.end();
    }
  });
}
