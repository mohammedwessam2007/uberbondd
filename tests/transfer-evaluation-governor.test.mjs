import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileIndependentEvaluation,
  compileFreshContextRetention
} from '../src/transfer-evaluation-governor.mjs';

const evaluation = {
  experimentId: 'transfer-1',
  generatorId: 'generator-a',
  evaluatorId: 'evaluator-b',
  generatorLineageRef: 'lineage:g1',
  evaluatorLineageRef: 'lineage:e1',
  generatorContextRef: 'context:development',
  evaluatorContextRef: 'context:evaluation',
  developmentCaseIds: ['dev-1', 'dev-2'],
  holdoutCaseIds: ['holdout-1', 'holdout-2'],
  candidateExposedCaseIds: [],
  generatorEvidenceRefs: ['evidence:generator-private'],
  evaluatorEvidenceRefs: ['evidence:evaluator-private'],
  rubricOwner: 'EVALUATOR_PREDECLARED',
  rubricRef: 'rubric:v1'
};

test('independent evaluator protocol freezes cleanly', () => {
  const result = compileIndependentEvaluation(evaluation);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'INDEPENDENT_EVALUATION_PROTOCOL_FROZEN');
  assert.equal(typeof result.contractHash, 'string');
  assert.equal(typeof result.holdoutSetHash, 'string');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('generator cannot evaluate itself', () => {
  const result = compileIndependentEvaluation({ ...evaluation, evaluatorId: evaluation.generatorId });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('generator-cannot-evaluate-itself'));
});

test('different model names with the same lineage are not independent', () => {
  const result = compileIndependentEvaluation({
    ...evaluation,
    evaluatorId: 'other-model-name',
    evaluatorLineageRef: evaluation.generatorLineageRef
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('generator-evaluator-lineage-not-independent'));
});

test('shared hidden context defeats evaluator independence', () => {
  const result = compileIndependentEvaluation({
    ...evaluation,
    evaluatorContextRef: evaluation.generatorContextRef
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('generator-evaluator-context-not-independent'));
});

test('development leakage into holdout is refused', () => {
  const result = compileIndependentEvaluation({
    ...evaluation,
    developmentCaseIds: ['dev-1', 'holdout-1']
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('development-holdout-overlap'));
});

test('candidate exposure converts holdout into development data and is refused', () => {
  const result = compileIndependentEvaluation({
    ...evaluation,
    candidateExposedCaseIds: ['holdout-2']
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('candidate-exposed-to-holdout'));
});

test('shared evidence ancestry is surfaced instead of counting correlated reviewers as independent', () => {
  const result = compileIndependentEvaluation({
    ...evaluation,
    evaluatorEvidenceRefs: ['evidence:evaluator-private', 'evidence:generator-private']
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('generator-evaluator-share-evidence-ancestry'));
});

test('candidate-owned or post-hoc rubric is invalid', () => {
  const result = compileIndependentEvaluation({ ...evaluation, rubricOwner: 'CANDIDATE' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evaluator-predeclared-rubric-required'));
});

const mechanism = {
  mechanismId: 'mechanism:causal-retry-mutation',
  revision: 'rev-3',
  applicabilityConditions: ['same blocker reproduced', 'same strategy failed'],
  counterexamples: ['new evidence changes the blocker'],
  provenanceRefs: ['commit:abc123', 'test:hostile-1'],
  rollbackRef: 'commit:parent'
};
const retention = {
  mechanism,
  priorContextRef: 'context:development',
  freshContextRef: 'context:fresh',
  rehydration: {
    mechanismLoadedFromArtifact: true,
    hiddenConversationStateUsed: false,
    contextRef: 'context:fresh',
    mechanismRevision: 'rev-3'
  },
  capabilityState: 'APPROVED',
  revocationState: { revoked: false },
  holdout: { baselineScore: 0.4, retainedScore: 0.7 },
  regression: { oldTaskRegressionRate: 0.01, maxAllowedRegressionRate: 0.05 },
  protectedGateRegressions: []
};

test('fresh-context retention requires durable artifact rehydration and survives holdout', () => {
  const result = compileFreshContextRetention(retention);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'FRESH_CONTEXT_RETENTION_PROVEN__PROMOTION_STILL_SEPARATE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.match(result.selectionBoundary, /DOES_NOT_PROMOTE_OR_SELECT/);
});

test('same context is not a context-reset proof', () => {
  const result = compileFreshContextRetention({ ...retention, freshContextRef: retention.priorContextRef });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('fresh-context-must-differ-from-development-context'));
});

test('hidden conversation memory invalidates retention evidence', () => {
  const result = compileFreshContextRetention({
    ...retention,
    rehydration: { ...retention.rehydration, hiddenConversationStateUsed: true }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('fresh-context-rehydration-not-proven'));
});

test('mechanism artifact must carry applicability counterexamples provenance and rollback', () => {
  const result = compileFreshContextRetention({
    ...retention,
    mechanism: { mechanismId: 'x', revision: 'r' }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('durable-mechanism-artifact-and-two-contexts-required'));
});

test('revoked capability cannot retain selection authority', () => {
  const result = compileFreshContextRetention({
    ...retention,
    capabilityState: 'REVOKED',
    revocationState: { revoked: true }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('revoked-capability-cannot-be-retained-or-selected'));
});

test('held-out improvement must survive the reset', () => {
  const result = compileFreshContextRetention({
    ...retention,
    holdout: { baselineScore: 0.6, retainedScore: 0.6 }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('held-out-improvement-did-not-survive-context-reset'));
});

test('old-task regression above declared tolerance is refused', () => {
  const result = compileFreshContextRetention({
    ...retention,
    regression: { oldTaskRegressionRate: 0.2, maxAllowedRegressionRate: 0.05 }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('old-task-regression-exceeds-tolerance'));
});

test('protected gates have zero regression tolerance', () => {
  const result = compileFreshContextRetention({
    ...retention,
    protectedGateRegressions: ['authority-boundary-regressed']
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('protected-gate-regression-zero-tolerance'));
});
