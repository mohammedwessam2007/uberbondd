import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileOperationalSnapshot, persistOperationalSnapshot } from '../src/uberwarm2-operational-journal.mjs';

const receipt = () => ({
  source: 'a'.repeat(40), observedAt: '2026-10-17T14:40:51.329Z',
  sends: 0, runtimeReady: false, sendAuthority: 'NONE', status: 'BLOCKED_FOR_SENDING',
  database: {recovery: false, ledger_present: true},
  ledger: {claims: 0, reserved: 0, uncertain: 0},
  provider: {accountRead: true, mailboxes: 53, domains: 11, providerReceiptDigestsPresent: true}
});
function fake() {
  const rows = new Map(), queries = [];
  return {rows, queries, pool: {async query(sql, args) {
    queries.push({sql, args});
    assert.ok(!/seed_probe_claims|UPDATE|DELETE|CREATE|ALTER/.test(sql));
    if (sql.startsWith('INSERT')) {
      const duplicate = rows.has(args[2]);
      if (!duplicate) rows.set(args[2], JSON.parse(args[3]));
      return {rows: duplicate ? [] : [{receipt_digest: args[2]}]};
    }
    return {rows: rows.has(args[0]) ? [{receipt_json: rows.get(args[0])}] : []};
  }}};
}
test('journal allowlists operational counts and cannot mint activation/placement proof', () => {
  const raw = {...receipt(), token: 'secret', email: 'private@example.com', body: 'private',
    provider: {...receipt().provider, accessToken: 'secret', messages: ['private']}};
  const compiled = compileOperationalSnapshot(raw);
  assert.ok(!/secret|private/.test(JSON.stringify(compiled)));
  assert.equal(compiled.activation, 'INDEPENDENT_SENDER_CONSENT_AND_PLACEMENT_GATES_REQUIRED');
  assert.equal(compiled.database.primary, true);
  assert.equal(compiled.provider.mailboxes, 53);
});
test('journal rejects sending/ready authority and invalid identity before database access', async () => {
  for (const change of [{source: 'main'}, {sends: 1}, {runtimeReady: true},
    {sendAuthority: 'APPROVED'}, {observedAt: 'yesterday'}]) {
    const db = fake();
    await assert.rejects(persistOperationalSnapshot({pool: db.pool, receipt: {...receipt(), ...change}}));
    assert.equal(db.queries.length, 0);
  }
});
test('journal persists and reads back exact content; replay is idempotent', async () => {
  const db = fake(), input = {pool: db.pool, receipt: receipt()};
  const first = await persistOperationalSnapshot(input);
  assert.deepEqual({...first, digest: 'omitted'}, {digest: 'omitted', stored: true, duplicate: false});
  const again = await persistOperationalSnapshot(input);
  assert.equal(again.digest, first.digest);
  assert.equal(again.duplicate, true);
  assert.equal(db.rows.size, 1);
  input.receipt.observedAt = '2026-10-17T14:45:51.329Z';
  assert.notEqual((await persistOperationalSnapshot(input)).digest, first.digest);
  assert.equal(db.rows.size, 2);
});
test('journal refuses missing, changed, or unavailable readback', async () => {
  for (const row of [[], [{receipt_json: {sends: 0}}]]) {
    await assert.rejects(persistOperationalSnapshot({
      pool: {async query(sql) {return {rows: sql.startsWith('INSERT') ? [{}] : row};}}, receipt: receipt()
    }), /readback/);
  }
  await assert.rejects(persistOperationalSnapshot({
    pool: {async query() {throw Error('db unavailable');}}, receipt: receipt()
  }));
});
test('journal preserves unknown observations, never substitutes healthy counts', () => {
  const result = compileOperationalSnapshot({...receipt(), database: {}, provider: {}, ledger: {claims: -1}});
  assert.equal(result.database.primary, false);
  assert.equal(result.provider.authenticatedAccountRead, false);
  assert.equal(result.provider.mailboxes, null);
  assert.equal(result.ledger.claims, null);
});
test('migration and actual PostgreSQL enforce journal constraints and duplicate safety', {
  skip: !process.env.OMNIA_V9_TEST_DATABASE_URL
}, async () => {
  const {default: pg} = await import('pg');
  const client = new pg.Client({connectionString: process.env.OMNIA_V9_TEST_DATABASE_URL});
  await client.connect();
  try {
    await client.query('BEGIN');
    const migration = await readFile(new URL('../docs/migrations-pending/20261017_uberwarm2_operational_receipts.sql', import.meta.url), 'utf8');
    await client.query(migration);
    await client.query(migration);
    const input = {pool: client, receipt: receipt()};
    assert.equal((await persistOperationalSnapshot(input)).stored, true);
    assert.equal((await persistOperationalSnapshot(input)).duplicate, true);
    await client.query('SAVEPOINT bad_receipt');
    await assert.rejects(client.query(`INSERT INTO public.uberwarm2_operational_receipts
      (source_sha,observed_at,receipt_digest,receipt_json) VALUES ($1,now(),$2,'{}'::jsonb)`,
    ['a'.repeat(40), 'sha256:' + 'b'.repeat(64)]), /check constraint/);
    await client.query('ROLLBACK TO SAVEPOINT bad_receipt');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
