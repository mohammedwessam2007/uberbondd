import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileMoonshot,
  mapConstraintGenome,
  buildDependencyGraph,
  classifyMoonshotFeasibility,
  chooseMinimumRealityProbe,
  admitExperiment,
  evaluatePromotion,
  scoreRealityLeverage,
  preserveUsefulDescendantsAfterFailure
} from '../src/moonshot-reality-compiler.mjs';

function baseMoonshot() {
  return compileMoonshot({
    id: 'reality-api',
    name: 'Reality API',
    source: 'founder-chat:2026-09-20',
    thesis: 'Expose heterogeneous real-world capabilities behind evidence-bound interfaces.',
    domains: ['infrastructure', 'physical'],
    aliases: ['Physical Cloud'],
    claims: [{
      claimId: 'common-interface',
      statement: 'Heterogeneous physical capabilities can expose a common semantic interface.',
      type: 'INFRASTRUCTURE',
      falsifier: 'No common interface preserves required semantics across two independent providers.',
      feasibility: 'UNKNOWN_NOT_CURRENTLY_FORBIDDEN',
      assumptions: ['Provider capabilities can be described machine-readably.'],
      requiredEvidence: ['Two independent adapters with contract tests.'],
      evidenceRefs: []
    }],
    constraints: [{
      class: 'AUTHORITY',
      description: 'External physical actions require explicit authority.',
      evidenceRefs: ['doc:AGENTS.md']
    }],
    dependencies: [],
    unknowns: ['How broad the shared semantics can be.']
  });
}

test('compilation preserves speculation boundary', () => {
  const result = baseMoonshot();
  assert.equal(result.ok, true);
  assert.equal(result.moonshot.realityState, 'IMAGINED');
  assert.match(result.claimBoundary, /NOT_PROOF/);
});

test('claim requires falsifier', () => {
  const result = compileMoonshot({
    id: 'bad',
    name: 'Bad',
    source: 'test:fixture',
    thesis: 'Unfalsifiable',
    claims: [{ statement: 'Magic works', type: 'PHYSICAL', evidenceRefs: [] }],
    constraints: []
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.includes('falsifier')));
});

test('constraint genome reports unmapped classes as unknown', () => {
  const compiled = baseMoonshot().moonshot;
  const result = mapConstraintGenome({ moonshot: compiled });
  assert.equal(result.ok, true);
  assert.ok(result.unresolvedConstraintClasses.includes('PHYSICS'));
  assert.match(result.claimBoundary, /NOT_ABSENCE/);
});

test('dependency graph detects nearest reachable frontier', () => {
  const result = buildDependencyGraph({
    nodes: [
      { id: 'measurement', state: 'REPRODUCED', requires: [] },
      { id: 'adapter', state: 'IMAGINED', requires: ['measurement'], experimentallyReachable: true },
      { id: 'platform', state: 'IMAGINED', requires: ['adapter'] }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.nearestExperimentFrontier, ['adapter']);
});

test('dependency cycles are rejected', () => {
  const result = buildDependencyGraph({
    nodes: [
      { id: 'a', requires: ['b'] },
      { id: 'b', requires: ['a'] }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('dependency-cycle-prohibited'));
});

test('feasibility conflict does not become success', () => {
  const compiled = baseMoonshot().moonshot;
  const result = classifyMoonshotFeasibility({
    moonshot: compiled,
    assessments: [{
      claimId: 'common-interface',
      feasibility: 'CONFLICTS_WITH_CURRENT_EVIDENCE_OR_LAW',
      evidenceRefs: ['paper:counterexample']
    }]
  });
  assert.equal(result.overall, 'PARTIALLY_OR_FULLY_CONFLICTED');
  assert.deepEqual(result.prohibitedClaimIds, ['common-interface']);
});

test('minimum reality probe favors information with bounded burden', () => {
  const result = chooseMinimumRealityProbe({
    candidates: [
      { id: 'expensive', claimId: 'c1', measurement: 'm', falsifier: 'f', informationGain: 100, cost: 90, risk: 20, irreversibility: 20, delay: 80, authorityReady: true },
      { id: 'small', claimId: 'c1', measurement: 'm', falsifier: 'f', informationGain: 70, cost: 5, risk: 2, irreversibility: 0, delay: 5, authorityReady: true }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.id, 'small');
});

test('external experiment cannot self-authorize', () => {
  const result = admitExperiment({
    probe: { id: 'probe', claimId: 'claim' },
    measurableOutcome: 'Observed result',
    stopConditions: ['stop on unexpected side effect'],
    externalEffects: true,
    authority: 'NONE',
    legalEthicsReady: true,
    rollbackOrContainment: 'isolate'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('owner-authority-required-for-external-effects'));
});

test('external experiment requires containment and legal ethics readiness', () => {
  const result = admitExperiment({
    probe: { id: 'probe', claimId: 'claim' },
    measurableOutcome: 'Observed result',
    stopConditions: ['stop'],
    externalEffects: true,
    authority: 'OWNER_AUTHORIZED'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('legal-ethics-readiness-required-for-external-effects'));
  assert.ok(result.reasonCodes.includes('rollback-or-containment-required'));
});

test('promotion is contiguous and evidence-gated', () => {
  const denied = evaluatePromotion({
    currentState: 'IMAGINED',
    targetState: 'CONSTRAINT_MAPPED',
    evidenceKinds: ['CONSTRAINT_MAP'],
    evidenceRefs: ['doc:constraint-map']
  });
  assert.equal(denied.status, 'PROMOTION_DENIED');

  const eligible = evaluatePromotion({
    currentState: 'IMAGINED',
    targetState: 'FORMALIZED',
    evidenceKinds: ['FORMAL_SPEC'],
    evidenceRefs: ['doc:formal-spec']
  });
  assert.equal(eligible.status, 'PROMOTION_ELIGIBLE_FOR_EXTERNAL_REVIEW');
  assert.equal(eligible.promotionAuthority, 'REVIEW_REQUIRED__NO_SELF_PROMOTION');
});

test('reality leverage remains explicitly heuristic', () => {
  const result = scoreRealityLeverage({
    informationGain: 80,
    prerequisiteCentrality: 90,
    expectedBranchFactor: 90,
    transferBreadth: 70,
    optionValue: 80,
    reversibility: 90,
    evidenceQuality: 40,
    computeCost: 20,
    capitalCost: 10,
    founderMinutes: 5,
    timeDelay: 20,
    safetyRisk: 5,
    irreversibility: 5,
    dependencyFragility: 20
  });
  assert.equal(result.ok, true);
  assert.match(result.scoreBoundary, /NOT_FEASIBILITY_PROOF/);
});

test('failed parent preserves independently useful descendants', () => {
  const result = preserveUsefulDescendantsAfterFailure({
    moonshotId: 'literal-teleportation',
    failedClaimId: 'matter-transfer',
    resurrectionCondition: 'new external physical evidence changes constraint map',
    descendants: [
      { id: 'remote-fabrication', thesis: 'Recreate specified objects remotely from local feedstock.', independentOfFailedClaim: true, evidenceRefs: ['doc:descendant'] },
      { id: 'matter-transfer-core', thesis: 'Transfer the original matter directly.', independentOfFailedClaim: false, evidenceRefs: [] }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.independentlyContinuable, ['remote-fabrication']);
  assert.match(result.law, /DOES_NOT_COUNT_AS_ACHIEVED/);
});
