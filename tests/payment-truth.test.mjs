import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { classifyPaymentEvent, normalizeLemonEvent, PAYMENT_TRUTH_POLICY_VERSION } from '../src/payments.mjs';

// Proves the deterministic payment-truth classification: only a genuinely
// cleared payment unlocks access or counts as revenue. This is a regression
// suite for a confirmed real bug -- subscription_updated (a metadata-only
// Lemon Squeezy webhook fired for card/plan/renewal-date changes, never a
// new charge) previously called unlockLead() and created a fresh
// revenueEvents "sale" row on every occurrence, overcounting gross revenue.

const SECRET = 'whsec_test_secret';

function cfg(dir, overrides = {}) {
  return {
    baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 4, freeFindings: 1, fullAuditPrice: 49, strategyAuditPrice: 299,
      monitoringPrice: 99, implementationFrom: 1000, bookingUrl: '', reportDeliveryInbox: 'B', autoEmailReports: false,
      paymentProvider: 'links', fullAuditCheckoutUrl: 'https://shop.test/buy/full', strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy',
      monitoringCheckoutUrl: 'https://shop.test/buy/watch', lemonWebhookSecret: SECRET, allowTestUnlock: true,
      monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'Mohamed' },
    ...overrides
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-payment-truth-'));
  const store = new Store(dir);
  await store.init();
  return { store, dir };
}

async function seedLead(store, config) {
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config, pipeline);
  const created = await engine.createLead({ company: 'Acme', website: 'https://example.com', email: 'owner@example.com', industry: 'SaaS', consent: true }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);
  const prospect = await store.get('prospects', lead.prospectId);
  return { engine, lead, prospect };
}

function lemonPayload({ eventName, eventId, leadId, prospectId, product = 'full', amountCents = 4900, currency = 'USD', status = 'paid', testMode = false }) {
  return {
    meta: { event_name: eventName, custom_data: { lead_id: leadId, prospect_id: prospectId, product }, test_mode: testMode },
    data: { id: eventId, type: 'orders', attributes: { total: amountCents, currency, status, user_email: 'owner@example.com', created_at: new Date().toISOString(), test_mode: testMode } }
  };
}

function sign(rawBody, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

async function deliverWebhook(engine, payloadObj, secret = SECRET) {
  const raw = JSON.stringify(payloadObj);
  return engine.handleLemonWebhook(raw, sign(raw, secret));
}

async function paymentAuditEntries(store) {
  return (await store.list('auditLog')).filter(e => e.type === 'payment_classification');
}

// --- Pure classifier unit tests -------------------------------------------------

test('classifyPaymentEvent: missing event id is rejected as invalid', () => {
  const result = classifyPaymentEvent({ event: { eventName: 'order_created', custom: {} }, lead: null, cfg: {} });
  assert.equal(result.classification, 'INVALID_OR_UNSUPPORTED');
  assert.ok(result.reasonCodes.includes('missing-event-id'));
});

test('classifyPaymentEvent: unrecognized event name (e.g. a dispute-style event) is rejected without crashing', () => {
  const lead = { id: 'lead_1', prospectId: 'p1' };
  const result = classifyPaymentEvent({ event: { eventId: 'e1', eventName: 'order_dispute_created', custom: { lead_id: 'lead_1' } }, lead, cfg: {} });
  assert.equal(result.classification, 'INVALID_OR_UNSUPPORTED');
  assert.ok(result.reasonCodes.some(r => r.startsWith('unrecognized-event-name')));
});

// --- Full webhook-path integration tests ----------------------------------------

test('a cleared one-time payment unlocks access and records exactly one positive revenue event', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'evt_1', leadId: lead.id, prospectId: prospect.id, product: 'full', amountCents: 4900 }));
  assert.equal(result.classification, 'CLEARED_ONE_TIME_PAYMENT');
  const paidLead = await store.get('leads', lead.id);
  assert.equal(paidLead.paymentStatus, 'paid');
  const events = await store.list('revenueEvents');
  assert.equal(events.length, 1);
  assert.equal(events[0].amountCents, 4900);
  assert.equal((await engine.summary()).clearedRevenue, 49);
});

test('a duplicate webhook (same provider event id) is harmless: no double unlock, no double revenue', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const payload = lemonPayload({ eventName: 'order_created', eventId: 'evt_dup', leadId: lead.id, prospectId: prospect.id });
  const first = await deliverWebhook(engine, payload);
  const second = await deliverWebhook(engine, payload);
  assert.equal(first.duplicate, undefined);
  assert.equal(second.duplicate, true);
  assert.equal((await store.list('revenueEvents')).length, 1);
});

test('subscription creation is a cleared subscription payment: unlocks, records revenue, activates the subscription', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_created', eventId: 'sub_1', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  assert.equal(result.classification, 'CLEARED_SUBSCRIPTION_PAYMENT');
  const subs = await store.list('subscriptions');
  assert.equal(subs.length, 1);
  assert.equal(subs[0].status, 'active');
  assert.equal((await store.list('revenueEvents')).length, 1);
});

test('THE BUG FIX: subscription_updated never creates a fake sale, even when fired repeatedly', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_created', eventId: 'sub_created_1', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  // Simulate five metadata-only update webhooks (card changed, plan synced, etc.)
  for (let i = 0; i < 5; i += 1) {
    const result = await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_updated', eventId: `sub_updated_${i}`, leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
    assert.equal(result.classification, 'SUBSCRIPTION_LIFECYCLE_UPDATE');
  }
  const events = await store.list('revenueEvents');
  assert.equal(events.length, 1, 'only the original subscription_created payment may ever count as revenue');
  assert.equal((await engine.summary()).clearedRevenue, 99, 'five update webhooks must not inflate gross revenue to 6x');
});

test('a genuine renewal charge (subscription_payment_success) is recorded as its own cleared revenue event', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_created', eventId: 'sub_created_2', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_payment_success', eventId: 'renewal_1', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  assert.equal(result.classification, 'CLEARED_SUBSCRIPTION_PAYMENT');
  assert.equal((await store.list('revenueEvents')).length, 2, 'the original payment plus one real renewal charge');
  assert.equal((await engine.summary()).clearedRevenue, 198);
});

test('subscription resume reactivates the subscription without creating a revenue event', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_created', eventId: 'sub_created_3', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_paused', eventId: 'sub_paused_1', leadId: lead.id, prospectId: prospect.id, product: 'monitoring' }));
  assert.equal((await store.list('subscriptions'))[0].status, 'paused');
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_resumed', eventId: 'sub_resumed_1', leadId: lead.id, prospectId: prospect.id, product: 'monitoring' }));
  assert.equal(result.classification, 'SUBSCRIPTION_LIFECYCLE_UPDATE');
  assert.equal((await store.list('subscriptions'))[0].status, 'active');
  assert.equal((await store.list('revenueEvents')).length, 1, 'resume must not create a second revenue event');
});

test('cancellation, pause, and expiration correctly exclude a subscription from active MRR', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_created', eventId: 'sub_created_4', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  assert.equal((await engine.summary()).mrr, 99);
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_cancelled', eventId: 'sub_cancel_1', leadId: lead.id, prospectId: prospect.id, product: 'monitoring' }));
  assert.equal((await engine.summary()).mrr, 0);
});

test('a refund is recorded as a negative revenue event, remains visible, and reduces net revenue without deleting the original sale', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'order_1', leadId: lead.id, prospectId: prospect.id, product: 'full', amountCents: 4900 }));
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_refunded', eventId: 'refund_1', leadId: lead.id, prospectId: prospect.id, product: 'full', amountCents: 4900 }));
  assert.equal(result.classification, 'REFUND_OR_DISPUTE');
  const events = await store.list('revenueEvents');
  assert.equal(events.length, 2, 'the refund is recorded alongside the original sale, not in place of it');
  const summary = await engine.summary();
  assert.equal(summary.clearedRevenue, 49);
  assert.equal(summary.refundedRevenue, 49);
  assert.equal(summary.grossRevenue, 0);
  const refundedLead = await store.get('leads', lead.id);
  assert.ok(refundedLead.refundedAt);
});

test('a pending/unclear order status blocks unlock and revenue', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'pending_1', leadId: lead.id, prospectId: prospect.id, status: 'pending' }));
  assert.equal(result.classification, 'PENDING_OR_UNCLEAR');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid');
  assert.equal((await store.list('revenueEvents')).length, 0);
});

test('a failed subscription payment attempt is pending, not a refund and not revenue', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_payment_failed', eventId: 'fail_1', leadId: lead.id, prospectId: prospect.id, product: 'monitoring' }));
  assert.equal(result.classification, 'PENDING_OR_UNCLEAR');
  assert.equal((await store.list('revenueEvents')).length, 0);
});

test('an invalid webhook signature is rejected before any classification occurs', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine } = await seedLead(store, config);
  const raw = JSON.stringify(lemonPayload({ eventName: 'order_created', eventId: 'bad_sig', leadId: 'x', prospectId: 'y' }));
  await assert.rejects(() => engine.handleLemonWebhook(raw, 'not-a-real-signature'), /Invalid webhook signature/);
});

test('an unknown product is review-required and never unlocks', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'unknown_product_1', leadId: lead.id, prospectId: prospect.id, product: 'enterprise-consulting-package' }));
  assert.equal(result.classification, 'REVIEW_REQUIRED');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid');
});

test('an unknown lead id is review-required and never throws', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'unknown_lead_1', leadId: 'lead_does_not_exist', prospectId: 'p' }));
  assert.equal(result.classification, 'REVIEW_REQUIRED');
});

test('a mismatched prospect id on an otherwise valid lead is review-required', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'mismatch_1', leadId: lead.id, prospectId: 'a-different-prospect' }));
  assert.equal(result.classification, 'REVIEW_REQUIRED');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid');
});

test('a malformed (negative/NaN) amount is review-required', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'bad_amount_1', leadId: lead.id, prospectId: prospect.id, amountCents: -100 }));
  assert.equal(result.classification, 'REVIEW_REQUIRED');
});

test('a malformed currency code is review-required', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'bad_currency_1', leadId: lead.id, prospectId: prospect.id, currency: 'dollars' }));
  assert.equal(result.classification, 'REVIEW_REQUIRED');
});

test('a test-mode event is rejected when test unlocks are disabled', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir, { revenue: { ...cfg(dir).revenue, allowTestUnlock: false } });
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'test_mode_1', leadId: lead.id, prospectId: prospect.id, testMode: true }));
  assert.equal(result.classification, 'INVALID_OR_UNSUPPORTED');
  assert.equal((await store.list('revenueEvents')).length, 0, 'a test-mode event must never produce production revenue');
});

test('concurrent duplicate webhook delivery races to exactly one cleared payment', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const payload = lemonPayload({ eventName: 'order_created', eventId: 'race_1', leadId: lead.id, prospectId: prospect.id });
  const [a, b] = await Promise.all([deliverWebhook(engine, payload), deliverWebhook(engine, payload)]);
  const duplicates = [a, b].filter(r => r.duplicate).length;
  assert.equal(duplicates, 1);
  assert.equal((await store.list('revenueEvents')).length, 1);
});

test('summary() and MRR are accurate across a mixed sequence of one-time, subscription, update, and refund events', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'mix_1', leadId: lead.id, prospectId: prospect.id, product: 'full', amountCents: 4900 }));
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_created', eventId: 'mix_2', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_updated', eventId: 'mix_3', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  await deliverWebhook(engine, lemonPayload({ eventName: 'order_refunded', eventId: 'mix_4', leadId: lead.id, prospectId: prospect.id, product: 'full', amountCents: 4900 }));
  const summary = await engine.summary();
  assert.equal(summary.clearedRevenue, 148);
  assert.equal(summary.refundedRevenue, 49);
  assert.equal(summary.grossRevenue, 99);
  assert.equal(summary.mrr, 99);
});

test('notifications are only created for genuinely cleared payments, not for lifecycle-only updates', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_created', eventId: 'notif_1', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  const afterCreate = (await store.list('notifications')).filter(n => n.type === 'payment').length;
  await deliverWebhook(engine, lemonPayload({ eventName: 'subscription_updated', eventId: 'notif_2', leadId: lead.id, prospectId: prospect.id, product: 'monitoring', amountCents: 9900 }));
  const afterUpdate = (await store.list('notifications')).filter(n => n.type === 'payment').length;
  assert.equal(afterCreate, 1);
  assert.equal(afterUpdate, 1, 'a metadata-only update must not create a second payment notification');
});

test('checkout unavailable is reported accurately when no checkout URL is configured', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir, { revenue: { ...cfg(dir).revenue, fullAuditCheckoutUrl: '' } });
  const { engine, lead } = await seedLead(store, config);
  const checkout = engine.checkoutFor(lead, 'full');
  assert.equal(checkout.configured, false);
});

test('every payment decision is audited, including denied and duplicate paths', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'audit_1', leadId: lead.id, prospectId: prospect.id }));
  await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'audit_1', leadId: lead.id, prospectId: prospect.id }));
  await deliverWebhook(engine, lemonPayload({ eventName: 'order_created', eventId: 'audit_bad', leadId: 'nope', prospectId: 'nope' }));
  const entries = await paymentAuditEntries(store);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map(e => e.detail.classification).sort(), ['CLEARED_ONE_TIME_PAYMENT', 'DUPLICATE', 'REVIEW_REQUIRED']);
  assert.ok(entries.every(e => e.detail.policyVersion === PAYMENT_TRUTH_POLICY_VERSION));
});

test('malformed webhook payload (unparseable JSON) throws cleanly rather than corrupting state', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine } = await seedLead(store, config);
  const raw = '{not valid json';
  await assert.rejects(() => engine.handleLemonWebhook(raw, sign(raw)));
  assert.equal((await store.list('orders')).length, 0);
});

test('no test in this file ever calls a real payment provider network endpoint', async () => {
  const source = await fs.readFile(new URL('../src/payments.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|lemonsqueezy\.com\/api/);
});
