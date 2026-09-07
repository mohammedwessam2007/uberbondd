import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcilePaymentRenewalTruth } from '../src/payment-renewal-truth.mjs';
import { createLeadPathSprint, LEAD_PATH_SPRINT_SKU } from '../src/lead-path-sprint-fulfillment.mjs';
import { PAYMENT_TRUTH_POLICY_VERSION } from '../src/payments.mjs';

const lead = { id: 'lead-paypal-1', prospectId: 'prospect-paypal-1', paymentStatus: 'unpaid' };
const eventId = 'WH-PAYPAL-LIVE-1';
const eventRef = `order_created:${eventId}`;

function witnesses(overrides = {}) {
  const provider = overrides.provider || 'paypal';
  const product = overrides.product || LEAD_PATH_SPRINT_SKU;
  const amountCents = overrides.amountCents ?? 45_000;
  const currency = overrides.currency || 'USD';
  return {
    orders: [{
      id: 'order-witness', provider, providerEventId: eventId, eventName: 'order_created',
      leadId: lead.id, prospectId: lead.prospectId, product, amountCents, currency, status: 'paid'
    }],
    revenueEvents: [{
      id: 'revenue-witness', provider, providerEventId: eventRef,
      leadId: lead.id, prospectId: lead.prospectId, product, amountCents, currency
    }],
    auditLog: [{
      id: 'audit-witness', type: 'payment_classification', createdAt: '2026-09-04T16:00:00.000Z',
      detail: {
        provider, classification: 'CLEARED_ONE_TIME_PAYMENT', eventName: 'order_created', eventId,
        leadId: lead.id, prospectId: lead.prospectId, product, amountCents, currency,
        policyVersion: PAYMENT_TRUTH_POLICY_VERSION, timestamp: '2026-09-04T16:00:00.000Z'
      }
    }]
  };
}

test('exact live PayPal three-witness truth reaches the existing Lead-Path Sprint PAID gate', () => {
  const truth = reconcilePaymentRenewalTruth({ lead, leadId: lead.id, ...witnesses() });
  assert.equal(truth.ok, true);
  assert.equal(truth.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(truth.economics.netProviderClearedRevenueCents, 45_000);
  assert.equal(truth.economics.currency, 'USD');
  assert.equal(truth.verifiedFirstPaymentProduct, LEAD_PATH_SPRINT_SKU);
  assert.deepEqual(truth.verifiedProviderEventRefs, [eventRef]);
  assert.equal(truth.stages.PAYMENT_RETAINED.status, 'PROVEN');

  const sprint = createLeadPathSprint({
    customerRef: 'customer:paypal-1',
    paymentLeadId: lead.id,
    canonicalPaymentTruth: truth,
    at: '2026-09-04T16:01:00.000Z'
  });
  assert.equal(sprint.ok, true);
  assert.equal(sprint.status, 'PAID');
  assert.match(sprint.canonicalPaymentTruthRef, /^payment-truth:/);
});

test('provider disagreement across the three witnesses cannot clear', () => {
  const rows = witnesses();
  rows.orders[0].provider = 'lemonsqueezy';
  const truth = reconcilePaymentRenewalTruth({ lead, leadId: lead.id, ...rows });
  assert.equal(truth.ok, false);
  assert.equal(truth.status, 'REVIEW_REQUIRED');
  assert.ok(truth.contradictions.includes('provider-payment-witness-provider-mismatch'));
});

test('wrong amount or wrong product cannot unlock the fixed sprint', () => {
  for (const patch of [{ amountCents: 44_999 }, { product: 'full' }]) {
    const truth = reconcilePaymentRenewalTruth({ lead, leadId: lead.id, ...witnesses(patch) });
    const sprint = createLeadPathSprint({
      customerRef: 'customer:paypal-1', paymentLeadId: lead.id, canonicalPaymentTruth: truth,
      at: '2026-09-04T16:01:00.000Z'
    });
    assert.equal(sprint.ok, false);
  }
});

test('an unresolved provider dispute blocks payment retention and therefore fulfillment', () => {
  const rows = witnesses();
  rows.auditLog.push({
    id: 'risk-1', type: 'payment_retention_risk', createdAt: '2026-09-04T16:02:00.000Z',
    detail: {
      provider: 'paypal', leadId: lead.id, riskKey: 'paypal-dispute:PP-D-1', status: 'OPEN',
      outcome: 'UNDER_REVIEW', providerEventId: 'WH-DISPUTE-1', observedAt: '2026-09-04T16:02:00.000Z'
    }
  });
  const truth = reconcilePaymentRenewalTruth({ lead, leadId: lead.id, ...rows });
  assert.equal(truth.ok, false);
  assert.equal(truth.stages.PAYMENT_RETAINED.status, 'REVIEW_REQUIRED');
  assert.ok(truth.contradictions.includes('provider-payment-retention-risk-unresolved'));
  const sprint = createLeadPathSprint({
    customerRef: 'customer:paypal-1', paymentLeadId: lead.id, canonicalPaymentTruth: truth,
    at: '2026-09-04T16:03:00.000Z'
  });
  assert.equal(sprint.ok, false);
});

test('a later seller-favorable dispute resolution clears only the dispute risk, not the payment witnesses', () => {
  const rows = witnesses();
  rows.auditLog.push(
    { id: 'risk-open', type: 'payment_retention_risk', createdAt: '2026-09-04T16:02:00.000Z', detail: { provider: 'paypal', leadId: lead.id, riskKey: 'paypal-dispute:PP-D-1', status: 'OPEN', outcome: 'UNDER_REVIEW' } },
    { id: 'risk-resolved', type: 'payment_retention_risk', createdAt: '2026-09-04T16:04:00.000Z', detail: { provider: 'paypal', leadId: lead.id, riskKey: 'paypal-dispute:PP-D-1', status: 'RESOLVED', outcome: 'RESOLVED_SELLER_FAVOUR' } }
  );
  const truth = reconcilePaymentRenewalTruth({ lead, leadId: lead.id, ...rows });
  assert.equal(truth.ok, true);
  assert.equal(truth.stages.PAYMENT_RETAINED.status, 'PROVEN');
  assert.equal(truth.economics.unresolvedPaymentRetentionRiskCount, 0);
});
