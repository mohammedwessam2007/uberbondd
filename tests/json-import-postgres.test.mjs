// Real-PostgreSQL proof for JSON import conflict handling.
//
// The importer treats a unique-constraint conflict on one row as a duplicate and
// keeps going. On PostgreSQL that is only safe inside a savepoint: the first
// error in a transaction aborts it, and every later statement then fails. These
// cases run against an embedded server from withDisposablePostgres, because the
// defect is a property of the server's transaction state, not of the JavaScript.
//
// The race cases hold a key open in one independent pool client, start an import
// from a second independent store, wait until that import is blocked on the key
// by a real lock wait, and only then commit the holder. Nothing is timed to win.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgresStore, Store } from '../src/store.mjs';
import { importJsonDatabase } from '../src/json-import.mjs';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const LOCK_WAIT_MS = 15000;

function postgresStore(url) {
  return new PostgresStore({ databaseUrl: url, ssl: false, migrationsDir: MIGRATIONS_DIR });
}

async function writeSource(name, data) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-import-pg-'));
  const file = path.join(dir, name);
  await fs.writeFile(file, JSON.stringify(data));
  return { dir, file };
}

// Every source row is either written, updated or duplicated, exactly once.
function assertAccountedFor(report) {
  const { source, written, updated, duplicates } = report.totals;
  assert.equal(written + updated + duplicates, source, `unaccounted rows: ${JSON.stringify(report.totals)}`);
  for (const [table, counts] of Object.entries(report.tables)) {
    assert.equal(counts.written + counts.updated + counts.duplicates, counts.source, `table ${table} is not fully accounted for`);
  }
}

// Resolves once `observer` sees at least one backend waiting on a row lock.
async function waitForLockWaiter(observer, timeoutMs = LOCK_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`);
    if (rows[0].waiting > 0) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`importer did not block on the held key within ${timeoutMs} ms`);
}

// Holds an open transaction that has written one row, using an independent store and pool.
// Returns a handle whose `release()` commits the holder and whose `done` settles after the commit.
async function holdRow(url, write) {
  const holder = postgresStore(url);
  await holder.init();
  let entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const done = holder.transaction(async tx => {
    await write(tx);
    entered();
    await gate;
  }).finally(() => holder.close());
  await enteredPromise;
  return { release, done };
}

test('duplicate on a key the importer does not pre-check is counted and the rest of the batch commits', async () => {
  await withDisposablePostgres(async url => {
    const store = postgresStore(url);
    await store.init();
    const { dir, file } = await writeSource('source.json', {
      campaigns: [
        { id: 'c1', name: 'First', idempotencyKey: 'SAME-KEY', approved: true, autoSend: false },
        { id: 'c2', name: 'Second', idempotencyKey: 'SAME-KEY', approved: true, autoSend: false }
      ],
      prospects: [{ id: 'p1', domain: 'example.com', website: 'https://example.com', status: 'queued' }],
      settings: { globalPause: false }
    });
    try {
      const report = await importJsonDatabase(store, file);
      assert.equal(report.tables.campaigns.written, 1);
      assert.equal(report.tables.campaigns.duplicates, 1);
      assert.equal(report.tables.prospects.written, 1);
      assert.equal(report.settings.written, 1);
      assert.equal(report.totals.duplicates, 1);
      assertAccountedFor(report);
      const conflict = report.duplicateDetails.find(detail => detail.table === 'campaigns');
      assert.equal(conflict?.incomingId, 'c2');
      assert.match(conflict?.constraint ?? '', /^campaigns_idempotency_key/, 'the duplicate names the constraint that rejected it');
      assert.equal(await store.count('campaigns'), 1);
      assert.equal(await store.count('prospects'), 1);
      assert.equal(await store.get('campaigns', 'c2'), null);
    } finally {
      await store.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

function mixedBatch() {
  return {
    campaigns: [
      { id: 'c1', name: 'One', idempotencyKey: 'K1', approved: true, autoSend: false },
      { id: 'c2', name: 'Two', idempotencyKey: 'K1', approved: true, autoSend: false },
      { id: 'c3', name: 'Three', idempotencyKey: 'K3', approved: true, autoSend: false }
    ],
    prospects: [
      { id: 'p1', domain: 'alpha.example', status: 'queued' },
      { id: 'p2', domain: 'beta.example', status: 'queued' },
      { id: 'p3', domain: 'ALPHA.example', status: 'queued' }
    ],
    socialTasks: [
      { id: 's1', prospectId: 'p1', status: 'open' },
      { id: 's2', prospectId: 'p1', status: 'open' },
      { id: 's3', prospectId: 'p2', status: 'open' }
    ],
    suppressions: [{ id: 'x1', value: 'Blocked@Example.com' }],
    settings: { globalPause: false, label: 'mixed' }
  };
}

test('mixed batch commits every valid row, counts each duplicate exactly, and reruns idempotently', async () => {
  await withDisposablePostgres(async url => {
    const store = postgresStore(url);
    await store.init();
    const { dir, file } = await writeSource('mixed.json', mixedBatch());
    try {
      const first = await importJsonDatabase(store, file);
      assert.equal(first.tables.campaigns.written, 2, 'c1 and c3 are valid; c2 duplicates c1 on idempotencyKey');
      assert.equal(first.tables.campaigns.duplicates, 1);
      assert.equal(first.tables.prospects.written, 2, 'p3 duplicates p1 on domain, case-insensitively');
      assert.equal(first.tables.prospects.duplicates, 1);
      assert.equal(first.tables.socialTasks.written, 2, 's2 duplicates s1 on prospect_id');
      assert.equal(first.tables.socialTasks.duplicates, 1);
      assert.equal(first.tables.suppressions.written, 1);
      assert.equal(first.settings.written, 2);
      assert.equal(first.totals.duplicates, 3);
      assertAccountedFor(first);
      assert.deepEqual(first.duplicateDetails.map(detail => detail.incomingId).sort(), ['c2', 'p3', 's2']);
      assert.equal(first.duplicateDetails.find(detail => detail.incomingId === 's2')?.constraint, 'social_tasks_prospect_unique');

      assert.equal(await store.count('campaigns'), 2);
      assert.equal(await store.count('prospects'), 2);
      assert.equal(await store.count('socialTasks'), 2);
      assert.equal(await store.count('suppressions'), 1);
      assert.equal((await store.get('socialTasks', 's1')).prospectId, 'p1');

      const second = await importJsonDatabase(store, file);
      assert.equal(second.tables.campaigns.updated, 2);
      assert.equal(second.tables.campaigns.duplicates, 1);
      assert.equal(second.tables.prospects.updated, 2);
      assert.equal(second.tables.prospects.duplicates, 1);
      assert.equal(second.tables.socialTasks.updated, 2);
      assert.equal(second.tables.socialTasks.duplicates, 1);
      assert.equal(second.totals.written, 2, 'only the settings keys are written again');
      assertAccountedFor(second);
      assert.equal(await store.count('campaigns'), 2);
      assert.equal(await store.count('prospects'), 2);
      assert.equal(await store.count('socialTasks'), 2);
    } finally {
      await store.close();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

test('a row blocked on a key held by a racing client is counted as a duplicate after that client commits', async () => {
  await withDisposablePostgres(async url => {
    const observer = new pg.Pool({ connectionString: url, max: 1 });
    const importer = postgresStore(url);
    let holder = null;
    let dir = null;
    let file = null;
    let importing = null;
    try {
      await importer.init();
      ({ dir, file } = await writeSource('race.json', {
        campaigns: [
          { id: 'c-ok', name: 'Before', idempotencyKey: 'OK-KEY', approved: true, autoSend: false },
          { id: 'c-race', name: 'Raced', idempotencyKey: 'RACE-KEY', approved: true, autoSend: false },
          { id: 'c-after', name: 'After', idempotencyKey: 'AFTER-KEY', approved: true, autoSend: false }
        ],
        prospects: [{ id: 'p1', domain: 'example.com', status: 'queued' }],
        settings: { globalPause: false }
      }));
      holder = await holdRow(url, tx => tx.upsert('campaigns', { id: 'holder', name: 'Holder', idempotencyKey: 'RACE-KEY', approved: false, autoSend: false }));
      importing = importJsonDatabase(importer, file);
      importing.catch(() => {});
      await waitForLockWaiter(observer);
      holder.release();
      await holder.done;
      const report = await importing;
      assert.equal(report.tables.campaigns.written, 2, 'c-ok and c-after commit around the raced row');
      assert.equal(report.tables.campaigns.duplicates, 1, 'the raced row is counted once, not lost silently');
      assert.equal(report.duplicateDetails.find(detail => detail.table === 'campaigns')?.incomingId, 'c-race');
      assert.equal(report.tables.prospects.written, 1);
      assert.equal(report.settings.written, 1);
      assertAccountedFor(report);
      assert.equal(await importer.count('campaigns'), 3);
      assert.equal(await importer.get('campaigns', 'c-race'), null);
      assert.equal((await importer.get('campaigns', 'c-after')).name, 'After');
    } finally {
      holder?.release();
      await holder?.done.catch(() => {});
      await importing?.catch(() => {});
      await importer.close();
      await observer.end();
      if (dir) await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

test('a row racing a client that wrote the same primary key is reported as an update, not a new write', async () => {
  await withDisposablePostgres(async url => {
    const observer = new pg.Pool({ connectionString: url, max: 1 });
    const importer = postgresStore(url);
    let holder = null;
    let dir = null;
    let file = null;
    let importing = null;
    try {
      await importer.init();
      ({ dir, file } = await writeSource('same-id.json', {
        prospects: [{ id: 'p-race', domain: 'race.example', status: 'queued' }],
        settings: {}
      }));
      holder = await holdRow(url, tx => tx.upsert('prospects', { id: 'p-race', domain: 'holder.example', status: 'queued' }));
      importing = importJsonDatabase(importer, file);
      importing.catch(() => {});
      await waitForLockWaiter(observer);
      holder.release();
      await holder.done;
      const report = await importing;
      assert.equal(report.tables.prospects.updated, 1, 'the row already existed when this import wrote it');
      assert.equal(report.tables.prospects.written, 0);
      assert.equal(report.totals.duplicates, 0);
      assertAccountedFor(report);
      assert.equal(await importer.count('prospects'), 1);
      assert.equal((await importer.get('prospects', 'p-race')).domain, 'race.example');
    } finally {
      holder?.release();
      await holder?.done.catch(() => {});
      await importing?.catch(() => {});
      await importer.close();
      await observer.end();
      if (dir) await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

test('JSON store reports the same campaign and prospect counts for the mixed batch as PostgreSQL', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-import-json-parity-'));
  const { dir: sourceDir, file } = await writeSource('parity.json', mixedBatch());
  try {
    const store = new Store(path.join(dir, 'store'));
    await store.init();
    const report = await importJsonDatabase(store, file);
    assert.equal(report.tables.campaigns.written, 2);
    assert.equal(report.tables.campaigns.duplicates, 1);
    assert.equal(report.tables.prospects.written, 2);
    assert.equal(report.tables.prospects.duplicates, 1);
    assert.equal(report.settings.written, 2);
    assertAccountedFor(report);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
});
