import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcilePaymentRenewalTruth,
  PAYMENT_RENEWAL_TRUTH_VERSION
} from '../src/payment-renewal-truth.mjs';

const lead = { id: 'lead_1', prospectId: 'pros_1', paymentStatus: 'paid' };

function clearedFixture({
  eventName = 'order_created',
  eventId = 'evt_1',
  amountCents = 4900,
  classification = 'CLEARED_ONE_TIME_PAYMENT',
  createdAt = '2026-08-22T10:00:00.000Z'
} = {}) {
  return {
    order: {
      id: `order_${eventId}`,
      provider: 'lemonsqueezy',
      providerEventId: eventId,
      eventName,
      leadId: lead.id,
      prospectId: lead.prospectId,
      amountCents,
      currency: 'USD',
      status: 'paid',
      createdAt
    },
    audit: {
      type: 'payment_classification',
      classification,
      eventName,
      eventId,
      leadId: lead.id,
      prospectId: lead.prospectId,
      policyVersion: 'payment-truth-1.0.0',
      timestamp: createdAt
    },
    revenue: {
      id: `rev_${eventId}`,
      providerEventId: `${eventName}:${eventId}`,
      leadId: lead.id,
      prospectId: lead.prospectId,
      product: eventName.startsWith('subscription_') ? 'monitoring' : 'full',
      kind: eventName.startsWith('subscription_') ? 'subscription' : 'sale',
      amountCents,
      currency: 'USD',
      createdAt
    }
  };
}

test('manual paid flag plus positive revenue row is never treated as cleared payment proof', () => {
  const result = reconcilePaymentRenewalTruth({
    lead,
    orders: [],
    auditLog: [],
    revenueEvents: [{
      id: 'rev_manual', providerEventId: 'rev_manual', leadId: lead.id,
      product: 'full', kind: 'sale', amountCents: 4900, currency: 'USD',
      createdAt: '2026-08-22T09:00:00.000Z'
    }]
  });

  assert.equal(result.policyVersion, PAYMENT_RENEWAL_TRUTH_VERSION);
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.equal(result.economics.unverifiedPositiveRevenueCents, 4900);
  assert.ok(result.contradictions.includes('lead-marked-paid-without-provider-cleared-proof'));
  assert.ok(result.contradictions.includes('positive-revenue-row-without-provider-cleared-proof'));
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  assert.equal(result.externalEffectLedger.paymentMutations, 0);
});

test('payment is proven only when order, cleared classification, and ledger row bind to the same provider event', () => {
  const fixture = clearedFixture();
  const result = reconcilePaymentRenewalTruth({
    lead,
    orders: [fixture.order],
    auditLog: [fixture.audit],
    revenueEvents: [fixture.revenue]
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 4900);
  assert.equal(result.economics.unverifiedPositiveRevenueCents, 0);
  assert.deepEqual(result.verifiedProviderEventRefs, ['order_created:evt_1']);
});

test('missing any one of the three durable proof views fails closed', () => {
  const fixture = clearedFixture({ eventId: 'evt_missing_order' });
  const result = reconcilePaymentRenewalTruth({
    lead,
    orders: [],
    auditLog: [fixture.audit],
    revenueEvents: [fixture.revenue]
  });

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.ok(result.contradictions.includes('positive-revenue-row-without-provider-cleared-proof'));
});

test('subscription_updated can never masquerade as a renewal even if a positive ledger row exists', () => {
  const fixture = clearedFixture({
    eventName: 'subscription_updated',
    eventId: 'metadata_only',
    amountCents: 9900,
    classification: 'SUBSCRIPTION_LIFECYCLE_UPDATE'
  });
  const result = reconcilePaymentRenewalTruth({
    lead,
    orders: [fixture.order],
    auditLog: [fixture.audit],
    revenueEvents: [fixture.revenue]
  });

  assert.equal(result.stages.SECOND_PAYMENT_OR_RENEWAL.status, 'NOT_PROVEN');
  assert.equal(result.economics.verifiedRenewalCount, 0);
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.equal(result.economics.unverifiedPositiveRevenueCents, 9900);
});

test('a genuine subscription_payment_success is proven as renewal only with matching provider evidence', () => {
  const initial = clearedFixture({
    eventName: 'subscription_created', eventId: 'sub_initial', amountCents: 9900,
    classification: 'CLEARED_SUBSCRIPTION_PAYMENT', createdAt: '2026-07-22T10:00:00.000Z'
  });
  const renewal = clearedFixture({
    eventName: 'subscription_payment_success', eventId: 'sub_renewal', amountCents: 9900,
    classification: 'CLEARED_SUBSCRIPTION_PAYMENT', createdAt: '2026-08-22T10:00:00.000Z'
  });
  const result = reconcilePaymentRenewalTruth({
    lead,
    orders: [initial.order, renewal.order],
    auditLog: [initial.audit, renewal.audit],
    revenueEvents: [initial.revenue, renewal.revenue]
  });

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(result.stages.SECOND_PAYMENT_OR_RENEWAL.status, 'PROVEN');
  assert.equal(result.economics.verifiedPaymentCount, 2);
  assert.equal(result.economics.verifiedRenewalCount, 1);
  assert.equal(result.economics.providerClearedRevenueCents, 19800);
});

test('customer acceptance requires the external customer evidence event, not an accepted boolean alone', () => {
  const fixture = clearedFixture();
  const fulfillment = {
    deliveredAt: '2026-08-22T11:00:00.000Z',
    artifactRefs: ['artifact:delivery_1'],
    acceptedAt: '2026-08-22T12:00:00.000Z',
    acceptanceEvidenceRef: 'customer:accept_1',
    economicTruth: { acceptedDelivery: true },
    eventLog: []
  };
  const result = reconcilePaymentRenewalTruth({
    lead,
    orders: [fixture.order],
    auditLog: [fixture.audit],
    revenueEvents: [fixture.revenue],
    fulfillment
  });

  assert.equal(result.stages.DELIVERY_RECEIPT.status, 'PROVEN');
  assert.equal(result.stages.CUSTOMER_ACCEPTED.status, 'NOT_PROVEN');
  assert.ok(result.contradictions.includes('accepted-delivery-flag-without-external-customer-proof'));
});

test('customer acceptance becomes proven only with a matching EXTERNAL_CUSTOMER event', () => {
  const fixture = clearedFixture();
  const fulfillment = {
    deliveredAt: '2026-08-22T11:00:00.000Z',
    artifactRefs: ['artifact:delivery_1'],
    acceptedAt: '2026-08-22T12:00:00.000Z',
    acceptanceEvidenceRef: 'customer:accept_1',
    economicTruth: { acceptedDelivery: true },
    eventLog: [{
      eventId: 'accept_event_1',
      type: 'CUSTOMER_ACCEPTED',
      evidenceClass: 'EXTERNAL_CUSTOMER',
      evidenceRef: 'customer:accept_1'
    }]
  };
  const result = reconcilePaymentRenewalTruth({
    lead,
    orders: [fixture.order],
    auditLog: [fixture.audit],
    revenueEvents: [fixture.revenue],
    fulfillment
  });

  assert.equal(result.stages.CUSTOMER_ACCEPTED.status, 'PROVEN');
  assert.equal(result.claimBoundary.customerAcceptance, 'EXTERNAL_CUSTOMER_EVIDENCE_PRESENT');
});

test('truth digest is deterministic for identical frozen evidence', () => {
  const fixture = clearedFixture();
  const input = { lead, orders: [fixture.order], auditLog: [fixture.audit], revenueEvents: [fixture.revenue] };
  const first = reconcilePaymentRenewalTruth(input);
  const second = reconcilePaymentRenewalTruth(input);
  assert.equal(first.truthDigest, second.truthDigest);
});
