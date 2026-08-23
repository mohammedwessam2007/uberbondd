// The premise of founder absence is that if something goes wrong, the founder
// finds out. The readiness proof did not check that.
//
// A probe built a proof that satisfied every dimension -- 900 successful ticks
// over 31 days, zero unauthorized effects, zero dead letters, zero abandoned
// cycles, matching source commit and policy versions, every capability
// VERIFIED_LIVE and externally verified -- and got KILIMANJARO_READY at 100%
// overall, with `nextGate: RUN_OWNER_ABSENCE_CANARY`.
//
// Meanwhile no transport that reaches a human exists in this repository. The
// proof had no dimension that would have noticed, and `ownerEscalationQueue`
// was satisfiable by the queue existing. A queue nobody reads and a queue that
// pages a phone look identical from the inside, and only one of them makes an
// unattended month survivable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFounderAbsenceReadiness, deriveFounderAbsenceObservationProof } from '../src/founder-absence-readiness.mjs';

const NOW = new Date('2026-08-23T12:00:00.000Z');
const REQUIRED = [
  'durableState', 'scheduler', 'agentRelay', 'agentWorkers', 'boundedBudgets', 'staleRecovery',
  'truthReceipts', 'killSwitch', 'paymentObservation', 'deliveryObservation', 'ownerEscalationQueue'
];

function perfectCapabilities() {
  return Object.fromEntries(REQUIRED.map(name =>
    [name, { status: 'VERIFIED_LIVE', evidenceRefs: ['audit:1'], externallyVerified: true }]));
}

function perfectProof(overrides = {}) {
  const through = new Date(NOW.getTime() - 3600000).toISOString();
  return {
    observedFrom: new Date(NOW.getTime() - 31 * 86400000).toISOString(),
    observedThrough: through,
    freshnessAt: through,
    successfulTicks: 900,
    failedTicks: 4,
    recoveredTicks: 4,
    unauthorizedEffects: 0,
    openDeadLetters: 0,
    abandonedCycles: 0,
    undeliveredEscalations: 0,
    sourceCommit: 'deadbeef',
    policyVersions: ['p1'],
    ...overrides
  };
}

function evaluate(proof, capabilities = perfectCapabilities()) {
  return evaluateFounderAbsenceReadiness({
    capabilities,
    targetDays: 30,
    observationProof: proof,
    currentSourceCommit: 'deadbeef',
    currentPolicyVersions: ['p1'],
    now: NOW
  });
}

test('an otherwise flawless month with undelivered escalations is not absence-ready', () => {
  const result = evaluate(perfectProof({ undeliveredEscalations: 1 }));
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('undelivered-escalations-present'));
});

test('omitting the deliverability dimension fails closed rather than reading as zero', () => {
  const proof = perfectProof();
  delete proof.undeliveredEscalations;
  const result = evaluate(proof);
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.observationProof.reasonCodes.includes('undelivered-escalation-count-required'),
    'a missing count must not be assumed to be zero: that is exactly how this passed before');
});

test('the escalation queue now needs external proof, like every other outward claim', () => {
  const capabilities = perfectCapabilities();
  capabilities.ownerEscalationQueue = { status: 'VERIFIED_LIVE', evidenceRefs: ['audit:1'], externallyVerified: false };
  const result = evaluate(perfectProof(), capabilities);
  assert.notEqual(result.status, 'KILIMANJARO_READY');
  assert.ok(result.externalProofMissing.includes('ownerEscalationQueue'),
    'whether a page reached a person is not something this system can attest about itself');
});

test('a complete proof with deliverability satisfied still reaches ready', () => {
  const result = evaluate(perfectProof());
  assert.equal(result.status, 'KILIMANJARO_READY',
    'the gate must be passable on real evidence, or it is a wall rather than a gate');
  assert.equal(result.nextGate, 'RUN_OWNER_ABSENCE_CANARY');
});

test('the derived proof carries the dimension through', () => {
  const derived = deriveFounderAbsenceObservationProof({ receipts: [], undeliveredEscalations: 3 });
  assert.equal(derived.undeliveredEscalations, 3);
  const empty = deriveFounderAbsenceObservationProof({ receipts: [] });
  assert.equal(empty.undeliveredEscalations, 0);
});
