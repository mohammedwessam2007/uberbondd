import test from 'node:test';
import assert from 'node:assert/strict';

import {
  profileCognitiveHotPaths,
  assessSemanticPage,
  recordFrontierThoughtCapital,
  compareCounterfactualRoutes,
  proposeSuperoptimizationCandidate,
  assessSuperoptimizationPromotion,
  computeFrontierResidualRatio
} from '../src/cognitive-superoptimizer.mjs';

const sha = char => char.repeat(64);

test('hot-path profiler prioritizes repeated expensive frontier cognition without granting authority', () => {
  const events = [
    { semanticIdentity: 'classify evidence sufficiency', taskArchetype: 'research', qualityType: 'Q_FRONTIER', backend: 'FRONTIER_CROWN', costUsd: 0.2, frontierCostUsd: 0.2, latencyMs: 500, reuseCount: 3, futureCallsAvoided: 2 },
    { semanticIdentity: 'classify evidence sufficiency', taskArchetype: 'research', qualityType: 'Q_FRONTIER', backend: 'FRONTIER_CROWN', costUsd: 0.25, frontierCostUsd: 0.25, latencyMs: 600, reuseCount: 4, futureCallsAvoided: 4 },
    { semanticIdentity: 'one-off novel synthesis', taskArchetype: 'research', qualityType: 'Q_FRONTIER', backend: 'FRONTIER_CROWN', costUsd: 2, frontierCostUsd: 2, latencyMs: 3000 }
  ];
  const out = profileCognitiveHotPaths({ events, minimumOccurrences: 2, implementationCostUsd: 0.1, migrationRiskWeight: 100 });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.hotPaths.length, 1);
  assert.equal(out.hotPaths[0].semanticIdentity, 'classify evidence sufficiency');
  assert.equal(out.promotionAuthority, 'NONE');
});

test('semantic page faults on source change, Crown succession, expiry, drift, or revocation', () => {
  const base = {
    pageId: 'page-1',
    qualityType: 'Q_CERTIFIED_BOUNDED',
    sourceStateDigest: sha('a'),
    crownRevision: 'crown@1',
    applicabilityDomain: 'bounded research triage',
    expiresAt: '2026-10-01T00:00:00.000Z'
  };
  const resident = assessSemanticPage({
    page: base,
    currentSourceStateDigest: sha('a'),
    currentCrownRevision: 'crown@1',
    currentTime: '2026-09-29T12:00:00.000Z'
  });
  assert.equal(resident.status, 'SEMANTIC_PAGE_RESIDENT');

  const fault = assessSemanticPage({
    page: { ...base, driftDetected: true },
    currentSourceStateDigest: sha('b'),
    currentCrownRevision: 'crown@2',
    currentTime: '2026-10-02T00:00:00.000Z'
  });
  assert.equal(fault.status, 'SEMANTIC_PAGE_FAULT');
  assert.ok(fault.invalidators.includes('SOURCE_STATE_CHANGED'));
  assert.ok(fault.invalidators.includes('CROWN_SUCCESSION_REVALIDATION_REQUIRED'));
  assert.ok(fault.invalidators.includes('PAGE_EXPIRED'));
  assert.ok(fault.invalidators.includes('REALITY_DRIFT_DETECTED'));
  assert.equal(fault.action, 'DECOMPILE_AND_ESCALATE_TO_REQUIRED_FRONTIER');
});

test('Frontier Thought Capital measures realized reuse rather than verbosity', () => {
  const out = recordFrontierThoughtCapital({
    frontierCallId: 'fc-1',
    taskArchetype: 'research',
    costUsd: 0.5,
    novelDecisionIds: ['d1', 'd2'],
    spawnedJevCandidateIds: ['j1'],
    spawnedCodeCandidateIds: ['c1'],
    futureReferenceCostAvoidedUsd: 12,
    realizedReferenceCostAvoidedUsd: 4,
    authorizedConsumers: 20
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.realizedRoi, 8);
  assert.equal(out.projectedRoi, 24);
  assert.equal(out.semanticReuseMultiplicity, 20);
  assert.match(out.asset.assetDigest, /^sha256:[a-f0-9]{64}$/);
});

test('counterfactual route market makes quality regret dominate cheaper lower-quality routes', () => {
  const out = compareCounterfactualRoutes({
    chosen: { quality: 1, costUsd: 1, latencyMs: 1000 },
    alternatives: [
      { routeId: 'cheap-worse', quality: 0.99, costUsd: 0.01, latencyMs: 100 },
      { routeId: 'equal-cheaper', quality: 1, costUsd: 0.5, latencyMs: 1200 }
    ]
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.bestAlternative.label, 'equal-cheaper');
  assert.equal(out.qualityRegret, 0);
  assert.ok(out.costRegretUsd > 0);
});

test('superoptimizer candidate is shadow-only and has no self-promotion authority', () => {
  const out = proposeSuperoptimizationCandidate({
    candidateArchitectureId: 'arch-v2',
    parentArchitectureId: 'arch-v1',
    mutations: ['COMMON_SEMANTIC_SUBEXPRESSION_ELIMINATION', 'FRONTIER_OUTPUT_MINIMIZATION'],
    expectedCostReductionUsd: 5,
    expectedLatencyReductionMs: 1000,
    affectedQualityTypes: ['Q_FRONTIER']
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'SUPEROPTIMIZATION_CANDIDATE_SHADOW_ONLY');
  assert.equal(out.promotionAuthority, 'NONE');
  assert.ok(out.requiredEvidence.includes('canonical zero-loss certificate'));
});

test('promotion assessment fails closed without a live canonical zero-loss certificate', () => {
  const candidate = proposeSuperoptimizationCandidate({
    candidateArchitectureId: 'arch-v2',
    parentArchitectureId: 'arch-v1',
    mutations: ['PARTIAL_EVALUATION'],
    expectedCostReductionUsd: 1,
    affectedQualityTypes: ['Q_FRONTIER']
  }).candidate;
  const out = assessSuperoptimizationPromotion({
    candidate,
    zeroLossCertificate: { fake: true },
    observedAllInCostUsd: 1,
    parentAllInCostUsd: 2,
    minimumTaskCount: 100
  });
  assert.equal(out.ok, true);
  assert.equal(out.eligible, false);
  assert.equal(out.status, 'SUPEROPTIMIZATION_REMAINS_SHADOW');
  assert.equal(out.automaticPromotionAuthorized, false);
});

test('frontier residual ratio makes compression measurable without implying quality proof', () => {
  const out = computeFrontierResidualRatio({
    directBaselineFrontierUsd: 10,
    compiledFrontierUsd: 2
  });
  assert.equal(out.ok, true);
  assert.equal(out.frontierResidualRatio, 0.2);
  assert.equal(out.referenceCompressionFactor, 5);
  assert.match(out.interpretation, /PAIRED_FINAL_QUALITY/);
});
