// The bridge between a probe and Ubercel's evidence, and the upgrades it refuses.
//
// A real probe existed -- /api/health returning 200 against the live Render
// deployment -- and it lived in a handoff document as a sentence, so the doctor
// went on reporting UNKNOWN__ONLY_PROVIDER_BADGES. Prose is not a signal. What
// this must never do while fixing that is turn a probe into more than it is.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recordHealthObservation,
  normalizeHealthContract,
  observationAge
} from '../src/ubercel-health-evidence.mjs';

const CONTRACT = { authenticatedHealthRef: 'https://uberbondd.onrender.com/api/health', expectedStatus: 200 };
const OBSERVED = '2026-09-17T16:46:59.098Z';

const observation = (overrides = {}) => ({
  healthContract: CONTRACT,
  probe: { url: CONTRACT.authenticatedHealthRef, status: 200 },
  observedAt: OBSERVED,
  sourceRef: 'handoff:final live probe',
  observedBy: 'deployment session',
  adapterType: 'OTHER_REPLACEABLE',
  provider: 'render',
  ...overrides
});

test('a probe matching the declared contract becomes contract-bound evidence', () => {
  const result = recordHealthObservation(observation());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CONTRACT_BOUND_HEALTH_SIGNAL');
  assert.equal(result.signal.contractBound, true);
  assert.equal(result.signal.serving, true);
  assert.equal(result.signal.evidenceClass, 'AUTHENTICATED_HEALTH');
  assert.equal(result.signal.deploymentAuthority, 'NONE');
});

test('a 200 from a URL nobody declared is recorded and establishes nothing', () => {
  // The upgrade that must not happen. A success against some other endpoint is
  // still an observation worth keeping, but it is not evidence about the service
  // the contract names.
  const result = recordHealthObservation(observation({
    probe: { url: 'https://example.test/health', status: 200 }
  }));
  assert.equal(result.ok, true);
  assert.equal(result.status, 'OBSERVATION_RECORDED_NOT_CONTRACT_BOUND');
  assert.equal(result.signal.contractBound, false);
  assert.equal(result.signal.serving, false, 'an unbound success must not read as serving');
  assert.equal(result.signal.unboundReason, 'probe-url-is-not-the-declared-health-ref');
});

test('the right URL with the wrong status does not bind either', () => {
  const result = recordHealthObservation(observation({
    probe: { url: CONTRACT.authenticatedHealthRef, status: 503 }
  }));
  assert.equal(result.signal.contractBound, false);
  assert.equal(result.signal.serving, false);
  assert.equal(result.signal.unboundReason, 'probe-status-is-not-the-declared-expected-status');
});

test('with no contract declared, nothing can bind', () => {
  const result = recordHealthObservation(observation({ healthContract: null }));
  assert.equal(result.signal.contractBound, false);
  assert.equal(result.signal.unboundReason, 'no-health-contract-declared');
});

test('an observation with no observer is refused', () => {
  // Without an observer, a recorded probe cannot later be told apart from one
  // this repository invented.
  const result = recordHealthObservation(observation({ observedBy: null }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('observer-identity-required'));
});

test('an observation with no time is refused, because it can never be aged', () => {
  for (const when of [null, '', 'whenever']) {
    const result = recordHealthObservation(observation({ observedAt: when }));
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('observation-time-required'), `observedAt ${JSON.stringify(when)} must be refused`);
  }
});

test('a probe with no status or no url is refused rather than assumed healthy', () => {
  assert.ok(recordHealthObservation(observation({ probe: { url: CONTRACT.authenticatedHealthRef } }))
    .reasonCodes.includes('probe-status-required'));
  assert.ok(recordHealthObservation(observation({ probe: { status: 200 } }))
    .reasonCodes.includes('probe-url-required'));
});

test('an undeclared adapter type is refused', () => {
  const result = recordHealthObservation(observation({ adapterType: 'FLY_IO' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('declared-adapter-type-required'));
});

test('a half-declared health contract is not a contract', () => {
  assert.equal(normalizeHealthContract({ authenticatedHealthRef: 'https://x.test/health' }).ok, false);
  assert.equal(normalizeHealthContract({ expectedStatus: 200 }).ok, false);
  assert.equal(normalizeHealthContract(CONTRACT).ok, true);
});

test('age is reported as unknown rather than zero when the time cannot be read', () => {
  // Returning 0 would make an unreadable observation look brand new.
  assert.deepEqual(observationAge({ observedAt: 'nonsense' }), { known: false, ageMs: null });
  const known = observationAge({ observedAt: OBSERVED }, new Date('2026-09-17T17:46:59.098Z'));
  assert.equal(known.known, true);
  assert.equal(known.ageMs, 3600000);
});

test('the recorder makes no network call of its own', () => {
  // It converts an observation somebody else made. If it probed, running it
  // would manufacture the evidence it records.
  const before = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('the recorder must not probe'); };
  try {
    assert.equal(recordHealthObservation(observation()).ok, true);
  } finally {
    globalThis.fetch = before;
  }
});
