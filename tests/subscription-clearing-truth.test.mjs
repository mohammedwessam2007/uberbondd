import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { classifyPaymentEvent } from '../src/payments.mjs';
import { reconcilePaymentRenewalTruthFromStore } from '../src/payment-renewal-truth.mjs';

// A subscription exists in one of several states, and only one of them means a
// charge has cleared. `subscription_created` fires for all of them -- including
// a free trial, where the whole point is that no money has moved yet.
//
// The one-time branch of the classifier has always checked whether the order was
// actually paid. The subscription branch did not, so the guard existed on one
// side of the money and not the other. Six `subscription_created` deliveries,
// measured before the fix:
//
//   status=on_trial   cleared    0 ->   99   paid   PROVIDER_CLEARED_PAYMENT_PROVEN
//   status=past_due   cleared   99 ->  198   paid   PROVIDER_CLEARED_PAYMENT_PROVEN
//   status=unpaid     cleared  198 ->  297   paid   PROVIDER_CLEARED_PAYMENT_PROVEN
//   status=cancelled  cleared  297 ->  396   paid   PROVIDER_CLEARED_PAYMENT_PROVEN
//   status=expired    cleared  396 ->  495   paid   PROVIDER_CLEARED_PAYMENT_PROVEN
//   status=paused     cleared  495 ->  594   paid   PROVIDER_CLEARED_PAYMENT_PROVEN
//
// $594 nobody paid, and every surface agreed on it -- including the canonical
// triple-witness reconciliation, because all three of its witnesses are derived
// from the same signed webhook. Consistency across three views of one event
// cannot catch a misreading of that event, which is what this was.
//
// A trial signup alone was worth $99 of imaginary cleared revenue, and it
// unlocked the paid report and started a monitoring subscription too.

const SECRET = 'subscription-clearing-truth-secret';
const NOT_YET_PAID = ['on_trial', 'past_due', 'unpaid', 'cancelled', 'expired', 'paused'];

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-subclear-'));
  const store = new Store(dir);
  await store.init();
  const cfg = {
    baseUrl: 'https://a.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 100, freeFindings: 1, fullAuditPrice: 49,
      strategyAuditPrice: 299, monitoringPrice: 99, implementationFrom: 1000, bookingUrl: '',
      reportDeliveryInbox: 'B', autoEmailReports: false, paymentProvider: 'links',
      lemonWebhookSecret: SECRET, allowTestUnlock: false,
      monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'O' }
  };
  const engine = new RevenueEngine(store, cfg, { running: true, paused: false, runBatch: async () => {} });
  const created = await engine.createLead(
    { company: 'SubCo', website: 'https://subco.example', email: 'o@subco.example', industry: 'S', consent: true },
    '1.2.3.4');
  return { store, engine, lead: await store.get('leads', created.leadId) };
}

async function deliver(engine, lead, { eventName = 'subscription_created', status, objectId }) {
  const body = JSON.stringify({
    meta: { event_name: eventName, test_mode: false, custom_data: { lead_id: lead.id, prospect_id: lead.prospectId, product: 'monitoring' } },
    data: { id: objectId, type: 'subscriptions', attributes: { total: 9900, currency: 'USD', status, created_at: '2026-08-30T10:00:00Z', test_mode: false, user_email: 'buyer@example.com' } }
  });
  return engine.handleLemonWebhook(body, crypto.createHmac('sha256', SECRET).update(body).digest('hex'));
}

test('a subscription created in a state that has not paid is not cleared revenue', async () => {
  const { store, engine, lead } = await harness();

  for (const status of NOT_YET_PAID) {
    await deliver(engine, lead, { status, objectId: `sub-${status}` });
  }

  const summary = await engine.summary();
  assert.equal(summary.clearedRevenue, 0,
    `${NOT_YET_PAID.length} unpaid subscription states booked ${summary.clearedRevenue} of cleared revenue`);
  assert.equal(summary.grossRevenue, 0, 'and no revenue event was written at all');

  // The canonical truth must agree, and the lead must not be sitting on a paid
  // report it never paid for.
  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead.id });
  assert.notEqual(truth.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(truth.economics.netProviderClearedRevenueCents, 0);
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid');
  assert.equal((await store.list('subscriptions')).length, 0,
    'an unpaid subscription must not start a monitoring subscription either');
});

// The control, and the reason the guard is narrow. Without this every assertion
// above is satisfied by refusing all subscription revenue, which would be a far
// more expensive bug than the one being fixed.
test('a subscription that has actually paid is still cleared revenue', async () => {
  const { store, engine, lead } = await harness();
  await deliver(engine, lead, { status: 'active', objectId: 'sub-active' });

  const summary = await engine.summary();
  assert.equal(summary.clearedRevenue, 99);
  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead.id });
  assert.equal(truth.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal((await store.list('subscriptions')).length, 1, 'and monitoring starts');
});

// `subscription_payment_success` is the provider asserting a charge succeeded.
// A recovery payment on a past_due subscription arrives exactly that way, so
// gating it on the subscription's status would discard real money.
test('a recovery payment on a past-due subscription is still money', async () => {
  const { engine, lead } = await harness();
  await deliver(engine, lead, { eventName: 'subscription_payment_success', status: 'past_due', objectId: 'sub-recovery' });
  assert.equal((await engine.summary()).clearedRevenue, 99);
});

// The classifier is pure, so the whole matrix is cheap to state exactly.
test('the classification matrix says what it means, status by status', async () => {
  const lead = { id: 'l1', prospectId: 'p1' };
  const event = (eventName, status) => ({
    eventName, eventId: `e-${eventName}-${status}`, status, amountCents: 9900, currency: 'USD',
    custom: { lead_id: 'l1', prospect_id: 'p1', product: 'monitoring' }, testMode: false
  });
  const classify = (name, status) => classifyPaymentEvent({ event: event(name, status), lead, cfg: { revenue: {} } });

  for (const status of NOT_YET_PAID) {
    const decision = classify('subscription_created', status);
    assert.equal(decision.classification, 'PENDING_OR_UNCLEAR', `subscription_created/${status}`);
    assert.equal(decision.shouldRecordRevenue, false);
    assert.equal(decision.shouldUnlock, false);
    assert.ok(decision.reasonCodes.includes(`subscription-status-${status}`),
      'the refusal must say which status it refused, so a provider dashboard is legible');
  }

  assert.equal(classify('subscription_created', 'active').classification, 'CLEARED_SUBSCRIPTION_PAYMENT');
  // An absent status is silence, not a claim of non-payment -- the same reading
  // the one-time branch has always taken.
  assert.equal(classify('subscription_created', '').classification, 'CLEARED_SUBSCRIPTION_PAYMENT');
  for (const status of ['active', 'past_due', 'unpaid']) {
    assert.equal(classify('subscription_payment_success', status).classification, 'CLEARED_SUBSCRIPTION_PAYMENT',
      `subscription_payment_success/${status} is the provider asserting a charge succeeded`);
  }
});
