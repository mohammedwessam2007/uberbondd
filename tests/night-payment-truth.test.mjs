import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCanonicalSprintPaymentTruth, createLeadPathSprint } from '../src/lead-path-sprint-fulfillment.mjs';
import { evaluateFirstCashCanary } from '../src/first-cash-canary-guard.mjs';

const canonicalTruth = {
  ok:true,
  status:'PROVIDER_CLEARED_PAYMENT_PROVEN',
  stages:{ CLEARED_PAYMENT:{ status:'PROVEN' } },
  contradictions:[],
  economics:{
    netProviderClearedRevenueCents:45000,
    currency:'USD',
    verifiedPaymentCount:1,
    reversedRevenueCents:0
  }
};

test('first-cash fulfilment consumes canonical three-witness payment reconciliation instead of parallel raw evidence', () => {
  const out = validateCanonicalSprintPaymentTruth(canonicalTruth);
  assert.equal(out.ok, true);
  assert.match(out.canonicalTruthRef, /^payment-truth:[a-f0-9]{64}$/);
});

test('pending, contradicted, refunded, wrong amount, wrong currency, and unverified canonical truth cannot start paid fulfilment', () => {
  const mutations = [
    { status:'NO_CLEARED_PAYMENT_PROVEN' },
    { contradictions:['provider-payment-witness-amount-mismatch'] },
    { economics:{ ...canonicalTruth.economics, reversedRevenueCents:45000, netProviderClearedRevenueCents:0 } },
    { economics:{ ...canonicalTruth.economics, netProviderClearedRevenueCents:44999 } },
    { economics:{ ...canonicalTruth.economics, currency:'EUR' } },
    { economics:{ ...canonicalTruth.economics, verifiedPaymentCount:0 } }
  ];
  for (const mutation of mutations) {
    const truth = { ...canonicalTruth, ...mutation };
    const result = createLeadPathSprint({ customerRef:'customer-1', canonicalPaymentTruth:truth, at:'2026-09-02T01:10:00.000Z' });
    assert.equal(result.ok, false, JSON.stringify(mutation));
  }
});

test('exact canonical $450 USD cleared truth can compile paid sprint without creating accepted delivery', () => {
  const result = createLeadPathSprint({ customerRef:'customer-1', canonicalPaymentTruth:canonicalTruth, at:'2026-09-02T01:10:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PAID');
  assert.equal(result.commercialDeliveryCount, 0);
  assert.match(result.canonicalPaymentTruthRef, /^payment-truth:[a-f0-9]{64}$/);
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
