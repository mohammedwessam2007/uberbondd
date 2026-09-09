import crypto from 'node:crypto';
import { COMPOUND_INTELLIGENCE_EVALUATION_VERSION } from './compound-intelligence-evaluation.mjs';
import { CAPABILITY_SCALED_SECURITY_VERSION } from './capability-scaled-security.mjs';

export const MODEL_ADAPTATION_LIFECYCLE_VERSION = 'uberbond.model-adaptation-lifecycle.v1.2';
export const MODEL_ADAPTATION_METHODS = Object.freeze(['LORA', 'FINE_TUNE', 'DISTILLATION', 'CONTINUAL_LEARNING']);
export const ADAPTATION_PRIOR_STAGES = Object.freeze(['PROMPT', 'RETRIEVAL', 'TOOLS', 'DECOMPOSITION', 'COMPOSITION', 'AUTHORIZED_EXISTING_MODEL']);

const ZERO_EFFECTS = Object.freeze({ customerMessages: 0, providerCalls: 0, spendCents: 0, deployments: 0, dnsChanges: 0, credentialChanges: 0, paymentMutations: 0, productionMutations: 0 });
const SHA256 = /^(?:sha256:)?[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const text = (value, max = 1000) => { const out = typeof value === 'string' ? value.trim() : ''; return out && out.length <= max ? out : null; };
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
const number = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const uniq = values => [...new Set(values)];
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
const instant = value => { const raw = text(value, 100); if (!raw || !ISO_INSTANT.test(raw)) return null; const ms = Date.parse(raw); return Number.isFinite(ms) ? { raw, ms } : null; };
const fail = (status, reasonCodes, extra = {}) => ({ ok: false, version: MODEL_ADAPTATION_LIFECYCLE_VERSION, status, reasonCodes: uniq(reasonCodes.filter(Boolean)), trainingAuthority: 'NONE', promotionAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO_EFFECTS }, ...extra });

function normalizePriorStages(rows = []) {
  const out = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    const stage = text(raw?.stage, 80)?.toUpperCase();
    const status = text(raw?.status, 80)?.toUpperCase();
    const evidenceRef = text(raw?.evidenceRef, 500);
    const reason = text(raw?.reason, 500);
    if (!ADAPTATION_PRIOR_STAGES.includes(stage) || !['INSUFFICIENT', 'NOT_APPLICABLE_WITH_REASON'].includes(status) || !evidenceRef || (status === 'NOT_APPLICABLE_WITH_REASON' && !reason)) return null;
    out.push({ stage, status, evidenceRef, reason });
  }
  if (out.length !== ADAPTATION_PRIOR_STAGES.length || new Set(out.map(row => row.stage)).size !== ADAPTATION_PRIOR_STAGES.length || ADAPTATION_PRIOR_STAGES.some(stage => !out.some(row => row.stage === stage))) return null;
  return out.sort((a, b) => ADAPTATION_PRIOR_STAGES.indexOf(a.stage) - ADAPTATION_PRIOR_STAGES.indexOf(b.stage));
}

function normalizeBaseModel(raw = {}) {
  const modelId = text(raw.modelId, 200);
  const revision = text(raw.revision, 300);
  const weightsDigest = text(raw.weightsDigest, 80)?.toLowerCase();
  const licenseRef = text(raw.licenseRef, 500);
  const entitlementRef = text(raw.entitlementRef, 500);
  const ownershipClass = text(raw.ownershipClass, 80)?.toUpperCase();
  const supportedMethods = uniq((Array.isArray(raw.supportedMethods) ? raw.supportedMethods : []).map(value => text(value, 80)?.toUpperCase()).filter(Boolean));
  if (!modelId || !revision || !weightsDigest || !SHA256.test(weightsDigest) || !licenseRef || !entitlementRef || !['OPEN_LOCAL', 'OWNER_CONTROLLED', 'AUTHORIZED_PROVIDER'].includes(ownershipClass) || !supportedMethods.length || supportedMethods.some(method => !MODEL_ADAPTATION_METHODS.includes(method))) return null;
  return { modelId, revision, weightsDigest, licenseRef, entitlementRef, ownershipClass, supportedMethods };
}

function normalizeExample(raw = {}) {
  const exampleId = text(raw.exampleId, 240);
  const contentDigest = text(raw.contentDigest, 80)?.toLowerCase();
  const split = text(raw.split, 20)?.toUpperCase();
  const sourceRef = text(raw.sourceRef, 500);
  const provenanceRef = text(raw.provenanceRef, 500);
  const licenseStatus = text(raw.licenseStatus, 80)?.toUpperCase();
  const consentBasis = text(raw.consentBasis, 100)?.toUpperCase();
  const privacyStatus = text(raw.privacyStatus, 80)?.toUpperCase();
  const labelClass = text(raw.labelClass, 80)?.toUpperCase();
  if (!exampleId || !contentDigest || !SHA256.test(contentDigest) || !['TRAIN', 'DEV', 'HELDOUT'].includes(split) || !sourceRef || !provenanceRef || licenseStatus !== 'USABLE') return null;
  if (!['EXPLICIT_CONSENT', 'PUBLIC_LICENSED_NO_PERSONAL_DATA', 'OWNER_AUTHORIZED_PRIVATE', 'NOT_REQUIRED_DOCUMENTED'].includes(consentBasis) || !['CLEARED', 'PRIVATE_BOUNDED'].includes(privacyStatus) || !['OBSERVED', 'HUMAN_VERIFIED', 'SYNTHETIC_LABELLED', 'ADVERSARIAL_GENERATED'].includes(labelClass)) return null;
  const synthetic = ['SYNTHETIC_LABELLED', 'ADVERSARIAL_GENERATED'].includes(labelClass);
  if (synthetic && raw.groundTruthEligible === true) return null;
  return { exampleId, contentDigest, split, sourceRef, provenanceRef, licenseStatus, consentBasis, privacyStatus, labelClass, synthetic, groundTruthEligible: raw.groundTruthEligible === true };
}

function normalizeDataset(raw = {}) {
  const datasetId = text(raw.datasetId, 200);
  const revision = text(raw.revision, 300);
  const examples = [];
  for (const item of Array.isArray(raw.examples) ? raw.examples : []) { const normalized = normalizeExample(item); if (!normalized) return null; examples.push(normalized); }
  if (!datasetId || !revision || examples.length < 3 || new Set(examples.map(row => row.exampleId)).size !== examples.length) return null;
  const splitCounts = Object.fromEntries(['TRAIN', 'DEV', 'HELDOUT'].map(split => [split, examples.filter(row => row.split === split).length]));
  if (Object.values(splitCounts).some(count => count < 1)) return null;
  const heldoutGroundTruth = examples.filter(row => row.split === 'HELDOUT' && !row.synthetic && row.groundTruthEligible).length;
  if (heldoutGroundTruth < 1) return null;
  const digestOwners = new Map();
  for (const row of examples) { const owners = digestOwners.get(row.contentDigest) || []; owners.push({ exampleId: row.exampleId, split: row.split }); digestOwners.set(row.contentDigest, owners); }
  const leakage = [...digestOwners.entries()].filter(([, rows]) => new Set(rows.map(row => row.split)).size > 1).map(([contentDigest, rows]) => ({ contentDigest, rows }));
  if (leakage.length) return { invalid: true, reason: 'content-digest-cross-split-leakage', leakage };
  const sortedExamples = [...examples].sort((a, b) => a.exampleId.localeCompare(b.exampleId));
  return { datasetId, revision, examples: sortedExamples, splitCounts, heldoutGroundTruth, datasetDigest: digest({ datasetId, revision, examples: sortedExamples }) };
}

function normalizeContaminationScan(raw = {}) {
  const scannerRef = text(raw.scannerRef, 500), scanEvidenceRef = text(raw.scanEvidenceRef, 500), scannedDatasetDigest = text(raw.scannedDatasetDigest, 80)?.toLowerCase(), observed = instant(raw.observedAt);
  const exactHoldoutExposureCount = integer(raw.exactHoldoutExposureCount, 0, 1_000_000_000), nearDuplicateCrossSplitCount = integer(raw.nearDuplicateCrossSplitCount, 0, 1_000_000_000);
  if (!scannerRef || !scanEvidenceRef || !scannedDatasetDigest || !SHA256.test(scannedDatasetDigest) || !observed || exactHoldoutExposureCount === null || nearDuplicateCrossSplitCount === null) return null;
  return { scannerRef, scanEvidenceRef, scannedDatasetDigest, observedAt: observed.raw, observedAtMs: observed.ms, exactHoldoutExposureCount, nearDuplicateCrossSplitCount };
}

function normalizeComputeAuthority(raw = {}) {
  const authorityRef = text(raw.authorityRef, 500), maxComputeUnits = integer(raw.maxComputeUnits, 1, 1_000_000_000_000), maxSpendCents = integer(raw.maxSpendCents, 0, 1_000_000_000_000), expires = instant(raw.expiresAt);
  if (!authorityRef || maxComputeUnits === null || maxSpendCents === null || !expires || raw.authorized !== true) return null;
  return { authorityRef, maxComputeUnits, maxSpendCents, expiresAt: expires.raw, expiresAtMs: expires.ms };
}

export function compileModelAdaptationPlan({ candidateId = null, method = null, baseModel = null, residualBottleneck = null, priorStages = [], dataset = null, contaminationScan = null, computeAuthority = null, proposedAt = null } = {}) {
  const id = text(candidateId, 200), normalizedMethod = text(method, 80)?.toUpperCase(), model = normalizeBaseModel(baseModel || {}), stages = normalizePriorStages(priorStages), data = normalizeDataset(dataset || {}), scan = normalizeContaminationScan(contaminationScan || {}), authority = normalizeComputeAuthority(computeAuthority || {}), proposed = instant(proposedAt);
  const bottleneckMetric = text(residualBottleneck?.metric, 200), bottleneckEvidenceRef = text(residualBottleneck?.measurementEvidenceRef, 500), baselineScore = number(residualBottleneck?.baselineScore, -1_000_000, 1_000_000), targetScore = number(residualBottleneck?.targetScore, -1_000_000, 1_000_000);
  const reasons = [];
  if (!id || !MODEL_ADAPTATION_METHODS.includes(normalizedMethod)) reasons.push('candidate-id-and-supported-adaptation-method-required');
  if (!model) reasons.push('authorized-licensed-base-model-required');
  if (model && !model.supportedMethods.includes(normalizedMethod)) reasons.push('base-model-does-not-support-requested-adaptation-method');
  if (!stages) reasons.push('all-cheaper-prior-improvement-stages-must-be-dispositioned');
  if (!data) reasons.push('valid-provenance-license-consent-privacy-split-dataset-required'); else if (data.invalid) reasons.push(data.reason);
  if (!scan) reasons.push('valid-contamination-scan-required');
  if (!authority) reasons.push('explicit-bounded-compute-authority-required');
  if (!proposed) reasons.push('exact-proposal-time-required');
  if (!bottleneckMetric || !bottleneckEvidenceRef || baselineScore === null || targetScore === null || targetScore <= baselineScore) reasons.push('measured-residual-bottleneck-with-improvement-target-required');
  if (data && !data.invalid && scan && scan.scannedDatasetDigest !== data.datasetDigest) reasons.push('contamination-scan-must-bind-exact-dataset');
  if (scan && (scan.exactHoldoutExposureCount > 0 || scan.nearDuplicateCrossSplitCount > 0)) reasons.push('contaminated-or-cross-split-near-duplicate-dataset-refused');
  if (proposed && scan && (scan.observedAtMs > proposed.ms || proposed.ms - scan.observedAtMs > 86_400_000)) reasons.push('fresh-preproposal-contamination-scan-required');
  if (proposed && authority && authority.expiresAtMs <= proposed.ms) reasons.push('compute-authority-expired-before-plan');
  if (reasons.length) return fail('MODEL_ADAPTATION_PLAN_REFUSED', reasons, data?.leakage ? { leakage: data.leakage } : {});

  const plan = {
    candidateId: id, method: normalizedMethod, baseModel: model,
    residualBottleneck: { metric: bottleneckMetric, measurementEvidenceRef: bottleneckEvidenceRef, baselineScore, targetScore },
    priorStages: stages,
    dataset: { datasetId: data.datasetId, revision: data.revision, datasetDigest: data.datasetDigest, splitCounts: data.splitCounts, heldoutGroundTruth: data.heldoutGroundTruth, syntheticExamples: data.examples.filter(row => row.synthetic).length, groundTruthExamples: data.examples.filter(row => row.groundTruthEligible).length },
    contaminationScan: { scannerRef: scan.scannerRef, scanEvidenceRef: scan.scanEvidenceRef, observedAt: scan.observedAt, exactHoldoutExposureCount: 0, nearDuplicateCrossSplitCount: 0 },
    computeEnvelope: { authorityRef: authority.authorityRef, maxComputeUnits: authority.maxComputeUnits, maxSpendCents: authority.maxSpendCents, expiresAt: authority.expiresAt }, proposedAt: proposed.raw
  };
  return { ok: true, version: MODEL_ADAPTATION_LIFECYCLE_VERSION, status: 'MODEL_ADAPTATION_TRAINING_PLAN_ADMISSIBLE__EXECUTION_SEPARATE', plan, planDigest: digest(plan), escalationLaw: 'PROMPT_RETRIEVAL_TOOLS_DECOMPOSITION_COMPOSITION_AND_AUTHORIZED_EXISTING_MODEL_PRECEDE_ADAPTATION', trainingAuthority: 'NONE', promotionAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO_EFFECTS } };
}

function normalizeTrainingReceipt(raw = {}) {
  const planDigest = text(raw.planDigest, 80)?.toLowerCase(), datasetDigest = text(raw.datasetDigest, 80)?.toLowerCase(), trainedWeightsDigest = text(raw.trainedWeightsDigest, 80)?.toLowerCase(), trainerRuntimeDigest = text(raw.trainerRuntimeDigest, 80)?.toLowerCase(), trainerId = text(raw.trainerId, 200), verifierId = text(raw.verifierId, 200), evidenceRef = text(raw.evidenceRef, 500), evidenceClass = text(raw.evidenceClass, 80)?.toUpperCase(), observed = instant(raw.observedAt), actualComputeUnits = integer(raw.actualComputeUnits, 0, 1_000_000_000_000), actualSpendCents = integer(raw.actualSpendCents, 0, 1_000_000_000_000);
  if (![planDigest, datasetDigest, trainedWeightsDigest, trainerRuntimeDigest].every(value => value && SHA256.test(value)) || !trainerId || !verifierId || trainerId === verifierId || !evidenceRef || evidenceClass !== 'OBSERVED_TRAINING' || !observed || actualComputeUnits === null || actualSpendCents === null) return null;
  return { planDigest, datasetDigest, trainedWeightsDigest, trainerRuntimeDigest, trainerId, verifierId, evidenceRef, evidenceClass, observedAt: observed.raw, observedAtMs: observed.ms, actualComputeUnits, actualSpendCents };
}

function normalizeServingArtifact(raw = {}) {
  const modelId = text(raw.modelId, 200), revision = text(raw.revision, 300), sourceTrainedWeightsDigest = text(raw.sourceTrainedWeightsDigest, 80)?.toLowerCase(), weightsDigest = text(raw.weightsDigest, 80)?.toLowerCase(), runtimeDigest = text(raw.runtimeDigest, 80)?.toLowerCase(), quantizationRef = text(raw.quantizationRef, 500), hardwareRef = text(raw.hardwareRef, 500), transformEvidenceRef = text(raw.transformEvidenceRef, 500);
  if (!modelId || !revision || !sourceTrainedWeightsDigest || !weightsDigest || !runtimeDigest || ![sourceTrainedWeightsDigest, weightsDigest, runtimeDigest].every(value => SHA256.test(value)) || !quantizationRef || !hardwareRef || !transformEvidenceRef) return null;
  const artifact = { modelId, revision, sourceTrainedWeightsDigest, weightsDigest, runtimeDigest, quantizationRef, hardwareRef, transformEvidenceRef };
  return { ...artifact, servingArtifactDigest: digest(artifact) };
}

export function evaluateAdaptedServingArtifact({ planResult = null, trainingReceipt = null, servingArtifact = null, servingEvaluation = null, securityAdmission = null, recovery = null, revocation = null, observedAt = null } = {}) {
  const structurallyValidPlan = planResult?.ok === true && planResult?.version === MODEL_ADAPTATION_LIFECYCLE_VERSION && planResult?.status === 'MODEL_ADAPTATION_TRAINING_PLAN_ADMISSIBLE__EXECUTION_SEPARATE' && text(planResult?.planDigest, 80) && planResult.planDigest === digest(planResult.plan);
  if (!structurallyValidPlan) return fail('ADAPTED_SERVING_ARTIFACT_REFUSED', ['valid-unmodified-adaptation-plan-required']);
  const training = normalizeTrainingReceipt(trainingReceipt || {}), serving = normalizeServingArtifact(servingArtifact || {}), observed = instant(observedAt);
  const reasons = [];
  if (!training) reasons.push('valid-independently-observed-training-receipt-required');
  if (!serving) reasons.push('exact-serving-artifact-identity-required');
  if (!observed) reasons.push('exact-serving-evaluation-time-required');
  if (training && training.planDigest !== planResult.planDigest.toLowerCase()) reasons.push('training-receipt-plan-digest-mismatch');
  if (training && training.datasetDigest !== planResult.plan?.dataset?.datasetDigest?.toLowerCase()) reasons.push('training-receipt-dataset-digest-mismatch');
  if (training && training.actualComputeUnits > planResult.plan?.computeEnvelope?.maxComputeUnits) reasons.push('training-compute-exceeded-authorized-envelope');
  if (training && training.actualSpendCents > planResult.plan?.computeEnvelope?.maxSpendCents) reasons.push('training-spend-exceeded-authorized-envelope');
  const expiry = instant(planResult.plan?.computeEnvelope?.expiresAt);
  if (training && expiry && training.observedAtMs > expiry.ms) reasons.push('training-finished-after-compute-authority-expiry');
  if (training && observed && training.observedAtMs > observed.ms) reasons.push('future-dated-training-receipt-refused');
  if (training && serving && serving.sourceTrainedWeightsDigest !== training.trainedWeightsDigest) reasons.push('serving-artifact-must-descend-from-exact-trained-weights');

  const evaluationSubject = text(servingEvaluation?.servingArtifactDigest, 80)?.toLowerCase(), compound = servingEvaluation?.compoundEvaluation;
  if (!serving || evaluationSubject !== serving?.servingArtifactDigest.toLowerCase()) reasons.push('evaluation-must-bind-exact-serving-artifact');
  if (!compound?.ok || compound?.version !== COMPOUND_INTELLIGENCE_EVALUATION_VERSION || compound?.status !== 'COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE' || compound?.asiStatus !== 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED' || compound?.promotionAuthority !== 'NONE' || !SHA256.test(String(compound?.receiptHash || ''))) reasons.push('successful-c13-defined-scope-evaluation-required');
  if (serving && compound?.receipt) {
    const included = (Array.isArray(compound.receipt.componentRevisions) ? compound.receipt.componentRevisions : []).some(row => row?.componentId === serving.modelId && row?.revision === serving.servingArtifactDigest);
    if (!included) reasons.push('c13-evaluation-must-include-exact-serving-artifact-as-component');
  }
  const servingEvalRef = text(servingEvaluation?.evidenceRef, 500), evaluatorId = text(servingEvaluation?.evaluatorId, 200);
  if (!servingEvalRef || !evaluatorId || (training && [training.trainerId, training.verifierId].includes(evaluatorId))) reasons.push('independent-serving-evaluator-required');

  const securityGood = securityAdmission?.ok && securityAdmission?.version === CAPABILITY_SCALED_SECURITY_VERSION && securityAdmission?.status === 'C26_SECURITY_ADMISSION_READY_FOR_SEPARATE_EFFECT_GATE' && securityAdmission?.businessEffectAuthority === 'NONE' && SHA256.test(String(securityAdmission?.subjectDigest || ''));
  if (!securityGood) reasons.push('successful-c26-serving-security-admission-required');
  if (serving && (securityAdmission?.subject?.capabilityId !== serving.modelId || String(securityAdmission?.subject?.sourceHash || '').toLowerCase() !== serving.weightsDigest.toLowerCase() || securityAdmission?.subject?.sourceRevision !== serving.revision || securityAdmission?.subject?.composition?.id !== serving.servingArtifactDigest)) reasons.push('c26-security-admission-must-bind-complete-serving-artifact');
  if (securityAdmission?.subject?.composition?.selfModifying === true && securityAdmission?.asiClaim !== 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED') reasons.push('security-admission-cannot-claim-asi');

  const recoveryEvaluator = text(recovery?.verifierId, 200), rollbackRef = text(recovery?.rollbackRef, 500), recoveryServingDigest = text(recovery?.servingArtifactDigest, 80)?.toLowerCase(), priorWeightsDigest = text(recovery?.priorWeightsDigest, 80)?.toLowerCase(), restoredWeightsDigest = text(recovery?.restoredWeightsDigest, 80)?.toLowerCase(), canaryEvidenceRef = text(recovery?.canaryEvidenceRef, 500);
  if (!serving || recoveryServingDigest !== serving?.servingArtifactDigest.toLowerCase() || !recoveryEvaluator || !rollbackRef || !priorWeightsDigest || !restoredWeightsDigest || !SHA256.test(priorWeightsDigest) || !SHA256.test(restoredWeightsDigest) || !canaryEvidenceRef || recovery?.canaryPassed !== true || recovery?.restorePassed !== true || priorWeightsDigest !== restoredWeightsDigest) reasons.push('exact-serving-canary-and-old-version-restore-proof-required');
  if (training && [training.trainerId, training.verifierId].includes(recoveryEvaluator)) reasons.push('recovery-verifier-must-be-independent-of-training');
  if (evaluatorId && recoveryEvaluator === evaluatorId) reasons.push('recovery-verifier-must-be-independent-of-serving-evaluator');

  const revocationRef = text(revocation?.revocationRef, 500), revocationVerifier = text(revocation?.verifierId, 200), exactServingDigest = text(revocation?.servingArtifactDigest, 80)?.toLowerCase();
  if (!serving || !revocationRef || !revocationVerifier || exactServingDigest !== serving?.servingArtifactDigest.toLowerCase() || revocation?.revocationPathTested !== true) reasons.push('exact-serving-revocation-proof-required');
  if ([training?.trainerId, training?.verifierId, evaluatorId, recoveryEvaluator].filter(Boolean).includes(revocationVerifier)) reasons.push('revocation-verifier-must-be-independent');
  if (reasons.length) return fail('ADAPTED_SERVING_ARTIFACT_REFUSED', reasons, serving ? { servingArtifactDigest: serving.servingArtifactDigest } : {});

  const receipt = { candidateId: planResult.plan.candidateId, method: planResult.plan.method, planDigest: planResult.planDigest, datasetDigest: training.datasetDigest, trainedWeightsDigest: training.trainedWeightsDigest, servingArtifactDigest: serving.servingArtifactDigest, servingWeightsDigest: serving.weightsDigest, servingRuntimeDigest: serving.runtimeDigest, servingEvaluationRef: servingEvalRef, compoundEvaluationReceiptHash: compound.receiptHash, securitySubjectDigest: securityAdmission.subjectDigest, rollbackRef, priorWeightsDigest, canaryEvidenceRef, revocationRef, observedAt: observed.raw };
  return { ok: true, version: MODEL_ADAPTATION_LIFECYCLE_VERSION, status: 'ADAPTED_SERVING_ARTIFACT_ELIGIBLE_FOR_SEPARATE_PROMOTION_DECISION', receipt, receiptDigest: digest(receipt), servingBoundary: 'TRAINED_WEIGHTS_ARE_NOT_THE_SERVED_ARTIFACT__QUANTIZATION_RUNTIME_AND_HARDWARE_MUST_BE_EVALUATED_AS_SERVED', promotionBoundary: 'THIS_LIFECYCLE_NEVER_PROMOTES_DEPLOYS_OR_ROUTES_THE_MODEL', asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED', trainingAuthority: 'NONE', promotionAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO_EFFECTS } };
}
