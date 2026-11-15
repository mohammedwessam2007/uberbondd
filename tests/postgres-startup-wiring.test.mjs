import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const store = await readFile(new URL('../src/store.mjs', import.meta.url), 'utf8');
const migrator = await readFile(new URL('../scripts/migrate.mjs', import.meta.url), 'utf8');

test('production PostgresStore defaults to nonmutating probe', () => {
  assert.match(store, /initMode\s*=\s*process\.env\.NODE_ENV\s*===\s*'production'\s*\?\s*'probe'\s*:\s*'migrate'/);
  assert.match(store, /initializePostgresPool\(this\.pool, this\.initMode, \(\) => this\.migrate\(\)\)/);
});
test('createStore forces probe for production config', () => {
  assert.match(store, /initMode:\s*config\.nodeEnv\s*===\s*'production'\s*\?\s*'probe'\s*:\s*undefined/);
});
test('operator migration command retains explicit authority', () => {
  assert.match(migrator, /initMode:\s*'migrate'/);
});
