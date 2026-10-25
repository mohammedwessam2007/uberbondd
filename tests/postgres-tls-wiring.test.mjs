import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/store.mjs', import.meta.url), 'utf8');
test('PostgresStore passes explicit deployment environment to TLS policy', () => {
  assert.match(source, /nodeEnv = process\.env\.NODE_ENV/);
  assert.match(source, /postgresTlsOptions\(\{ databaseUrl, ssl, nodeEnv \}\)/);
});
test('createStore passes config.nodeEnv to PostgresStore', () => assert.match(source, /nodeEnv: config\.nodeEnv/));
test('store does not bypass TLS certificate verification', () => assert.doesNotMatch(source, /rejectUnauthorized:\s*false/));
test('production defaults to probe whenever either environment is production', () => {
  assert.match(source, /initMode = \(nodeEnv === 'production' \|\| process\.env\.NODE_ENV === 'production'\) \? 'probe' : 'migrate'/);
});

test('ambient production cannot be downgraded by an explicit test environment', async () => {
  const { PostgresStore } = await import('../src/store.mjs');
  const previous = process.env.NODE_ENV;
  const queries = [];
  try {
    process.env.NODE_ENV = 'production';
    const store = new PostgresStore({
      nodeEnv: 'test',
      pool: {
        query: async sql => { queries.push(sql); return { rows: [{ uberbond_startup_probe: 1 }] }; },
        connect: () => { throw new Error('MIGRATION_CONNECTION_FORBIDDEN'); }
      }
    });
    assert.equal(store.initMode, 'probe');
    await store.init();
    assert.deepEqual(queries, ['SELECT 1 AS uberbond_startup_probe']);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('explicit production environment uses read-only probe', async () => {
  const { PostgresStore } = await import('../src/store.mjs');
  const queries = [];
  const store = new PostgresStore({
    nodeEnv: 'production',
    pool: {
      query: async sql => { queries.push(sql); return { rows: [{ uberbond_startup_probe: 1 }] }; },
      connect: () => { throw new Error('MIGRATION_CONNECTION_FORBIDDEN'); }
    }
  });
  assert.equal(store.initMode, 'probe');
  await store.init();
  assert.deepEqual(queries, ['SELECT 1 AS uberbond_startup_probe']);
});
