import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateFounderAbsenceReadiness,
  classifyObservationTier,
  deriveFounderAbsenceObservationProof,
  FOUNDER_ABSENCE_TIERS
} from '../src/founder-absence-readiness.mjs';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BASE = Date.parse('2026-08-01T00:00:00.000Z');

const ZERO_EXTERNAL = Object.freeze({
  providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
  credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
});

/** `count` healthy terminal receipts, one per hour, on one code identity. */
function healthyReceipts(count, { status = 'ADVANCED', startMs = BASE, stepMs = HOUR } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    phase: 'TERMINAL',
    status,
    startedAt: new Date(startMs + index * stepMs).toISOString(),
    finishedAt: new Date(startMs + index * stepMs + 60_000).toISOString(),
    sourceCommit: 'deadbeefcafe',
    policyVersions: ['agent-mesh-control-plane-1.0.0'],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL }
  }));
}

function proofFrom(receipts, openDeadLetters = 0) {
  const raw = deriveFounderAbsenceObservationProof({ receipts, openDeadLetters });
  return {
    ...raw,
    observedFromMs: raw.observedFrom ? Date.parse(raw.observedFrom) : null,
    observedThroughMs: raw.observedThrough ? Date.parse(raw.observedThrough) : null
  };
}

test('the tier ladder is ordered and strictly increasing in both duration and ticks', () => {
  for (let index = 1; index < FOUNDER_ABSENCE_TIERS.length; index += 1) {
    const previous = FOUNDER_ABSENCE_TIERS[index - 1];
    const current = FOUNDER_ABSENCE_TIERS[index];
    assert.ok(current.minSpanMs >= previous.minSpanMs, `${current.name} span must not regress`);
    assert.ok(current.minSuccessfulTicks >= previous.minSuccessfulTicks, `${current.name} ticks must not regress`);
  }
  assert.equal(FOUNDER_ABSENCE_TIERS[0].name, 'LOCAL_REHEARSAL');
  assert.equal(FOUNDER_ABSENCE_TIERS.at(-1).name, 'FOURTEEN_DAY');
});

test('no history is LOCAL_REHEARSAL, not a silent pass', () => {
  assert.equal(classifyObservationTier({}).tier, 'LOCAL_REHEARSAL');
  assert.equal(classifyObservationTier(proofFrom([])).tier, 'LOCAL_REHEARSAL');
});

test('each tier requires both its duration and its tick count', () => {
  // 200 ticks packed into one hour is 200 ticks and one hour, not seven days.
  const dense = proofFrom(healthyReceipts(200, { stepMs: 18_000 }));
  assert.equal(classifyObservationTier(dense).tier, 'MULTI_TICK');
  // Two ticks a week apart is a week of wall clock and two ticks of evidence.
  const sparse = proofFrom(healthyReceipts(2, { stepMs: 7 * DAY }));
  assert.equal(classifyObservationTier(sparse).tier, 'ONE_REAL_TICK');
});

test('an hourly cadence walks the ladder one rung at a time', () => {
  assert.equal(classifyObservationTier(proofFrom(healthyReceipts(1))).tier, 'ONE_REAL_TICK');
  assert.equal(classifyObservationTier(proofFrom(healthyReceipts(3))).tier, 'MULTI_TICK');
  assert.equal(classifyObservationTier(proofFrom(healthyReceipts(9))).tier, 'OVERNIGHT');
  assert.equal(classifyObservationTier(proofFrom(healthyReceipts(25))).tier, 'ONE_DAY');
  assert.equal(classifyObservationTier(proofFrom(healthyReceipts(73))).tier, 'THREE_DAY');
  assert.equal(classifyObservationTier(proofFrom(healthyReceipts(169))).tier, 'SEVEN_DAY_KILIMANJARO');
  assert.equal(classifyObservationTier(proofFrom(healthyReceipts(337))).tier, 'FOURTEEN_DAY');
});

test('an open dead letter collapses any tier back to LOCAL_REHEARSAL', () => {
  const survived = proofFrom(healthyReceipts(337));
  assert.equal(classifyObservationTier(survived).tier, 'FOURTEEN_DAY');
  const abandoned = proofFrom(healthyReceipts(337), 1);
  assert.equal(classifyObservationTier(abandoned).tier, 'LOCAL_REHEARSAL');
  assert.equal(classifyObservationTier(abandoned).integrityBroken, true);
});

test('an unrecovered failure collapses the tier however long the window is', () => {
  // A failure with no later healthy cycle is never recovered.
  const receipts = [...healthyReceipts(300), ...healthyReceipts(1, { status: 'DEGRADED', startMs: BASE + 400 * HOUR })];
  const proof = proofFrom(receipts);
  assert.ok(proof.failedTicks > proof.recoveredTicks);
  assert.equal(classifyObservationTier(proof).tier, 'LOCAL_REHEARSAL');
});

test('a recovered failure does not collapse the tier', () => {
  const receipts = [
    ...healthyReceipts(100),
    ...healthyReceipts(1, { status: 'DEGRADED', startMs: BASE + 100 * HOUR }),
    ...healthyReceipts(250, { startMs: BASE + 101 * HOUR })
  ];
  const proof = proofFrom(receipts);
  assert.equal(proof.recoveredTicks, proof.failedTicks);
  assert.equal(classifyObservationTier(proof).tier, 'FOURTEEN_DAY');
});

test('an unauthorized external effect collapses the tier', () => {
  const receipts = healthyReceipts(337);
  receipts[10] = { ...receipts[10], externalEffectLedger: { ...ZERO_EXTERNAL, messages: 1 } };
  assert.equal(classifyObservationTier(proofFrom(receipts)).tier, 'LOCAL_REHEARSAL');
});

test('a receipt claiming business-effect authority collapses the tier', () => {
  const receipts = healthyReceipts(337);
  receipts[5] = { ...receipts[5], businessEffectAuthority: 'FULL' };
  assert.equal(classifyObservationTier(proofFrom(receipts)).tier, 'LOCAL_REHEARSAL');
});

test('a reversed observation window cannot mint duration', () => {
  const tier = classifyObservationTier({
    observedFromMs: BASE + 7 * DAY,
    observedThroughMs: BASE,
    successfulTicks: 500,
    failedTicks: 0,
    recoveredTicks: 0,
    unauthorizedEffects: 0,
    openDeadLetters: 0
  });
  assert.equal(tier.tier, 'LOCAL_REHEARSAL');
});

test('readiness reports the proven tier and the next rung to earn', () => {
  const caps = {};
  for (const name of ['durableState','scheduler','agentRelay','agentWorkers','boundedBudgets','staleRecovery','truthReceipts','killSwitch','paymentObservation','deliveryObservation','ownerEscalationQueue']) {
    caps[name] = { status: 'VERIFIED_LIVE', evidenceRefs: [`receipt:${name}`], externallyVerified: true };
  }
  const receipts = healthyReceipts(9);
  const proof = deriveFounderAbsenceObservationProof({ receipts, openDeadLetters: 0 });
  const readiness = evaluateFounderAbsenceReadiness({
    capabilities: caps,
    targetDays: 7,
    observationProof: proof,
    currentSourceCommit: 'deadbeefcafe',
    currentPolicyVersions: ['agent-mesh-control-plane-1.0.0'],
    now: new Date(Date.parse(proof.observedThrough) + HOUR)
  });
  assert.equal(readiness.provenTier, 'OVERNIGHT');
  assert.equal(readiness.nextTier, 'ONE_DAY');
  assert.deepEqual(readiness.nextTierRequires, { minSpanMs: DAY, minSuccessfulTicks: 24 });
  // Eight hours of proof is not seven days of proof, whatever the checklist says.
  assert.notEqual(readiness.status, 'KILIMANJARO_READY');
  assert.ok(readiness.observationProof.reasonCodes.includes('observation-window-shorter-than-target-days'));
});

test('the top rung stops climbing rather than reporting a tier that does not exist', () => {
  const caps = {};
  for (const name of ['durableState','scheduler','agentRelay','agentWorkers','boundedBudgets','staleRecovery','truthReceipts','killSwitch','paymentObservation','deliveryObservation','ownerEscalationQueue']) {
    caps[name] = { status: 'VERIFIED_LIVE', evidenceRefs: [`receipt:${name}`], externallyVerified: true };
  }
  const proof = deriveFounderAbsenceObservationProof({ receipts: healthyReceipts(400), openDeadLetters: 0 });
  const readiness = evaluateFounderAbsenceReadiness({
    capabilities: caps,
    targetDays: 7,
    observationProof: proof,
    currentSourceCommit: 'deadbeefcafe',
    currentPolicyVersions: ['agent-mesh-control-plane-1.0.0'],
    now: new Date(Date.parse(proof.observedThrough) + HOUR)
  });
  assert.equal(readiness.provenTier, 'FOURTEEN_DAY');
  assert.equal(readiness.nextTier, null);
  assert.equal(readiness.nextTierRequires, null);
  assert.equal(readiness.status, 'KILIMANJARO_READY');
});
