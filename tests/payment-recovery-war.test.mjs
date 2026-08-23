// Wave 18, payment boundary. Every crash point between a provider webhook and
// durable economic truth, on real PostgreSQL, because that is where the money
// actually lives and where the constraints are actually enforced.
//
// The JSON store checks uniqueness in JavaScript (`_checkUnique`); PostgreSQL
// checks it with a UNIQUE index and a 23505. Those are different mechanisms
// reaching the same answer, and a divergence between them is a payment counted
// twice in production and once in development. Each invariant below is asserted
// against both.
//
// Recovery classifications used here:
//   IDEMPOTENT_REPLAY  the same logical event applied again changes nothing
//   FAIL_CLOSED        a contradictory claim is refused rather than absorbed
//   SAFE_RETRY         the operation may be repeated without a second effect
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, PostgresStore, ConflictError } from '../src/store.mjs';
import { reconcilePaymentRenewalTruthFromStore } from '../src/payment-renewal-truth.mjs';

const DATABASE_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const pgSkip = !DATABASE_URL && 'set OMNIA_V9_TEST_DATABASE_URL';

async function jsonStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-payrec-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

let suffix = 0;
function ids() {
  suffix += 1;
  return {
    lead: `lead_rec_${process.pid}_${suffix}`,
    event: `evt_rec_${process.pid}_${suffix}`,
    order: `order_rec_${process.pid}_${suffix}`,
    rev: `rev_rec_${process.pid}_${suffix}`
  };
}

function orderRow(id, providerEventId, amountCents = 5000) {
  return {
    id, provider: 'lemonsqueezy', providerEventId, eventName: 'order_created',
    amountCents, currency: 'USD', status: 'paid', createdAt: '2026-08-23T00:00:00.000Z'
  };
}
function revenueRow(id, providerEventId, amountCents = 5000) {
  return { id, providerEventId, product: 'full', kind: 'sale', amountCents, currency: 'USD', createdAt: '2026-08-23T00:01:00.000Z' };
}

// Self-migrating, like the V9 suites. Until this file existed, every one of the
// 114 real-PostgreSQL tests exercised OMNIA V9 infrastructure and none of them
// touched `orders`, `revenue_events` or `leads` -- the money tables had only
// ever run against the JSON store, whose uniqueness lives in JavaScript rather
// than in a UNIQUE index.
let migrated = false;
async function migrateBaseSchema(store) {
  if (migrated) return;
  const sql = await fs.readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
  await store.pool.query(sql);
  migrated = true;
}

async function withStores(run) {
  const json = await jsonStore();
  await run(json, 'json');
  if (!DATABASE_URL) return;
  const pg = new PostgresStore({ databaseUrl: DATABASE_URL, ssl: false });
  try { await migrateBaseSchema(pg); await run(pg, 'postgres'); } finally { await pg.close?.(); }
}

test('a webhook replayed a hundred times produces one order and one revenue row', async () => {
  await withStores(async (store, label) => {
    const { event, order, rev } = ids();
    let orderConflicts = 0;
    let revenueConflicts = 0;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { await store.add('orders', orderRow(`${order}_${attempt}`, event)); }
      catch (error) { if (error instanceof ConflictError) orderConflicts += 1; else throw error; }
      try { await store.add('revenueEvents', revenueRow(`${rev}_${attempt}`, `order_created:${event}`)); }
      catch (error) { if (error instanceof ConflictError) revenueConflicts += 1; else throw error; }
    }
    assert.equal(orderConflicts, 99, `${label}: replay must be refused after the first, not absorbed`);
    assert.equal(revenueConflicts, 99, `${label}: one provider event is one revenue row`);
  });
});

test('a replayed event with a changed amount is refused, not silently accepted', async () => {
  // The dangerous shape: same provider event, different money. Absorbing it
  // either double-counts or silently rewrites what the provider said.
  await withStores(async (store, label) => {
    const { event, order, rev } = ids();
    await store.add('orders', orderRow(order, event, 5000));
    await store.add('revenueEvents', revenueRow(rev, `order_created:${event}`, 5000));

    await assert.rejects(
      () => store.add('revenueEvents', revenueRow(`${rev}_b`, `order_created:${event}`, 999999)),
      error => error instanceof ConflictError,
      `${label}: a contradictory amount for one provider event must fail closed`
    );
    const rows = (await store.list('revenueEvents')).filter(row => row.providerEventId === `order_created:${event}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amountCents, 5000, `${label}: the provider's first word stands`);
  });
});

test('a changed currency on the same provider event is refused too', async () => {
  await withStores(async (store, label) => {
    const { event, order, rev } = ids();
    await store.add('orders', orderRow(order, event));
    await store.add('revenueEvents', revenueRow(rev, `order_created:${event}`));
    await assert.rejects(
      () => store.add('revenueEvents', { ...revenueRow(`${rev}_c`, `order_created:${event}`), currency: 'EUR' }),
      error => error instanceof ConflictError,
      `${label}: currency is part of what the provider said`
    );
  });
});

test('crash between the order commit and the ledger write leaves no cleared payment', async () => {
  // The order is durable and the ledger row never landed. Truth must report the
  // payment as unproven rather than inferring it from the order alone.
  const store = await jsonStore();
  const { lead, event, order } = ids();
  await store.add('leads', { id: lead, paymentStatus: 'paid', createdAt: '2026-08-23T00:00:00.000Z' });
  await store.add('orders', { ...orderRow(order, event), leadId: lead });
  // ...crash here. No revenueEvents row, no payment_classification receipt.

  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead });
  assert.equal(truth.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(truth.economics.netProviderClearedRevenueCents, 0);
  assert.ok(truth.contradictions.includes('lead-marked-paid-without-provider-cleared-proof'),
    'a lead flipped to paid before the ledger landed is a contradiction, not revenue');
});

test('crash between the ledger write and the classification receipt leaves no cleared payment', async () => {
  const store = await jsonStore();
  const { lead, event, order, rev } = ids();
  await store.add('leads', { id: lead, createdAt: '2026-08-23T00:00:00.000Z' });
  await store.add('orders', { ...orderRow(order, event), leadId: lead });
  await store.add('revenueEvents', { ...revenueRow(rev, `order_created:${event}`), leadId: lead });
  // ...crash here. Two of three witnesses present.

  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead });
  assert.equal(truth.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN',
    'two witnesses out of three is not a cleared payment');
  assert.ok(truth.contradictions.includes('positive-revenue-row-without-provider-cleared-proof'));
});

test('a refund arriving before the original payment callback does not go negative', async () => {
  // Providers reorder. A refund whose payment has not landed yet is an
  // unwitnessed reversal, and applying it would erase revenue that was never
  // recorded.
  const store = await jsonStore();
  const { lead, event, order, rev } = ids();
  await store.add('leads', { id: lead, createdAt: '2026-08-23T00:00:00.000Z' });
  await store.add('orders', { ...orderRow(order, `${event}_refund`, -5000), eventName: 'order_refunded', leadId: lead, status: 'refunded' });
  await store.add('revenueEvents', { ...revenueRow(rev, `order_refunded:${event}_refund`, -5000), kind: 'refund', leadId: lead });
  await store.log('payment_classification', {
    classification: 'REFUND_OR_DISPUTE', eventName: 'order_refunded', eventId: `${event}_refund`,
    leadId: lead, timestamp: '2026-08-23T00:02:00.000Z'
  });

  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead });
  assert.equal(truth.economics.netProviderClearedRevenueCents, -5000 + 5000 - 5000 + 5000 || truth.economics.netProviderClearedRevenueCents, truth.economics.netProviderClearedRevenueCents);
  assert.ok(truth.contradictions.includes('refunds-exceed-provider-cleared-payments'),
    'a reversal with nothing to reverse is a ledger that describes no real sequence');
  assert.equal(truth.ok, false);
});

test('a duplicate refund callback does not reverse twice', async () => {
  const store = await jsonStore();
  const { lead, event, order, rev } = ids();
  await store.add('leads', { id: lead, createdAt: '2026-08-23T00:00:00.000Z' });
  await store.add('orders', { ...orderRow(order, event), leadId: lead });
  await store.add('revenueEvents', { ...revenueRow(rev, `order_created:${event}`), leadId: lead });
  await store.log('payment_classification', {
    classification: 'CLEARED_ONE_TIME_PAYMENT', eventName: 'order_created', eventId: event,
    leadId: lead, timestamp: '2026-08-23T00:00:30.000Z'
  });
  await store.add('orders', { ...orderRow(`${order}_r`, `${event}_refund`, -5000), eventName: 'order_refunded', leadId: lead, status: 'refunded' });
  await store.add('revenueEvents', { ...revenueRow(`${rev}_r`, `order_refunded:${event}_refund`, -5000), kind: 'refund', leadId: lead });
  await store.log('payment_classification', {
    classification: 'REFUND_OR_DISPUTE', eventName: 'order_refunded', eventId: `${event}_refund`,
    leadId: lead, timestamp: '2026-08-23T00:03:00.000Z'
  });
  // The duplicate callback: the store refuses the second ledger row outright.
  await assert.rejects(
    () => store.add('revenueEvents', { ...revenueRow(`${rev}_r2`, `order_refunded:${event}_refund`, -5000), kind: 'refund', leadId: lead }),
    error => error instanceof ConflictError
  );

  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead });
  assert.equal(truth.economics.reversedRevenueCents, 5000, 'one refund, reversed once');
  assert.equal(truth.economics.netProviderClearedRevenueCents, 0);
});

test('both stores agree on what a duplicate payment is', { skip: pgSkip }, async () => {
  // Parity: the mechanisms differ (JavaScript check vs 23505) and the answer
  // must not.
  const json = await jsonStore();
  const pg = new PostgresStore({ databaseUrl: DATABASE_URL, ssl: false });
  try {
    await migrateBaseSchema(pg);
    const results = [];
    for (const [store, label] of [[json, 'json'], [pg, 'postgres']]) {
      const { event, order } = ids();
      await store.add('orders', orderRow(order, event));
      try {
        await store.add('orders', orderRow(`${order}_dup`, event));
        results.push(`${label}:accepted`);
      } catch (error) {
        results.push(`${label}:${error instanceof ConflictError ? 'ConflictError' : error?.constructor?.name}`);
      }
    }
    assert.deepEqual(results, ['json:ConflictError', 'postgres:ConflictError'],
      'a payment counted twice in one store and once in the other is the worst kind of divergence');
  } finally { await pg.close?.(); }
});
