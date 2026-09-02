import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCanonicalSprintPaymentTruth, createLeadPathSprint, advanceLeadPathSprint } from '../src/lead-path-sprint-fulfillment.mjs';
import { evaluateFirstCashCanary } from '../src/first-cash-canary-guard.mjs';

const canonicalTruth = {
  ok:true,
  policyVersion:'payment-renewal-truth-1.6.0',
  truthDigest:'a'.repeat(64),
  leadId:'lead-customer-1',
  status:'PROVIDER_CLEARED_PAYMENT_PROVEN',
  stages:{ CLEARED_PAYMENT:{ status:'PROVEN' }, PAYMENT_RETAINED:{ status:'PROVEN' } },
  verifiedProviderEventRefs:['order_created:evt-450'],
  contradictions:[],
  economics:{
    netProviderClearedRevenueCents:45000,
    currency:'USD',
    verifiedPaymentCount:1,
    verifiedRenewalCount:0,
    verifiedReversalCount:0,
    unverifiedReversalCents:0,
    reversedRevenueCents:0
  }
};

const create = (truth = canonicalTruth, overrides = {}) => createLeadPathSprint({
  customerRef:'customer-1',
  paymentLeadId:'lead-customer-1',
  canonicalPaymentTruth:truth,
  at:'2026-09-02T01:10:00.000Z',
  ...overrides
});

test('first-cash fulfilment consumes one exact canonical three-witness payment reconciliation instead of a parallel summary', () => {
  const out = validateCanonicalSprintPaymentTruth(canonicalTruth, { paymentLeadId:'lead-customer-1' });
  assert.equal(out.ok, true);
  assert.match(out.canonicalTruthRef, /^payment-truth:[a-f0-9]{64}$/);
});

test('pending, contradicted, refunded, wrong amount, wrong currency, unverified, aggregated, renewal, and unbound canonical truth cannot start paid fulfilment', () => {
  const mutations = [
    { status:'NO_CLEARED_PAYMENT_PROVEN' },
    { contradictions:['provider-payment-witness-amount-mismatch'] },
    { economics:{ ...canonicalTruth.economics, reversedRevenueCents:45000, netProviderClearedRevenueCents:0, verifiedReversalCount:1 } },
    { economics:{ ...canonicalTruth.economics, netProviderClearedRevenueCents:44999 } },
    { economics:{ ...canonicalTruth.economics, currency:'EUR' } },
    { economics:{ ...canonicalTruth.economics, verifiedPaymentCount:0 }, verifiedProviderEventRefs:[] },
    // Previously this was accepted because only the net total and >=1 count were checked.
    { economics:{ ...canonicalTruth.economics, verifiedPaymentCount:2 }, verifiedProviderEventRefs:['order_created:a','order_created:b'] },
    { economics:{ ...canonicalTruth.economics, verifiedPaymentCount:2, verifiedRenewalCount:1 }, verifiedProviderEventRefs:['order_created:a','subscription_payment_success:b'] },
    { leadId:'lead-someone-else' },
    { truthDigest:null },
    { policyVersion:'synthetic-payment-summary-v1' },
    { stages:{ ...canonicalTruth.stages, PAYMENT_RETAINED:{ status:'PARTIALLY_REVERSED' } } }
  ];
  for (const mutation of mutations) {
    const truth = { ...canonicalTruth, ...mutation };
    const result = create(truth);
    assert.equal(result.ok, false, JSON.stringify(mutation));
  }
});

test('missing requested lead binding cannot unlock fulfilment even with otherwise valid totals', () => {
  const result = createLeadPathSprint({
    customerRef:'customer-1',
    canonicalPaymentTruth:canonicalTruth,
    at:'2026-09-02T01:10:00.000Z'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('payment-lead-id-required'));
});

test('exact one-event canonical $450 USD retained truth can compile paid sprint without creating accepted delivery', () => {
  const result = create();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PAID');
  assert.equal(result.paymentLeadId, 'lead-customer-1');
  assert.equal(result.commercialDeliveryCount, 0);
  assert.match(result.canonicalPaymentTruthRef, /^payment-truth:[a-f0-9]{64}$/);
});

test('customer silence cannot be promoted through support to COMPLETE or accepted delivery', () => {
  let sprint = create();
  assert.equal(sprint.ok, true);
  for (const [to, extra] of [
    ['INPUT_READY',{}],
    ['ANALYSIS_RUNNING',{}],
    ['QA_REQUIRED',{}],
    ['QA_PASSED',{qaEvidenceRef:'qa:pass'}],
    ['DELIVERY_READY',{}],
    ['DELIVERED',{artifactRefs:['artifact:report-1']}],
    ['CUSTOMER_SILENT',{}]
  ]) {
    const out = advanceLeadPathSprint({ state:sprint.state || sprint, to, at:'2026-09-02T01:10:00.000Z', ...extra });
    assert.equal(out.ok, true, `${to}: ${JSON.stringify(out.reasonCodes)}`);
    sprint = out.state;
  }
  assert.equal(sprint.status, 'CUSTOMER_SILENT');
  assert.equal(sprint.commercialDeliveryCount, 0);
  const illegal = advanceLeadPathSprint({ state:sprint, to:'SUPPORT_WINDOW', at:'2026-09-02T01:10:00.000Z' });
  assert.equal(illegal.ok, false);
  assert.equal(sprint.fulfillmentState.economicTruth.acceptedDelivery, false);
});

test('customer acceptance requires customer-origin evidence with canonical referent', () => {
  let sprint = create();
  for (const [to, extra] of [
    ['INPUT_READY',{}], ['ANALYSIS_RUNNING',{}], ['QA_REQUIRED',{}], ['QA_PASSED',{qaEvidenceRef:'qa:pass'}],
    ['DELIVERY_READY',{}], ['DELIVERED',{artifactRefs:['artifact:report-1']}]
  ]) {
    const out = advanceLeadPathSprint({ state:sprint.state || sprint, to, at:'2026-09-02T01:10:00.000Z', ...extra });
    assert.equal(out.ok, true);
    sprint = out.state;
  }
  const fake = advanceLeadPathSprint({
    state:sprint,
    to:'CUSTOMER_ACCEPTED',
    evidence:{ evidenceClass:'EXTERNAL_CUSTOMER', origin:'CUSTOMER', evidenceRef:'synthetic-acceptance' },
    at:'2026-09-02T01:10:00.000Z'
  });
  assert.equal(fake.ok, false);
  assert.equal(fake.state.commercialDeliveryCount, 0);

  const real = advanceLeadPathSprint({
    state:sprint,
    to:'CUSTOMER_ACCEPTED',
    evidence:{ evidenceClass:'EXTERNAL_CUSTOMER', origin:'CUSTOMER', evidenceRef:'customer:acceptance-1' },
    at:'2026-09-02T01:10:00.000Z'
  });
  assert.equal(real.ok, true);
  assert.equal(real.state.commercialDeliveryCount, 1);
  assert.equal(real.state.fulfillmentState.economicTruth.acceptedDelivery, true);
});

test('five qualified conversations without paid pilot forces kill-or-rethink and sixth is violation', () => {
  const four = evaluateFirstCashCanary({ qualifiedConversations:4, paidPilots:0 });
  assert.equal(four.status, 'CANARY_OPEN');
  assert.equal(four.mayOpenAnotherQualifiedConversation, true);
  assert.equal(four.remainingBeforeReview, 1);

  const five = evaluateFirstCashCanary({ qualifiedConversations:5, paidPilots:0 });
  assert.equal(five.status, 'KILL_OR_RETHINK');
  assert.equal(five.mayOpenAnotherQualifiedConversation, false);

  const six = evaluateFirstCashCanary({ qualifiedConversations:6, paidPilots:0 });
  assert.equal(six.ok, false);
  assert.equal(six.status, 'CANARY_VIOLATION');
  assert.equal(six.requiredAction, 'KILL_OR_RETHINK');
});

test('a real paid pilot changes canary state without pretending future retention', () => {
  const state = evaluateFirstCashCanary({ qualifiedConversations:3, paidPilots:1 });
  assert.equal(state.status, 'PAID_PILOT_PROVEN');
  assert.equal(state.mayOpenAnotherQualifiedConversation, true);
});
