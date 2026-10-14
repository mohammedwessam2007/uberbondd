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

// The defect this file pins down: a migration opens its own transaction, does
// work, records its own version, and never closes the block. PostgreSQL reports
// no error for this file, so only a probe of the session can notice it.
const UNCLOSED_MIGRATION = `BEGIN;
CREATE TABLE IF NOT EXISTS hostile_unclosed (id integer);
INSERT INTO hostile_unclosed (id) VALUES (7);
INSERT INTO schema_migrations (version) VALUES ('002_unclosed') ON CONFLICT DO NOTHING;
`;

// Plain statements with no BEGIN at all. PostgreSQL runs them as one implicit
// transaction and returns the session to autocommit, so they must apply cleanly.
const PLAIN_MIGRATION = `CREATE TABLE IF NOT EXISTS hostile_apply_log (version text NOT NULL);
INSERT INTO hostile_apply_log (version) VALUES ('001_plain');
INSERT INTO schema_migrations (version) VALUES ('001_plain') ON CONFLICT DO NOTHING;
`;

// Counts backends that a pooled session could leave behind in an open block.
async function idleInTransactionCount(pool) {
  const { rows } = await settleWithin(
    pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'`),
    'pg_stat_activity probe'
  );
  return rows[0].n;
}

// A destroyed client is torn down asynchronously, so the backend may take a moment
// to disappear. A session that is kept idle in a transaction never does.
async function assertNoIdleInTransaction(pool, label, ms = 2000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const n = await idleInTransactionCount(pool);
    if (n === 0) return;
    if (Date.now() >= deadline) assert.fail(`${label}: ${n} session(s) left idle in a transaction`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

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

test('a migration that opens a transaction and never closes it is refused, rolled back and not recorded', async () => {
  await withDisposablePostgres(async url => {
    await withMigrations({ '001_base': appliedMigration('001_base'), '002_unclosed': UNCLOSED_MIGRATION }, async dir => {
      const poolA = makePool(url);
      const poolB = makePool(url);
      try {
        // PostgreSQL accepts this file without error. The runner must still refuse it,
        // naming the file, rather than move on to the next migration.
        const first = new PostgresStore({ pool: poolA, migrationsDir: dir });
        await assert.rejects(
          settleWithin(first.migrate(), 'migrate() over an unclosed transaction'),
          error => error.code === 'MIGRATION_LEFT_TRANSACTION_OPEN' && /002_unclosed\.sql/.test(error.message)
        );

        // Its write is rolled back and its version is not recorded.
        const { rows } = await settleWithin(
          poolB.query(`SELECT to_regclass('public.hostile_unclosed') AS table_name,
            (SELECT count(*)::int FROM schema_migrations WHERE version = '002_unclosed') AS recorded`),
          'rollback check'
        );
        assert.equal(rows[0].table_name, null);
        assert.equal(rows[0].recorded, 0);

        // The session that ran the file is not left idle in its open transaction.
        await assertNoIdleInTransaction(poolB, 'after the refused migration');

        // A fresh store on the same pool, which held the refused session, progresses
        // within the hang budget and reaches the same refusal. It does not inherit a
        // poisoned session or block on a lock the refused run still holds.
        const second = new PostgresStore({ pool: poolA, migrationsDir: dir });
        await assert.rejects(
          settleWithin(second.migrate(), 'second migrate() on a fresh store'),
          error => error.code === 'MIGRATION_LEFT_TRANSACTION_OPEN'
        );
        await assertNoIdleInTransaction(poolB, 'after the second refused migration');
      } finally {
        await closePool(poolA);
        await closePool(poolB);
      }
    });
  });
});

test('a correct BEGIN...COMMIT migration still applies exactly once after an unclosed one is refused', async () => {
  await withDisposablePostgres(async url => {
    await withMigrations({ '001_base': appliedMigration('001_base'), '002_unclosed': UNCLOSED_MIGRATION }, async dir => {
      const pool = makePool(url);
      try {
        const store = new PostgresStore({ pool, migrationsDir: dir });
        await assert.rejects(
          settleWithin(store.migrate(), 'refused migrate()'),
          error => error.code === 'MIGRATION_LEFT_TRANSACTION_OPEN'
        );

        await writeMigrations(dir, { '002_unclosed': appliedMigration('002_unclosed') });
        await settleWithin(store.migrate(), 'recovery migrate()');
        await settleWithin(store.migrate(), 'idempotent migrate()');

        const log = await settleWithin(
          pool.query('SELECT version, count(*)::int AS n FROM hostile_apply_log GROUP BY version ORDER BY version'),
          'apply log'
        );
        assert.deepEqual(log.rows, [{ version: '001_base', n: 1 }, { version: '002_unclosed', n: 1 }]);

        const recorded = await settleWithin(
          pool.query('SELECT version, count(*)::int AS n FROM schema_migrations GROUP BY version ORDER BY version'),
          'schema_migrations rows'
        );
        assert.deepEqual(recorded.rows, [{ version: '001_base', n: 1 }, { version: '002_unclosed', n: 1 }]);
        await assertNoIdleInTransaction(pool, 'after recovery');
      } finally {
        await closePool(pool);
      }
    });
  });
});

test('a plain migration with no BEGIN is not mistaken for an open transaction', async () => {
  await withDisposablePostgres(async url => {
    await withMigrations({ '001_plain': PLAIN_MIGRATION }, async dir => {
      const pool = makePool(url);
      try {
        const store = new PostgresStore({ pool, migrationsDir: dir });
        await settleWithin(store.migrate(), 'migrate() over a plain migration');
        await settleWithin(store.migrate(), 'idempotent migrate()');

        const log = await settleWithin(
          pool.query('SELECT count(*)::int AS n FROM hostile_apply_log WHERE version = $1', ['001_plain']),
          'apply log'
        );
        assert.equal(log.rows[0].n, 1);
        await assertNoIdleInTransaction(pool, 'after a plain migration');
      } finally {
        await closePool(pool);
      }
    });
  });
});
