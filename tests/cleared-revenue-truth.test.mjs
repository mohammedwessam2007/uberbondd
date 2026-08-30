import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { reconcilePaymentRenewalTruthFromStore } from '../src/payment-renewal-truth.mjs';
import { validateStartupConfig } from '../src/config.mjs';

// Two surfaces disagreed about the one number this company optimizes.
//
// `POST /api/test/unlock` marks a lead paid and writes a revenue event with no
// order and no provider behind it. `reconcilePaymentRenewalTruthFromStore` --
// the canonical triple-witness truth -- correctly answered REVIEW_REQUIRED and
// $0 for that lead. But `RevenueEngine.summary()`, which is what the operator's
// dashboard shows, summed every positive revenue event and called the total
// `clearedRevenue`. A test unlock therefore read as $49 cleared.
//
// "Cleared" is load-bearing in this repository: it is the word that separates
// money a provider actually moved from money someone typed. The rule used below
// is not new either -- it is the same order-witness match revenue.mjs already
// applies when reconciling refunds. The dashboard simply was not using it.
//
// Nothing is hidden by the fix: an unwitnessed positive event still appears,
// under `unwitnessedRevenue`, which is what it is.

const WEBHOOK_SECRET = 'cleared-revenue-truth-secret';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-cleared-'));
  const store = new Store(dir);
  await store.init();
  const cfg = {
    baseUrl: 'https://a.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 100, freeFindings: 1, fullAuditPrice: 49,
      strategyAuditPrice: 299, monitoringPrice: 99, implementationFrom: 1000, bookingUrl: '',
      reportDeliveryInbox: 'B', autoEmailReports: false, paymentProvider: 'links',
      lemonWebhookSecret: WEBHOOK_SECRET, allowTestUnlock: true,
      monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'O' }
  };
  const engine = new RevenueEngine(store, cfg, { running: true, paused: false, runBatch: async () => {} });
  return { store, engine };
}

const lead = async (engine, store, company) => {
  const created = await engine.createLead(
    { company, website: `https://${company.toLowerCase()}.example`, email: `o@${company.toLowerCase()}.example`, industry: 'S', consent: true },
    '1.2.3.4');
  return store.get('leads', created.leadId);
};

async function payByWebhook(engine, target, eventId) {
  const body = JSON.stringify({
    meta: { event_name: 'order_created', test_mode: false, custom_data: { lead_id: target.id, prospect_id: target.prospectId, product: 'full' } },
    data: { id: eventId, type: 'orders', attributes: { total: 4900, currency: 'USD', status: 'paid', created_at: '2026-08-30T10:00:00Z', test_mode: false, user_email: 'buyer@example.com' } }
  });
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  return engine.handleLemonWebhook(body, signature);
}

test('a test unlock is not cleared revenue on the dashboard', async () => {
  const { store, engine } = await harness();
  const target = await lead(engine, store, 'Alpha');

  await engine.unlockLead(target.id, 'full', { provider: 'test', eventId: 'test_abc', amountCents: 4900 });

  const summary = await engine.summary();
  assert.equal(summary.clearedRevenue, 0, 'an unlock with no provider behind it is not cleared');
  assert.equal(summary.unwitnessedRevenue, 49, 'and it is still reported, under its real name');
  assert.equal(summary.grossRevenue, 49, 'gross is unchanged: nothing is being hidden');
});

// The control that matters more than the fix: a real payment must still count.
test('a real provider payment is still cleared revenue', async () => {
  const { store, engine } = await harness();
  const target = await lead(engine, store, 'Bravo');

  await payByWebhook(engine, target, 'evt-real-1');

  const summary = await engine.summary();
  assert.equal(summary.clearedRevenue, 49, 'a payment witnessed by a provider order is cleared');
  assert.equal(summary.unwitnessedRevenue, 0);
});

// The whole point: the dashboard and the canonical truth must not contradict
// each other about whether money cleared.
test('the dashboard and the canonical payment truth agree', async () => {
  const { store, engine } = await harness();
  const fake = await lead(engine, store, 'Charlie');
  const real = await lead(engine, store, 'Delta');

  await engine.unlockLead(fake.id, 'full', { provider: 'test', eventId: 'test_xyz', amountCents: 4900 });
  await payByWebhook(engine, real, 'evt-real-2');

  const summary = await engine.summary();
  const fakeTruth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: fake.id });
  const realTruth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: real.id });

  assert.notEqual(fakeTruth.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(fakeTruth.economics.netProviderClearedRevenueCents, 0);

  assert.equal(realTruth.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(realTruth.economics.netProviderClearedRevenueCents, 4900);

  // One real payment, one fabricated one: the dashboard must show exactly the
  // real one as cleared.
  assert.equal(summary.clearedRevenue, 49,
    'the dashboard must count the provider-witnessed payment and only that one');
  assert.equal(summary.unwitnessedRevenue, 49);
});

test('a refund still nets out of gross without becoming unwitnessed revenue', async () => {
  const { store, engine } = await harness();
  const target = await lead(engine, store, 'Echo');
  await payByWebhook(engine, target, 'evt-real-3');

  const before = await engine.summary();
  assert.equal(before.clearedRevenue, 49);

  await store.add('revenueEvents', {
    id: 'rev_refund_1', providerEventId: 'refund-1', leadId: target.id, prospectId: target.prospectId,
    product: 'full', kind: 'refund', amountCents: -4900, currency: 'USD', createdAt: new Date().toISOString()
  });

  const after = await engine.summary();
  assert.equal(after.grossRevenue, 0, 'a refund nets out of gross');
  assert.equal(after.refundedRevenue, 49);
  assert.equal(after.unwitnessedRevenue, 0,
    'a negative event is a refund, not an unwitnessed positive one');
});

// ALLOW_TEST_PAYMENT_UNLOCK arms the route that writes a payment nobody made.
// It is admin-gated, so it was never remotely reachable -- but there is no
// version of production where having it on is right, and an environment variable
// set once for a staging run is exactly how it would end up there.
test('production refuses to start with test payment unlock enabled', () => {
  const base = {
    processRole: 'web', storeBackend: 'postgres', databaseUrl: 'postgres://x',
    nodeEnv: 'production', adminToken: 'x'.repeat(40), baseUrl: 'https://a.test',
    outbound: { enabled: false }, google: {}, sender: {}, revenue: {}
  };
  assert.throws(
    () => validateStartupConfig({ ...base, revenue: { allowTestUnlock: true } }),
    /ALLOW_TEST_PAYMENT_UNLOCK/);

  // And it stays available where it is useful.
  assert.equal(validateStartupConfig({
    ...base, nodeEnv: 'development', storeBackend: 'json', revenue: { allowTestUnlock: true }
  }), true);
});
