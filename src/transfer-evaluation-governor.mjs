import crypto from 'node:crypto';

export const TRANSFER_EVALUATION_GOVERNOR_VERSION = 'uberbond.transfer-evaluation-governor.v1';

const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const list = (values, max = 500) => [...new Set((Array.isArray(values) ? values : [])
  .map(value => text(value, 500)).filter(Boolean))].slice(0, max).sort();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});
const intersection = (a, b) => {
  const right = new Set(b);
  return a.filter(value => right.has(value));
};

/**
 * Freeze an evaluator-owned holdout protocol before the candidate is scored.
 * A different model name is not enough: shared lineage, shared hidden context,
 * shared evidence ancestry or exposed holdouts all defeat independence.
 */
export function compileIndependentEvaluation({
  experimentId = null,
  generatorId = null,
  evaluatorId = null,
  generatorLineageRef = null,
  evaluatorLineageRef = null,
  generatorContextRef = null,
  evaluatorContextRef = null,
  developmentCaseIds = [],
  holdoutCaseIds = [],
  candidateExposedCaseIds = [],
  generatorEvidenceRefs = [],
  evaluatorEvidenceRefs = [],
  rubricOwner = null,
  rubricRef = null
} = {}) {
  const id = text(experimentId, 200);
  const generator = text(generatorId, 200);
  const evaluator = text(evaluatorId, 200);
  const generatorLineage = text(generatorLineageRef, 500);
  const evaluatorLineage = text(evaluatorLineageRef, 500);
  const generatorContext = text(generatorContextRef, 500);
  const evaluatorContext = text(evaluatorContextRef, 500);
  const rubric = text(rubricRef, 500);
  const owner = text(rubricOwner, 80)?.toUpperCase();
  const development = list(developmentCaseIds);
  const holdouts = list(holdoutCaseIds);
  const exposed = list(candidateExposedCaseIds);
  const generatorEvidence = list(generatorEvidenceRefs);
  const evaluatorEvidence = list(evaluatorEvidenceRefs);

  const invalid = [];
  if (!id || !generator || !evaluator) invalid.push('experiment-generator-evaluator-required');
  if (!generatorLineage || !evaluatorLineage) invalid.push('generator-and-evaluator-lineage-required');
  if (!generatorContext || !evaluatorContext) invalid.push('generator-and-evaluator-context-required');
  if (!development.length || !holdouts.length) invalid.push('development-and-holdout-cases-required');
  if (!rubric || owner !== 'EVALUATOR_PREDECLARED') invalid.push('evaluator-predeclared-rubric-required');
  if (invalid.length) return fail('EVALUATION_PROTOCOL_INVALID', invalid);

  const reasons = [];
  const devHoldoutOverlap = intersection(development, holdouts);
  const exposedHoldouts = intersection(exposed, holdouts);
  const sharedEvidence = intersection(generatorEvidence, evaluatorEvidence);
  if (generator === evaluator) reasons.push('generator-cannot-evaluate-itself');
  if (generatorLineage === evaluatorLineage) reasons.push('generator-evaluator-lineage-not-independent');
  if (generatorContext === evaluatorContext) reasons.push('generator-evaluator-context-not-independent');
  if (devHoldoutOverlap.length) reasons.push('development-holdout-overlap');
  if (exposedHoldouts.length) reasons.push('candidate-exposed-to-holdout');
  if (sharedEvidence.length) reasons.push('generator-evaluator-share-evidence-ancestry');

  if (reasons.length) {
    return fail('EVALUATION_INDEPENDENCE_REFUSED', reasons, {
      devHoldoutOverlap,
      exposedHoldouts,
      sharedEvidence
    });
  }

  const contract = {
    experimentId: id,
    generator: { id: generator, lineageRef: generatorLineage, contextRef: generatorContext },
    evaluator: { id: evaluator, lineageRef: evaluatorLineage, contextRef: evaluatorContext },
    developmentCaseIds: development,
    holdoutCaseIds: holdouts,
    rubricOwner: owner,
    rubricRef: rubric,
    generatorEvidenceRefs: generatorEvidence,
    evaluatorEvidenceRefs: evaluatorEvidence
  };

  return {
    ok: true,
    status: 'INDEPENDENT_EVALUATION_PROTOCOL_FROZEN',
    contract,
    contractHash: hash(contract),
    holdoutSetHash: hash(holdouts),
    boundary: 'DIFFERENT_MODEL_NAME_IS_NOT_INDEPENDENCE__HOLDOUT_EXPOSURE_CONVERTS_HOLDOUT_TO_DEVELOPMENT_DATA',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function normalizeMechanismArtifact(input = {}) {
  const mechanismId = text(input.mechanismId, 200);
  const revision = text(input.revision, 200);
  const applicabilityConditions = list(input.applicabilityConditions, 100);
  const counterexamples = list(input.counterexamples, 100);
  const provenanceRefs = list(input.provenanceRefs, 100);
  const rollbackRef = text(input.rollbackRef, 500);
  if (!mechanismId || !revision || !applicabilityConditions.length || !counterexamples.length || !provenanceRefs.length || !rollbackRef) return null;
  return { mechanismId, revision, applicabilityConditions, counterexamples, provenanceRefs, rollbackRef };
}

/**
 * Decide whether a learned mechanism survived a real context reset without
 * regressing old work or protected gates. This is retention evidence, not a
 * promotion action. Existing Capability Genome admission remains authoritative.
 */
export function compileFreshContextRetention({
  mechanism = null,
  priorContextRef = null,
  freshContextRef = null,
  rehydration = null,
  capabilityState = null,
  revocationState = null,
  holdout = null,
  regression = null,
  protectedGateRegressions = []
} = {}) {
  const artifact = normalizeMechanismArtifact(mechanism || {});
  const prior = text(priorContextRef, 500);
  const fresh = text(freshContextRef, 500);
  if (!artifact || !prior || !fresh) {
    return fail('RETENTION_PROTOCOL_INVALID', ['durable-mechanism-artifact-and-two-contexts-required']);
  }
  if (prior === fresh) return fail('RETENTION_REFUSED', ['fresh-context-must-differ-from-development-context']);

  const promotion = text(capabilityState, 80)?.toUpperCase();
  if (promotion === 'REVOKED' || revocationState?.revoked === true) {
    return fail('RETENTION_REFUSED', ['revoked-capability-cannot-be-retained-or-selected']);
  }

  const loadedFromArtifact = rehydration?.mechanismLoadedFromArtifact === true;
  const hiddenContextUsed = rehydration?.hiddenConversationStateUsed === true;
  const rehydratedContext = text(rehydration?.contextRef, 500);
  const artifactRevision = text(rehydration?.mechanismRevision, 200);
  if (!loadedFromArtifact || hiddenContextUsed || rehydratedContext !== fresh || artifactRevision !== artifact.revision) {
    return fail('RETENTION_REFUSED', ['fresh-context-rehydration-not-proven'], {
      rehydrationBoundary: 'MECHANISM_MUST_SURVIVE_FROM_DURABLE_ARTIFACT__NOT_HIDDEN_CHAT_STATE'
    });
  }

  const baselineScore = Number(holdout?.baselineScore);
  const retainedScore = Number(holdout?.retainedScore);
  if (!Number.isFinite(baselineScore) || !Number.isFinite(retainedScore)) {
    return fail('RETENTION_PROTOCOL_INVALID', ['numeric-held-out-baseline-and-retained-scores-required']);
  }
  if (retainedScore <= baselineScore) {
    return fail('RETENTION_REFUSED', ['held-out-improvement-did-not-survive-context-reset'], {
      baselineScore,
      retainedScore
    });
  }

  const regressionRate = Number(regression?.oldTaskRegressionRate);
  const maxRegressionRate = Number(regression?.maxAllowedRegressionRate);
  if (!Number.isFinite(regressionRate) || !Number.isFinite(maxRegressionRate) || regressionRate < 0 || maxRegressionRate < 0) {
    return fail('RETENTION_PROTOCOL_INVALID', ['valid-regression-rates-required']);
  }
  if (regressionRate > maxRegressionRate) {
    return fail('RETENTION_REFUSED', ['old-task-regression-exceeds-tolerance'], { regressionRate, maxRegressionRate });
  }

  const protectedRegressions = list(protectedGateRegressions);
  if (protectedRegressions.length) {
    return fail('RETENTION_REFUSED', ['protected-gate-regression-zero-tolerance'], { protectedGateRegressions: protectedRegressions });
  }

  const retentionReceipt = {
    mechanismId: artifact.mechanismId,
    revision: artifact.revision,
    priorContextRef: prior,
    freshContextRef: fresh,
    baselineScore,
    retainedScore,
    oldTaskRegressionRate: regressionRate,
    maxAllowedRegressionRate: maxRegressionRate,
    provenanceRefs: artifact.provenanceRefs,
    rollbackRef: artifact.rollbackRef
  };

  return {
    ok: true,
    status: 'FRESH_CONTEXT_RETENTION_PROVEN__PROMOTION_STILL_SEPARATE',
    mechanism: artifact,
    retentionReceipt,
    receiptHash: hash(retentionReceipt),
    selectionBoundary: 'RETENTION_EVIDENCE_DOES_NOT_PROMOTE_OR_SELECT_A_CAPABILITY__CAPABILITY_GENOME_ADMISSION_STILL_APPLIES',
    revocationBoundary: 'ANY_LATER_REVOCATION_INVALIDATES_SELECTION_EVEN_IF_THIS_RECEIPT_ONCE_PASSED',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
