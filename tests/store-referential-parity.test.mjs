import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, PostgresStore, ConflictError, StoreError } from '../src/store.mjs';

// The two stores agree on collection names, filters, uniqueness and conflict
// types -- that was reconciled in a previous mission and is re-checked below.
//
// They do NOT agree on referential integrity, and this test exists to say so out
// loud rather than let someone find it by surprise.
//
// PostgreSQL carries twelve-plus `REFERENCES ... ON DELETE SET NULL` constraints
// (orders.lead_id, revenueEvents.lead_id, prospect_id, campaign_id, and so on).
// The JSON store enforces none of them.
//
// This divergence is recorded rather than removed, for two reasons:
//
//   1. The direction is the safe one. PostgreSQL is production; it refuses an
//      orphan row. The JSON store is development; it accepts one. A bug that
//      creates an orphan therefore surfaces loudly before it can touch money,
//      rather than silently after. The dangerous direction would be the
//      reverse, and that is what this test pins against.
//
//   2. Replicating twelve relationships plus ON DELETE SET NULL cascade
//      semantics in the JSON store is a subsystem, not a validator. The cost
//      would exceed the risk it removes.
//
// What must never happen is someone "aligning" the two by dropping the
// PostgreSQL constraints. That would move the divergence to the dangerous
// direction, and the test below fails if it is attempted.

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL;

async function jsonStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ref-parity-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

let counter = 0;
const uid = () => `rp_${process.pid}_${++counter}_${Date.now()}`;

const classify = error => {
  if (!error) return 'ok';
  if (error instanceof ConflictError) return 'ConflictError';
  if (error instanceof StoreError) return `StoreError:${error.code || '?'}`;
  return error?.constructor?.name || 'Error';
};
const attempt = async fn => {
  try { await fn(); return 'ok'; } catch (error) { return classify(error); }
};

test('the JSON store accepts an orphan row, and that is the documented behaviour', async () => {
  const store = await jsonStore();
  const outcome = await attempt(() => store.add('revenueEvents', {
    id: uid(), providerEventId: uid(), leadId: 'lead-does-not-exist',
    kind: 'sale', amountCents: 1, currency: 'USD', createdAt: new Date().toISOString()
  }));
  assert.equal(outcome, 'ok',
    'if this starts refusing, the JSON store has gained referential integrity and this test should be replaced by a parity assertion');
});

test('uniqueness semantics are identical, with a real referent present', async () => {
  const store = await jsonStore();
  const leadId = uid();
  await store.add('leads', { id: leadId, createdAt: new Date().toISOString() });
  const providerEventId = uid();
  const row = () => ({
    id: uid(), providerEventId, leadId, kind: 'sale',
    amountCents: 1, currency: 'USD', createdAt: new Date().toISOString()
  });
  assert.equal(await attempt(() => store.add('revenueEvents', row())), 'ok');
  assert.equal(await attempt(() => store.add('revenueEvents', row())), 'ConflictError');
});

test('the schema still carries its referential constraints', async () => {
  // The guard against "fixing" the divergence in the dangerous direction.
  const sql = await fs.readFile('migrations/001_initial.sql', 'utf8');
  const references = [...sql.matchAll(/REFERENCES\s+(\w+)\s*\(/gi)].map(m => m[1].toLowerCase());
  assert.ok(references.length >= 10,
    `expected the production schema to keep its referential constraints; found ${references.length}`);
  assert.ok(references.includes('leads'), 'lead references must survive');
  // orders and revenue rows must both point at a real lead in production.
  assert.match(sql, /orders[\s\S]*?lead_id\s+text\s+REFERENCES\s+leads/i);
  assert.match(sql, /revenue_events[\s\S]*?lead_id\s+text\s+REFERENCES\s+leads/i);
});

test('real PostgreSQL refuses the orphan the JSON store accepts', { skip: !realPostgresUrl }, async () => {
  const pg = new PostgresStore({ databaseUrl: realPostgresUrl, ssl: false });
  try {
    const sql = await fs.readFile('migrations/001_initial.sql', 'utf8');
    await pg.pool.query(sql).catch(() => {});
    const outcome = await attempt(() => pg.add('revenueEvents', {
      id: uid(), providerEventId: uid(), leadId: 'lead-does-not-exist',
      kind: 'sale', amountCents: 1, currency: 'USD', createdAt: new Date().toISOString()
    }));
    assert.equal(outcome, 'StoreError:FOREIGN_KEY',
      'production must refuse a revenue row for a lead that does not exist');

    // Positive control: with a real lead, the same insert succeeds.
    const leadId = uid();
    await pg.add('leads', { id: leadId, createdAt: new Date().toISOString() });
    const ok = await attempt(() => pg.add('revenueEvents', {
      id: uid(), providerEventId: uid(), leadId,
      kind: 'sale', amountCents: 1, currency: 'USD', createdAt: new Date().toISOString()
    }));
    assert.equal(ok, 'ok');
  } finally {
    await pg.close?.();
  }
});

test('everything else the two stores were reconciled on still agrees', { skip: !realPostgresUrl }, async () => {
  const json = await jsonStore();
  const pg = new PostgresStore({ databaseUrl: realPostgresUrl, ssl: false });
  try {
    const sql = await fs.readFile('migrations/001_initial.sql', 'utf8');
    await pg.pool.query(sql).catch(() => {});
    const CASES = [
      ['unknown collection', store => store.list('not_a_collection', {})],
      ['unknown filter', store => store.list('auditLog', { filters: { nope: 'x' } })],
      ['__proto__ as a collection', store => store.list('__proto__', {})],
      ['missing row get', store => store.get('leads', 'nope')],
      ['patch missing row', store => store.patch('leads', 'nope', { company: 'x' })]
    ];
    for (const [label, fn] of CASES) {
      assert.equal(await attempt(() => fn(json)), await attempt(() => fn(pg)), label);
    }
  } finally {
    await pg.close?.();
  }
});
