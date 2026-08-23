import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFounderAbsenceReadiness } from '../src/founder-absence-readiness.mjs';

const NAMES = [
  'durableState','scheduler','agentRelay','agentWorkers','boundedBudgets','staleRecovery',
  'truthReceipts','killSwitch','paymentObservation','deliveryObservation','ownerEscalationQueue'
];

function liveCapabilities() {
  return Object.fromEntries(NAMES.map(name => [name, {
    status: 'VERIFIED_LIVE',
    evidenceRefs: [`receipt:${name}`],
    externallyVerified: true
  }]));
}

function proof(overrides = {}) {
  return {
    observedFrom: '2026-08-15T12:00:00.000Z',
    observedThrough: '2026-08-22T12:00:00.000Z',
    freshnessAt: '2026-08-22T12:00:00.000Z',
    successfulTicks: 168,
    failedTicks: 2,
    recoveredTicks: 2,
    unauthorizedEffects: 0,
    openDeadLetters: 0,
    sourceCommit: 'abc123',
    policyVersions: ['mesh-policy-1'],
    ...overrides
  };
}

const COMMON = {
  capabilities: liveCapabilities(),
  currentSourceCommit: 'abc123',
  currentPolicyVersions: ['mesh-policy-1'],
  now: new Date('2026-08-22T12:30:00.000Z')
};

test('one-hour proof cannot certify seven-day founder absence', () => {
  const result = evaluateFounderAbsenceReadiness({
    ...COMMON,
    targetDays: 7,
    observationProof: proof({
      observedFrom: '2026-08-22T11:00:00.000Z',
      observedThrough: '2026-08-22T12:00:00.000Z',
      successfulTicks: 2
    })
  });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('observation-window-shorter-than-target-days'));
});

test('sufficient fresh repeated proof can satisfy Kilimanjaro duration gate', () => {
  const result = evaluateFounderAbsenceReadiness({ ...COMMON, targetDays: 7, observationProof: proof() });
  assert.equal(result.status, 'KILIMANJARO_READY');
  assert.equal(result.observationProof.valid, true);
});

test('raising targetDays can make identical evidence insufficient', () => {
  const fourDayProof = proof({
    observedFrom: '2026-08-18T12:00:00.000Z',
    successfulTicks: 96
  });
  const shortTarget = evaluateFounderAbsenceReadiness({ ...COMMON, targetDays: 3, observationProof: fourDayProof });
  const longTarget = evaluateFounderAbsenceReadiness({ ...COMMON, targetDays: 7, observationProof: fourDayProof });
  assert.equal(shortTarget.status, 'KILIMANJARO_READY');
  assert.notEqual(longTarget.status, 'KILIMANJARO_READY');
});

test('old source identity invalidates otherwise sufficient proof', () => {
  const result = evaluateFounderAbsenceReadiness({
    ...COMMON,
    targetDays: 7,
    observationProof: proof({ sourceCommit: 'old456' })
  });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('proof-source-commit-mismatch'));
});

test('stale proof invalidates otherwise sufficient observation window', () => {
  const result = evaluateFounderAbsenceReadiness({
    ...COMMON,
    targetDays: 7,
    now: new Date('2026-08-23T12:30:00.000Z'),
    observationProof: proof()
  });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('proof-stale'));
});

test('unauthorized effects or unresolved dead letters fail closed regardless of score', () => {
  const effects = evaluateFounderAbsenceReadiness({ ...COMMON, targetDays: 7, observationProof: proof({ unauthorizedEffects: 1 }) });
  const deadLetters = evaluateFounderAbsenceReadiness({ ...COMMON, targetDays: 7, observationProof: proof({ openDeadLetters: 1 }) });
  assert.notEqual(effects.status, 'KILIMANJARO_READY');
  assert.notEqual(deadLetters.status, 'KILIMANJARO_READY');
  assert.ok(effects.observationProof.reasonCodes.includes('unauthorized-effects-observed'));
  assert.ok(deadLetters.observationProof.reasonCodes.includes('open-dead-letters-present'));
});

test('failed ticks must be fully recovered before readiness', () => {
  const result = evaluateFounderAbsenceReadiness({ ...COMMON, targetDays: 7, observationProof: proof({ failedTicks: 3, recoveredTicks: 2 }) });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('unrecovered-failed-ticks-present'));
});

test('proof without explicit bounded counters and identity cannot certify readiness', () => {
  const result = evaluateFounderAbsenceReadiness({ ...COMMON, targetDays: 7, observationProof: {} });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('observation-start-required'));
  assert.ok(result.observationProof.reasonCodes.includes('proof-source-commit-required'));
});

test('caller cannot omit current source identity and still certify Kilimanjaro readiness', () => {
  const result = evaluateFounderAbsenceReadiness({
    capabilities: liveCapabilities(),
    targetDays: 7,
    observationProof: proof(),
    currentPolicyVersions: ['mesh-policy-1'],
    now: COMMON.now
  });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('current-source-commit-required'));
});

test('caller cannot omit current policy identity and still certify Kilimanjaro readiness', () => {
  const result = evaluateFounderAbsenceReadiness({
    capabilities: liveCapabilities(),
    targetDays: 7,
    observationProof: proof(),
    currentSourceCommit: 'abc123',
    now: COMMON.now
  });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('current-policy-versions-required'));
});

test('observation window cannot extend materially into the future', () => {
  const result = evaluateFounderAbsenceReadiness({
    ...COMMON,
    targetDays: 7,
    observationProof: proof({
      observedFrom: '2026-08-15T13:00:00.000Z',
      observedThrough: '2026-08-22T13:00:01.000Z',
      freshnessAt: '2026-08-22T12:30:00.000Z'
    })
  });
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('observation-end-in-future'));
});
