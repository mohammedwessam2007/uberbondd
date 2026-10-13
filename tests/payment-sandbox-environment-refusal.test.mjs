import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPaymentEvent } from '../src/payments.mjs';

// A synthetic or sandbox payment must never classify as cleared cash. The environment marker is checked directly, so it
// holds even when the testMode flag is false and even when test-unlock is enabled for non-production work.

const lead = { id: 'lead-1', prospectId: 'opp-1' };

function event(overrides = {}) {
  return {
    eventId: 'fixture-event-1', eventName: 'order_created',
    custom: { lead_id: 'lead-1', prospect_id: 'opp-1', product: 'full' },
    amountCents: 4900, currency: 'USD', status: 'paid', testMode: false,
    ...overrides
  };
}

const CLEARED = new Set(['CLEARED_ONE_TIME_PAYMENT', 'CLEARED_SUBSCRIPTION_PAYMENT']);

test('a real production event still classifies as cleared (baseline, so the refusal below is meaningful)', () => {
  const decision = classifyPaymentEvent({ event: event(), lead, cfg: {} });
  assert.ok(CLEARED.has(decision.classification), decision.classification);
  assert.equal(decision.shouldRecordRevenue, true);
});

test('a sandbox environment with testMode false is refused and never becomes cleared cash', () => {
  for (const environment of ['sandbox', 'SANDBOX', 'test']) {
    const decision = classifyPaymentEvent({ event: event({ environment }), lead, cfg: {} });
    assert.equal(CLEARED.has(decision.classification), false, environment);
    assert.equal(decision.shouldRecordRevenue, false, environment);
    assert.ok(decision.reasonCodes.includes('sandbox-environment-event-rejected'), environment);
  }
});

test('the test-unlock setting does not turn a sandbox environment into cleared cash', () => {
  const decision = classifyPaymentEvent({ event: event({ environment: 'sandbox', testMode: true }), lead, cfg: { revenue: { allowTestUnlock: true } } });
  assert.equal(CLEARED.has(decision.classification), false);
  assert.equal(decision.shouldRecordRevenue, false);
});

test('a non-production test-unlock event without a sandbox environment keeps its existing behaviour', () => {
  const decision = classifyPaymentEvent({ event: event({ testMode: true }), lead, cfg: { revenue: { allowTestUnlock: true } } });
  assert.ok(!decision.reasonCodes.includes('sandbox-environment-event-rejected'));
});

test('a production environment marker is not refused by the sandbox rule', () => {
  const decision = classifyPaymentEvent({ event: event({ environment: 'production' }), lead, cfg: {} });
  assert.ok(!decision.reasonCodes.includes('sandbox-environment-event-rejected'));
});
