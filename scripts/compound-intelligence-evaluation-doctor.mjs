#!/usr/bin/env node
import crypto from 'node:crypto';
import { evaluateCompoundIntelligence } from '../src/compound-intelligence-evaluation.mjs';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const components = [
  { componentId: 'planner-a', revision: 'model-a@1', lineageRef: 'lineage:model-a', role: 'PLANNER', capabilityState: 'APPROVED', countsAsIndependentVote: true },
  { componentId: 'critic-b', revision: 'model-b@7', lineageRef: 'lineage:model-b', role: 'CRITIC', capabilityState: 'APPROVED', countsAsIndependentVote: true }
];
const canonicalComponents = components.map(row => ({ ...row })).sort((a, b) => a.componentId.localeCompare(b.componentId));
const compositionDigest = hash({ compositionId: 'doctor-composition', revision: 'doctor@1', components: canonicalComponents });
const arm = (systemId, revision, score) => ({
  systemId,
  revision,
  score,
  scoreInterval: { low: score - 0.01, high: score + 0.01 },
  computeUnits: 10,
  toolBudgetRef: 'doctor:tool-budget',
  wallTimeMs: 1000,
  monetaryCostMicros: 0,
  humanAssistanceMinutes: 0
});
const families = ['software', 'science', 'strategy'].map((familyId, index) => ({
  familyId,
  protectedGate: familyId === 'software',
  baseline: arm('baseline', 'baseline@1', 0.40 + index * 0.01),
  current: arm('current', 'current@1', 0.50 + index * 0.01),
  candidate: arm('doctor-composition', 'doctor@1', 0.70 + index * 0.01)
}));

const result = evaluateCompoundIntelligence({
  compositionId: 'doctor-composition',
  compositionRevision: 'doctor@1',
  components,
  claimedIndependentVotes: 2,
  evaluationSubjectDigest: compositionDigest,
  independentEvaluation: {
    experimentId: 'doctor-evaluation',
    generatorId: 'doctor-composition',
    evaluatorId: 'doctor-independent-evaluator',
    generatorLineageRef: `composition:${compositionDigest}`,
    evaluatorLineageRef: 'lineage:doctor-evaluator',
    generatorContextRef: 'doctor:development',
    evaluatorContextRef: 'doctor:evaluator',
    developmentCaseIds: ['doctor-dev-1'],
    holdoutCaseIds: ['doctor-holdout-1', 'doctor-holdout-2'],
    candidateExposedCaseIds: [],
    generatorEvidenceRefs: ['doctor:candidate-evidence'],
    evaluatorEvidenceRefs: ['doctor:evaluator-evidence'],
    rubricOwner: 'EVALUATOR_PREDECLARED',
    rubricRef: 'doctor:rubric'
  },
  baselineSelection: {
    selectedBaselineId: 'baseline',
    selectedRevision: 'baseline@1',
    selectionEvidenceRef: 'doctor:baseline-selection',
    selectionOwner: 'EVALUATOR_PREDECLARED',
    frozenBeforeEvaluation: true,
    alternatives: [
      { id: 'baseline', revision: 'baseline@1', evidenceRef: 'doctor:baseline', strengthRank: 1, accessible: true, eligible: true }
    ]
  },
  currentSystemId: 'current',
  currentSystemRevision: 'current@1',
  minimumMeaningfulGain: 0.05,
  maxAllowedRegression: 0.02,
  families,
  freshContextRetention: {
    mechanism: {
      mechanismId: 'doctor-composition',
      revision: 'doctor@1',
      applicabilityConditions: ['doctor-only'],
      counterexamples: ['revocation'],
      provenanceRefs: ['doctor:provenance'],
      rollbackRef: 'doctor@0'
    },
    priorContextRef: 'doctor:development',
    freshContextRef: 'doctor:fresh',
    rehydration: {
      mechanismLoadedFromArtifact: true,
      hiddenConversationStateUsed: false,
      contextRef: 'doctor:fresh',
      mechanismRevision: 'doctor@1'
    },
    capabilityState: 'APPROVED',
    revocationState: { revoked: false },
    holdout: { baselineScore: 0.5, retainedScore: 0.7 },
    regression: { oldTaskRegressionRate: 0, maxAllowedRegressionRate: 0.02 },
    protectedGateRegressions: []
  },
  revocationSnapshot: {
    snapshotRef: 'doctor:revocation',
    verifiedAt: '2026-09-09T00:00:00Z',
    verifierId: 'doctor-revocation-verifier',
    verifierLineageRef: 'lineage:doctor-revocation-verifier',
    components: components.map(row => ({ componentId: row.componentId, revision: row.revision, evidenceRef: `doctor:registry:${row.componentId}`, revoked: false }))
  },
  observedAt: '2026-09-09T00:30:00Z',
  maxRevocationAgeMs: 3_600_000,
  decisionPolicy: {
    abstainOnInsufficientEvidence: true,
    noRecommendationOnValueBoundary: true,
    escalationBudgetRef: 'doctor:escalation-budget',
    maxEscalationSteps: 1
  }
});

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    status: result.status,
    evidenceStage: result.evidenceStage,
    asiStatus: result.asiStatus,
    businessEffectAuthority: result.businessEffectAuthority,
    promotionAuthority: result.promotionAuthority,
    note: 'SYNTHETIC_ZERO_EFFECT_DOCTOR__NOT_REAL_WORLD_OR_ASI_EVIDENCE'
  }, null, 2));
}
