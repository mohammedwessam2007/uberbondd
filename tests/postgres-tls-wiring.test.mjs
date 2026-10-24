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
test('production defaults to probe rather than migrations', () => assert.match(source, /initMode = nodeEnv === 'production' \? 'probe' : 'migrate'/));
