import test from 'node:test';
import assert from 'node:assert/strict';
import { FRONTIER_LOOP_STAGES, verifyFrontierLoop } from '../src/frontier-loop-proof.mjs';
import { verifyAbsorptionClaim } from '../src/frontier-absorption-proof.mjs';

const now = '2026-09-03T02:10:00.000Z';

function completeLoop() {
  return FRONTIER_LOOP_STAGES.map((stage, index) => ({
    stage,
    observedAt: now,
    evidenceRef: `evidence:${index}`,
    artifactRef: `artifact:${index}`
  }));
}

test('complete ordered frontier loop is evidenced', () => {
  const result = verifyFrontierLoop(completeLoop());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'FRONTIER_LOOP_EVIDENCED');
  assert.equal(result.promotionAuthority, 'NONE');
});

test('missing reality judge cannot masquerade as a complete loop', () => {
  const stages = completeLoop().filter(item => item.stage !== 'REALITY_JUDGE');
  const result = verifyFrontierLoop(stages);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FRONTIER_LOOP_INCOMPLETE');
});

test('cloned requires reproduced baseline behavior', () => {
  const result = verifyAbsorptionClaim({
    claimedLevel: 'CLONED',
    targetFeature: 'plan mode',
    baselineVersion: 'reference@1',
    candidateVersion: 'uberbond@1',
    behaviorEvidence: [{
      behavior: 'plan freezes execution until approval',
      baselineResult: 'execution-blocked',
      candidateResult: 'execution-started',
      evidenceRef: 'receipt:clone-1',
      observedAt: now
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('clone-not-demonstrated'));
});

test('identical baseline and candidate revisions cannot prove absorption', () => {
  const result = verifyAbsorptionClaim({
    claimedLevel: 'CLONED',
    targetFeature: 'checkpoint resume',
    baselineVersion: 'same@1',
    candidateVersion: 'same@1',
    behaviorEvidence: [{
      behavior: 'resume continues from saved checkpoint',
      baselineResult: 'resumes-at-step-4',
      candidateResult: 'resumes-at-step-4',
      evidenceRef: 'receipt:clone-2',
      observedAt: now
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('distinct-versions-required'));
});

test('duplicate behavior evidence references fail closed', () => {
  const result = verifyAbsorptionClaim({
    claimedLevel: 'PARITY',
    targetFeature: 'checkpoint resume',
    baselineVersion: 'reference@1',
    candidateVersion: 'uberbond@1',
    behaviorEvidence: [
      { behavior: 'resume state', baselineResult: 'ok', candidateResult: 'ok', evidenceRef: 'receipt:dup', observedAt: now },
      { behavior: 'resume cursor', baselineResult: 'ok', candidateResult: 'ok', evidenceRef: 'receipt:dup', observedAt: now }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('unique-behavior-evidence-required'));
});

test('parity requires behavior-level equality', () => {
  const result = verifyAbsorptionClaim({
    claimedLevel: 'PARITY',
    targetFeature: 'checkpoint resume',
    baselineVersion: 'reference@1',
    candidateVersion: 'uberbond@1',
    behaviorEvidence: [{
      behavior: 'resume continues from saved checkpoint',
      baselineResult: 'resumes-at-step-4',
      candidateResult: 'restarts-at-step-1',
      evidenceRef: 'receipt:checkpoint-1',
      observedAt: now
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('parity-not-demonstrated'));
});

test('superior requires parity plus directional metric wins', () => {
  const result = verifyAbsorptionClaim({
    claimedLevel: 'SUPERIOR',
    targetFeature: 'artifact-first completion',
    baselineVersion: 'reference@1',
    candidateVersion: 'uberbond@1',
    behaviorEvidence: [{
      behavior: 'completion requires artifact receipt',
      baselineResult: 'receipt-required',
      candidateResult: 'receipt-required',
      evidenceRef: 'receipt:artifact-1',
      observedAt: now
    }],
    superiorityMetrics: [{
      metric: 'founder_minutes',
      baseline: 8,
      candidate: 5,
      direction: 'LOWER_BETTER',
      evidenceRef: 'benchmark:minutes-1'
    }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ABSORPTION_EVIDENCED');
});

test('superiority cannot reuse behavior receipt as metric evidence', () => {
  const result = verifyAbsorptionClaim({
    claimedLevel: 'SUPERIOR',
    targetFeature: 'artifact-first completion',
    baselineVersion: 'reference@1',
    candidateVersion: 'uberbond@1',
    behaviorEvidence: [{
      behavior: 'completion requires artifact receipt',
      baselineResult: 'receipt-required',
      candidateResult: 'receipt-required',
      evidenceRef: 'receipt:shared',
      observedAt: now
    }],
    superiorityMetrics: [{
      metric: 'founder_minutes',
      baseline: 8,
      candidate: 5,
      direction: 'LOWER_BETTER',
      evidenceRef: 'receipt:shared'
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('unique-metric-evidence-required'));
});

test('fake superiority without a metric win fails closed', () => {
  const result = verifyAbsorptionClaim({
    claimedLevel: 'SUPERIOR',
    targetFeature: 'context meter',
    baselineVersion: 'reference@1',
    candidateVersion: 'uberbond@1',
    behaviorEvidence: [{
      behavior: 'reports context pressure',
      baselineResult: 'pressure-reported',
      candidateResult: 'pressure-reported',
      evidenceRef: 'receipt:context-1',
      observedAt: now
    }],
    superiorityMetrics: [{
      metric: 'founder_minutes',
      baseline: 5,
      candidate: 7,
      direction: 'LOWER_BETTER',
      evidenceRef: 'benchmark:minutes-2'
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('superiority-not-demonstrated'));
});
