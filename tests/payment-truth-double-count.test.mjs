// One provider event is one payment.
//
// reconcilePaymentRenewalTruth requires three witnesses for cleared revenue --
// an order, a payment_classification receipt, and a revenue ledger row, all
// keyed on eventName:eventId. The first two are keyed maps and therefore
// deduped. The revenue ledger is a list, and it was not: two rows carrying the
// same providerEventId each matched the same order and the same receipt, and
// both were counted.
//
// A single $50 payment recorded twice reported $100 cleared, with no
// contradiction raised. For a module whose entire purpose is cleared-revenue
// truth, that is the defect that matters most.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePaymentRenewalTruth } from '../src/payment-renewal-truth.mjs';

const EVENT_NAME = 'order_created';
const EVENT_ID = 'evt_1';
const KEY = `${EVENT_NAME}:${EVENT_ID}`;

function witnesses({ leadId = 'lead_1' } = {}) {
  return {
    lead: { id: leadId, paymentStatus: 'paid' },
    // The order carries the amount and currency, because the sole writer of
    // this collection (RevenueEngine, from the provider event) always does. An
    // order without them is a shape production never produces, and leaving it
    // out here meant the witnesses were never compared on content -- which is
    // how a $50 order and a $5,000 ledger row both counted as the same payment.
    orders: [{
      leadId, provider: 'lemonsqueezy', eventName: EVENT_NAME, providerEventId: EVENT_ID,
      amountCents: 5_000, currency: 'USD'
    }],
    auditLog: [{
      type: 'payment_classification', leadId,
      classification: 'CLEARED_ONE_TIME_PAYMENT',
      eventName: EVENT_NAME, eventId: EVENT_ID
    }]
  };
}

function revenueRow(overrides = {}) {
  return {
    leadId: 'lead_1', providerEventId: KEY, amountCents: 5_000,
    createdAt: '2026-08-23T00:00:00Z', ...overrides
  };
}

test('one fully witnessed payment clears once', () => {
  const result = reconcilePaymentRenewalTruth({ ...witnesses(), revenueEvents: [revenueRow()] });
  assert.equal(result.economics.providerClearedRevenueCents, 5_000);
  assert.equal(result.economics.verifiedPaymentCount, 1);
  assert.deepEqual(result.contradictions, []);
});

test('the same provider event recorded twice does not clear twice', () => {
  const result = reconcilePaymentRenewalTruth({
    ...witnesses(),
    revenueEvents: [revenueRow(), revenueRow({ createdAt: '2026-08-23T00:00:01Z' })]
  });
  assert.equal(result.economics.providerClearedRevenueCents, 5_000, 'one event was counted twice');
  assert.equal(result.economics.verifiedPaymentCount, 1);
});

test('a duplicate ledger row is reported rather than quietly dropped', () => {
  const result = reconcilePaymentRenewalTruth({
    ...witnesses(),
    revenueEvents: [revenueRow(), revenueRow({ createdAt: '2026-08-23T00:00:01Z' })]
  });
  assert.ok(result.contradictions.includes('duplicate-revenue-rows-for-one-provider-event'));
  assert.equal(result.economics.duplicateRevenueRowCount, 1);
  assert.equal(result.economics.duplicateRevenueRowCents, 5_000);
  assert.equal(result.ok, false, 'a duplicated ledger row should demand review');
});

test('many duplicates of one event still clear exactly once', () => {
  const rows = Array.from({ length: 12 }, (_, index) =>
    revenueRow({ createdAt: `2026-08-23T00:00:${String(index).padStart(2, '0')}Z` }));
  const result = reconcilePaymentRenewalTruth({ ...witnesses(), revenueEvents: rows });
  assert.equal(result.economics.providerClearedRevenueCents, 5_000);
  assert.equal(result.economics.duplicateRevenueRowCount, 11);
});

test('two genuinely different provider events both clear', () => {
  const secondName = 'subscription_payment_success';
  const secondId = 'evt_2';
  const result = reconcilePaymentRenewalTruth({
    lead: { id: 'lead_1', paymentStatus: 'paid' },
    orders: [
      { leadId: 'lead_1', provider: 'lemonsqueezy', eventName: EVENT_NAME, providerEventId: EVENT_ID, amountCents: 5_000, currency: 'USD' },
      { leadId: 'lead_1', provider: 'lemonsqueezy', eventName: secondName, providerEventId: secondId, amountCents: 2_500, currency: 'USD' }
    ],
    auditLog: [
      { type: 'payment_classification', leadId: 'lead_1', classification: 'CLEARED_ONE_TIME_PAYMENT', eventName: EVENT_NAME, eventId: EVENT_ID },
      { type: 'payment_classification', leadId: 'lead_1', classification: 'CLEARED_SUBSCRIPTION_PAYMENT', eventName: secondName, eventId: secondId }
    ],
    revenueEvents: [
      revenueRow(),
      revenueRow({ providerEventId: `${secondName}:${secondId}`, amountCents: 2_500, createdAt: '2026-08-23T01:00:00Z' })
    ]
  });
  assert.equal(result.economics.providerClearedRevenueCents, 7_500);
  assert.equal(result.economics.verifiedPaymentCount, 2);
  assert.equal(result.economics.verifiedRenewalCount, 1);
  assert.deepEqual(result.contradictions, []);
});

test('a revenue row with no order and no receipt still clears nothing', () => {
  const result = reconcilePaymentRenewalTruth({
    lead: { id: 'lead_1', paymentStatus: 'paid' },
    orders: [], auditLog: [],
    revenueEvents: [revenueRow()]
  });
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.ok(result.contradictions.includes('positive-revenue-row-without-provider-cleared-proof'));
  assert.ok(result.contradictions.includes('lead-marked-paid-without-provider-cleared-proof'));
});

test('the module extends the canonical ledger rather than retyping one', async () => {
  // paymentMutations is a real effect this module reports and the canonical set
  // does not carry. Adding it to the canonical set would make every existing
  // complete ledger incomplete under the relay's own contract, so it is a
  // declared extension instead -- and the canonical keys must still all be
  // present and zero, so a drift away from the base shows up here.
  const { PAYMENT_RENEWAL_TRUTH_EXTERNAL_EFFECTS } = await import('../src/payment-renewal-truth.mjs');
  const { ZERO_EXTERNAL_EFFECTS } = await import('../src/effect-ledgers.mjs');

  for (const [key, value] of Object.entries(ZERO_EXTERNAL_EFFECTS)) {
    assert.equal(PAYMENT_RENEWAL_TRUTH_EXTERNAL_EFFECTS[key], value, `canonical key ${key} drifted`);
  }
  assert.equal(PAYMENT_RENEWAL_TRUTH_EXTERNAL_EFFECTS.paymentMutations, 0);
  assert.deepEqual(
    Object.keys(PAYMENT_RENEWAL_TRUTH_EXTERNAL_EFFECTS).sort(),
    [...Object.keys(ZERO_EXTERNAL_EFFECTS), 'paymentMutations'].sort(),
    'the extension grew beyond the one key it declares'
  );
});
