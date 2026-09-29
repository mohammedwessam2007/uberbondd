import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  sealedManifestCommitmentDigest,
  sealedCorpusDigestFromManifest
} from './apex-sealed-tournament.mjs';

export const APEX_FRESH_CAMPAIGN_VERSION = 'uberbond.apex-fresh-campaign.v1';
export const APEX_FRESH_CAMPAIGN_ARCHITECTURE_CLASSES = Object.freeze([
  'INCUMBENT',
  'CHALLENGER',
  'PUBLIC_BASELINE'
]);

const FORBIDDEN_RAW_HOLDOUT_KEYS = new Set([
  'prompt',
  'rawPrompt',
  'rawPrompts',
  'answer',
  'rawAnswer',
  'rawAnswers',
  'expectedAnswer',
  'expectedAnswers',
  'referenceAnswer',
  'referenceAnswers',
  'taskBody',
  'taskBodies',
  'plaintextAnswer',
  'plaintextAnswers'
]);

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function envelope(extra = {}) {
  return {
    policyVersion: APEX_FRESH_CAMPAIGN_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    providerCallAuthority: 'NONE',
    spendAuthority: 'NONE',
    executionAuthority: 'NONE',
    ...extra
  };
}

function fail(status, reasonCodes, extra = {}) {
  return envelope({
    ok: false,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  });
}

function text(value, max = 5000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function timestamp(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function hasForbiddenRawHoldoutMaterial(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = hasForbiddenRawHoldoutMaterial(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_RAW_HOLDOUT_KEYS.has(key)) return `${path}.${key}`;
    const found = hasForbiddenRawHoldoutMaterial(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function normalizeModelRequirement(raw, index) {
  const candidateId = text(raw?.candidateId, 240)?.toLowerCase();
  const role = text(raw?.role, 160)?.toUpperCase();
  const reasoningSettingRef = text(raw?.reasoningSettingRef, 500);
  const count = integer(raw?.count ?? 1, 1, 10000);
  const transportClass = text(raw?.transportClass ?? 'ANY_VERIFIED', 80)?.toUpperCase();
  const reasons = [];
  if (!candidateId) reasons.push(`model-${index}:candidate-id-required`);
  if (!role) reasons.push(`model-${index}:role-required`);
  if (!reasoningSettingRef) reasons.push(`model-${index}:reasoning-setting-required`);
  if (count == null) reasons.push(`model-${index}:bounded-count-required`);
  if (!['ANY_VERIFIED', 'DIRECT', 'GATEWAY'].includes(transportClass)) {
    reasons.push(`model-${index}:recognized-transport-class-required`);
  }
  return reasons.length ? { ok: false, reasonCodes: reasons } : {
    ok: true,
    value: { candidateId, role, reasoningSettingRef, count, transportClass }
  };
}

function normalizeArchitecture(raw, index, defaultFrozenAt) {
  const architectureId = text(raw?.architectureId, 240)?.toLowerCase();
  const architectureClass = text(raw?.architectureClass, 80)?.toUpperCase();
  const revision = text(raw?.architectureRevision, 240);
  const sourceRef = text(raw?.architectureSourceRef, 1600);
  const frozenAt = timestamp(raw?.architectureFrozenAt ?? defaultFrozenAt);
  const topologyRef = text(raw?.topologyRef, 1600);
  const contextPolicyRef = text(raw?.contextPolicyRef, 1600);
  const verifierPolicyRef = text(raw?.verifierPolicyRef, 1600);
  const promptContractRef = text(raw?.promptContractRef, 1600);
  const jevMode = text(raw?.jevMode ?? 'NONE', 80)?.toUpperCase();
  const deterministicCrystallization = raw?.deterministicCrystallization === true;
  const trialSpendCeilingUsd = finite(raw?.trialSpendCeilingUsd, 0.000001, 1_000_000);
  const evidencePrerequisites = Array.isArray(raw?.evidencePrerequisites)
    ? [...new Set(raw.evidencePrerequisites.map(value => text(value, 500)).filter(Boolean))]
    : [];
  const reasons = [];

  if (!architectureId) reasons.push(`architecture-${index}:id-required`);
  if (!APEX_FRESH_CAMPAIGN_ARCHITECTURE_CLASSES.includes(architectureClass)) {
    reasons.push(`architecture-${index}:recognized-class-required`);
  }
  if (!revision || !sourceRef || !frozenAt) reasons.push(`architecture-${index}:revision-source-freeze-required`);
  if (!topologyRef || !contextPolicyRef || !verifierPolicyRef || !promptContractRef) {
    reasons.push(`architecture-${index}:complete-policy-refs-required`);
  }
  if (!['NONE', 'SHADOW_ONLY', 'CALIBRATED_BOUNDED'].includes(jevMode)) {
    reasons.push(`architecture-${index}:recognized-jev-mode-required`);
  }
  if (trialSpendCeilingUsd == null) reasons.push(`architecture-${index}:trial-spend-ceiling-required`);
  if (!Array.isArray(raw?.modelRequirements) || raw.modelRequirements.length === 0 || raw.modelRequirements.length > 1000) {
    reasons.push(`architecture-${index}:bounded-model-requirements-required`);
  }

  const models = [];
  for (const [modelIndex, modelRaw] of (raw?.modelRequirements || []).entries()) {
    const normalized = normalizeModelRequirement(modelRaw, modelIndex);
    if (!normalized.ok) reasons.push(...normalized.reasonCodes.map(code => `architecture-${index}:${code}`));
    else models.push(normalized.value);
  }

  const seenModelRoles = new Set();
  for (const model of models) {
    const key = `${model.candidateId}::${model.role}::${model.reasoningSettingRef}::${model.transportClass}`;
    if (seenModelRoles.has(key)) reasons.push(`architecture-${index}:duplicate-model-requirement`);
    seenModelRoles.add(key);
  }

  if (reasons.length) return { ok: false, reasonCodes: reasons };

  const identityMaterial = {
    architectureId,
    architectureClass,
    architectureRevision: revision,
    architectureSourceRef: sourceRef,
    architectureFrozenAt: frozenAt,
    topologyRef,
    contextPolicyRef,
    verifierPolicyRef,
    promptContractRef,
    jevMode,
    deterministicCrystallization,
    trialSpendCeilingUsd,
    evidencePrerequisites,
    modelRequirements: models
  };

  return {
    ok: true,
    value: {
      ...identityMaterial,
      architectureDigest: digest(identityMaterial)
    }
  };
}

function campaignIdentityMaterial({
  campaignId,
  suiteVersion,
  taskClass,
  minimumTaskCount,
  qualityFloorPolicy,
  budgetPolicy,
  architectureRoster
}) {
  return {
    campaignId,
    suiteVersion,
    taskClass,
    minimumTaskCount,
    qualityFloorPolicy,
    budgetPolicy,
    architectureRoster
  };
}

export function prepareFreshApexCampaign({
  campaignId,
  suiteVersion,
  taskClass,
  minimumTaskCount = 100,
  architectureFrozenAt,
  qualityFloorPolicy = {},
  budgetPolicy = {},
  architectures = [],
  custodianPolicy = {}
} = {}) {
  const rawLeak = hasForbiddenRawHoldoutMaterial({
    campaignId, suiteVersion, taskClass, minimumTaskCount, architectureFrozenAt,
    qualityFloorPolicy, budgetPolicy, architectures, custodianPolicy
  });
  if (rawLeak) return fail('FRESH_APEX_CAMPAIGN_REFUSED', ['raw-holdout-material-prohibited-in-campaign-plan'], { rawLeakPath: rawLeak });

  const id = text(campaignId, 240)?.toLowerCase();
  const suite = text(suiteVersion, 160);
  const klass = text(taskClass, 160)?.toLowerCase();
  const minTasks = integer(minimumTaskCount, 20, 100000);
  const freeze = timestamp(architectureFrozenAt);

  const qualityMode = text(qualityFloorPolicy?.mode ?? 'LEXICOGRAPHIC_FRONTIER_FIRST', 160)?.toUpperCase();
  const frontierBaselineId = text(qualityFloorPolicy?.frontierBaselineArchitectureId, 240)?.toLowerCase();
  const maxQualityDelta = finite(qualityFloorPolicy?.maxQualityDelta ?? 0, 0, 1);
  const requireNoWorseFalsePositiveUpperBound = qualityFloorPolicy?.requireNoWorseFalsePositiveUpperBound !== false;

  const normalization = text(budgetPolicy?.normalization ?? 'COMMON_CEILING', 120)?.toUpperCase();
  const maxMeanCostUsd = finite(budgetPolicy?.maxMeanCostUsd, 0.000001, 1_000_000);
  const maxMeanLatencyMs = finite(budgetPolicy?.maxMeanLatencyMs, 1, 86_400_000);
  const maxMeanFounderMinutes = finite(budgetPolicy?.maxMeanFounderMinutes, 0, 100000);
  const maxTotalCampaignSpendUsd = finite(budgetPolicy?.maxTotalCampaignSpendUsd, 0.000001, 1_000_000);

  const rawStorage = text(custodianPolicy?.rawStorage ?? 'OUTSIDE_REPOSITORY', 120)?.toUpperCase();
  const evaluatorIndependenceRequired = custodianPolicy?.evaluatorIndependenceRequired !== false;
  const architectureFreezeBeforeCommitmentRequired = custodianPolicy?.architectureFreezeBeforeCommitmentRequired !== false;
  const freshGenerationRequired = custodianPolicy?.freshGenerationRequired !== false;
  const previouslyEvaluatedItemReuseAllowed = custodianPolicy?.previouslyEvaluatedItemReuseAllowed === true;

  const reasons = [];
  if (!id || !suite || !klass || minTasks == null || !freeze) reasons.push('campaign-suite-task-freeze-required');
  if (qualityMode !== 'LEXICOGRAPHIC_FRONTIER_FIRST') reasons.push('lexicographic-frontier-first-quality-policy-required');
  if (!frontierBaselineId || maxQualityDelta == null) reasons.push('frontier-baseline-and-quality-delta-required');
  if (normalization !== 'COMMON_CEILING' || [maxMeanCostUsd, maxMeanLatencyMs, maxMeanFounderMinutes, maxTotalCampaignSpendUsd].some(value => value == null)) {
    reasons.push('matched-cost-latency-founder-and-total-spend-ceilings-required');
  }
  if (rawStorage !== 'OUTSIDE_REPOSITORY') reasons.push('raw-holdouts-must-stay-outside-repository');
  if (!evaluatorIndependenceRequired) reasons.push('independent-evaluator-policy-required');
  if (!architectureFreezeBeforeCommitmentRequired) reasons.push('architecture-freeze-before-commitment-required');
  if (!freshGenerationRequired) reasons.push('fresh-generation-policy-required');
  if (previouslyEvaluatedItemReuseAllowed) reasons.push('previously-evaluated-item-reuse-prohibited');
  if (!Array.isArray(architectures) || architectures.length < 2 || architectures.length > 1000) {
    reasons.push('two-to-1000-architectures-required');
  }
  if (reasons.length) return fail('FRESH_APEX_CAMPAIGN_REFUSED', reasons);

  const roster = [];
  const architectureReasons = [];
  const seenIds = new Set();
  for (const [index, architecture] of architectures.entries()) {
    const normalized = normalizeArchitecture(architecture, index, freeze);
    if (!normalized.ok) {
      architectureReasons.push(...normalized.reasonCodes);
      continue;
    }
    if (seenIds.has(normalized.value.architectureId)) {
      architectureReasons.push(`architecture-${index}:unique-architecture-id-required`);
      continue;
    }
    seenIds.add(normalized.value.architectureId);
    roster.push(normalized.value);
  }
  if (architectureReasons.length) return fail('FRESH_APEX_CAMPAIGN_REFUSED', architectureReasons);

  const incumbents = roster.filter(row => row.architectureClass === 'INCUMBENT');
  const challengers = roster.filter(row => row.architectureClass === 'CHALLENGER');
  if (incumbents.length !== 1) reasons.push('exactly-one-incumbent-required');
  if (challengers.length < 1) reasons.push('at-least-one-challenger-required');
  if (!seenIds.has(frontierBaselineId)) reasons.push('frontier-baseline-must-be-in-roster');
  if (reasons.length) return fail('FRESH_APEX_CAMPAIGN_REFUSED', reasons);

  const quality = {
    mode: 'LEXICOGRAPHIC_FRONTIER_FIRST',
    frontierBaselineArchitectureId: frontierBaselineId,
    maxQualityDelta,
    requireNoWorseFalsePositiveUpperBound
  };
  const sumTrialSpendCeilingsUsd = Number(roster.reduce((sum, row) => sum + row.trialSpendCeilingUsd, 0).toFixed(8));
  if (sumTrialSpendCeilingsUsd > maxTotalCampaignSpendUsd + 1e-9) {
    return fail('FRESH_APEX_CAMPAIGN_REFUSED', ['architecture-trial-ceilings-exceed-total-campaign-spend-cap'], {
      sumTrialSpendCeilingsUsd,
      maxTotalCampaignSpendUsd
    });
  }
  const budget = {
    normalization: 'COMMON_CEILING',
    maxMeanCostUsd,
    maxMeanLatencyMs,
    maxMeanFounderMinutes,
    maxTotalCampaignSpendUsd,
    sumTrialSpendCeilingsUsd
  };
  const custodian = {
    rawStorage: 'OUTSIDE_REPOSITORY',
    evaluatorIndependenceRequired: true,
    architectureFreezeBeforeCommitmentRequired: true,
    freshGenerationRequired: true,
    previouslyEvaluatedItemReuseAllowed: false,
    optimizerAccessBeforeEvaluation: false,
    candidateAccessBeforeEvaluation: false,
    plaintextAnswersExposedBeforeEvaluation: false
  };

  const identity = campaignIdentityMaterial({
    campaignId: id,
    suiteVersion: suite,
    taskClass: klass,
    minimumTaskCount: minTasks,
    qualityFloorPolicy: quality,
    budgetPolicy: budget,
    architectureRoster: roster
  });
  const campaignDigest = digest(identity);
  const architectureRosterDigest = digest(roster);

  return envelope({
    ok: true,
    status: 'FRESH_APEX_CAMPAIGN_PREPARED',
    campaignId: id,
    suiteVersion: suite,
    taskClass: klass,
    minimumTaskCount: minTasks,
    campaignDigest,
    architectureRosterDigest,
    architectureRoster: roster,
    qualityFloorPolicy: quality,
    budgetPolicy: budget,
    custodianPolicy: custodian,
    rawHoldoutMaterialAccepted: false,
    legacyEvaluatedEvidenceReusableAsFreshEvidence: false,
    nextGate: 'EXTERNAL_FRESH_HOLDOUT_CUSTODIAN_COMMITMENT',
    truthBoundary: 'THIS PLAN FREEZES ARCHITECTURE IDENTITIES AND THE QUALITY/COST EXPERIMENT CONTRACT. IT DOES NOT CREATE, STORE, VIEW OR EVALUATE RAW HOLDOUTS AND DOES NOT AUTHORIZE MODEL CALLS OR SPEND.'
  });
}

export function admitFreshCustodianManifest({
  campaignPlan,
  sealedManifest = [],
  custodianReceipt = {}
} = {}) {
  if (!campaignPlan?.ok || campaignPlan?.status !== 'FRESH_APEX_CAMPAIGN_PREPARED') {
    return fail('FRESH_CUSTODIAN_MANIFEST_REFUSED', ['prepared-fresh-campaign-plan-required']);
  }

  const rawLeak = hasForbiddenRawHoldoutMaterial(custodianReceipt);
  if (rawLeak) return fail('FRESH_CUSTODIAN_MANIFEST_REFUSED', ['raw-holdout-material-prohibited-in-custodian-receipt'], { rawLeakPath: rawLeak });

  const manifestDigest = sealedManifestCommitmentDigest(sealedManifest);
  const corpusDigest = sealedCorpusDigestFromManifest(sealedManifest);
  const taskCount = Array.isArray(sealedManifest) ? sealedManifest.length : 0;
  const reasons = [];

  if (!manifestDigest || !corpusDigest) reasons.push('valid-sealed-manifest-required');
  if (taskCount < campaignPlan.minimumTaskCount) reasons.push('minimum-fresh-task-count-not-met');

  const campaignDigest = text(custodianReceipt?.campaignDigest, 128);
  const receiptCampaignId = text(custodianReceipt?.campaignId, 240)?.toLowerCase();
  const suiteVersion = text(custodianReceipt?.suiteVersion, 160);
  const receiptManifestDigest = text(custodianReceipt?.manifestDigest, 128);
  const receiptCorpusDigest = text(custodianReceipt?.corpusDigest, 128);
  const receiptTaskCount = integer(custodianReceipt?.taskCount, 1, 100000);
  const commitmentRef = text(custodianReceipt?.commitmentRef, 1600);
  const committedAt = timestamp(custodianReceipt?.committedAt);
  const sourceFreezeRef = text(custodianReceipt?.sourceFreezeRef, 1600);
  const evaluatorRef = text(custodianReceipt?.evaluatorRef, 1600);
  const custodianRef = text(custodianReceipt?.custodianRef, 1600);

  if (!commitmentRef || !committedAt || !sourceFreezeRef || !evaluatorRef || !custodianRef) {
    reasons.push('complete-external-custodian-provenance-required');
  }
  if (campaignDigest !== campaignPlan.campaignDigest) reasons.push('custodian-campaign-digest-mismatch');
  if (receiptCampaignId !== campaignPlan.campaignId) reasons.push('custodian-campaign-id-mismatch');
  if (suiteVersion !== campaignPlan.suiteVersion) reasons.push('custodian-suite-mismatch');
  if (receiptManifestDigest !== manifestDigest) reasons.push('custodian-manifest-digest-mismatch');
  if (receiptCorpusDigest !== corpusDigest) reasons.push('custodian-corpus-digest-mismatch');
  if (receiptTaskCount !== taskCount) reasons.push('custodian-task-count-mismatch');

  if (custodianReceipt?.rawHoldoutsStoredInRepository !== false) reasons.push('raw-holdouts-must-remain-outside-repository');
  if (custodianReceipt?.optimizerAccessBeforeEvaluation !== false) reasons.push('optimizer-pre-evaluation-access-must-be-false');
  if (custodianReceipt?.candidateAccessBeforeEvaluation !== false) reasons.push('candidate-pre-evaluation-access-must-be-false');
  if (custodianReceipt?.plaintextAnswersExposedBeforeEvaluation !== false) reasons.push('plaintext-answer-pre-evaluation-exposure-must-be-false');
  if (custodianReceipt?.evaluatorIndependent !== true) reasons.push('independent-evaluator-required');
  if (custodianReceipt?.custodianIndependent !== true) reasons.push('independent-custodian-required');
  if (custodianReceipt?.freshlyGeneratedForCampaign !== true) reasons.push('fresh-campaign-generation-required');
  if (custodianReceipt?.tasksPreviouslyEvaluated !== false) reasons.push('previously-evaluated-task-reuse-prohibited');
  if (custodianReceipt?.tasksDerivedFromPreviouslyEvaluatedItems !== false) reasons.push('evaluated-item-derivation-prohibited');
  if (custodianReceipt?.legacyEvidenceReuse !== false) reasons.push('legacy-evidence-reuse-prohibited');
  if (custodianReceipt?.secretFreeReceipt !== true) reasons.push('secret-free-receipt-required');

  const latestArchitectureFreezeMs = Math.max(...campaignPlan.architectureRoster.map(row => Date.parse(row.architectureFrozenAt)));
  const committedAtMs = committedAt ? Date.parse(committedAt) : NaN;
  if (Number.isFinite(committedAtMs) && committedAtMs < latestArchitectureFreezeMs) {
    reasons.push('holdout-commitment-must-follow-architecture-freeze');
  }
  if (Number.isFinite(committedAtMs) && committedAtMs > Date.now() + 60_000) {
    reasons.push('future-custodian-commitment-prohibited');
  }

  if (reasons.length) return fail('FRESH_CUSTODIAN_MANIFEST_REFUSED', reasons);

  const holdoutCommitment = {
    commitmentRef,
    committedAt,
    sourceFreezeRef,
    evaluatorRef,
    suiteVersion: campaignPlan.suiteVersion,
    corpusDigest,
    manifestDigest,
    taskCount,
    rawHoldoutsStoredInRepository: false,
    optimizerAccessBeforeEvaluation: false,
    candidateAccessBeforeEvaluation: false,
    plaintextAnswersExposedBeforeEvaluation: false,
    evaluatorIndependent: true
  };

  const admittedDigest = digest({
    campaignDigest: campaignPlan.campaignDigest,
    architectureRosterDigest: campaignPlan.architectureRosterDigest,
    manifestDigest,
    corpusDigest,
    taskCount,
    commitmentRef,
    committedAt,
    sourceFreezeRef,
    evaluatorRef,
    custodianRef
  });

  return envelope({
    ok: true,
    status: 'FRESH_CUSTODIAN_MANIFEST_ADMITTED',
    campaignId: campaignPlan.campaignId,
    campaignDigest: campaignPlan.campaignDigest,
    architectureRosterDigest: campaignPlan.architectureRosterDigest,
    suiteVersion: campaignPlan.suiteVersion,
    taskClass: campaignPlan.taskClass,
    taskCount,
    manifestDigest,
    corpusDigest,
    commitmentRef,
    custodianRef,
    holdoutCommitment,
    admittedDigest,
    rawHoldoutMaterialAccepted: false,
    legacyEvidenceReuse: false,
    nextGate: 'EXACT_RUNTIME_AND_PRICING_RECEIPTS',
    truthBoundary: 'THIS ADMISSION BINDS A SAFE SEALED MANIFEST TO AN EXTERNAL CUSTODIAN RECEIPT AND THE PRE-FROZEN CAMPAIGN. IT CANNOT PROVE THE EXTERNAL CUSTODIAN TOLD THE TRUTH OR THAT EQUIVALENT TASKS NEVER EXISTED IN MODEL TRAINING.'
  });
}

function runtimeReceiptKey(candidateId, reasoningSettingRef, transportClass) {
  return `${candidateId}::${reasoningSettingRef}::${transportClass}`;
}

export function assessFreshCampaignRuntimeReadiness({
  campaignPlan,
  admittedCampaign,
  runtimeReceipts = [],
  pricingReceipts = [],
  prerequisiteReceipts = []
} = {}) {
  if (!campaignPlan?.ok || campaignPlan?.status !== 'FRESH_APEX_CAMPAIGN_PREPARED') {
    return fail('FRESH_CAMPAIGN_RUNTIME_NOT_READY', ['prepared-fresh-campaign-plan-required']);
  }
  if (!admittedCampaign?.ok || admittedCampaign?.status !== 'FRESH_CUSTODIAN_MANIFEST_ADMITTED') {
    return fail('FRESH_CAMPAIGN_RUNTIME_NOT_READY', ['admitted-fresh-custodian-manifest-required']);
  }
  if (admittedCampaign.campaignDigest !== campaignPlan.campaignDigest) {
    return fail('FRESH_CAMPAIGN_RUNTIME_NOT_READY', ['campaign-digest-mismatch']);
  }

  const runtimeMap = new Map();
  const pricingMap = new Map();
  const prerequisiteSet = new Set((prerequisiteReceipts || []).map(row => text(row?.evidenceRef, 1600)).filter(Boolean));
  const reasons = [];
  const requiredRuntimeKeys = new Set();

  for (const architecture of campaignPlan.architectureRoster) {
    for (const requirement of architecture.modelRequirements) {
      requiredRuntimeKeys.add(runtimeReceiptKey(
        requirement.candidateId,
        requirement.reasoningSettingRef,
        requirement.transportClass
      ));
    }
    for (const prerequisite of architecture.evidencePrerequisites) {
      if (!prerequisiteSet.has(prerequisite)) {
        reasons.push(`architecture-${architecture.architectureId}:missing-evidence-prerequisite:${prerequisite}`);
      }
    }
  }

  for (const [index, raw] of runtimeReceipts.entries()) {
    const candidateId = text(raw?.candidateId, 240)?.toLowerCase();
    const reasoningSettingRef = text(raw?.reasoningSettingRef, 500);
    const transportClass = text(raw?.transportClass ?? 'ANY_VERIFIED', 80)?.toUpperCase();
    const observedAt = timestamp(raw?.observedAt);
    const evidenceRef = text(raw?.evidenceRef, 1600);
    if (!candidateId || !reasoningSettingRef || !['ANY_VERIFIED', 'DIRECT', 'GATEWAY'].includes(transportClass) || !observedAt || !evidenceRef) {
      reasons.push(`runtime-${index}:complete-runtime-identity-required`);
      continue;
    }
    if (raw?.callableNow !== true) reasons.push(`runtime-${index}:callable-now-proof-required`);
    if (raw?.exactModelIdentityMatched !== true) reasons.push(`runtime-${index}:exact-model-identity-match-required`);
    if (raw?.exactReasoningSettingMatched !== true) reasons.push(`runtime-${index}:exact-reasoning-setting-match-required`);
    if (raw?.transportVerified !== true) reasons.push(`runtime-${index}:verified-transport-required`);
    if (raw?.providerCallObserved !== true) reasons.push(`runtime-${index}:observed-provider-call-required`);
    if (Date.parse(observedAt) < Math.max(...campaignPlan.architectureRoster.map(row => Date.parse(row.architectureFrozenAt)))) {
      reasons.push(`runtime-${index}:runtime-proof-predates-campaign-freeze`);
    }
    if (Date.parse(observedAt) > Date.now() + 60_000) reasons.push(`runtime-${index}:future-runtime-proof-prohibited`);
    const key = runtimeReceiptKey(candidateId, reasoningSettingRef, transportClass);
    if (runtimeMap.has(key)) reasons.push(`runtime-${index}:duplicate-runtime-proof`);
    runtimeMap.set(key, { candidateId, reasoningSettingRef, transportClass, observedAt, evidenceRef });
  }

  for (const [index, raw] of pricingReceipts.entries()) {
    const candidateId = text(raw?.candidateId, 240)?.toLowerCase();
    const pricingMode = text(raw?.pricingMode, 120)?.toUpperCase();
    const observedAt = timestamp(raw?.observedAt);
    const evidenceRef = text(raw?.evidenceRef, 1600);
    const inputUsdPerMillion = finite(raw?.inputUsdPerMillion, 0, 1_000_000);
    const outputUsdPerMillion = finite(raw?.outputUsdPerMillion, 0, 1_000_000);
    const cacheReadUsdPerMillion = raw?.cacheReadUsdPerMillion == null
      ? null
      : finite(raw.cacheReadUsdPerMillion, 0, 1_000_000);
    if (!candidateId || !pricingMode || !observedAt || !evidenceRef || inputUsdPerMillion == null || outputUsdPerMillion == null) {
      reasons.push(`pricing-${index}:complete-pricing-proof-required`);
      continue;
    }
    if (raw?.officialOrMeteredEvidence !== true) reasons.push(`pricing-${index}:official-or-metered-pricing-evidence-required`);
    if (Date.parse(observedAt) > Date.now() + 60_000) reasons.push(`pricing-${index}:future-pricing-proof-prohibited`);
    const key = `${candidateId}::${pricingMode}`;
    if (pricingMap.has(key)) reasons.push(`pricing-${index}:duplicate-pricing-proof`);
    pricingMap.set(key, { candidateId, pricingMode, observedAt, evidenceRef, inputUsdPerMillion, outputUsdPerMillion, cacheReadUsdPerMillion });
  }

  for (const requiredKey of requiredRuntimeKeys) {
    const [candidateId, reasoningSettingRef, transportClass] = requiredKey.split('::');
    const runtimeSatisfied = transportClass === 'ANY_VERIFIED'
      ? [...runtimeMap.values()].some(row => row.candidateId === candidateId && row.reasoningSettingRef === reasoningSettingRef)
      : runtimeMap.has(requiredKey);
    if (!runtimeSatisfied) reasons.push(`missing-runtime-proof:${requiredKey}`);
    if (![...pricingMap.keys()].some(key => key.startsWith(`${candidateId}::`))) {
      reasons.push(`missing-pricing-proof:${candidateId}`);
    }
  }

  if (reasons.length) {
    return fail('FRESH_CAMPAIGN_RUNTIME_NOT_READY', reasons, {
      campaignId: campaignPlan.campaignId,
      requiredRuntimeKeys: [...requiredRuntimeKeys].sort(),
      observedRuntimeKeys: [...runtimeMap.keys()].sort(),
      observedPricingKeys: [...pricingMap.keys()].sort(),
      providerCallsPerformedByThisAssessment: 0,
      spendUsd: 0
    });
  }

  const readinessDigest = digest({
    campaignDigest: campaignPlan.campaignDigest,
    admittedDigest: admittedCampaign.admittedDigest,
    runtimeReceipts: [...runtimeMap.values()].sort((a, b) => runtimeReceiptKey(a.candidateId, a.reasoningSettingRef, a.transportClass).localeCompare(runtimeReceiptKey(b.candidateId, b.reasoningSettingRef, b.transportClass))),
    pricingReceipts: [...pricingMap.values()].sort((a, b) => `${a.candidateId}::${a.pricingMode}`.localeCompare(`${b.candidateId}::${b.pricingMode}`)),
    prerequisiteReceipts: [...prerequisiteSet].sort()
  });

  return envelope({
    ok: true,
    status: 'FRESH_CAMPAIGN_READY_FOR_SEPARATELY_AUTHORIZED_EXECUTION',
    campaignId: campaignPlan.campaignId,
    campaignDigest: campaignPlan.campaignDigest,
    admittedDigest: admittedCampaign.admittedDigest,
    readinessDigest,
    requiredRuntimeKeys: [...requiredRuntimeKeys].sort(),
    runtimeEvidenceRefs: [...runtimeMap.values()].map(row => row.evidenceRef).sort(),
    pricingEvidenceRefs: [...pricingMap.values()].map(row => row.evidenceRef).sort(),
    prerequisiteEvidenceRefs: [...prerequisiteSet].sort(),
    providerCallsPerformedByThisAssessment: 0,
    spendUsd: 0,
    executionAuthority: 'NONE',
    nextGate: 'EXPLICIT_EXECUTION_AUTHORITY_PLUS_RAW_CUSTODIAN_TASK_ACCESS',
    truthBoundary: 'READY MEANS THE SAFE CAMPAIGN CONTRACT, FRESH MANIFEST, LIVE MODEL IDENTITIES, PRICING, AND DECLARED PREREQUISITES ARE PRESENT. THIS FUNCTION DOES NOT CALL MODELS, SPEND MONEY, ACCESS RAW HOLDOUTS OR AUTHORIZE EXECUTION.'
  });
}
