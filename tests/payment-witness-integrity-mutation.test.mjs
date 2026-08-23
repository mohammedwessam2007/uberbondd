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

// The probe above mutates the revenue ledger row. A first fix compared the
// order and the ledger and passed all four -- while the classification receipt
// was still excluded, because `clearedEvidenceIndex` dropped leadId, prospectId
// and product before the comparison could see them. A receipt bound to a
// different prospect therefore reconciled as agreement.
//
// Found by re-attacking the fix rather than by trusting that the four tests
// above covered the shape. Each witness gets its own case now.

test('a classification receipt bound to another prospect cannot prove the payment', () => {
  const parts = fixture();
  parts.audit.prospectId = 'pros_other';
  const result = reconcile(parts);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.netProviderClearedRevenueCents, 0);
  assert.ok(result.contradictions.includes('provider-payment-witness-prospect-mismatch'));
});

test('a witness bound to another lead is an absent witness, not a contradicting one', () => {
  // Both evidence indexes are already scoped by leadId, so a receipt or order
  // belonging to a different lead never enters them: the payment is refused for
  // want of a witness rather than for disagreement. That is the more accurate
  // description of what happened, and it is why no lead-mismatch code appears.
  for (const mutate of [parts => { parts.audit.leadId = 'lead_other'; }, parts => { parts.order.leadId = 'lead_other'; }]) {
    const parts = fixture();
    mutate(parts);
    const result = reconcile(parts);
    assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
    assert.equal(result.economics.netProviderClearedRevenueCents, 0);
    assert.ok(result.contradictions.includes('positive-revenue-row-without-provider-cleared-proof'));
  }
});

test('a classification receipt naming another product cannot prove the payment', () => {
  const parts = fixture();
  parts.audit.product = 'monitoring';
  const result = reconcile(parts);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.ok(result.contradictions.includes('provider-payment-witness-product-mismatch'));
});

test('an order stating a different amount cannot prove the payment', () => {
  // The mirror of the first test: the disagreement is caught whichever witness
  // is the one that moved.
  const parts = fixture();
  parts.order.amountCents = 999;
  const result = reconcile(parts);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.ok(result.contradictions.includes('provider-payment-witness-amount-mismatch'));
});

test('three witnesses that genuinely agree still clear, exactly once', () => {
  // A guard that refuses everything is not a guard.
  const result = reconcile(fixture());
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(result.economics.netProviderClearedRevenueCents, 5000);
  assert.equal(result.economics.verifiedPaymentCount, 1);
  assert.equal(result.economics.contradictedWitnessRowCount, 0);
});
