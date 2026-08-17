import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { classifyPaymentEvent, PAYMENT_TRUTH_POLICY_VERSION } from '../src/payments.mjs';
import {
  normalizeCommercialOutcome,
  logCommercialOutcome,
  COMMERCIAL_OUTCOME_POLICY_VERSION
} from '../src/commercial-outcome.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const referenceDate = new Date('2026-08-18T10:00:00.000Z');

function paymentDecision(eventName = 'order_created') {
  const event = {
    eventId: 'provider-event-1', eventName,
    custom: { lead_id: 'lead-1', prospect_id: 'opp-1', product: 'full' },
    amountCents: 4900, currency: 'USD', status: 'paid'
  };
  const decision = classifyPaymentEvent({ event, lead: { id: 'lead-1', prospectId: 'opp-1' }, cfg: {} });
  return { ...decision, providerEventId: event.eventId, amountCents: event.amountCents, currency: event.currency };
}

function baseOutcome(overrides = {}) {
  return {
    eventId: 'outcome-event-1', outcomeType: 'PAYMENT_CLEARED', occurredAt: referenceDate.toISOString(),
    signalId: 'sig-1', opportunityId: 'opp-1', experimentId: 'exp-1', channelId: 'partner-1',
    providerEventId: 'provider-event-1', amountCents: 4900, currency: 'USD', ownerMinutes: 20,
    contributionMarginCents: 4200, ...overrides
  };
}

test('records cleared payment only when the existing payment truth decision proves it', () => {
  const result = normalizeCommercialOutcome({ outcome: baseOutcome(), paymentDecision: paymentDecision(), date: referenceDate });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'RECORDED_CLEARED_PAYMENT');
  assert.equal(result.truthLevel, 'CLEARED_PAYMENT');
  assert.equal(result.paymentProof.paymentPolicyVersion, PAYMENT_TRUTH_POLICY_VERSION);
  assert.equal(result.paymentProof.amountCents, 4900);
  assert.equal(result.lineage.opportunityId, 'opp-1');
  assert.equal(result.externalEffectLedger.productionMutations, 0);
});

test('a payment-looking outcome without provider proof is rejected', () => {
  const decision = paymentDecision();
  delete decision.providerEventId;
  const result = normalizeCommercialOutcome({
    outcome: baseOutcome({ providerEventId: '' }), paymentDecision: decision, date: referenceDate
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('provider-event-proof-required'));
});

test('missing or non-cleared payment classifications cannot create revenue truth', () => {
  const missing = normalizeCommercialOutcome({ outcome: baseOutcome(), date: referenceDate });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('payment-truth-decision-required'));

  const lifecycle = normalizeCommercialOutcome({ outcome: baseOutcome(), paymentDecision: paymentDecision('subscription_updated'), date: referenceDate });
  assert.equal(lifecycle.ok, false);
  assert.ok(lifecycle.reasonCodes.includes('cleared-payment-classification-required'));
});

test('payment type must agree with the payment classifier', () => {
  const result = normalizeCommercialOutcome({
    outcome: baseOutcome({ outcomeType: 'RENEWAL_CLEARED' }), paymentDecision: paymentDecision(), date: referenceDate
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('subscription-payment-classification-required'));
});

test('non-payment outcomes are recorded as observations, never revenue', () => {
  const result = normalizeCommercialOutcome({
    outcome: { eventId: 'obs-1', outcomeType: 'DELIVERY_ACCEPTED', occurredAt: referenceDate.toISOString(), opportunityId: 'opp-1', experimentId: 'exp-1' },
    date: referenceDate
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'RECORDED_NON_REVENUE_OUTCOME');
  assert.equal(result.truthLevel, 'OBSERVED_OUTCOME');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'paymentProof'), false);
});

test('amounts on non-payment outcomes require explicit payment proof', () => {
  const result = normalizeCommercialOutcome({
    outcome: { eventId: 'obs-2', outcomeType: 'CHECKOUT_STARTED', occurredAt: referenceDate.toISOString(), opportunityId: 'opp-1', amountCents: 4900 },
    date: referenceDate
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('revenue-proof-required'));
});

test('refund and dispute-like outcomes cannot silently become negative revenue', () => {
  const refund = normalizeCommercialOutcome({
    outcome: { eventId: 'refund-1', outcomeType: 'REFUND', occurredAt: referenceDate.toISOString(), opportunityId: 'opp-1', amountCents: 4900, currency: 'USD' },
    date: referenceDate
  });
  assert.equal(refund.ok, false);
  assert.ok(refund.reasonCodes.includes('refund-dispute-proof-required'));
});

test('invalid lineage and unknown outcome types fail closed', () => {
  const missing = normalizeCommercialOutcome({ outcome: { eventId: 'x', outcomeType: 'DELIVERY_ACCEPTED' }, date: referenceDate });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('opportunity-lineage-required'));

  const unknown = normalizeCommercialOutcome({ outcome: { eventId: 'x', outcomeType: 'MAGIC_REVENUE', opportunityId: 'opp-1' }, date: referenceDate });
  assert.equal(unknown.ok, false);
  assert.match(unknown.reasonCodes[0], /unknown-outcome-type/);
});

test('audit logging reuses auditLog and excludes raw webhook data', async () => {
  const calls = [];
  const result = normalizeCommercialOutcome({ outcome: baseOutcome(), paymentDecision: paymentDecision(), date: referenceDate });
  const receipt = await logCommercialOutcome({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-1' }; } }, result);
  assert.deepEqual(receipt, { id: 'audit-1' });
  assert.equal(calls[0].type, 'commercial_outcome');
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'payload'), false);
  assert.equal(calls[0].detail.policyVersion, COMMERCIAL_OUTCOME_POLICY_VERSION);
});

test('queue handler records only a normalized local outcome', async () => {
  const calls = [];
  const handlers = createJobHandlers({ store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-queue' }; } }, cfg: {} });
  const result = await handlers['prometheus.outcome.record']({ outcome: baseOutcome(), paymentDecision: paymentDecision(), date: referenceDate });
  assert.equal(result.status, 'RECORDED_CLEARED_PAYMENT');
  assert.equal(calls[0].type, 'commercial_outcome');
});

test('outcome normalizer has no provider or filesystem boundary of its own', async () => {
  const source = await fs.readFile(new URL('../src/commercial-outcome.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
