import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdentityBlindPacket,
  compileApexReasoningArchitecture,
  compileReasoningArchitectureEvolutionExperiment,
  evaluateReasoningArchitectureArena
} from '../src/apex-reasoning-hypercompiler.mjs';

test('APEX mode preserves frontier semantic quality while compiling bounded Jev reflex candidates', () => {
  const out = compileApexReasoningArchitecture({
    missionId: 'singularity',
    taskId: 'apex-architecture',
    objective: 'Solve a high-stakes novel reasoning mission without lowering the semantic quality floor.',
    forceApex: true,
    signals: {
      uncertainty: 0.9,
      novelty: 0.95,
      stakes: 0.95,
      irreversibility: 0.8,
      ambiguity: 0.9,
      verifiability: 0.5,
      contextPressure: 0.7,
      toolLatency: 0.6
    },
    semanticDecisions: [
      {
        id: 'continue_branch',
        op: 'NOUL',
        question: 'Does this branch still contain unresolved high-value evidence?',
        criteria: { true: 'Continue', false: 'Stop' },
        escalateBelow: 0.9
      },
      {
        id: 'next_route',
        op: 'CHOICE',
        question: 'Which bounded next route best matches the frontier-authored policy?',
        criteria: { execute: 'Execute approved bounded step', retrieve: 'Retrieve evidence', escalate: 'Escalate to frontier reasoning' },
        escalateBelow: 0.85
      }
    ]
  });

  assert.equal(out.ok, true);
  assert.equal(out.architecture.mode, 'APEX_SEARCH');
  assert.equal(out.architecture.semanticQualityFloor.cheapGenerativeAuthority, 'NONE');
  assert.equal(out.architecture.councilPolicy.identityBlindCritique, true);
  assert.equal(out.architecture.reflexLayer.promotionState, 'SHADOW_ONLY');
  assert.equal(out.architecture.reflexLayer.program.instructions.length, 2);
  assert.equal(out.architecture.reflexLayer.consequenceAuthority, 'NONE');
  assert.ok(out.architecture.computePlan.parallelBranches > out.architecture.computePlan.sequentialAggregations);
});

test('easy task may use one frontier pass but does not silently delegate semantic authority to cheap models', () => {
  const out = compileApexReasoningArchitecture({
    missionId: 'small',
    taskId: 'bounded',
    objective: 'Resolve a low-uncertainty bounded semantic decision.',
    signals: {
      uncertainty: 0.05,
      novelty: 0.05,
      stakes: 0.1,
      irreversibility: 0.05,
      ambiguity: 0.05,
      verifiability: 0.95,
      contextPressure: 0.05,
      toolLatency: 0.05
    }
  });
  assert.equal(out.ok, true);
  assert.equal(out.architecture.mode, 'DIRECT_FRONTIER');
  assert.equal(out.architecture.computePlan.frontierPasses, 1);
  assert.match(out.architecture.semanticQualityFloor.consequentialSemanticJudgements, /FRONTIER/);
  assert.equal(out.architecture.semanticQualityFloor.cheapGenerativeAuthority, 'NONE');
});

test('reasoning topology expands with uncertainty and novelty', () => {
  const medium = compileApexReasoningArchitecture({
    missionId: 'm',
    taskId: 'medium',
    objective: 'Medium task.',
    signals: { uncertainty: 0.55, novelty: 0.5, stakes: 0.45, ambiguity: 0.5, verifiability: 0.6 }
  });
  const hard = compileApexReasoningArchitecture({
    missionId: 'm',
    taskId: 'hard',
    objective: 'Hard task.',
    signals: { uncertainty: 0.95, novelty: 0.95, stakes: 0.85, ambiguity: 0.95, verifiability: 0.2 }
  });
  assert.equal(medium.ok, true);
  assert.equal(hard.ok, true);
  assert.ok(hard.architecture.computePlan.parallelBranches > medium.architecture.computePlan.parallelBranches);
  assert.ok(hard.architecture.computePlan.frontierPasses >= medium.architecture.computePlan.frontierPasses);
});

test('identity-blind packet hides source identities from model-facing candidates', () => {
  const out = buildIdentityBlindPacket({
    candidates: [
      { sourceId: 'provider-a:model-x', content: '{"decision":"A","confidence":0.8}' },
      { sourceId: 'provider-b:model-y', content: '{"decision":"B","confidence":0.7}' },
      { sourceId: 'provider-c:model-z', content: '{"decision":"C","confidence":0.6}' }
    ]
  });
  assert.equal(out.ok, true);
  assert.equal(out.modelVisibleIdentityMap, false);
  assert.equal(out.publicPacket.length, 3);
  assert.ok(out.publicPacket.every(row => !('sourceId' in row)));
  assert.equal(out.identityMapReturned, false);
  assert.equal('identityMap' in out, false);
  assert.match(out.identityMapDigest, /^[a-f0-9]{64}$/);
});

test('Arena keeps verified quality primary over a dramatically cheaper but materially weaker architecture', () => {
  const out = evaluateReasoningArchitectureArena({
    taskClass: 'research',
    minimumSampleSize: 20,
    qualityFloorDelta: 0.01,
    trials: [
      {
        architectureId: 'apex-council',
        taskClass: 'research',
        verifiedSuccessRate: 0.96,
        processScore: 0.95,
        falsePositiveRate: 0.01,
        costUsd: 8,
        latencyMs: 10000,
        founderMinutes: 0.5,
        sampleSize: 100,
        evidenceRef: 'holdout://apex'
      },
      {
        architectureId: 'cheap-swarm',
        taskClass: 'research',
        verifiedSuccessRate: 0.90,
        processScore: 0.90,
        falsePositiveRate: 0.03,
        costUsd: 0.01,
        latencyMs: 1000,
        founderMinutes: 0.1,
        sampleSize: 100,
        evidenceRef: 'holdout://cheap'
      },
      {
        architectureId: 'efficient-frontier',
        taskClass: 'research',
        verifiedSuccessRate: 0.955,
        processScore: 0.94,
        falsePositiveRate: 0.012,
        costUsd: 2,
        latencyMs: 6000,
        founderMinutes: 0.3,
        sampleSize: 100,
        evidenceRef: 'holdout://efficient'
      }
    ]
  });
  assert.equal(out.ok, true);
  assert.equal(out.promotionCandidateId, 'apex-council');
  assert.equal(out.ranked.some(row => row.architectureId === 'cheap-swarm'), false);
  assert.equal(out.promotionAuthority, 'NONE');
});

test('Arena refuses to promote architectures without enough evidence', () => {
  const out = evaluateReasoningArchitectureArena({
    taskClass: 'coding',
    minimumSampleSize: 50,
    trials: [{
      architectureId: 'one-lucky-run',
      taskClass: 'coding',
      verifiedSuccessRate: 1,
      processScore: 1,
      falsePositiveRate: 0,
      costUsd: 0.01,
      latencyMs: 1,
      founderMinutes: 0,
      sampleSize: 1,
      evidenceRef: 'trial://one'
    }]
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'REASONING_ARENA_INSUFFICIENT_EVIDENCE');
});

test('invalid private or unclassified data class is refused before reasoning compilation', () => {
  const out = compileApexReasoningArchitecture({
    missionId: 'x',
    taskId: 'x',
    objective: 'x',
    dataClass: 'PRIVATE_SECRET'
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('safe-data-class-required'));
});


test('architecture evolution is failure-anchored, holdout-sealed and cannot self-promote', () => {
  const out = compileReasoningArchitectureEvolutionExperiment({
    experimentId: 'research-evolution-1',
    taskClass: 'research',
    parentArchitectureIds: ['apex-search-v1', 'blind-council-v1'],
    failureEvidenceRefs: ['failure://missed-counterexample', 'failure://context-loss'],
    mutationFamilies: ['TOPOLOGY', 'VERIFICATION', 'CONTEXT', 'REFLEX_BOUNDARY'],
    trainPartitionRef: 'dataset://research/train-v1',
    sealedHoldoutRef: 'dataset://research/holdout-v1',
    maxCandidates: 16,
    maxEvaluationCostUsd: 10
  });
  assert.equal(out.ok, true);
  assert.equal(out.experiment.searchPolicy.automaticProductionMutation, false);
  assert.equal(out.experiment.antiOverfitPolicy.sealedHoldoutInvisibleToCandidateGenerator, true);
  assert.equal(out.experiment.authority.productionPromotion, 'NONE');
  assert.match(out.experimentDigest, /^[a-f0-9]{64}$/);
});

test('architecture evolution refuses holdout leakage and mutation without failure evidence', () => {
  const out = compileReasoningArchitectureEvolutionExperiment({
    experimentId: 'bad',
    taskClass: 'research',
    parentArchitectureIds: ['a'],
    failureEvidenceRefs: [],
    trainPartitionRef: 'dataset://same',
    sealedHoldoutRef: 'dataset://same'
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('failure-evidence-required-before-mutation'));
  assert.ok(out.reasonCodes.includes('distinct-train-and-sealed-holdout-partitions-required'));
});
