import test from 'node:test';
import assert from 'node:assert/strict';
import { compileApexReasoningArchitecture } from '../src/apex-reasoning-hypercompiler.mjs';
import {
  buildArchitectureArchive,
  compileArchitectureCandidate,
  compileArchitectureSearchPlan,
  evaluateArchitectureGeneration
} from '../src/reasoning-architecture-lab.mjs';

function parent() {
  const built = compileApexReasoningArchitecture({
    missionId: 'lab',
    taskId: 'parent',
    objective: 'Build a quality-first frontier reasoning architecture.',
    forceApex: true,
    signals: {
      uncertainty: 0.9, novelty: 0.9, stakes: 0.9, irreversibility: 0.7,
      ambiguity: 0.9, verifiability: 0.5, contextPressure: 0.5, toolLatency: 0.5
    }
  });
  assert.equal(built.ok, true);
  return built.architecture;
}

test('offline architecture candidate preserves immutable quality and authority guards', () => {
  const out = compileArchitectureCandidate({
    parentArchitecture: parent(),
    mutationId: 'more-falsifier-diversity',
    axis: 'PERSPECTIVE_SET',
    patch: {
      perspectives: [
        'FIRST_PRINCIPLES_SOLVER',
        'FALSIFIER',
        'EVIDENCE_AUDITOR',
        'FRAMEBREAKER',
        'CAUSAL_MODELER',
        'COUNTERFACTUAL_ANALYST',
        'VERIFIER_DESIGNER'
      ]
    },
    rationale: 'Test whether explicit verifier design improves hard-task reliability.',
    expectedEffect: 'Higher verified success or lower false-positive rate on sealed hard tasks.',
    falsifier: 'No gain, reliability regression, or materially worse quality-adjusted resource use.',
    donorRefs: ['paper://agent-search'],
    generation: 2
  });
  assert.equal(out.ok, true);
  assert.equal(out.promotionAuthority, 'NONE');
  assert.equal(out.productionActivationAuthorized, false);
  assert.equal(out.candidate.semanticQualityFloor.cheapGenerativeAuthority, 'NONE');
  assert.equal(out.candidate.reflexLayer.consequenceAuthority, 'NONE');
  assert.match(out.candidateDigest, /^[a-f0-9]{64}$/);
  assert.match(out.lineageDigest, /^[a-f0-9]{64}$/);
});

test('candidate cannot mutate production authority or lower quality guards', () => {
  const authority = compileArchitectureCandidate({
    parentArchitecture: parent(),
    mutationId: 'bad-authority',
    axis: 'TOOL_POLICY',
    patch: { spendAuthority: 'AUTO' },
    rationale: 'bad',
    expectedEffect: 'bad',
    falsifier: 'bad'
  });
  assert.equal(authority.ok, false);
  assert.ok(authority.reasonCodes.some(code => code.includes('authority-guard-mutation-prohibited')));

  const quality = compileArchitectureCandidate({
    parentArchitecture: parent(),
    mutationId: 'bad-quality',
    axis: 'VERIFICATION_POLICY',
    patch: { experimentalPolicy: 'COST_FIRST_SKIP_VERIFICATION' },
    rationale: 'bad',
    expectedEffect: 'bad',
    falsifier: 'bad'
  });
  assert.equal(quality.ok, false);
  assert.ok(quality.reasonCodes.some(code => code.includes('quality-guard-lowering-prohibited')));
});

test('quality-diversity archive keeps distinct strong cells instead of one global winner', () => {
  const out = buildArchitectureArchive({
    maxPerCell: 2,
    entries: [
      { architectureId: 'a', taskClass: 'research', quality: 0.97, novelty: 0.2, reliability: 0.97, costUsd: 2, evidenceRef: 'h://a', candidateDigest: 'a'.repeat(64) },
      { architectureId: 'b', taskClass: 'research', quality: 0.96, novelty: 0.9, reliability: 0.96, costUsd: 3, evidenceRef: 'h://b', candidateDigest: 'b'.repeat(64) },
      { architectureId: 'c', taskClass: 'research', quality: 0.95, novelty: 0.21, reliability: 0.95, costUsd: 1, evidenceRef: 'h://c', candidateDigest: 'c'.repeat(64) }
    ]
  });
  assert.equal(out.ok, true);
  assert.ok(out.cellCount >= 2);
  assert.ok(out.retained.some(row => row.architectureId === 'a'));
  assert.ok(out.retained.some(row => row.architectureId === 'b'));
  assert.match(out.archiveDigest, /^[a-f0-9]{64}$/);
});

test('architecture search plan may generate and evaluate candidates but has zero production promotion authority', () => {
  const out = compileArchitectureSearchPlan({
    taskClass: 'research',
    archiveDigest: 'd'.repeat(64),
    generation: 3,
    populationSize: 24,
    eliteCount: 6,
    noveltySlots: 6,
    maxEvaluationCostUsd: 10
  });
  assert.equal(out.ok, true);
  assert.equal(out.plan.authority.productionPromotion, 'NONE');
  assert.equal(out.plan.authority.externalEffects, 'NONE');
  assert.equal(out.plan.budget.productionMutationBudgetUsd, 0);
  assert.equal(out.plan.searchPolicy.sealedHoldoutRequired, true);
  assert.equal(out.plan.searchPolicy.trainTestSeparationRequired, true);
});

test('generation evaluation names a challenger but cannot promote it', () => {
  const out = evaluateArchitectureGeneration({
    taskClass: 'research',
    incumbentArchitectureId: 'incumbent',
    minimumSampleSize: 20,
    trials: [
      {
        architectureId: 'incumbent', taskClass: 'research',
        verifiedSuccessRate: 0.95, processScore: 0.94, falsePositiveRate: 0.02,
        costUsd: 2, latencyMs: 5000, founderMinutes: 0.2, sampleSize: 100, evidenceRef: 'holdout://incumbent'
      },
      {
        architectureId: 'challenger', taskClass: 'research',
        verifiedSuccessRate: 0.958, processScore: 0.95, falsePositiveRate: 0.015,
        costUsd: 2.2, latencyMs: 5200, founderMinutes: 0.2, sampleSize: 100, evidenceRef: 'holdout://challenger'
      }
    ]
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'CHALLENGER_SURVIVED_SEALED_HOLDOUT');
  assert.equal(out.promotionCandidateId, 'challenger');
  assert.equal(out.promotionAuthority, 'NONE');
  assert.equal(out.automaticProductionChange, false);
  assert.match(out.nextStep, /INDEPENDENT_REPLICATION/);
});
