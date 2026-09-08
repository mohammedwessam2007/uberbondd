import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { evaluateCompoundIntelligence } from '../src/compound-intelligence-evaluation.mjs';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

const components = [
  { componentId: 'planner-a', revision: 'model-a@1', lineageRef: 'lineage:model-a', role: 'PLANNER', capabilityState: 'APPROVED', countsAsIndependentVote: true },
  { componentId: 'critic-b', revision: 'model-b@7', lineageRef: 'lineage:model-b', role: 'CRITIC', capabilityState: 'APPROVED', countsAsIndependentVote: true },
  { componentId: 'code-tool', revision: 'tool@4', lineageRef: 'lineage:tool-code', role: 'TOOL', capabilityState: 'ACTIVE', countsAsIndependentVote: false }
];

function compositionDigest(rows = components, revision = 'composition@3') {
  const normalized = rows.map(row => ({
    componentId: row.componentId,
    revision: row.revision,
    lineageRef: row.lineageRef,
    role: String(row.role).toUpperCase(),
    capabilityState: String(row.capabilityState).toUpperCase(),
    countsAsIndependentVote: row.countsAsIndependentVote === true
  })).sort((a, b) => a.componentId.localeCompare(b.componentId));
  return hash({ compositionId: 'compound-candidate', revision, components: normalized });
}

function arm(systemId, revision, score, low, high, extra = {}) {
  return {
    systemId,
    revision,
    score,
    scoreInterval: { low, high },
    computeUnits: 100,
    toolBudgetRef: 'tool-budget:equal-v1',
    wallTimeMs: 10_000,
    monetaryCostMicros: 500_000,
    humanAssistanceMinutes: 0,
    ...extra
  };
}

function family(familyId, baselineScore, currentScore, candidateScore, protectedGate = false) {
  return {
    familyId,
    protectedGate,
    baseline: arm('baseline-strong', 'baseline@9', baselineScore, baselineScore - 0.01, baselineScore + 0.01),
    current: arm('uberbond-current', 'main@current', currentScore, currentScore - 0.01, currentScore + 0.01),
    candidate: arm('compound-candidate', 'composition@3', candidateScore, candidateScore - 0.01, candidateScore + 0.01)
  };
}

function fixture() {
  const digest = compositionDigest();
  return {
    compositionId: 'compound-candidate',
    compositionRevision: 'composition@3',
    components: structuredClone(components),
    claimedIndependentVotes: 2,
    evaluationSubjectDigest: digest,
    independentEvaluation: {
      experimentId: 'compound-eval-1',
      generatorId: 'compound-candidate',
      evaluatorId: 'independent-evaluator',
      generatorLineageRef: `composition:${digest}`,
      evaluatorLineageRef: 'lineage:evaluator-independent',
      generatorContextRef: 'context:development',
      evaluatorContextRef: 'context:evaluator-sealed',
      developmentCaseIds: ['dev-1', 'dev-2'],
      holdoutCaseIds: ['holdout-1', 'holdout-2', 'holdout-3'],
      candidateExposedCaseIds: [],
      generatorEvidenceRefs: ['evidence:candidate-private'],
      evaluatorEvidenceRefs: ['evidence:evaluator-private'],
      rubricOwner: 'EVALUATOR_PREDECLARED',
      rubricRef: 'rubric:compound-v1'
    },
    baselineSelection: {
      selectedBaselineId: 'baseline-strong',
      selectedRevision: 'baseline@9',
      selectionEvidenceRef: 'evidence:baseline-selection-frozen',
      selectionOwner: 'EVALUATOR_PREDECLARED',
      frozenBeforeEvaluation: true,
      alternatives: [
        { id: 'baseline-strong', revision: 'baseline@9', evidenceRef: 'evidence:baseline-strong', strengthRank: 20, accessible: true, eligible: true },
        { id: 'baseline-cheap', revision: 'baseline@2', evidenceRef: 'evidence:baseline-cheap', strengthRank: 10, accessible: true, eligible: true },
        { id: 'imagined-unavailable-supermodel', revision: 'unknown', evidenceRef: 'evidence:unavailable', strengthRank: 999, accessible: false, eligible: false }
      ]
    },
    currentSystemId: 'uberbond-current',
    currentSystemRevision: 'main@current',
    minimumMeaningfulGain: 0.05,
    maxAllowedRegression: 0.02,
    families: [
      family('software', 0.40, 0.50, 0.72, true),
      family('science', 0.45, 0.52, 0.70),
      family('strategy', 0.50, 0.55, 0.74),
      family('forecasting', 0.48, 0.54, 0.71)
    ],
    freshContextRetention: {
      mechanism: {
        mechanismId: 'compound-candidate',
        revision: 'composition@3',
        applicabilityConditions: ['declared task families', 'matched evaluation budgets'],
        counterexamples: ['revoked component', 'unseen family regression'],
        provenanceRefs: ['commit:candidate', 'evaluation:compound-eval-1'],
        rollbackRef: 'composition@2'
      },
      priorContextRef: 'context:development',
      freshContextRef: 'context:fresh-replay',
      rehydration: {
        mechanismLoadedFromArtifact: true,
        hiddenConversationStateUsed: false,
        contextRef: 'context:fresh-replay',
        mechanismRevision: 'composition@3'
      },
      capabilityState: 'APPROVED',
      revocationState: { revoked: false },
      holdout: { baselineScore: 0.55, retainedScore: 0.71 },
      regression: { oldTaskRegressionRate: 0.01, maxAllowedRegressionRate: 0.02 },
      protectedGateRegressions: []
    },
    revocationSnapshot: {
      snapshotRef: 'revocation-snapshot:2026-09-09T00:00:00Z',
      verifiedAt: '2026-09-09T00:00:00Z',
      verifierId: 'revocation-auditor',
      verifierLineageRef: 'lineage:revocation-auditor',
      components: components.map(row => ({ componentId: row.componentId, revision: row.revision, evidenceRef: `registry:${row.componentId}`, revoked: false }))
    },
    observedAt: '2026-09-09T00:30:00Z',
    maxRevocationAgeMs: 3_600_000,
    decisionPolicy: {
      abstainOnInsufficientEvidence: true,
      noRecommendationOnValueBoundary: true,
      escalationBudgetRef: 'budget:compound-eval-v1',
      maxEscalationSteps: 2
    }
  };
}

test('compound intelligence gain is supported only within the declared scope', () => {
  const result = evaluateCompoundIntelligence(fixture());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE');
  assert.equal(result.evidenceStage, 'FRESH_CONTEXT_REPRODUCED_WITH_CROSS_DOMAIN_TRANSFER_SUPPORT');
  assert.equal(result.asiStatus, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.promotionAuthority, 'NONE');
  assert.match(result.promotionBoundary, /DOES_NOT_PROMOTE/);
});

test('evaluation must bind the exact composition digest', () => {
  const input = fixture();
  input.evaluationSubjectDigest = '0'.repeat(64);
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evaluation-subject-digest-must-bind-exact-composition'));
});

test('silent component revision change invalidates old evaluation identity', () => {
  const input = fixture();
  input.components[0].revision = 'model-a@2';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evaluation-subject-digest-must-bind-exact-composition'));
});

test('revoked declared component cannot enter the composition', () => {
  const input = fixture();
  input.components[0].capabilityState = 'REVOKED';
  input.evaluationSubjectDigest = compositionDigest(input.components);
  input.independentEvaluation.generatorLineageRef = `composition:${input.evaluationSubjectDigest}`;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('revoked-component-cannot-enter-composition'));
});

test('correlated model copies cannot multiply independent votes', () => {
  const input = fixture();
  input.components[1].lineageRef = input.components[0].lineageRef;
  input.evaluationSubjectDigest = compositionDigest(input.components);
  input.independentEvaluation.generatorLineageRef = `composition:${input.evaluationSubjectDigest}`;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('correlated-lineage-cannot-multiply-independent-votes'));
});

test('claimed independent vote count cannot exceed actual declared voters', () => {
  const input = fixture();
  input.claimedIndependentVotes = 3;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('claimed-independent-vote-count-mismatch'));
});

test('evaluator protocol must name the exact composition digest', () => {
  const input = fixture();
  input.independentEvaluation.generatorLineageRef = 'composition:stale';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evaluator-protocol-must-name-exact-composition-and-digest'));
});

test('evaluator cannot be one of the composition components by id', () => {
  const input = fixture();
  input.independentEvaluation.evaluatorId = 'planner-a';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evaluator-must-be-independent-of-every-composition-component'));
});

test('aggregate lineage cannot hide evaluator ancestry shared with a component', () => {
  const input = fixture();
  input.independentEvaluation.evaluatorLineageRef = 'lineage:model-a';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evaluator-must-be-independent-of-every-composition-component'));
});

test('candidate and evaluator aggregate lineage still cannot be identical', () => {
  const input = fixture();
  input.independentEvaluation.evaluatorLineageRef = input.independentEvaluation.generatorLineageRef;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('generator-evaluator-lineage-not-independent'));
});

test('baseline selection must be evaluator-predeclared, not candidate-owned', () => {
  const input = fixture();
  input.baselineSelection.selectionOwner = 'CANDIDATE';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evaluator-predeclared-baseline-selection-required'));
});

test('weaker accessible baseline cannot be selected while a stronger eligible one exists', () => {
  const input = fixture();
  input.baselineSelection.selectedBaselineId = 'baseline-cheap';
  input.baselineSelection.selectedRevision = 'baseline@2';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('strongest-accessible-eligible-baseline-required'));
});

test('inaccessible hypothetical model does not become an imagined benchmark', () => {
  const input = fixture();
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.receipt.baseline.id, 'baseline-strong');
});

test('family candidate arm cannot silently reroute to another revision', () => {
  const input = fixture();
  input.families[0].candidate.revision = 'composition@other';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('family-candidate-arm-does-not-match-exact-composition'));
});

test('wall time must be matched instead of buying a hidden latency advantage', () => {
  const input = fixture();
  input.families[0].candidate.wallTimeMs += 1;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('matched-time-cost-and-human-assistance-budget-required'));
});

test('money and human assistance must be matched across comparison arms', () => {
  const money = fixture();
  money.families[0].candidate.monetaryCostMicros += 1;
  assert.ok(evaluateCompoundIntelligence(money).reasonCodes.includes('matched-time-cost-and-human-assistance-budget-required'));
  const human = fixture();
  human.families[0].candidate.humanAssistanceMinutes = 1;
  assert.ok(evaluateCompoundIntelligence(human).reasonCodes.includes('matched-time-cost-and-human-assistance-budget-required'));
});

test('existing transfer governor still owns compute and tool budget parity', () => {
  const input = fixture();
  input.families[0].candidate.computeUnits = 101;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('matched-compute-and-tool-budget-required'));
});

test('uncertainty interval must contain the reported score', () => {
  const input = fixture();
  input.families[0].candidate.scoreInterval = { low: 0.8, high: 0.9 };
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-family-system-budget-and-uncertainty-arms-required'));
});

test('point-score win is refused when uncertainty does not support robust gain', () => {
  const input = fixture();
  for (const row of input.families) {
    row.current.scoreInterval = { low: row.current.score - 0.01, high: row.current.score + 0.14 };
    row.candidate.scoreInterval = { low: row.candidate.score - 0.14, high: row.candidate.score + 0.01 };
  }
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('interval-robust-cross-domain-gain-not-supported'));
});

test('protected gate uncertainty regression has zero tolerance', () => {
  const input = fixture();
  input.families[0].candidate.scoreInterval.low = 0.48;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('protected-gate-uncertainty-regression-zero-tolerance'));
});

test('fresh-context retention must bind the exact composition revision', () => {
  const input = fixture();
  input.freshContextRetention.mechanism.revision = 'composition@2';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('fresh-context-retention-must-bind-exact-composition-revision'));
});

test('hidden conversation state cannot masquerade as fresh-context retention', () => {
  const input = fixture();
  input.freshContextRetention.rehydration.hiddenConversationStateUsed = true;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('fresh-context-rehydration-not-proven'));
});

test('revocation snapshot must cover the exact component revision set', () => {
  const input = fixture();
  input.revocationSnapshot.components.pop();
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('revocation-snapshot-must-cover-exact-composition-components'));
});

test('later observed revocation invalidates an otherwise passing evaluation', () => {
  const input = fixture();
  input.revocationSnapshot.components[0].revoked = true;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('observed-revoked-component-invalidates-composition'));
});

test('revocation evidence cannot be verified by a candidate component lineage', () => {
  const input = fixture();
  input.revocationSnapshot.verifierLineageRef = 'lineage:model-b';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('revocation-verifier-must-be-independent-of-components-and-evaluator'));
});

test('evaluation judge cannot also be the revocation verifier', () => {
  const input = fixture();
  input.revocationSnapshot.verifierId = input.independentEvaluation.evaluatorId;
  input.revocationSnapshot.verifierLineageRef = input.independentEvaluation.evaluatorLineageRef;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('revocation-verifier-must-be-independent-of-components-and-evaluator'));
});

test('stale revocation snapshot cannot keep a composition alive indefinitely', () => {
  const input = fixture();
  input.revocationSnapshot.verifiedAt = '2026-09-08T20:00:00Z';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('stale-revocation-snapshot-refused'));
});

test('future-dated revocation evidence is refused', () => {
  const input = fixture();
  input.revocationSnapshot.verifiedAt = '2026-09-09T01:00:00Z';
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('future-dated-revocation-snapshot-refused'));
});

test('composition must preserve abstention and the human value boundary', () => {
  const input = fixture();
  input.decisionPolicy.noRecommendationOnValueBoundary = false;
  const result = evaluateCompoundIntelligence(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('abstention-and-value-boundary-refusal-required'));
});
