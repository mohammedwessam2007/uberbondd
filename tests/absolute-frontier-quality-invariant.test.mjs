import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
  certifyPairedZeroLoss,
  qualityInvariantAttestation,
  validateAbsoluteFrontierQualityPolicy,
  validateQualityInvariantAttestation
} from '../src/absolute-frontier-quality-invariant.mjs';

function trial(id, outcomes, overrides = {}) {
  const correct = outcomes.filter(row => row.outcome === 'CORRECT').length;
  const incorrect = outcomes.filter(row => row.outcome === 'INCORRECT').length;
  return {
    architectureId: id,
    suiteVersion: 'zero-loss-v1',
    corpusDigest: 'a'.repeat(64),
    manifestDigest: 'b'.repeat(64),
    taskClass: 'reasoning',
    taskOutcomeDigest: id.repeat(64).slice(0, 64),
    pairedTaskOutcomes: outcomes,
    statistics: {
      verifiedSuccessRate: correct / outcomes.length,
      falsePositiveRate: incorrect / outcomes.length
    },
    arenaTrial: {
      processScore: 1
    },
    economics: {
      meanCostUsd: id === 'baseline' ? 1 : 0.1
    },
    ...overrides
  };
}

test('absolute quality policy accepts only zero delta, high-confidence, non-degraded frontier operation', () => {
  const ok = validateAbsoluteFrontierQualityPolicy({});
  assert.equal(ok.ok, true);
  assert.equal(ok.qualityDelta, 0);

  const slack = validateAbsoluteFrontierQualityPolicy({ qualityDelta: 1e-12 });
  assert.equal(slack.ok, false);
  assert.ok(slack.reasonCodes.includes('absolute-frontier-quality-delta-must-be-zero'));

  const weakEvidence = validateAbsoluteFrontierQualityPolicy({ minimumEvidenceConfidence: 0.949999 });
  assert.equal(weakEvidence.ok, false);
  assert.ok(weakEvidence.reasonCodes.includes('absolute-frontier-minimum-evidence-confidence-not-met'));

  const degraded = validateAbsoluteFrontierQualityPolicy({ allowDegradedCouncil: true });
  assert.equal(degraded.ok, false);
  assert.ok(degraded.reasonCodes.includes('absolute-frontier-degraded-council-prohibited'));
});

test('quality attestation is self-consistent and any mutation is refused', () => {
  const attestation = qualityInvariantAttestation();
  assert.equal(attestation.policyDigest, ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST);
  assert.equal(validateQualityInvariantAttestation(attestation).ok, true);

  for (const forged of [
    { ...attestation, qualityDelta: 0.000001 },
    { ...attestation, degradedCouncilAllowed: true },
    { ...attestation, policyDigest: 'f'.repeat(64) },
    { ...attestation, uncertaintyFallback: 'CHEAPEST_AVAILABLE' }
  ]) {
    assert.equal(validateQualityInvariantAttestation(forged).ok, false);
  }
});

test('paired zero-loss certification accepts a strict superset of baseline successes at lower cost', () => {
  const baseline = trial('baseline', [
    { taskId: 'a', outcome: 'CORRECT' },
    { taskId: 'b', outcome: 'ABSTAINED' },
    { taskId: 'c', outcome: 'INCORRECT' }
  ]);
  const candidate = trial('candidate', [
    { taskId: 'a', outcome: 'CORRECT' },
    { taskId: 'b', outcome: 'CORRECT' },
    { taskId: 'c', outcome: 'ABSTAINED' }
  ]);
  const out = certifyPairedZeroLoss({ baselineTrial: baseline, candidateTrial: candidate, requireEconomicsImprovement: true });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'PAIRED_ZERO_LOSS_CERTIFIED');
  assert.equal(out.regressions.length, 0);
  assert.equal(out.economicsImproved, true);
});

test('same aggregate score with swapped errors is a regression and cannot be called equivalent', () => {
  const baseline = trial('baseline', [
    { taskId: 'a', outcome: 'CORRECT' },
    { taskId: 'b', outcome: 'CORRECT' },
    { taskId: 'c', outcome: 'INCORRECT' },
    { taskId: 'd', outcome: 'INCORRECT' }
  ]);
  const candidate = trial('candidate', [
    { taskId: 'a', outcome: 'CORRECT' },
    { taskId: 'b', outcome: 'INCORRECT' },
    { taskId: 'c', outcome: 'CORRECT' },
    { taskId: 'd', outcome: 'INCORRECT' }
  ]);
  const out = certifyPairedZeroLoss({ baselineTrial: baseline, candidateTrial: candidate });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('paired-task-regression-detected'));
  assert.deepEqual(out.regressions, [{ taskId: 'b', baseline: 'CORRECT', candidate: 'INCORRECT' }]);
});
