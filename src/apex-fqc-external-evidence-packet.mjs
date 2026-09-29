import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  prepareFreshApexCampaign,
  admitFreshCustodianManifest,
  assessFreshCampaignRuntimeReadiness
} from './apex-fresh-campaign.mjs';

export const APEX_FQC_EXTERNAL_EVIDENCE_VERSION = 'uberbond.apex-fqc-external-evidence.v1';

const FORBIDDEN_KEYS = new Set([
  'apikey', 'api_key', 'token', 'secret', 'password', 'authorization', 'cookie',
  'rawprompt', 'rawprompts', 'prompt', 'prompts', 'rawanswer', 'rawanswers',
  'plaintextanswer', 'plaintextanswers', 'expectedanswer', 'referenceanswer',
  'taskbody', 'taskbodies'
]);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) {
  return {
    policyVersion: APEX_FQC_EXTERNAL_EVIDENCE_VERSION,
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
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function timestamp(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function findForbidden(value, path = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findForbidden(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) return `${path}.${key}`;
    const found = findForbidden(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
function latestArchitectureFreeze(plan) {
  const times = plan.architectureRoster.map(row => Date.parse(row.architectureFrozenAt)).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
function requiredRuntimeAndPricing(plan) {
  const runtime = new Map();
  const pricing = new Set();
  for (const architecture of plan.architectureRoster) {
    for (const requirement of architecture.modelRequirements) {
      const runtimeKey = `${requirement.candidateId}::${requirement.reasoningSettingRef}::${requirement.transportClass}`;
      if (!runtime.has(runtimeKey)) {
        runtime.set(runtimeKey, {
          candidateId: requirement.candidateId,
          reasoningSettingRef: requirement.reasoningSettingRef,
          transportClass: requirement.transportClass
        });
      }
      pricing.add(`${requirement.candidateId}::${requirement.pricingModeRef}`);
    }
  }
  return {
    runtimeRequirements: [...runtime.values()].sort((a, b) =>
      `${a.candidateId}::${a.reasoningSettingRef}::${a.transportClass}`.localeCompare(
        `${b.candidateId}::${b.reasoningSettingRef}::${b.transportClass}`
      )
    ),
    pricingRequirements: [...pricing].sort()
  };
}

export function buildApexFqcCustodianRequest({ campaignConfig } = {}) {
  const leak = findForbidden(campaignConfig);
  if (leak) return fail('APEX_FQC_CUSTODIAN_REQUEST_REFUSED', ['secret-or-raw-holdout-material-in-campaign-config'], { leakPath: leak });

  const plan = prepareFreshApexCampaign(campaignConfig);
  if (!plan.ok) return fail('APEX_FQC_CUSTODIAN_REQUEST_REFUSED', plan.reasonCodes || ['fresh-campaign-plan-required']);

  const requirements = requiredRuntimeAndPricing(plan);
  const request = {
    schemaVersion: 'uberbond.apex-fqc-custodian-request.v1',
    campaignId: plan.campaignId,
    campaignDigest: plan.campaignDigest,
    architectureRosterDigest: plan.architectureRosterDigest,
    suiteVersion: plan.suiteVersion,
    taskClass: plan.taskClass,
    minimumTaskCount: plan.minimumTaskCount,
    architectureFreezeDeadline: latestArchitectureFreeze(plan),
    custodianInstructions: {
      generateFreshTasksForThisCampaignOnly: true,
      previouslyEvaluatedItemsAllowed: false,
      derivativesOfEvaluatedItemsAllowed: false,
      rawHoldoutsStoredInRepository: false,
      optimizerAccessBeforeEvaluation: false,
      candidateAccessBeforeEvaluation: false,
      plaintextAnswersExposedBeforeEvaluation: false,
      returnOnlySealedManifestAndSecretFreeReceipt: true
    },
    requiredReceiptFields: [
      'campaignId',
      'campaignDigest',
      'suiteVersion',
      'manifestDigest',
      'corpusDigest',
      'taskCount',
      'commitmentRef',
      'committedAt',
      'sourceFreezeRef',
      'evaluatorRef',
      'custodianRef',
      'rawHoldoutsStoredInRepository=false',
      'optimizerAccessBeforeEvaluation=false',
      'candidateAccessBeforeEvaluation=false',
      'plaintextAnswersExposedBeforeEvaluation=false',
      'evaluatorIndependent=true',
      'custodianIndependent=true',
      'freshlyGeneratedForCampaign=true',
      'tasksPreviouslyEvaluated=false',
      'tasksDerivedFromPreviouslyEvaluatedItems=false',
      'legacyEvidenceReuse=false',
      'secretFreeReceipt=true'
    ],
    sealedManifestAllowedFields: ['taskId', 'family', 'tier=SEALED_HOLDOUT', 'difficulty', 'answerDigest'],
    prohibitedReturnMaterial: [
      'raw prompts',
      'plaintext answers',
      'API keys',
      'tokens',
      'cookies',
      'authorization headers',
      'private model credentials'
    ],
    runtimeRequirements: requirements.runtimeRequirements,
    pricingRequirements: requirements.pricingRequirements,
    totalCampaignSpendCeilingUsd: plan.budgetPolicy.maxTotalCampaignSpendUsd,
    executionAuthority: 'NONE'
  };
  return envelope({
    ok: true,
    status: 'APEX_FQC_CUSTODIAN_REQUEST_READY',
    request,
    requestDigest: digest(request),
    truthBoundary: 'THIS REQUEST CAN BE HANDED TO AN INDEPENDENT CUSTODIAN WITHOUT RAW HOLDOUTS OR CREDENTIALS. IT DOES NOT PROVE CUSTODIAN INDEPENDENCE, CREATE TASKS, CALL MODELS, SPEND MONEY OR AUTHORIZE EXECUTION.'
  });
}

export function compileApexFqcExternalEvidencePacket({
  campaignConfig,
  sealedManifest = [],
  custodianReceipt = {},
  runtimeReceipts = [],
  pricingReceipts = [],
  prerequisiteReceipts = []
} = {}) {
  const leak = findForbidden({ campaignConfig, custodianReceipt, runtimeReceipts, pricingReceipts, prerequisiteReceipts });
  if (leak) return fail('APEX_FQC_EXTERNAL_EVIDENCE_REFUSED', ['secret-or-raw-holdout-material-prohibited'], { leakPath: leak });

  const plan = prepareFreshApexCampaign(campaignConfig);
  if (!plan.ok) return fail('APEX_FQC_EXTERNAL_EVIDENCE_REFUSED', plan.reasonCodes || ['fresh-campaign-plan-required']);

  const admitted = admitFreshCustodianManifest({
    campaignPlan: plan,
    sealedManifest,
    custodianReceipt
  });
  if (!admitted.ok) {
    return envelope({
      ok: true,
      status: 'APEX_FQC_EXTERNAL_EVIDENCE_INCOMPLETE',
      campaignId: plan.campaignId,
      campaignDigest: plan.campaignDigest,
      custodianAdmitted: false,
      runtimeReady: false,
      missingOrInvalidEvidence: admitted.reasonCodes || [],
      providerCallsPerformed: 0,
      spendUsd: 0,
      nextGate: 'FRESH_EXTERNAL_CUSTODIAN_EVIDENCE'
    });
  }

  const readiness = assessFreshCampaignRuntimeReadiness({
    campaignPlan: plan,
    admittedCampaign: admitted,
    runtimeReceipts,
    pricingReceipts,
    prerequisiteReceipts
  });

  const packetSummary = {
    campaignId: plan.campaignId,
    campaignDigest: plan.campaignDigest,
    architectureRosterDigest: plan.architectureRosterDigest,
    admittedDigest: admitted.admittedDigest,
    custodianRef: admitted.custodianRef,
    taskCount: admitted.taskCount,
    manifestDigest: admitted.manifestDigest,
    corpusDigest: admitted.corpusDigest,
    runtimeReady: readiness.ok === true,
    runtimeEvidenceRefs: readiness.runtimeEvidenceRefs || [],
    pricingEvidenceRefs: readiness.pricingEvidenceRefs || [],
    prerequisiteEvidenceRefs: readiness.prerequisiteEvidenceRefs || [],
    unresolvedEvidence: readiness.ok ? [] : (readiness.reasonCodes || [])
  };

  return envelope({
    ok: true,
    status: readiness.ok
      ? 'APEX_FQC_EXTERNAL_EVIDENCE_READY_FOR_SEPARATELY_AUTHORIZED_EXECUTION'
      : 'APEX_FQC_EXTERNAL_EVIDENCE_INCOMPLETE',
    campaignId: plan.campaignId,
    custodianAdmitted: true,
    runtimeReady: readiness.ok === true,
    evidencePacketDigest: digest(packetSummary),
    packetSummary,
    providerCallsPerformed: 0,
    spendUsd: 0,
    executionAuthority: 'NONE',
    nextGate: readiness.ok
      ? 'EXPLICIT_SEPARATE_INFERENCE_EXECUTION_AUTHORITY'
      : 'EXACT_LIVE_RUNTIME_REASONING_TRANSPORT_AND_PRICING_EVIDENCE',
    truthBoundary: 'THIS PACKET REUSES THE FRESH CAMPAIGN ADMISSION/READINESS GATES AND CONTAINS ONLY SECRET-FREE EVIDENCE POINTERS AND DIGESTS. READY DOES NOT AUTHORIZE OR PERFORM INFERENCE.'
  });
}
