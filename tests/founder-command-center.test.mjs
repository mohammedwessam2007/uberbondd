import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { buildFounderCommandCenter } from '../src/founder-command-center.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function cfg(overrides = {}) {
  return {
    outbound: { enabled: false, dryRun: true, reservationRecoveryTimeoutMs: 30 * 60000, reservationRecoverySweepLimit: 200 },
    revenue: {
      fullAuditPrice: 49, strategyAuditPrice: 299, monitoringPrice: 99, implementationFrom: 1000,
      fullAuditCheckoutUrl: 'https://shop.test/buy/full', strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy',
      monitoringCheckoutUrl: 'https://shop.test/buy/watch', bookingUrl: 'https://cal.test/book',
      founderHourlyRateCents: 0, publicIntake: true, publicRateLimitPerHour: 4, freeFindings: 1,
      reportDeliveryInbox: 'B', autoEmailReports: false, monitoringIntervalDays: 30, monitoringBatchSize: 10,
      ...overrides.revenue
    },
    baseUrl: 'https://audit.test', encryptionKey: 'a'.repeat(64), google: {}, sender: { name: 'Mohamed' }
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-fcc-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('malformed store input is denied cleanly, never throws', async () => {
  const result = await buildFounderCommandCenter({ date: monday });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed-input-store');
});

test('an empty store surfaces unconfigured checkout as the top owner action when prices exist', async () => {
  const store = await tempStore();
  const config = cfg({ revenue: { fullAuditCheckoutUrl: '' } });
  const result = await buildFounderCommandCenter({ store, cfg: config, date: monday });
  assert.equal(result.ok, true);
  assert.ok(result.blocked.some(b => b.includes('full')));
  assert.match(result.ownerActionQueue[0].action, /Configure checkout/);
});

test('a fully configured system with no issues reports no binding action required', async () => {
  const store = await tempStore();
  const config = cfg();
  const result = await buildFounderCommandCenter({ store, cfg: config, date: monday });
  assert.equal(result.blocked.length, 0);
  assert.match(result.ownerActionQueue[0].action, /No binding action required/);
});

test('the owner action queue never exceeds three actions', async () => {
  const store = await tempStore();
  const config = cfg({ revenue: { fullAuditCheckoutUrl: '', strategyAuditCheckoutUrl: '', monitoringCheckoutUrl: '', bookingUrl: '' } });
  await store.reserveOutboundSend({ idempotencyKey: 'initial:stale', prospectId: 'stale', campaignId: 'camp', inbox: 'A', recipientEmail: 'x@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: new Date(monday.getTime() - 40 * 60000).toISOString() });
  await store.log('payment_classification', { classification: 'REVIEW_REQUIRED', reasonCodes: ['unknown-lead'] });
  const result = await buildFounderCommandCenter({ store, cfg: config, date: monday });
  assert.ok(result.ownerActionQueue.length <= 3);
});

test('offer readiness reflects real evidence sufficiency for actual prospects', async () => {
  const store = await tempStore();
  const config = cfg();
  await store.add('campaigns', { id: 'camp', approved: true, autoSend: false, allowedCountries: [], minScore: 0, dailyCaps: {}, maxFollowups: 0, createdAt: monday.toISOString() });
  await store.add('prospects', {
    id: 'p1', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example', status: 'ready',
    score: { total: 80 }, issue: { title: 'Booking broken', evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'error', confidence: 0.9, safeForOutreach: true },
    createdAt: monday.toISOString()
  });
  const result = await buildFounderCommandCenter({ store, cfg: config, date: monday });
  assert.equal(result.offerReadiness.candidateProspects, 1);
  assert.equal(result.offerReadiness.readyOffersByProduct.full, 1);
  assert.match(result.whatCanMakeMoneyFirst, /1 prospect/);
});

test('review-required payment events surface in both blocked[] and the owner action queue', async () => {
  const store = await tempStore();
  const config = cfg();
  await store.log('payment_classification', { classification: 'REVIEW_REQUIRED', reasonCodes: ['unknown-lead'] });
  const result = await buildFounderCommandCenter({ store, cfg: config, date: monday });
  assert.equal(result.paymentTruth.reviewRequiredRecently, 1);
  assert.ok(result.blocked.some(b => b.includes('payment event')));
});

test('revenue truth is UNKNOWN, not zero, when no RevenueEngine is supplied', async () => {
  const store = await tempStore();
  const result = await buildFounderCommandCenter({ store, cfg: cfg(), date: monday });
  assert.equal(result.paymentTruth.cleared, 'UNKNOWN');
  assert.equal(result.paymentTruth.activeMrr, 'UNKNOWN');
});

// This test used to reach `paymentTruth.cleared === 49` through
// `unlockLead(..., { provider: 'test' })` -- a test unlock, which writes a
// revenue event and no order. It passed because summary() summed every positive
// revenue event and called the total cleared, so a fabricated payment counted.
//
// That contradicted reconcilePaymentRenewalTruthFromStore, which answered
// REVIEW_REQUIRED and $0 for the same lead. A field named `paymentTruth.cleared`
// cannot mean one thing on the founder's report and another in the canonical
// truth, so summary() now requires a provider order to witness a payment before
// it is cleared.
//
// The test is strengthened rather than relaxed: it still proves a real payment
// reaches this field, and now also proves a fabricated one does not.
test('revenue truth reflects real cleared/refunded/MRR figures when a RevenueEngine is supplied', async () => {
  const store = await tempStore();
  const config = cfg({ revenue: { lemonWebhookSecret: 'founder-command-center-secret' } });
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const revenueEngine = new RevenueEngine(store, config, pipeline);
  const created = await revenueEngine.createLead({ company: 'Acme', website: 'https://example.com', email: 'owner@example.com', industry: 'SaaS', consent: true }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);

  const body = JSON.stringify({
    meta: { event_name: 'order_created', test_mode: false, custom_data: { lead_id: lead.id, prospect_id: lead.prospectId, product: 'full' } },
    data: { id: 'evt_real_fcc', type: 'orders', attributes: { total: 4900, currency: 'USD', status: 'paid', created_at: '2026-08-30T10:00:00Z', test_mode: false, user_email: 'buyer@example.com' } }
  });
  const signature = crypto.createHmac('sha256', 'founder-command-center-secret').update(body).digest('hex');
  await revenueEngine.handleLemonWebhook(body, signature);

  const result = await buildFounderCommandCenter({ store, cfg: config, revenueEngine, date: monday });
  assert.equal(result.paymentTruth.cleared, 49, 'a provider-witnessed payment reaches the founder report');
});

test('a fabricated unlock never reaches the founder report as cleared payment', async () => {
  const store = await tempStore();
  const config = cfg();
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const revenueEngine = new RevenueEngine(store, config, pipeline);
  const created = await revenueEngine.createLead({ company: 'Acme', website: 'https://example.com', email: 'owner@example.com', industry: 'SaaS', consent: true }, '1.2.3.4');
  await revenueEngine.unlockLead(created.leadId, 'full', { provider: 'test', eventId: 'evt_x', amountCents: 4900 });

  const result = await buildFounderCommandCenter({ store, cfg: config, revenueEngine, date: monday });
  assert.equal(result.paymentTruth.cleared, 0,
    'an unlock with no provider order behind it is not cleared payment, on any surface');
});

test('cross-workspace/campaign data does not leak into a different campaign\'s readiness count', async () => {
  const store = await tempStore();
  const config = cfg();
  await store.add('campaigns', { id: 'camp-a', approved: true, autoSend: false, allowedCountries: [], minScore: 0, dailyCaps: {}, maxFollowups: 0, createdAt: monday.toISOString() });
  await store.add('prospects', {
    id: 'pa', campaignId: 'camp-a', company: 'A', website: 'https://a.example', status: 'ready',
    score: { total: 80 }, issue: { title: 'X', evidenceUrl: 'https://a.example/x', evidenceExcerpt: 'x', confidence: 0.9, safeForOutreach: true },
    createdAt: monday.toISOString()
  });
  const result = await buildFounderCommandCenter({ store, cfg: config, date: monday });
  assert.equal(result.offerReadiness.candidateProspects, 1);
});

test('the founder command center never sends anything or calls a provider', async () => {
  const store = await tempStore();
  await buildFounderCommandCenter({ store, cfg: cfg(), date: monday });
  assert.equal((await store.list('messages')).length, 0);
  const source = await fs.readFile(new URL('../src/founder-command-center.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sendEmail|gmail\.mjs|fetch\(|http\.request|https\.request/);
});

test('the exact same reference time produces a byte-identical report on identical fresh state', async () => {
  const storeA = await tempStore();
  const storeB = await tempStore();
  const resultA = await buildFounderCommandCenter({ store: storeA, cfg: cfg(), date: monday });
  const resultB = await buildFounderCommandCenter({ store: storeB, cfg: cfg(), date: monday });
  assert.deepEqual(resultA.checkoutReadiness, resultB.checkoutReadiness);
  assert.deepEqual(resultA.offerReadiness, resultB.offerReadiness);
  assert.equal(resultA.timestamp, resultB.timestamp);
});
