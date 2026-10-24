import test from 'node:test';
import assert from 'node:assert/strict';
import { initializePostgresPool as initialize } from '../src/postgres-startup-gate.mjs';

test('probe issues one read-only query and never migrates', async () => {
  const queries = []; let migrations = 0;
  const result = await initialize({ query: async sql => { queries.push(sql); return { rows: [{ uberbond_startup_probe: 1 }] }; } }, 'probe', async () => { migrations++; });
  assert.equal(result, 'PROBED_NO_MIGRATION');
  assert.deepEqual(queries, ['SELECT 1 AS uberbond_startup_probe']);
  assert.equal(migrations, 0);
});
test('probe does not acquire migration connection', async () => {
  await initialize({ query: async sql => { assert.equal(sql, 'SELECT 1 AS uberbond_startup_probe'); }, connect: () => { throw new Error('unexpected connect'); } }, 'probe', () => { throw new Error('unexpected migrate'); });
});
test('probe failure fails closed without migration', async () => {
  let migrations = 0;
  await assert.rejects(initialize({ query: async () => { throw new Error('DB_UNAVAILABLE'); } }, 'probe', () => { migrations++; }), /DB_UNAVAILABLE/);
  assert.equal(migrations, 0);
});
test('unknown modes fail closed without DB calls', async () => {
  for (const mode of ['', 'read-only', 'auto', 'MIGRATE', undefined, null]) {
    await assert.rejects(initialize({ query: () => { throw new Error('QUERY_CALLED'); } }, mode, () => { throw new Error('MIGRATION_CALLED'); }), /POSTGRES_STARTUP_MODE_INVALID/);
  }
});
test('explicit migrate mode invokes callback once', async () => {
  let migrations = 0;
  assert.equal(await initialize({ query: () => { throw new Error('unexpected query'); } }, 'migrate', async () => { migrations++; }), 'MIGRATED_EXPLICITLY');
  assert.equal(migrations, 1);
});
test('probe refuses missing pool', async () => {
  await assert.rejects(initialize(null, 'probe', () => {}), /POSTGRES_PROBE_POOL_REQUIRED/);
  await assert.rejects(initialize({}, 'probe', () => {}), /POSTGRES_PROBE_POOL_REQUIRED/);
});
test('migrate refuses missing callback', async () => {
  await assert.rejects(initialize({}, 'migrate', null), /POSTGRES_MIGRATION_RUNNER_REQUIRED/);
});
test('migration failure is not hidden or retried', async () => {
  let n = 0;
  await assert.rejects(initialize({}, 'migrate', async () => { n++; throw new Error('LOCK_FAILED'); }), /LOCK_FAILED/);
  assert.equal(n, 1);
});
