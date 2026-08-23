// Money that came back.
//
// src/payments.mjs classifies `order_refunded` as REFUND_OR_DISPUTE with
// revenueSign -1 and writes a negative ledger row. This module read only rows
// with `amountCents > 0`, so every refund row was invisible to it. A probe:
// customer pays $50, is refunded $50.
//
//   status: PROVIDER_CLEARED_PAYMENT_PROVEN
//   ok: true
//   contradictions: []
//   providerClearedRevenue: $50.00
//
// The money was gone and the revenue ledger said it was there -- the one thing
// this module exists to prevent, in a repository whose entire premise is that
// revenue is never claimed without proof. Proof of a payment is not proof the
// business kept it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePaymentRenewalTruth } from '../src/payment-renewal-truth.mjs';

function order(eventName, eventId, amountCents, at) {
  return {
    id: `o_${eventId}`, provider: 'lemonsqueezy', providerEventId: eventId, eventName,
    leadId: 'lead1', amountCents, status: amountCents < 0 ? 'refunded' : 'paid', createdAt: at
  };
}
function revenue(eventName, eventId, amountCents, at, id = `r_${eventId}`) {
  return { id, providerEventId: `${eventName}:${eventId}`, leadId: 'lead1', amountCents, createdAt: at };
}
function receipt(classification, eventName, eventId, at) {
  return { type: 'payment_classification', createdAt: at, detail: { classification, eventName, eventId, leadId: 'lead1', timestamp: at } };
}

const PAID = {
  orders: [order('order_created', 'evt_pay', 5000, '2026-08-01T00:00:00Z')],
  revenueEvents: [revenue('order_created', 'evt_pay', 5000, '2026-08-01T00:01:00Z')],
  auditLog: [receipt('CLEARED_ONE_TIME_PAYMENT', 'order_created', 'evt_pay', '2026-08-01T00:00:30Z')]
};

function withRefund(amountCents = -5000) {
  return {
    orders: [...PAID.orders, order('order_refunded', 'evt_refund', amountCents, '2026-08-05T00:00:00Z')],
    revenueEvents: [...PAID.revenueEvents, revenue('order_refunded', 'evt_refund', amountCents, '2026-08-05T00:01:00Z')],
    auditLog: [...PAID.auditLog, receipt('REFUND_OR_DISPUTE', 'order_refunded', 'evt_refund', '2026-08-05T00:00:30Z')]
  };
}

test('a fully refunded payment is not retained revenue', () => {
  const result = reconcilePaymentRenewalTruth({ lead: { id: 'lead1' }, ...withRefund() });
  assert.equal(result.economics.netProviderClearedRevenueCents, 0,
    'net revenue must reflect the money that came back');
  assert.equal(result.economics.reversedRevenueCents, 5000);
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_REVERSED');
  assert.equal(result.stages.PAYMENT_RETAINED.status, 'REVERSED');
  assert.equal(result.claimBoundary.retainedRevenue, 'CLEARED_THEN_FULLY_REVERSED');
});

test('the payment still cleared: history is not rewritten by the refund', () => {
  const result = reconcilePaymentRenewalTruth({ lead: { id: 'lead1' }, ...withRefund() });
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN',
    'the payment really did clear; merging that with retention is how a refund erases evidence');
  assert.equal(result.economics.providerClearedRevenueCents, 5000, 'gross stays gross');
  assert.deepEqual(result.verifiedReversalEventRefs, ['order_refunded:evt_refund']);
});

test('a partial refund is partial, not all-or-nothing', () => {
  const result = reconcilePaymentRenewalTruth({ lead: { id: 'lead1' }, ...withRefund(-2000) });
  assert.equal(result.economics.netProviderClearedRevenueCents, 3000);
  assert.equal(result.stages.PAYMENT_RETAINED.status, 'PARTIALLY_REVERSED');
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(result.claimBoundary.retainedRevenue, 'CLEARED_THEN_PARTIALLY_REVERSED');
});

test('a lead still marked paid after a full refund is a contradiction', () => {
  const result = reconcilePaymentRenewalTruth({ lead: { id: 'lead1', paymentStatus: 'paid' }, ...withRefund() });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.contradictions.includes('lead-marked-paid-after-full-refund'));
});

test('a negative row without provider refund proof erases revenue nobody can check', () => {
  // An unwitnessed positive row invents revenue; an unwitnessed negative row
  // erases it. Both are ledger claims with no provider behind them.
  const result = reconcilePaymentRenewalTruth({
    lead: { id: 'lead1' },
    orders: PAID.orders,
    revenueEvents: [...PAID.revenueEvents, revenue('order_refunded', 'ghost', -5000, '2026-08-05T00:01:00Z')],
    auditLog: PAID.auditLog
  });
  assert.ok(result.contradictions.includes('negative-revenue-row-without-provider-refund-proof'));
  assert.equal(result.economics.netProviderClearedRevenueCents, 5000,
    'an unproven refund must not be applied to the ledger, only reported');
  assert.equal(result.economics.unverifiedReversalCents, 5000);
});

test('refunding more than ever cleared is reported as an impossible ledger', () => {
  const result = reconcilePaymentRenewalTruth({ lead: { id: 'lead1' }, ...withRefund(-9000) });
  assert.ok(result.contradictions.includes('refunds-exceed-provider-cleared-payments'));
  assert.equal(result.ok, false);
});

test('one refund counted twice is a ledger integrity problem, like a double payment', () => {
  const base = withRefund();
  const result = reconcilePaymentRenewalTruth({
    lead: { id: 'lead1' },
    orders: base.orders,
    revenueEvents: [...base.revenueEvents, revenue('order_refunded', 'evt_refund', -5000, '2026-08-05T00:02:00Z', 'r_dup')],
    auditLog: base.auditLog
  });
  assert.ok(result.contradictions.includes('duplicate-refund-rows-for-one-provider-event'));
  assert.equal(result.economics.reversedRevenueCents, 5000, 'the duplicate must not double the refund either');
  assert.equal(result.economics.duplicateReversalRowCount, 1);
});

test('customer acceptance and a returned payment cannot both stand unexamined', () => {
  const base = withRefund();
  const fulfillment = {
    acceptedAt: '2026-08-03T00:00:00Z',
    acceptanceEvidenceRef: 'customer:ack-1',
    economicTruth: { acceptedDelivery: true },
    eventLog: [{ type: 'CUSTOMER_ACCEPTED', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:ack-1' }]
  };
  const result = reconcilePaymentRenewalTruth({ lead: { id: 'lead1' }, ...base, fulfillment });
  assert.ok(result.contradictions.includes('customer-acceptance-claimed-with-reversed-payment'),
    'a refund is the customer\'s strongest available statement that the delivery was not what they wanted');
  assert.equal(result.ok, false);
});

test('with no refunds at all, nothing about the existing verdict changes', () => {
  const result = reconcilePaymentRenewalTruth({ lead: { id: 'lead1' }, ...PAID });
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(result.economics.netProviderClearedRevenueCents, 5000);
  assert.equal(result.economics.reversedRevenueCents, 0);
  assert.equal(result.stages.PAYMENT_RETAINED.status, 'PROVEN');
  assert.deepEqual(result.contradictions, []);
});
