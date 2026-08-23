import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { reconcilePaymentRenewalTruthFromStore } from '../src/payment-renewal-truth.mjs';

// `payment-renewal-truth` compares amount and currency across all three
// witnesses and treats an absent field as silence rather than disagreement, so
// that receipts written before the index carried money keep reconciling.
//
// `logPaymentDecision` is the only producer of `payment_classification` rows in
// the system, and it wrote neither field. The receipt was therefore permanently
// silent, and the triple witness was a double witness on money -- with the
// missing one being the only witness written by a different code path at a
// different moment, and so the only one that survives a tamper of the other two.
//
// Corrupt the order and the ledger to agree with each other at 100x and the
// reconciliation reported $4,900.00 PROVIDER_CLEARED_PAYMENT_PROVEN with no
// contradictions at all.
//
// This is a guard that existed, was covered by a mutation, and could not fire on
// production data because its input was never written. A test that only mutates
// the reader cannot find that.

const SECRET = 'whsec_receipt_witness_probe';

const cfg = dir => ({
  baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
  revenue: {
    publicIntake: true, publicRateLimitPerHour: 4, freeFindings: 1, fullAuditPrice: 49,
    strategyAuditPrice: 299, monitoringPrice: 99, implementationFrom: 1000, bookingUrl: '',
    reportDeliveryInbox: 'B', autoEmailReports: false, paymentProvider: 'links',
    fullAuditCheckoutUrl: 'https://shop.test/buy/full',
    strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy',
    monitoringCheckoutUrl: 'https://shop.test/buy/watch',
    lemonWebhookSecret: SECRET, allowTestUnlock: true,
    monitoringIntervalDays: 30, monitoringBatchSize: 10
  },
  google: {}, sender: { name: 'Owner' }
});

async function clearedPayment({ totalCents = 4900, currency = 'USD', expect = 'CLEARED_ONE_TIME_PAYMENT' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'receipt-witness-'));
  const store = new Store(dir);
  await store.init();
  const engine = new RevenueEngine(store, cfg(dir), { running: true, paused: false, runBatch: async () => {} });
  const created = await engine.createLead(
    { company: 'Acme', website: 'https://example.com', email: 'owner@example.com', industry: 'SaaS', consent: true },
    '1.2.3.4');
  const lead = await store.get('leads', created.leadId);

  const body = JSON.stringify({
    meta: {
      event_name: 'order_created', test_mode: false,
      custom_data: { lead_id: lead.id, prospect_id: lead.prospectId, product: 'full' }
    },
    data: {
      id: 'evt-receipt-witness', type: 'orders',
      attributes: { total: totalCents, currency, status: 'paid', created_at: '2026-08-23T17:00:00Z', test_mode: false }
    }
  });
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const result = await engine.handleLemonWebhook(body, signature);
  assert.equal(result.classification, expect);
  return { store, lead };
}

const receipts = async store =>
  (await store.list('auditLog')).filter(row => row.type === 'payment_classification');

test('the production writer records the money the classification was made about', async () => {
  const { store } = await clearedPayment();
  const [receipt] = await receipts(store);
  assert.ok(receipt, 'a payment_classification row must be written');
  assert.equal(receipt.detail.amountCents, 4900);
  assert.equal(receipt.detail.currency, 'USD');
});

test('an honest payment still reconciles as proven', async () => {
  // Positive control. A guard that refuses everything is not a guard.
  const { store, lead } = await clearedPayment();
  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead.id });
  assert.equal(truth.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(truth.economics.netProviderClearedRevenueCents, 4900);
  assert.equal(truth.economics.currency, 'USD');
  assert.deepEqual(truth.contradictions, []);
});

test('the receipt contradicts an order and ledger forged to agree at 100x', async () => {
  const { store, lead } = await clearedPayment();
  const [order] = await store.list('orders');
  const [revenue] = await store.list('revenueEvents');
  await store.patch('orders', order.id, { amountCents: 490000 });
  await store.patch('revenueEvents', revenue.id, { amountCents: 490000 });

  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead.id });
  assert.ok(truth.contradictions.includes('provider-payment-witness-amount-mismatch'),
    'the receipt must object when the other two witnesses agree on a number it never saw');
  assert.equal(truth.economics.netProviderClearedRevenueCents, 0);
  assert.notEqual(truth.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
});

test('the receipt contradicts a currency forged on the other two witnesses', async () => {
  const { store, lead } = await clearedPayment();
  const [order] = await store.list('orders');
  const [revenue] = await store.list('revenueEvents');
  await store.patch('orders', order.id, { currency: 'EUR' });
  await store.patch('revenueEvents', revenue.id, { currency: 'EUR' });

  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead.id });
  assert.ok(truth.contradictions.includes('provider-payment-witness-currency-mismatch'));
  assert.equal(truth.economics.netProviderClearedRevenueCents, 0);
});

test('a receipt written before the writer carried money still reconciles', async () => {
  // Backward compatibility by construction: silence is not disagreement, so
  // already-persisted receipts must not start failing.
  const { store, lead } = await clearedPayment();
  const [receipt] = await receipts(store);
  const legacy = { ...receipt.detail };
  delete legacy.amountCents;
  delete legacy.currency;
  await store.patch('auditLog', receipt.id, { detail: legacy });

  const truth = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead.id });
  assert.equal(truth.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(truth.economics.netProviderClearedRevenueCents, 4900);
});

test('a non-USD payment records its own currency, not a default', async () => {
  const { store } = await clearedPayment({ totalCents: 3000, currency: 'EUR' });
  const [receipt] = await receipts(store);
  assert.equal(receipt.detail.currency, 'EUR');
  assert.equal(receipt.detail.amountCents, 3000);
});

test('a lowercase provider currency fails closed rather than clearing', async () => {
  // Not a defect -- `malformedCurrency` requires ISO-4217 shape and a provider
  // sending `usd` gets REVIEW_REQUIRED rather than an unlock. Pinned because
  // the safe direction of this strictness is worth keeping: several providers
  // do send lowercase, and the day someone "fixes" that by lowercasing the
  // comparison instead of the value, it should be a deliberate change.
  const { store, lead } = await clearedPayment({ currency: 'usd', expect: 'REVIEW_REQUIRED' });
  const [receipt] = await receipts(store);
  assert.equal(receipt.detail.classification, 'REVIEW_REQUIRED');
  assert.ok(receipt.detail.reasonCodes.includes('malformed-amount-or-currency'));

  const { reconcilePaymentRenewalTruthFromStore: reconcile } = await import('../src/payment-renewal-truth.mjs');
  const truth = await reconcile(store, { leadId: lead.id });
  assert.equal(truth.economics.netProviderClearedRevenueCents, 0);
});
