import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLiveSprintPaymentEvidence, createLeadPathSprint } from '../src/lead-path-sprint-fulfillment.mjs';
import { evaluateFirstCashCanary } from '../src/first-cash-canary-guard.mjs';

const livePayment = {
  evidenceClass:'EXTERNAL_PAYMENT',
  origin:'PROVIDER',
  environment:'LIVE',
  cleared:true,
  economicEligible:true,
  amount:'450.00',
  currency:'USD',
  evidenceRef:'payment:provider:receipt-1',
  provider:'paypal',
  providerEventRef:'provider-event:1',
  orderRef:'order:1',
  settlementRef:'settlement:1'
};

test('live $450 USD payment requires three distinct provider witnesses', () => {
  assert.equal(validateLiveSprintPaymentEvidence(livePayment).ok, true);
  const missing = validateLiveSprintPaymentEvidence({ ...livePayment, settlementRef:'' });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('three-payment-witnesses-required'));
  const duplicate = validateLiveSprintPaymentEvidence({ ...livePayment, settlementRef:'order:1' });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.reasonCodes.includes('payment-witnesses-must-be-distinct'));
});

test('sandbox, synthetic, fixtures, pending, wrong amount, and wrong currency cannot start paid fulfilment', () => {
  const mutations = [
    { environment:'SANDBOX' },
    { origin:'SYNTHETIC' },
    { origin:'TEST_FIXTURE' },
    { cleared:false },
    { amount:'449.99' },
    { currency:'EUR' },
    { economicEligible:false }
  ];
  for (const mutation of mutations) {
    const result = createLeadPathSprint({ customerRef:'customer-1', paymentEvidence:{ ...livePayment, ...mutation }, at:'2026-09-02T01:10:00.000Z' });
    assert.equal(result.ok, false, JSON.stringify(mutation));
  }
});

test('valid provider-origin live payment can compile paid sprint without creating accepted delivery', () => {
  const result = createLeadPathSprint({ customerRef:'customer-1', paymentEvidence:livePayment, at:'2026-09-02T01:10:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PAID');
  assert.equal(result.commercialDeliveryCount, 0);
  assert.deepEqual(result.paymentWitnessRefs, ['provider-event:1','order:1','settlement:1']);
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
