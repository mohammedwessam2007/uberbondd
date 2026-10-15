import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDirectMigrationConnection } from '../src/postgres-migration-connection.mjs';
import { PostgresStore } from '../src/store.mjs';

const DIRECT = 'postgresql://app:secret@dpg-example-a.oregon-postgres.render.com:5432/uberbond?sslmode=require';

test('a direct connection string passes the migration guard', () => {
  assert.equal(assertDirectMigrationConnection(DIRECT).ok, true);
});

test('transaction-pooler indicators are refused for migrations', () => {
  const pooled = [
    'postgresql://app:secret@db.example.com:6543/uberbond',
    'postgresql://app:secret@aws-0-eu-west-1.pooler.supabase.com:5432/uberbond',
    'postgresql://app:secret@db.example.com:5432/uberbond?pgbouncer=true',
    'postgresql://app:secret@db.example.com:5432/uberbond?pool_mode=transaction',
  ];
  for (const url of pooled) {
    assert.throws(() => assertDirectMigrationConnection(url), { code: 'MIGRATION_REQUIRES_DIRECT_CONNECTION' }, url);
  }
});

test('an unparseable connection string cannot be proven direct and is refused', () => {
  assert.throws(() => assertDirectMigrationConnection('not a url'), { code: 'MIGRATION_REQUIRES_DIRECT_CONNECTION' });
});

test('the store refuses to migrate through a pooler before it opens any connection', async () => {
  const store = new PostgresStore({ databaseUrl: 'postgresql://app:secret@db.example.com:6543/uberbond', ssl: false });
  try {
    await assert.rejects(store.migrate(), { code: 'MIGRATION_REQUIRES_DIRECT_CONNECTION' });
  } finally {
    await store.close();
  }
});

test('error text never echoes the password', () => {
  try { assertDirectMigrationConnection('postgresql://app:hunter2@db.example.com:6543/uberbond'); }
  catch (error) { assert.doesNotMatch(String(error.message), /hunter2/); }
});
