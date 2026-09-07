import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFounderMinuteActions } from '../src/founder-minute-priority.mjs';

test('legacy static checkout configuration never appears as a founder action', () => {
  const actions = deriveFounderMinuteActions({ paymentAttention: {}, outbound: null, revenue: null });
  assert.equal(actions.length, 1);
  assert.match(actions[0].action, /No binding action required/);
  assert.doesNotMatch(JSON.stringify(actions), /Configure checkout/);
  assert.match(actions[0].expectedValue, /Avoids founder time/);
});

test('real payment ambiguity outranks automated recovery work', () => {
  const actions = deriveFounderMinuteActions({
    paymentAttention: { attentionRequired: 2, reviewRequired: 1, anomalousPending: 1, expectedPending: 9 },
    outbound: { staleRecoveryPreview: { wouldRecover: 3, wouldQuarantine: 1 } }
  });
  assert.equal(actions.length, 2);
  assert.match(actions[0].action, /Review 2 payment event/);
  assert.match(actions[1].action, /reservation recovery sweep/);
  assert.equal(actions[0].cost, 'None');
  assert.equal(actions[1].cost, 'None');
});

test('expected pending telemetry alone cannot create founder work', () => {
  const actions = deriveFounderMinuteActions({
    paymentAttention: { attentionRequired: 0, reviewRequired: 0, anomalousPending: 0, expectedPending: 500 }
  });
  assert.equal(actions.length, 1);
  assert.match(actions[0].action, /No binding action required/);
});

test('malformed and negative counts fail closed to zero work rather than fake urgency', () => {
  const actions = deriveFounderMinuteActions({
    paymentAttention: { attentionRequired: -7, reviewRequired: 'secret-value' },
    outbound: { staleRecoveryPreview: { wouldRecover: -2, wouldQuarantine: 'n/a' } }
  });
  assert.equal(actions.length, 1);
  assert.match(actions[0].action, /No binding action required/);
  assert.doesNotMatch(JSON.stringify(actions), /secret-value/);
});

test('queue remains bounded even when both actionable classes are present', () => {
  const actions = deriveFounderMinuteActions({
    paymentAttention: { attentionRequired: 100, reviewRequired: 100 },
    outbound: { staleRecoveryPreview: { wouldRecover: 100, wouldQuarantine: 100 } }
  });
  assert.ok(actions.length <= 3);
});
