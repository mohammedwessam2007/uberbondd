// Hostile proof that PostgresStore hands its pooled session back clean after a
// failed migration or transaction. Every case runs against a real PostgreSQL
// server from withDisposablePostgres, because the defect is about what a live
// session still holds after an error: an open transaction, a session-level
// advisory lock, or a dead connection. A fake pool cannot express any of those.
//
// The failure mode that matters most is a hang, so every step that depends on
// another session is raced against a timeout. A hang fails the test; it does
// not stall the suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { PostgresStore } from '../src/store.mjs';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';

const HANG_MS = 5000;
const noop = () => {};

function settleWithin(promise, label, ms = HANG_MS) {
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
  pool.on('error', noop);
  return pool;
}

async function closePool(pool) {
  // A pool holding a client that never came back cannot drain. The caller stops
  // the server afterwards, which ends every backend, so a bounded wait is enough.
  await settleWithin(pool.end(), 'pool.end()', 2000).catch(noop);
}

async function withMigrations(files, body) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-migration-lock-'));
  try {
    await writeMigrations(dir, files);
    return await body(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeMigrations(dir, files) {
  for (const [version, sql] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, `${version}.sql`), sql);
  }
}

// A migration in the shape the repository uses: its own transaction and its own
// schema_migrations row. Each run is logged so a test can count applications.
function appliedMigration(version) {
  return `BEGIN;
CREATE TABLE IF NOT EXISTS hostile_apply_log (version text NOT NULL);
INSERT INTO hostile_apply_log (version) VALUES ('${version}');
INSERT INTO schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING;
COMMIT;
`;
}

// The defect: a migration that opens its own transaction, does work inside it,
// then fails. The failure leaves the session aborted while it still holds the lock.
const BROKEN_MIGRATION = `BEGIN;
CREATE TABLE IF NOT EXISTS hostile_partial (id integer);
SELECT * FROM hostile_missing_relation;
COMMIT;
`;

const TERMINATE_SELF = 'SELECT pg_terminate_backend(pg_backend_pid());\n';

test('a failing migration that opened its own BEGIN does not strand the schema lock', async () => {
  await withDisposablePostgres(async url => {
    await withMigrations({ '001_base': appliedMigration('001_base'), '002_broken': BROKEN_MIGRATION }, async dir => {
      const poolA = makePool(url);
      const poolB = makePool(url);
      try {
        const first = new PostgresStore({ pool: poolA, migrationsDir: dir });
        await assert.rejects(settleWithin(first.migrate(), 'first migrate()'), /hostile_missing_relation/);

        // A second session on a second pool must reach the same SQL error promptly.
        // A stranded lock would block it forever instead.
        const second = new PostgresStore({ pool: poolB, migrationsDir: dir });
        await assert.rejects(settleWithin(second.migrate(), 'second migrate() on a second pool'), /hostile_missing_relation/);

        // The failed migration's own CREATE TABLE must not survive either attempt.
        const { rows } = await settleWithin(poolB.query("SELECT to_regclass('public.hostile_partial') AS table_name"), 'rollback check');
        assert.equal(rows[0].table_name, null);
      } finally {
        await closePool(poolA);
        await closePool(poolB);
      }
    });
  });
});

test('a migration that terminates its own backend leaves no dead client for the pool to hand out', async () => {
  await withDisposablePostgres(async url => {
    await withMigrations({ '001_terminate': TERMINATE_SELF }, async dir => {
      const pool = makePool(url);
      try {
        const store = new PostgresStore({ pool, migrationsDir: dir });
        await assert.rejects(settleWithin(store.migrate(), 'migrate() over a terminated backend'), /terminat|connection/i);

        // Replace the migration with a healthy one. The same pool must now serve a
        // working session, not the connection the failed run just lost.
        await writeMigrations(dir, { '001_terminate': appliedMigration('001_terminate') });
        await settleWithin(store.migrate(), 'second migrate() on the same pool');

        const { rows } = await settleWithin(
          pool.query('SELECT count(*)::int AS n FROM hostile_apply_log WHERE version = $1', ['001_terminate']),
          'query after recovery'
        );
        assert.equal(rows[0].n, 1);
      } finally {
        await closePool(pool);
      }
    });
  });
});

test('a migration recovered after a failure applies exactly once and is never reapplied', async () => {
  await withDisposablePostgres(async url => {
    await withMigrations({ '001_base': appliedMigration('001_base'), '002_broken': BROKEN_MIGRATION }, async dir => {
      const pool = makePool(url);
      try {
        const store = new PostgresStore({ pool, migrationsDir: dir });
        await assert.rejects(settleWithin(store.migrate(), 'first migrate()'), /hostile_missing_relation/);

        await writeMigrations(dir, { '002_broken': appliedMigration('002_broken') });
        await settleWithin(store.migrate(), 'recovery migrate()');
        await settleWithin(store.migrate(), 'idempotent migrate()');

        const log = await settleWithin(
          pool.query('SELECT version, count(*)::int AS n FROM hostile_apply_log GROUP BY version ORDER BY version'),
          'apply log'
        );
        assert.deepEqual(log.rows, [{ version: '001_base', n: 1 }, { version: '002_broken', n: 1 }]);

        const recorded = await settleWithin(
          pool.query('SELECT version, count(*)::int AS n FROM schema_migrations GROUP BY version ORDER BY version'),
          'schema_migrations rows'
        );
        assert.deepEqual(recorded.rows, [{ version: '001_base', n: 1 }, { version: '002_broken', n: 1 }]);
      } finally {
        await closePool(pool);
      }
    });
  });
});

test('two stores migrating the same clean database concurrently each apply every version once', async () => {
  await withDisposablePostgres(async url => {
    const files = {
      '001_one': appliedMigration('001_one'),
      '002_two': appliedMigration('002_two'),
      '003_three': appliedMigration('003_three')
    };
    await withMigrations(files, async dir => {
      const poolA = makePool(url);
      const poolB = makePool(url);
      try {
        const storeA = new PostgresStore({ pool: poolA, migrationsDir: dir });
        const storeB = new PostgresStore({ pool: poolB, migrationsDir: dir });
        await settleWithin(Promise.all([storeA.migrate(), storeB.migrate()]), 'concurrent migrate()');

        const log = await settleWithin(
          poolA.query('SELECT version, count(*)::int AS n FROM hostile_apply_log GROUP BY version ORDER BY version'),
          'apply log'
        );
        assert.deepEqual(log.rows, [
          { version: '001_one', n: 1 },
          { version: '002_two', n: 1 },
          { version: '003_three', n: 1 }
        ]);
      } finally {
        await closePool(poolA);
        await closePool(poolB);
      }
    });
  });
});

test('transaction() rolls back a failing query and leaves the pool usable', async () => {
  await withDisposablePostgres(async url => {
    const pool = makePool(url);
    try {
      const store = new PostgresStore({ pool });
      await assert.rejects(
        settleWithin(store.transaction(async tx => { await tx.pool.query('SELECT * FROM hostile_missing_relation'); }), 'failing transaction()'),
        /hostile_missing_relation/
      );

      const plain = await settleWithin(pool.query('SELECT 1 AS n'), 'pool query after failed transaction');
      assert.equal(plain.rows[0].n, 1);

      const value = await settleWithin(
        store.transaction(async tx => (await tx.pool.query('SELECT 2 AS n')).rows[0].n),
        'transaction() after failed transaction'
      );
      assert.equal(value, 2);
    } finally {
      await closePool(pool);
    }
  });
});

test('transaction() destroys a client whose rollback fails and rethrows the original error', async () => {
  await withDisposablePostgres(async url => {
    const pool = makePool(url);
    try {
      const store = new PostgresStore({ pool });
      let original = null;
      await assert.rejects(
        settleWithin(store.transaction(async tx => {
          try {
            await tx.pool.query('SELECT pg_terminate_backend(pg_backend_pid())');
          } catch (error) {
            original = error;
            throw error;
          }
        }), 'transaction() over a terminated backend'),
        error => error === original
      );
      assert.ok(original, 'the callback observed its own failure');

      // The dead session must not be parked in the idle list for the next caller.
      assert.equal(pool.idleCount, 0);
      const { rows } = await settleWithin(pool.query('SELECT 3 AS n'), 'query on a fresh connection');
      assert.equal(rows[0].n, 3);
    } finally {
      await closePool(pool);
    }
  });
});
