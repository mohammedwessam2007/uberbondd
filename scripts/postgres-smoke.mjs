import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PostgresStore, ConflictError } from '../src/store.mjs';
import { importJsonDatabase } from '../src/json-import.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-postgres-smoke-'));
await fs.chmod(root, 0o777);
const databaseDir = path.join(root, 'db');
await fs.mkdir(databaseDir, { recursive: true });
await fs.chmod(databaseDir, 0o777);
const port = 25000 + Math.floor(Math.random() * 3000);
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'password',
  port,
  persistent: false,
  createPostgresUser: true,
  onLog: () => {},
  onError: message => process.stderr.write(`[embedded-postgres] ${String(message)}\n`)
});

let store;
let secondStore;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('uberbond_test');
  const databaseUrl = `postgresql://postgres:password@127.0.0.1:${port}/uberbond_test`;
  store = new PostgresStore({ databaseUrl, ssl: false });
  secondStore = new PostgresStore({ databaseUrl, ssl: false });
  await store.init();

  await store.add('campaigns', { id: 'camp_1', name: 'Postgres Test', approved: true, autoSend: false, createdAt: new Date().toISOString() });
  await store.add('prospects', { id: 'pros_1', domain: 'example.com', website: 'https://example.com', campaignId: 'camp_1', status: 'queued', createdAt: new Date().toISOString() });
  assert.equal((await store.get('prospects', 'pros_1')).domain, 'example.com');
  await assert.rejects(
    store.add('prospects', { id: 'pros_2', domain: 'example.com', website: 'https://example.com/again', campaignId: 'camp_1', status: 'queued' }),
    ConflictError
  );

  await assert.rejects(store.transaction(async tx => {
    await tx.add('suppressions', { id: 'sup_rollback', value: 'rollback@example.com' });
    throw new Error('force rollback');
  }), /force rollback/);
  assert.equal(await store.findOne('suppressions', { value: 'rollback@example.com' }), null);

  await store.add('prospects', { id: 'pros_3', domain: 'three.test', website: 'https://three.test', campaignId: 'camp_1', status: 'queued', createdAt: new Date().toISOString() });
  const [claimA, claimB] = await Promise.all([store.claimProspects(1), secondStore.claimProspects(1)]);
  assert.equal(new Set([...claimA, ...claimB].map(item => item.id)).size, 2);

  const date = new Date().toISOString().slice(0, 10);
  await store.add('discoveryRuns', { id: 'disc_a', provider: 'test', status: 'running', runDate: date, importedCount: 0, startedAt: new Date().toISOString() });
  await store.add('discoveryRuns', { id: 'disc_b', provider: 'test', status: 'running', runDate: date, importedCount: 0, startedAt: new Date().toISOString() });
  const [capacityA, capacityB] = await Promise.all([
    store.reserveDiscoveryCapacity(date, 5, 5, 'disc_a'),
    secondStore.reserveDiscoveryCapacity(date, 5, 5, 'disc_b')
  ]);
  assert.equal(capacityA + capacityB, 5);

  const sourceFile = path.join(root, 'db.json');
  await fs.writeFile(sourceFile, JSON.stringify({
    campaigns: [{ id: 'camp_import', name: 'Imported', approved: true, autoSend: false }],
    prospects: [{ id: 'pros_import', domain: 'import.test', website: 'https://import.test', campaignId: 'camp_import', status: 'queued' }],
    settings: { globalPause: false }
  }));
  const first = await importJsonDatabase(store, sourceFile);
  const second = await importJsonDatabase(store, sourceFile);
  assert.equal(first.totals.written, 3);
  assert.equal(second.totals.updated, 2);
  assert.equal((await store.getSettings()).globalPause, false);

  const tableCount = await store.pool.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'");
  console.log(JSON.stringify({
    ok: true,
    postgresVersion: (await store.pool.query('SHOW server_version')).rows[0].server_version,
    publicTables: tableCount.rows[0].count,
    uniqueDomainConstraint: true,
    transactionRollback: true,
    concurrentClaimsDistinct: true,
    discoveryCapTotal: capacityA + capacityB,
    jsonImportWritten: first.totals.written,
    jsonImportRerunUpdated: second.totals.updated
  }, null, 2));
} finally {
  await secondStore?.close().catch(() => {});
  await store?.close().catch(() => {});
  await postgres.stop().catch(() => {});
}

process.exit(0);
