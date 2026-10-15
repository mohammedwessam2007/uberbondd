// Hostile proof for two PostgresStore session defects.
//
// The transaction cases run against a real PostgreSQL server from
// withDisposablePostgres. The defect depends on what the server answers to COMMIT
// after a swallowed statement error, and only a live server reproduces that.
//
// The migrate cleanup case uses a pooled-client stand-in whose ROLLBACK never
// settles. A live server cannot be made to hang on demand at that point, and the
// behaviour under test is what migrate() does with the session after the wait.
//
// Every wait on another session is raced against a timeout, so a hang fails one
// test rather than stalling the suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { PostgresStore } from '../src/store.mjs';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const SETTLE_MS = 5000;
// The cleanup budget migrate() is expected to honour. The late-settling case waits
// past it on purpose, so a migrate() that keeps waiting is caught.
const CLEANUP_BUDGET_MS = 10000;
const CLEANUP_SETTLE_MS = CLEANUP_BUDGET_MS + 5000;

function settleWithin(promise, label, ms = SETTLE_MS) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function makePool(url) {
  const pool = new Pool({ connectionString: url, max: 4 });
  // An idle client that loses its connection emits 'error' on the pool. With no
  // listener that would end the test process rather than fail one test.
  pool.on('error', () => {});
  return pool;
}

async function closePool(pool) {
  // A pool holding a client that never came back cannot drain. The caller stops
  // the server afterwards, which ends every backend, so a bounded wait is enough.
  await settleWithin(pool.end(), 'pool.end()', 2000).catch(() => {});
}

function campaign(id) {
  return { id, approved: true, autoSend: false, createdAt: new Date().toISOString() };
}

// Wraps the pool's promise-form connect so every checkout reports the argument it
// is released with. A released client that was destroyed is released with true.
// Callback-form calls, which pool.query() makes internally, pass straight through.
function recordReleases(pool) {
  const releases = [];
  const connect = pool.connect.bind(pool);
  pool.connect = (...args) => {
    if (typeof args[0] === 'function') return connect(...args);
    return connect().then(client => {
      const release = client.release.bind(client);
      client.release = (...releaseArgs) => {
        releases.push(releaseArgs[0]);
        return release(...releaseArgs);
      };
      return client;
    });
  };
  return releases;
}

// Counts backends a pooled session could leave behind in an open block.
async function idleInTransactionCount(pool) {
  const { rows } = await settleWithin(
    pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'`),
    'pg_stat_activity probe'
  );
  return rows[0].n;
}

test('transaction() whose callback swallows a unique violation rejects and persists zero rows', async () => {
  await withDisposablePostgres(async url => {
    const pool = makePool(url);
    try {
      const store = new PostgresStore({ pool, migrationsDir: MIGRATIONS_DIR });
      await settleWithin(store.init(), 'init()');
      const releases = recordReleases(pool);
      const id = `camp_swallow_${randomUUID()}`;

      // The second insert violates the primary key. The callback catches it and
      // returns normally, so the transaction is aborted while the callback believes
      // it succeeded. PostgreSQL then answers COMMIT with ROLLBACK and no error.
      await assert.rejects(
        settleWithin(store.transaction(async tx => {
          await tx.add('campaigns', campaign(id));
          try {
            await tx.add('campaigns', campaign(id));
          } catch (error) {
            assert.equal(error.code, 'CONFLICT');
          }
        }), 'transaction() with a swallowed violation'),
        error => error.code === 'TRANSACTION_NOT_COMMITTED'
      );

      // The first insert must not survive either.
      const { rows } = await settleWithin(
        pool.query('SELECT count(*)::int AS n FROM campaigns WHERE id = $1', [id]),
        'row count after the refused commit'
      );
      assert.equal(rows[0].n, 0);

      // The connection that ran the aborted transaction is destroyed, not pooled.
      assert.deepEqual(releases, [true]);
    } finally {
      await closePool(pool);
    }
  });
});

test('transaction() still commits when the callback runs cleanly', async () => {
  await withDisposablePostgres(async url => {
    const pool = makePool(url);
    try {
      const store = new PostgresStore({ pool, migrationsDir: MIGRATIONS_DIR });
      await settleWithin(store.init(), 'init()');
      const id = `camp_clean_${randomUUID()}`;

      const result = await settleWithin(
        store.transaction(async tx => {
          await tx.add('campaigns', campaign(id));
          return 'done';
        }),
        'clean transaction()'
      );
      assert.equal(result, 'done');

      const { rows } = await settleWithin(
        pool.query('SELECT count(*)::int AS n FROM campaigns WHERE id = $1', [id]),
        'row count after a clean commit'
      );
      assert.equal(rows[0].n, 1);
    } finally {
      await closePool(pool);
    }
  });
});

test('after a refused commit the store keeps working and no session is left idle in a transaction', async () => {
  await withDisposablePostgres(async url => {
    const pool = makePool(url);
    try {
      const store = new PostgresStore({ pool, migrationsDir: MIGRATIONS_DIR });
      await settleWithin(store.init(), 'init()');
      const id = `camp_refused_${randomUUID()}`;

      await assert.rejects(
        settleWithin(store.transaction(async tx => {
          await tx.add('campaigns', campaign(id));
          try {
            await tx.add('campaigns', campaign(id));
          } catch {
            // swallowed on purpose
          }
        }), 'refused transaction()'),
        error => error.code === 'TRANSACTION_NOT_COMMITTED'
      );

      assert.equal(await idleInTransactionCount(pool), 0);

      const followUp = `camp_followup_${randomUUID()}`;
      await settleWithin(store.transaction(tx => tx.add('campaigns', campaign(followUp))), 'follow-up transaction()');
      const { rows } = await settleWithin(
        pool.query('SELECT count(*)::int AS n FROM campaigns WHERE id = $1', [followUp]),
        'follow-up row count'
      );
      assert.equal(rows[0].n, 1);
    } finally {
      await closePool(pool);
    }
  });
});

// A pooled-client stand-in for one migration run. Every statement the runner sends
// is recorded. The migration itself fails, so migrate() enters its cleanup, where
// the ROLLBACK either never settles or settles after rollbackSettleMs.
function hungRollbackClient(rollbackSettleMs = null) {
  const statements = [];
  const releases = [];
  const client = {
    statements,
    releases,
    rollbackDone: null,
    on() {},
    removeListener() {},
    query(sql) {
      statements.push(sql);
      if (sql === 'ROLLBACK') {
        const settled = rollbackSettleMs === null
          ? new Promise(() => {})
          : new Promise(resolve => setTimeout(() => resolve({ command: 'ROLLBACK', rows: [] }), rollbackSettleMs));
        client.rollbackDone = settled;
        return settled;
      }
      if (sql.includes('hostile_missing_relation')) {
        return Promise.reject(new Error('relation "hostile_missing_relation" does not exist'));
      }
      // After a successful ROLLBACK the session is in autocommit, where PostgreSQL
      // refuses SAVEPOINT with 25P01. This is what a settled cleanup would observe.
      if (sql.startsWith('SAVEPOINT')) {
        return Promise.reject(Object.assign(new Error('SAVEPOINT can only be used in transaction blocks'), { code: '25P01' }));
      }
      if (sql.includes('pg_advisory_unlock')) return Promise.resolve({ rows: [{ released: true }] });
      return Promise.resolve({ rows: [] });
    },
    release(destroy) { releases.push(destroy); }
  };
  return client;
}

function fakePool(client) {
  return { connect: async () => client };
}

async function withFailingMigration(body) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-cleanup-bound-'));
  try {
    await fs.writeFile(path.join(dir, '001_fail.sql'), 'SELECT * FROM hostile_missing_relation;\n');
    return await body(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('migrate() settles and destroys its session when the cleanup ROLLBACK never settles', async () => {
  await withFailingMigration(async dir => {
    const client = hungRollbackClient(null);
    const store = new PostgresStore({ pool: fakePool(client), migrationsDir: dir });

    await assert.rejects(
      settleWithin(store.migrate(), 'migrate() with a ROLLBACK that never settles', CLEANUP_SETTLE_MS),
      /hostile_missing_relation/
    );

    // The schema lock was taken, so the cleanup had a lock to give back.
    assert.ok(client.statements.includes('SELECT pg_advisory_lock(hashtext($1))'));
    // The session is destroyed, not pooled.
    assert.deepEqual(client.releases, [true]);
    // The unsettled ROLLBACK means the session cannot be proven clean, so no
    // unlock is claimed. The server releases the lock when the session is destroyed.
    assert.equal(client.statements.some(sql => sql.includes('pg_advisory_unlock')), false);
    assert.equal(client.statements.some(sql => sql.startsWith('SAVEPOINT')), false);
  });
});

test('migrate() issues nothing further after its cleanup budget, even if the ROLLBACK settles late', async () => {
  await withFailingMigration(async dir => {
    const client = hungRollbackClient(CLEANUP_BUDGET_MS + 1000);
    const store = new PostgresStore({ pool: fakePool(client), migrationsDir: dir });

    await assert.rejects(
      settleWithin(store.migrate(), 'migrate() with a late ROLLBACK', CLEANUP_SETTLE_MS),
      /hostile_missing_relation/
    );
    assert.deepEqual(client.releases, [true]);

    // Let the late ROLLBACK arrive, then give any continuation a turn to run.
    await settleWithin(client.rollbackDone, 'late ROLLBACK', CLEANUP_SETTLE_MS);
    await new Promise(resolve => setImmediate(resolve));

    // No probe and no unlock is sent after the budget ran out.
    assert.equal(client.statements.at(-1), 'ROLLBACK');
    assert.equal(client.statements.some(sql => sql.includes('pg_advisory_unlock')), false);
    assert.deepEqual(client.releases, [true]);
  });
});
