import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcilePaymentRenewalTruth,
  canonicalPaymentFacts,
  isTestModeWitness,
  TEST_MODE_WITNESS_REFUSED
} from '../src/payment-renewal-truth.mjs';
import { normalizeCommercialOutcome } from '../src/commercial-outcome.mjs';
import { classifyPaymentEvent, PAYMENT_TRUTH_POLICY_VERSION } from '../src/payments.mjs';

const AT = '2026-08-22T10:00:00.000Z';
const LEAD = { id: 'lead_1', prospectId: 'pros_1', paymentStatus: 'open' };

// The three witness rows for one provider event, as RevenueEngine writes them.
// Markers are passed per row so a test can put a test-mode flag on exactly one witness.
function witness({
  eventId = 'evt_real_1',
  eventName = 'order_created',
  amountCents = 4900,
  revenueAmountCents = amountCents,
  classification = 'CLEARED_ONE_TIME_PAYMENT',
  orderMarks = {},
  auditMarks = {},
  revenueMarks = {}
} = {}) {
  const providerEventId = `${eventName}:${eventId}`;
  return {
    order: {
      id: `order_${eventId}`, provider: 'lemonsqueezy', providerEventId: eventId, eventName,
      leadId: LEAD.id, prospectId: LEAD.prospectId, product: 'full', amountCents, currency: 'USD',
      status: 'paid', createdAt: AT, ...orderMarks
    },
    audit: {
      type: 'payment_classification', classification, eventName, eventId,
      leadId: LEAD.id, prospectId: LEAD.prospectId, amountCents, currency: 'USD',
      policyVersion: PAYMENT_TRUTH_POLICY_VERSION, timestamp: AT, ...auditMarks
    },
    revenue: {
      id: `rev_${eventId}`, providerEventId, leadId: LEAD.id, prospectId: LEAD.prospectId,
      product: 'full', kind: 'sale', amountCents: revenueAmountCents, currency: 'USD',
      createdAt: AT, ...revenueMarks
    }
  };
}

function reconcile(rows, { lead = LEAD } = {}) {
  return reconcilePaymentRenewalTruth({
    lead,
    orders: rows.map(row => row.order),
    auditLog: rows.map(row => row.audit),
    revenueEvents: rows.map(row => row.revenue)
  });
}

test('a real witness is still proven and reconciles exactly as before', () => {
  const result = reconcile([witness({ eventId: 'evt_real_1' })]);

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(result.stages.CLEARED_PAYMENT.reason, undefined, 'a real payment carries no refusal reason');
  assert.deepEqual(result.verifiedProviderEventRefs, ['order_created:evt_real_1']);
  assert.equal(result.economics.providerClearedRevenueCents, 4900);
  assert.deepEqual(result.contradictions, []);
  assert.deepEqual(result.refusedTestModeEventRefs, []);
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
});

test('a real witness with an explicit production environment is still proven', () => {
  const result = reconcile([witness({
    orderMarks: { testMode: false, environment: 'production' },
    auditMarks: { testMode: false, environment: 'production' }
  })]);

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 4900);
  assert.deepEqual(result.refusedTestModeEventRefs, []);
});

test('a test-mode order witness is refused, not proven, and never summed', () => {
  const result = reconcile([witness({ eventId: 'evt_test_1', orderMarks: { testMode: true } })]);

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.stages.CLEARED_PAYMENT.reason, TEST_MODE_WITNESS_REFUSED);
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.equal(result.economics.providerClearedRevenue, 0);
  assert.deepEqual(result.verifiedProviderEventRefs, []);
  assert.deepEqual(result.refusedTestModeEventRefs, ['order_created:evt_test_1']);
  assert.ok(result.contradictions.includes('test-mode-payment-witness-refused'));
  assert.equal(result.ok, false, 'a refused test witness is flagged for review, not silently dropped');
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.externalEffectLedger.paymentMutations, 0);
});

test('a test-mode audit (clearing) witness is refused even when the order is real', () => {
  const result = reconcile([witness({ eventId: 'evt_test_2', auditMarks: { testMode: true } })]);

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.deepEqual(result.refusedTestModeEventRefs, ['order_created:evt_test_2']);
});

test('a test-mode revenue row with real order and audit witnesses is refused', () => {
  const result = reconcile([witness({ eventId: 'evt_test_3', revenueMarks: { testMode: true } })]);

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.deepEqual(result.refusedTestModeEventRefs, ['order_created:evt_test_3']);
});

test('sandbox and test environments refuse the proof on any witness, case-insensitively', () => {
  const sandboxOrder = reconcile([witness({ eventId: 'evt_env_1', orderMarks: { environment: 'sandbox' } })]);
  const testAudit = reconcile([witness({ eventId: 'evt_env_2', auditMarks: { environment: 'test' } })]);
  const upperRevenue = reconcile([witness({ eventId: 'evt_env_3', revenueMarks: { environment: 'SANDBOX' } })]);

  for (const result of [sandboxOrder, testAudit, upperRevenue]) {
    assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
    assert.equal(result.economics.providerClearedRevenueCents, 0);
    assert.equal(result.stages.CLEARED_PAYMENT.reason, TEST_MODE_WITNESS_REFUSED);
  }
});

test('a test-mode witness beside a real witness counts only the real one', () => {
  const result = reconcile([
    witness({ eventId: 'evt_real_2' }),
    witness({ eventId: 'evt_test_4', orderMarks: { testMode: true } })
  ]);

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(result.stages.CLEARED_PAYMENT.reason, undefined, 'a real payment is proven, so no refusal reason is attached');
  assert.equal(result.economics.providerClearedRevenueCents, 4900, 'only the real 49.00 is cleared');
  assert.deepEqual(result.verifiedProviderEventRefs, ['order_created:evt_real_2']);
  assert.deepEqual(result.refusedTestModeEventRefs, ['order_created:evt_test_4']);
  assert.equal(result.status, 'REVIEW_REQUIRED', 'the refused witness is flagged for review');
});

test('a test-mode refund witness is not subtracted from real cleared revenue', () => {
  const result = reconcile([
    witness({ eventId: 'evt_real_3' }),
    witness({
      eventId: 'evt_refund_1', eventName: 'order_refunded', amountCents: 4900,
      revenueAmountCents: -4900, classification: 'REFUND_OR_DISPUTE', orderMarks: { testMode: true }
    })
  ]);

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 4900);
  assert.equal(result.economics.reversedRevenueCents, 0, 'a test-mode refund must not reduce real money');
  assert.equal(result.economics.netProviderClearedRevenueCents, 4900);
  assert.deepEqual(result.verifiedReversalEventRefs, []);
  assert.deepEqual(result.refusedTestModeEventRefs, ['order_refunded:evt_refund_1']);
  assert.ok(result.contradictions.includes('test-mode-payment-witness-refused'));
});

test('the test-unlock path, which writes only a positive revenue row, is flagged REVIEW_REQUIRED', () => {
  // Mirrors revenue.unlockLead() under allowTestUnlock: a revenue row with a `test_` event id,
  // no order row and no audit row, and the lead patched to paid with provider `test`.
  const paidLead = { id: 'lead_1', prospectId: 'pros_1', paymentStatus: 'paid', provider: 'test' };
  const result = reconcilePaymentRenewalTruth({
    lead: paidLead,
    orders: [],
    auditLog: [],
    revenueEvents: [{
      id: 'rev_test_unlock', providerEventId: 'test_unlock_0001', leadId: 'lead_1', prospectId: 'pros_1',
      product: 'full', kind: 'sale', amountCents: 4900, currency: 'USD', createdAt: AT
    }]
  });

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.contradictions.includes('positive-revenue-row-without-provider-cleared-proof'));
  assert.ok(result.contradictions.includes('lead-marked-paid-without-provider-cleared-proof'));
});

test('a test-unlock payment carrying a provider=test order and a cleared audit row is still not proven', () => {
  // Provider `test` is not a payment witness provider, so the order cannot bind the event.
  const result = reconcile([witness({
    eventId: 'test_unlock_0002',
    orderMarks: { provider: 'test', testMode: false }
  })], { lead: { ...LEAD, paymentStatus: 'paid' } });

  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.equal(result.status, 'REVIEW_REQUIRED');
});

test('canonicalPaymentFacts admits no cleared-payment event and no paid lead for a test-mode witness', () => {
  const rows = witness({ eventId: 'evt_test_5', orderMarks: { testMode: true } });
  const facts = canonicalPaymentFacts({
    leads: [{ ...LEAD, paymentStatus: 'paid' }],
    orders: [rows.order],
    auditLog: [rows.audit],
    revenueEvents: [rows.revenue],
    now: Date.parse('2026-09-01T00:00:00.000Z')
  });

  assert.deepEqual(facts.events, []);
  assert.deepEqual(facts.paidLeadIds, []);
});

test('isTestModeWitness reads only explicit test markers', () => {
  assert.equal(isTestModeWitness({ testMode: true }), true);
  assert.equal(isTestModeWitness({ testMode: 'TRUE' }), true);
  assert.equal(isTestModeWitness({ environment: 'Sandbox' }), true);
  assert.equal(isTestModeWitness({ environment: ' test ' }), true);

  assert.equal(isTestModeWitness({ testMode: false }), false);
  assert.equal(isTestModeWitness({ testMode: 0 }), false);
  assert.equal(isTestModeWitness({ environment: 'production' }), false);
  assert.equal(isTestModeWitness({}), false, 'a missing marker is not evidence of a test');
  assert.equal(isTestModeWitness(null), false);
  assert.equal(isTestModeWitness('sandbox'), false);
});

function realDecision(overrides = {}) {
  return classifyPaymentEvent({
    event: {
      eventId: 'evt_real_9', eventName: 'order_created', amountCents: 4900, currency: 'USD',
      status: 'paid', testMode: false, custom: { lead_id: 'lead_1', prospect_id: 'pros_1', product: 'full' },
      ...overrides
    },
    lead: LEAD,
    cfg: { revenue: { fullAuditPrice: 49 } }
  });
}

// classifyPaymentEvent returns no amount or currency, so the outcome supplies them.
function paymentOutcome(overrides = {}) {
  return {
    eventId: 'evt_real_9', outcomeType: 'PAYMENT_CLEARED', opportunityId: 'opp_1',
    providerEventId: 'order_created:evt_real_9', amountCents: 4900, currency: 'USD', ...overrides
  };
}

test('commercial-outcome still records a real cleared payment', () => {
  const decision = realDecision();
  assert.equal(decision.classification, 'CLEARED_ONE_TIME_PAYMENT');

  const result = normalizeCommercialOutcome({ outcome: paymentOutcome(), paymentDecision: decision });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'RECORDED_CLEARED_PAYMENT');
  assert.equal(result.paymentProof.amountCents, 4900);
});

test('commercial-outcome refuses a PAYMENT_CLEARED outcome that carries a test-mode marker', () => {
  const decision = realDecision();
  const result = normalizeCommercialOutcome({
    outcome: paymentOutcome({ testMode: true }),
    paymentDecision: decision
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.reasonCodes, [TEST_MODE_WITNESS_REFUSED]);
  assert.equal(result.outcomeId, undefined, 'a refused outcome produces no recorded outcome id');
  assert.equal(result.externalEffectLedger.spendCents, 0);
  assert.equal(result.externalEffectLedger.productionMutations, 0);
});

test('commercial-outcome refuses a sandbox or test environment on the outcome or the decision', () => {
  const decision = realDecision();
  const sandboxOutcome = normalizeCommercialOutcome({
    outcome: paymentOutcome({ environment: 'sandbox' }), paymentDecision: decision
  });
  const testDecision = normalizeCommercialOutcome({
    outcome: paymentOutcome(), paymentDecision: { ...decision, environment: 'test' }
  });
  const testModeDecision = normalizeCommercialOutcome({
    outcome: paymentOutcome(), paymentDecision: { ...decision, testMode: true }
  });

  for (const result of [sandboxOutcome, testDecision, testModeDecision]) {
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasonCodes, [TEST_MODE_WITNESS_REFUSED]);
  }
});

test('commercial-outcome refuses a REFUND outcome carrying a test-mode marker', () => {
  const refundDecision = {
    policyVersion: PAYMENT_TRUTH_POLICY_VERSION,
    classification: 'REFUND_OR_DISPUTE',
    shouldRecordRevenue: true,
    amountCents: 4900,
    currency: 'USD',
    providerEventId: 'order_refunded:evt_refund_9'
  };
  const real = normalizeCommercialOutcome({
    outcome: { eventId: 'evt_refund_9', outcomeType: 'REFUND', opportunityId: 'opp_1' },
    paymentDecision: refundDecision
  });
  const refused = normalizeCommercialOutcome({
    outcome: { eventId: 'evt_refund_9', outcomeType: 'REFUND', opportunityId: 'opp_1', testMode: true },
    paymentDecision: refundDecision
  });

  assert.equal(real.ok, true, 'a real refund is still recorded');
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, [TEST_MODE_WITNESS_REFUSED]);
});
