import crypto from 'node:crypto';
import { compileBoundedExperiment } from './bounded-experiment-compiler.mjs';
import { evaluateValueOfInformation } from './value-of-information-governor.mjs';
import { CONSTRAINT_MUTATION_ENGINE_VERSION } from './constraint-mutation-engine.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SELF_IMPROVEMENT_CAUSAL_ADMISSION_VERSION = 'uberbond.self-improvement-causal-admission.v1.1';

const SHA40 = /^[0-9a-f]{40}$/i;
const SHA32 = /^[0-9a-f]{32}$/i;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1600) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const unique = values => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const evidenceRefs = values => unique((Array.isArray(values) ? values : []).map(value => text(value, 600)).filter(Boolean));
const mechanismKey = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_IMPROVEMENT_CAUSAL_ADMISSION_VERSION,
    status: 'SELF_IMPROVEMENT_CAUSAL_ADMISSION_REFUSED',
    reasonCodes: unique(reasonCodes),
    writeAuthority: 'NONE',
    promotionAuthority: 'NONE',
    selfModificationAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function normalizeHypothesis(row = {}) {
  const id = text(row.id, 180);
  const mechanismId = text(row.mechanismId, 220);
  const mechanism = text(row.mechanism, 1400);
  const predictedObservations = unique((Array.isArray(row.predictedObservations) ? row.predictedObservations : [])
    .map(value => text(value, 700)).filter(Boolean));
  const falsifier = text(row.falsifier, 1200);
  if (!id || !mechanism || !predictedObservations.length || !falsifier) return null;
  return { id, mechanismId, mechanism, mechanismKey: mechanismKey(mechanism), predictedObservations, falsifier };
}

function validateStrategyMutationReceipt(receipt, { primary, constraintObjectiveId }) {
  const reasons = [];
  if (receipt?.ok !== true || receipt?.status !== 'STRATEGY_MUTATION_REQUIRED') reasons.push('canonical-strategy-mutation-receipt-required');
  if (receipt?.policyVersion !== CONSTRAINT_MUTATION_ENGINE_VERSION) reasons.push('strategy-mutation-policy-version-mismatch');
  if (receipt?.hardMutationRequired !== true || receipt?.identicalRetryAllowed !== false || receipt?.decision !== 'MUTATE_STRATEGY_NOW') {
    reasons.push('strategy-mutation-must-forbid-identical-retry');
  }
  if (receipt?.businessEffectAuthority !== 'NONE') reasons.push('strategy-mutation-receipt-must-not-carry-authority');
  const objectiveId = text(receipt?.objectiveId, 200);
  const priorMechanismId = text(receipt?.mechanismId, 200);
  const providerId = text(receipt?.providerId, 200);
  const failureClass = text(receipt?.failureClass, 80);
  const failedSignature = text(receipt?.failedSignature, 128);
  const strategyFingerprint = text(receipt?.strategyFingerprint, 64);
  if (!objectiveId || !priorMechanismId || !providerId || !failureClass || !strategyFingerprint || !SHA32.test(strategyFingerprint)) {
    reasons.push('strategy-mutation-identity-fields-required');
  }
  if (!constraintObjectiveId || constraintObjectiveId !== objectiveId) reasons.push('strategy-mutation-objective-binding-mismatch');
  if (!primary?.mechanismId) reasons.push('proposed-mechanism-id-required-after-strategy-mutation');
  if (primary?.mechanismId && priorMechanismId && mechanismKey(primary.mechanismId) === mechanismKey(priorMechanismId)) {
    reasons.push('strategy-mutation-proposed-mechanism-must-differ-from-failed-mechanism');
  }
  if (objectiveId && priorMechanismId && providerId && failureClass && strategyFingerprint) {
    const expected = digest({ objectiveId, mechanismId: priorMechanismId, providerId, failureClass, failedSignature: failedSignature || null }).slice(0, 32);
    if (expected !== strategyFingerprint.toLowerCase()) reasons.push('strategy-mutation-fingerprint-integrity-mismatch');
  }
  return {
    ok: reasons.length === 0,
    reasonCodes: unique(reasons),
    identity: {
      policyVersion: receipt?.policyVersion || null,
      objectiveId: objectiveId || null,
      mechanismId: priorMechanismId || null,
      providerId: providerId || null,
      failureClass: failureClass || null,
      failedSignature: failedSignature || null,
      strategyFingerprint: strategyFingerprint || null,
      repeatCount: Number.isSafeInteger(Number(receipt?.repeatCount)) ? Number(receipt.repeatCount) : null
    }
  };
}

export function compileSelfImprovementCausalAdmission({
  baseRevision,
  task = {},
  bottleneck = {},
  hypothesis = {},
  rivals = [],
  probe = {},
  budget = {},
  voi = {},
  unknownUnknownReceipt = null,
  strategyMutationReceipt = null
} = {}) {
  const reasons = [];
  const base = text(baseRevision, 80);
  const taskId = text(task.taskId, 220);
  const constraintObjectiveId = text(task.constraintObjectiveId, 220);
  const objective = text(task.objective, 1600);
  const acceptanceTests = unique((Array.isArray(task.acceptanceTests) ? task.acceptanceTests : [])
    .map(value => text(value, 600)).filter(Boolean));

  if (!base || !SHA40.test(base)) reasons.push('exact-base-revision-required');
  if (!taskId || !objective) reasons.push('task-id-and-objective-required');
  if (!acceptanceTests.length) reasons.push('predeclared-acceptance-tests-required');

  const bottleneckId = text(bottleneck.id, 220);
  const bottleneckStatement = text(bottleneck.statement, 1600);
  const bottleneckStatus = text(bottleneck.status, 120)?.toUpperCase();
  const bottleneckEvidence = evidenceRefs(bottleneck.evidenceRefs);
  if (!bottleneckId || !bottleneckStatement) reasons.push('measured-bottleneck-identity-required');
  if (!['OBSERVED', 'MEASURED_INSUFFICIENT', 'REPRODUCED_DEFECT'].includes(bottleneckStatus)) reasons.push('observed-or-measured-bottleneck-required');
  if (!bottleneckEvidence.length) reasons.push('bottleneck-evidence-required');

  const primary = normalizeHypothesis(hypothesis);
  if (!primary) reasons.push('causal-hypothesis-mechanism-predictions-and-falsifier-required');
  const rivalRows = (Array.isArray(rivals) ? rivals : []).map(normalizeHypothesis).filter(Boolean);
  if (rivalRows.length < 1) reasons.push('at-least-one-rival-causal-hypothesis-required');
  const allHypotheses = primary ? [primary, ...rivalRows] : rivalRows;
  if (new Set(allHypotheses.map(row => row.id)).size !== allHypotheses.length) reasons.push('hypothesis-identities-must-be-unique');
  if (primary && rivalRows.some(row => row.mechanismKey === primary.mechanismKey)) reasons.push('rival-mechanism-must-materially-differ');
  const mechanismIds = allHypotheses.map(row => row.mechanismId).filter(Boolean);
  if (new Set(mechanismIds.map(mechanismKey)).size !== mechanismIds.length) reasons.push('hypothesis-mechanism-identities-must-be-unique-when-supplied');

  if (unknownUnknownReceipt != null) {
    if (unknownUnknownReceipt?.ok !== true || unknownUnknownReceipt?.status !== 'UNKNOWN_UNKNOWN_MINED') {
      reasons.push('unknown-unknown-receipt-must-be-canonical-when-supplied');
    }
    if (unknownUnknownReceipt?.businessEffectAuthority !== 'NONE') reasons.push('unknown-unknown-receipt-must-not-carry-authority');
  }

  let mutationValidation = null;
  if (strategyMutationReceipt != null && primary) {
    mutationValidation = validateStrategyMutationReceipt(strategyMutationReceipt, { primary, constraintObjectiveId });
    reasons.push(...mutationValidation.reasonCodes);
  }

  if (reasons.length) return fail(reasons);

  const bounded = compileBoundedExperiment({
    mission: `Discriminate whether proposed self-improvement solves measured bottleneck ${bottleneckId}: ${bottleneckStatement}`,
    hypotheses: allHypotheses.map(row => ({ id: row.id, predictedObservations: row.predictedObservations })),
    probe: {
      description: text(probe.description, 1800),
      costCents: probe.costCents,
      timeMinutes: probe.timeMinutes,
      reversibility: probe.reversibility,
      effects: Array.isArray(probe.effects) ? probe.effects : [],
      declaredEffectCount: probe.declaredEffectCount
    },
    budget,
    capabilities: Array.isArray(probe.capabilities) ? probe.capabilities : [],
    resources: Array.isArray(probe.resources) ? probe.resources : [],
    authority: probe.authority ?? null
  });
  if (!bounded.ok) return fail(['canonical-bounded-experiment-not-admissible'], { boundedExperiment: bounded });

  const information = evaluateValueOfInformation({
    decision: voi.decision || `Whether to build candidate ${taskId} now versus observe or defer`,
    unit: voi.unit,
    budgetUnits: voi.budgetUnits,
    currentEvidenceSufficient: voi.currentEvidenceSufficient === true,
    observe: voi.observe,
    defer: voi.defer
  });
  if (!information.ok) return fail(['canonical-voi-protocol-invalid'], { valueOfInformation: information });
  if (information.status !== 'ACT_NOW_INFORMATIONALLY_SUFFICIENT') {
    return fail(['information-acquisition-or-deferral-dominates-building-now'], {
      decision: information.status,
      valueOfInformation: information,
      boundedExperiment: bounded
    });
  }

  const boundedExperimentDigest = digest(bounded);
  const valueOfInformationDigest = digest(information);
  const unknownUnknownReceiptDigest = unknownUnknownReceipt == null ? null : digest(unknownUnknownReceipt);
  const strategyMutationReceiptDigest = strategyMutationReceipt == null ? null : digest(strategyMutationReceipt);

  const causalCore = {
    baseRevision: base.toLowerCase(),
    taskId,
    constraintObjectiveId: constraintObjectiveId || null,
    objective,
    bottleneck: {
      id: bottleneckId,
      statement: bottleneckStatement,
      status: bottleneckStatus,
      evidenceRefs: bottleneckEvidence
    },
    selectedHypothesis: primary,
    rivals: rivalRows,
    acceptanceTests,
    boundedExperimentDigest,
    valueOfInformationDigest,
    unknownUnknownReceiptDigest,
    strategyMutationReceiptDigest,
    strategyMutationIdentity: mutationValidation?.identity || null,
    boundedExperiment: {
      status: bounded.status,
      mission: bounded.mission,
      hypotheses: bounded.hypotheses,
      probe: bounded.probe,
      budget: bounded.budget,
      discrimination: bounded.discrimination
    },
    valueOfInformation: {
      status: information.status,
      decision: information.decision,
      unit: information.unit,
      budgetUnits: information.budgetUnits,
      currentEvidenceSufficient: information.currentEvidenceSufficient,
      observe: information.observe,
      defer: information.defer,
      executionBoundary: information.executionBoundary,
      valueBoundary: information.valueBoundary
    }
  };

  const causalAdmissionDigest = digest(causalCore);
  return {
    ok: true,
    policyVersion: SELF_IMPROVEMENT_CAUSAL_ADMISSION_VERSION,
    status: 'SELF_IMPROVEMENT_CAUSALLY_ADMISSIBLE_FOR_EXISTING_MAINTAINER',
    causalAdmissionDigest,
    ...causalCore,
    maintainerTask: {
      taskId,
      objective,
      acceptanceTests,
      causalAdmissionDigest,
      bottleneckId,
      hypothesisId: primary.id,
      mechanismId: primary.mechanismId || null
    },
    truthBoundary: 'CAUSAL_ADMISSION_ONLY__EXISTING_SELF_MAINTAINER_C13_C26_AND_RECURSIVE_GOVERNANCE_GATES_REMAIN_REQUIRED_FOR_ANY_LATER_CHANGE_REVIEW_OR_RETENTION',
    writeAuthority: 'NONE',
    promotionAuthority: 'NONE',
    selfModificationAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    externalEffectLedger: zeroEffects()
  };
}
