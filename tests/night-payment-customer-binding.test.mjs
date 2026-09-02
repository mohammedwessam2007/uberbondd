import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalPaymentTruthDigest,
  createLeadPathSprint,
  advanceLeadPathSprint
} from '../src/lead-path-sprint-fulfillment.mjs';

const baseTruth = {
  ok:true,
  policyVersion:'payment-renewal-truth-1.6.0',
  leadId:'lead-customer-1',
  status:'PROVIDER_CLEARED_PAYMENT_PROVEN',
  // The cleared-payment stage must name the same provider event the truth
  // claims, or the two halves are describing different payments.
  stages:{ CLEARED_PAYMENT:{ status:'PROVEN', evidenceRef:'payment:order_created:evt-450' }, PAYMENT_RETAINED:{ status:'PROVEN' } },
  verifiedProviderEventRefs:['order_created:evt-450'],
  verifiedFirstPaymentProduct:'lead-path-revenue-leak-evidence-sprint-usd-450',
  contradictions:[],
  economics:{
    netProviderClearedRevenueCents:45000,
    currency:'USD',
    verifiedPaymentCount:1,
    verifiedRenewalCount:0,
    verifiedReversalCount:0,
    unverifiedReversalCents:0,
    reversedRevenueCents:0
  },
  claimBoundary:{
    leadPaidBoolean:'NOT_PAYMENT_PROOF',
    revenueEventRow:'NOT_PAYMENT_PROOF_ALONE',
    clearedPayment:'SIGNED_PROVIDER_CALLBACK_PLUS_CLEARED_CLASSIFICATION_PLUS_LEDGER_MATCH',
    paymentProduct:'THREE_WITNESS_PRODUCT_MATCH',
    customerAcceptance:'NOT_PROVEN',
    renewal:'NOT_PROVEN',
    retainedRevenue:'PROVIDER_CLEARED_AND_NOT_REVERSED'
  }
};
const canonicalPaymentTruth = { ...baseTruth, truthDigest: canonicalPaymentTruthDigest(baseTruth) };

function deliveredSprint() {
  let sprint = createLeadPathSprint({
    customerRef:'customer-1',
    paymentLeadId:'lead-customer-1',
    canonicalPaymentTruth,
    at:'2026-09-02T04:10:00.000Z'
  });
  assert.equal(sprint.ok, true);
  for (const [to, extra] of [
    ['INPUT_READY',{}],
    ['ANALYSIS_RUNNING',{}],
    ['QA_REQUIRED',{}],
    ['QA_PASSED',{qaEvidenceRef:'qa:pass'}],
    ['DELIVERY_READY',{}],
    ['DELIVERED',{artifactRefs:['artifact:report-1']}]
  ]) {
    const out = advanceLeadPathSprint({ state:sprint.state || sprint, to, at:'2026-09-02T04:10:00.000Z', ...extra });
    assert.equal(out.ok, true, `${to}: ${JSON.stringify(out.reasonCodes)}`);
    sprint = out.state;
  }
  return sprint;
}

test('acceptance from a different customer cannot prove accepted delivery', () => {
  const sprint = deliveredSprint();
  const out = advanceLeadPathSprint({
    state:sprint,
    to:'CUSTOMER_ACCEPTED',
    evidence:{
      evidenceClass:'EXTERNAL_CUSTOMER',
      origin:'CUSTOMER',
      customerRef:'customer-2',
      evidenceRef:'customer:acceptance-from-wrong-customer'
    },
    at:'2026-09-02T04:10:00.000Z'
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('customer-bound-external-acceptance-evidence-required'));
  assert.equal(out.state.commercialDeliveryCount, 0);
  assert.equal(out.state.fulfillmentState.economicTruth.acceptedDelivery, false);
});

test('acceptance without explicit customer binding cannot prove accepted delivery', () => {
  const sprint = deliveredSprint();
  const out = advanceLeadPathSprint({
    state:sprint,
    to:'CUSTOMER_ACCEPTED',
    evidence:{
      evidenceClass:'EXTERNAL_CUSTOMER',
      origin:'CUSTOMER',
      evidenceRef:'customer:unbound-acceptance'
    },
    at:'2026-09-02T04:10:00.000Z'
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('customer-bound-external-acceptance-evidence-required'));
});

test('acceptance bound to the sprint customer can prove accepted delivery', () => {
  const sprint = deliveredSprint();
  const out = advanceLeadPathSprint({
    state:sprint,
    to:'CUSTOMER_ACCEPTED',
    evidence:{
      evidenceClass:'EXTERNAL_CUSTOMER',
      origin:'CUSTOMER',
      customerRef:'customer-1',
      evidenceRef:'customer:acceptance-1'
    },
    at:'2026-09-02T04:10:00.000Z'
  });
  assert.equal(out.ok, true, JSON.stringify(out.reasonCodes));
  assert.equal(out.state.commercialDeliveryCount, 1);
  assert.equal(out.state.fulfillmentState.economicTruth.acceptedDelivery, true);
});

test('rejection from a different customer is rejected too', () => {
  const sprint = deliveredSprint();
  const out = advanceLeadPathSprint({
    state:sprint,
    to:'CUSTOMER_REJECTED',
    evidence:{
      evidenceClass:'EXTERNAL_CUSTOMER',
      origin:'CUSTOMER',
      customerRef:'customer-2',
      evidenceRef:'customer:rejection-from-wrong-customer'
    },
    at:'2026-09-02T04:10:00.000Z'
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('customer-bound-external-rejection-evidence-required'));
});
