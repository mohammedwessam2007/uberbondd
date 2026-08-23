import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePaymentRenewalTruth } from '../src/payment-renewal-truth.mjs';

const PAY_AT = '2026-08-01T00:00:00Z';
const REFUND_AT = '2026-08-05T00:00:00Z';

function order(eventName, eventId, amountCents, overrides = {}) {
  return {
    id: `o_${eventId}`,
    provider: 'lemonsqueezy',
    providerEventId: eventId,
    eventName,
    leadId: 'lead1',
    prospectId: 'prospect1',
    product: 'full',
    amountCents,
    currency: 'USD',
    status: amountCents < 0 ? 'refunded' : 'paid',
    createdAt: eventName === 'order_refunded' ? REFUND_AT : PAY_AT,
    ...overrides
  };
}

function revenue(eventName, eventId, amountCents, overrides = {}) {
  return {
    id: `r_${eventId}`,
    providerEventId: `${eventName}:${eventId}`,
    leadId: 'lead1',
    prospectId: 'prospect1',
    product: 'full',
    amountCents,
    currency: 'USD',
    createdAt: eventName === 'order_refunded' ? '2026-08-05T00:01:00Z' : '2026-08-01T00:01:00Z',
    ...overrides
  };
}

function receipt(classification, eventName, eventId, overrides = {}) {
  return {
    type: 'payment_classification',
    createdAt: eventName === 'order_refunded' ? '2026-08-05T00:00:30Z' : '2026-08-01T00:00:30Z',
    detail: {
      classification,
      eventName,
      eventId,
      leadId: 'lead1',
      prospectId: 'prospect1',
      product: 'full',
      timestamp: eventName === 'order_refunded' ? '2026-08-05T00:00:30Z' : '2026-08-01T00:00:30Z',
      ...overrides
    }
  };
}

function scenario({ refundOrder = {}, refundRevenue = {}, refundReceipt = {} } = {}) {
  return {
    lead: { id: 'lead1' },
    orders: [
      order('order_created', 'evt_pay', 5000),
      order('order_refunded', 'evt_refund', -5000, refundOrder)
    ],
    revenueEvents: [
      revenue('order_created', 'evt_pay', 5000),
      revenue('order_refunded', 'evt_refund', -5000, refundRevenue)
    ],
    auditLog: [
      receipt('CLEARED_ONE_TIME_PAYMENT', 'order_created', 'evt_pay'),
      receipt('REFUND_OR_DISPUTE', 'order_refunded', 'evt_refund', refundReceipt)
    ]
  };
}

function assertRefundRefused(result, code) {
  assert.equal(result.ok, false);
  assert.ok(result.contradictions.includes(code), `expected ${code}, got ${result.contradictions.join(', ')}`);
  assert.equal(result.economics.reversedRevenueCents, 0, 'contradicted reversal must not reduce net revenue');
  assert.equal(result.economics.netProviderClearedRevenueCents, 5000);
  assert.equal(result.economics.verifiedReversalCount, 0);
  assert.deepEqual(result.verifiedReversalEventRefs, []);
}

test('refund amount must match provider order magnitude', () => {
  const result = reconcilePaymentRenewalTruth(scenario({ refundRevenue: { amountCents: -500000 } }));
  assertRefundRefused(result, 'provider-payment-witness-amount-mismatch');
});

test('refund currency must match provider order', () => {
  const result = reconcilePaymentRenewalTruth(scenario({ refundRevenue: { currency: 'EUR' } }));
  assertRefundRefused(result, 'provider-payment-witness-currency-mismatch');
});

test('refund product must agree across order, receipt, and ledger', () => {
  const result = reconcilePaymentRenewalTruth(scenario({ refundReceipt: { product: 'monitoring' } }));
  assertRefundRefused(result, 'provider-payment-witness-product-mismatch');
});

test('refund prospect must agree across order, receipt, and ledger', () => {
  const result = reconcilePaymentRenewalTruth(scenario({ refundReceipt: { prospectId: 'prospect2' } }));
  assertRefundRefused(result, 'provider-payment-witness-prospect-mismatch');
});

test('refund lead binding cannot be borrowed from another entity', () => {
  const result = reconcilePaymentRenewalTruth(scenario({ refundRevenue: { leadId: 'lead2' } }));
  // The revenue row is filtered out by leadId before witness comparison, so it
  // cannot be applied to lead1. The important property is economic: it proves
  // no reversal for this lead and cannot reduce retained revenue.
  assert.equal(result.economics.reversedRevenueCents, 0);
  assert.equal(result.economics.netProviderClearedRevenueCents, 5000);
  assert.equal(result.economics.verifiedReversalCount, 0);
});

test('matching refund witnesses still reverse exactly once', () => {
  const result = reconcilePaymentRenewalTruth(scenario());
  assert.equal(result.economics.reversedRevenueCents, 5000);
  assert.equal(result.economics.netProviderClearedRevenueCents, 0);
  assert.equal(result.economics.verifiedReversalCount, 1);
  assert.deepEqual(result.verifiedReversalEventRefs, ['order_refunded:evt_refund']);
});
