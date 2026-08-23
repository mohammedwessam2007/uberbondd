import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePaymentRenewalTruth } from '../src/payment-renewal-truth.mjs';

const lead = { id: 'lead_mut', prospectId: 'pros_mut', paymentStatus: 'paid' };

function fixture() {
  const eventName = 'order_created';
  const eventId = 'evt_mut';
  return {
    order: {
      id: 'order_evt_mut', provider: 'lemonsqueezy', providerEventId: eventId,
      eventName, leadId: lead.id, prospectId: lead.prospectId, product: 'full',
      amountCents: 5000, currency: 'USD', status: 'paid',
      createdAt: '2026-08-23T12:00:00.000Z'
    },
    audit: {
      type: 'payment_classification', classification: 'CLEARED_ONE_TIME_PAYMENT',
      eventName, eventId, leadId: lead.id, prospectId: lead.prospectId,
      product: 'full', policyVersion: 'payment-truth-1.0.0',
      timestamp: '2026-08-23T12:00:00.000Z'
    },
    revenue: {
      id: 'rev_evt_mut', providerEventId: `${eventName}:${eventId}`,
      leadId: lead.id, prospectId: lead.prospectId, product: 'full', kind: 'sale',
      amountCents: 5000, currency: 'USD', createdAt: '2026-08-23T12:00:00.000Z'
    }
  };
}

function reconcile(parts) {
  return reconcilePaymentRenewalTruth({
    lead,
    orders: [parts.order],
    auditLog: [parts.audit],
    revenueEvents: [parts.revenue]
  });
}

test('same provider event id cannot prove a ledger amount that disagrees with the signed-provider order', () => {
  const parts = fixture();
  parts.revenue.amountCents = 500000;
  const result = reconcile(parts);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.ok(result.contradictions.includes('provider-payment-witness-amount-mismatch'));
});

test('same provider event id cannot prove a ledger currency that disagrees with the signed-provider order', () => {
  const parts = fixture();
  parts.revenue.currency = 'EUR';
  const result = reconcile(parts);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.ok(result.contradictions.includes('provider-payment-witness-currency-mismatch'));
});

test('same provider event id cannot prove a ledger product bound to a different commercial product', () => {
  const parts = fixture();
  parts.revenue.product = 'monitoring';
  const result = reconcile(parts);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.ok(result.contradictions.includes('provider-payment-witness-product-mismatch'));
});

test('same provider event id cannot prove a ledger row bound to another prospect', () => {
  const parts = fixture();
  parts.revenue.prospectId = 'pros_other';
  const result = reconcile(parts);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.ok(result.contradictions.includes('provider-payment-witness-prospect-mismatch'));
});
