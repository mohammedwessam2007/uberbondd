import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PostgresStore } from '../src/store.mjs';

const store = await readFile(new URL('../src/store.mjs', import.meta.url), 'utf8');
const migrator = await readFile(new URL('../scripts/migrate.mjs', import.meta.url), 'utf8');

test('production PostgresStore defaults to nonmutating probe', () => {
  assert.match(store, /initMode\s*=\s*\(nodeEnv\s*===\s*'production'\s*\|\|\s*process\.env\.NODE_ENV\s*===\s*'production'\)\s*\?\s*'probe'\s*:\s*'migrate'/);
  assert.match(store, /initializePostgresPool\(this\.pool, this\.initMode, \(\) => this\.migrate\(\)\)/);
});
test('createStore forces probe for production config', () => {
  assert.match(store, /initMode:\s*config\.nodeEnv\s*===\s*'production'\s*\?\s*'probe'\s*:\s*undefined/);
});
test('operator migration command retains explicit authority', () => {
  assert.match(migrator, /initMode:\s*'migrate'/);
});
test('ambient production cannot be downgraded to automatic migrations by test config', async () => {
  const prior = process.env.NODE_ENV;
  const statements = [];
  try {
    process.env.NODE_ENV = 'production';
    const fakePool = { query: async (sql) => { statements.push(sql); return { rows: [] }; } };
    const db = new PostgresStore({ pool: fakePool, nodeEnv: 'test' });
    db.migrate = async () => { throw new Error('UNAUTHORIZED_MIGRATION'); };
    await db.init();
    assert.equal(db.initMode, 'probe');
    assert.deepEqual(statements, ['SELECT 1 AS uberbond_startup_probe']);
  } finally {
    if (prior === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prior;
  }
});
