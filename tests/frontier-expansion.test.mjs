import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeGoalContract,
  planWorkerLanes,
  planPersistentLoop,
  selectEffortTier,
  evaluateGoalEvidence,
  buildMissionCheckpoint
} from '../src/frontier-operator.mjs';
import {
  normalizeModelSupply,
  rankModelCandidates,
  planModelTournament
} from '../src/open-model-foundry.mjs';
import { planFrontierCapabilityHarvest } from '../src/frontier-capability-harvest.mjs';

function goal() {
  return {
    id: 'frontier-demo',
    outcome: 'Produce a verified frontier expansion artifact.',
    reason: 'Expand UberBond capability without granting authority.',
    constraints: ['no-live-external-effects'],
    proof: [
      { id: 'tests', description: 'Relevant tests pass.' },
      { id: 'artifact', description: 'Artifact exists at the expected revision.' }
    ],
    permittedEffects: ['NONE'],
    maxSpendUsd: 0,
    maxTurns: 20,
    maxDurationMinutes: 120
  };
}

function model(overrides = {}) {
  return {
    id: 'model.worker-a',
    provider: 'local-or-hosted',
    model: 'worker-a',
    revision: 'rev-1',
    supplyType: 'HOSTED_OPEN_WEIGHT',
    state: 'APPROVED',
    license: 'APACHE-2.0',
    weightsAvailable: true,
    taskClasses: ['coding'],
    modalities: ['TEXT'],
    toolCapabilities: ['structured-output'],
    contextTokens: 131072,
    benchmarkScore: 0.8,
    benchmarkObservedAt: '2026-09-02T00:00:00Z',
    reliabilityScore: 0.9,
    inputCostPerMillionUsd: 0.2,
    outputCostPerMillionUsd: 0.8,
    infrastructureCostPerHourUsd: 0.1,
    minimumVramGb: 0,
    runtimeCostKnown: true,
    permissionEligible: true,
    evidenceRefs: ['benchmark:worker-a:rev-1'],
    ...overrides
  };
}

test('goal completion refuses missing proof', () => {
  const result = evaluateGoalEvidence({
    goal: goal(),
    receipts: [{ proofId: 'tests', status: 'PASS', observedAt: '2026-09-03T00:00:00Z', evidenceRef: 'test-run:1' }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'GOAL_NOT_PROVEN');
  assert.deepEqual(result.missing, ['artifact']);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('uncertain proof cannot become goal success', () => {
  const result = evaluateGoalEvidence({
    goal: goal(),
    receipts: [
      { proofId: 'tests', status: 'PASS', observedAt: '2026-09-03T00:00:00Z', evidenceRef: 'test-run:1' },
      { proofId: 'artifact', status: 'UNCERTAIN', observedAt: '2026-09-03T00:01:00Z', evidenceRef: 'artifact-check:1' }
    ]
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.uncertain, ['artifact']);
});

test('overlapping worker ownership requires serialization', () => {
  const result = planWorkerLanes({
    missionId: 'mission-1',
    lanes: [
      { id: 'worker-a', objective: 'Implement A', ownedResources: ['src/shared.mjs'], dependsOn: [] },
      { id: 'worker-b', objective: 'Implement B', ownedResources: ['src/shared.mjs'], dependsOn: [] }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SERIALIZATION_REQUIRED');
  assert.equal(result.ownershipConflicts.length, 1);
  assert.equal(result.parallelExecutionAuthorized, false);
});

test('persistent loop requires bounded stop conditions and stays plan-only', () => {
  const invalid = planPersistentLoop({ id: 'loop-1', objective: 'Keep checking', cadenceMinutes: 15 });
  assert.equal(invalid.ok, false);

  const valid = planPersistentLoop({
    id: 'loop-1',
    objective: 'Check a bounded condition.',
    cadenceMinutes: 15,
    stopCondition: 'Observed terminal state or iteration limit.',
    maxIterations: 8,
    maxSpendUsd: 0,
    allowedEffects: ['NONE']
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.status, 'LOOP_PLAN_ONLY');
  assert.equal(valid.schedulingAuthority, 'NONE');
});

test('effort routing uses deterministic execution first and frontier for high consequence', () => {
  assert.equal(selectEffortTier({ deterministicPossible: true }).effortTier, 'DETERMINISTIC');
  assert.equal(selectEffortTier({ consequenceScore: 92, ambiguityScore: 20, complexityScore: 30 }).effortTier, 'FRONTIER');
});

test('long-horizon checkpoint preserves failures and falsified assumptions', () => {
  const result = buildMissionCheckpoint({
    missionId: 'mission-1',
    observedAt: '2026-09-03T00:00:00Z',
    sourceRevision: 'abc123',
    completedStages: ['inspection'],
    failedStrategies: ['blind-retry'],
    falsifiedAssumptions: ['provider-response-implies-effect-not-accepted'],
    blockers: [],
    nextActions: ['read-only-reconciliation']
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.checkpoint.failedStrategies, ['blind-retry']);
  assert.deepEqual(result.checkpoint.falsifiedAssumptions, ['provider-response-implies-effect-not-accepted']);
});

test('open weights are rejected when runtime cost is unknown', () => {
  const result = normalizeModelSupply(model({
    supplyType: 'OPEN_WEIGHT',
    runtimeCostKnown: false
  }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('open-or-local-runtime-cost-must-be-known'));
});

test('model ranking excludes revoked and permission-ineligible suppliers', () => {
  const result = rankModelCandidates({
    taskClass: 'coding',
    now: '2026-09-03T00:00:00Z',
    maxEstimatedCostUsd: 10,
    candidates: [
      model({ id: 'model.good' }),
      model({ id: 'model.revoked', state: 'REVOKED' }),
      model({ id: 'model.no-permission', permissionEligible: false })
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.id, 'model.good');
  assert.equal(result.rejected.length, 2);
  assert.equal(result.executionAuthority, 'NONE');
});

test('model tournament evaluates infrastructure cost and recovery', () => {
  const result = planModelTournament({
    baseline: model({ id: 'model.baseline' }),
    candidates: [model({ id: 'model.candidate' })],
    taskClass: 'coding',
    holdoutId: 'holdout-frontier-1'
  });
  assert.equal(result.ok, true);
  assert.ok(result.tournament.measures.includes('infrastructure-cost'));
  assert.ok(result.tournament.measures.includes('recovery-success'));
  assert.equal(result.promotionAuthority, 'NONE');
});

test('frontier harvest covers operator, automation and open-model families with zero authority', () => {
  const result = planFrontierCapabilityHarvest();
  assert.equal(result.ok, true);
  assert.ok(result.counts.frontierOperator > 0);
  assert.ok(result.counts.automationCourse > 0);
  assert.ok(result.counts.openModel > 0);
  assert.ok(result.seeds.every(seed => seed.executionAuthority === 'NONE'));
  assert.ok(result.seeds.every(seed => seed.promotionState === 'NOT_EVALUATED'));
  assert.ok(result.laws.includes('connector-availability-is-not-authority'));
});

test('goal contract itself never grants business-effect authority', () => {
  const result = normalizeGoalContract(goal());
  assert.equal(result.ok, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.deepEqual(result.goal.permittedEffects, ['NONE']);
});
