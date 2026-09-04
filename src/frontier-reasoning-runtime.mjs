import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_REASONING_RUNTIME_VERSION = 'uberbond.frontier-reasoning-runtime-1.1.0';

const GATEWAY_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);

function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) {
  return { policyVersion: FRONTIER_REASONING_RUNTIME_VERSION, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}
function failure(reasonCodes, status = 'FRONTIER_REASONING_RUNTIME_BLOCKED', extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], ...extra });
}

function parseGatewaySetting(ref) {
  const match = /^ai-gateway:reasoning=(none|minimal|low|medium|high|xhigh)$/.exec(String(ref || '').trim().toLowerCase());
  if (!match || !GATEWAY_EFFORTS.has(match[1])) return null;
  return match[1];
}

export function compileFrontierExecutorWorker(member = {}) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) return failure(['frontier-plan-member-required']);
  const profileId = text(member.profileId, 120)?.toLowerCase();
  const provider = text(member.provider, 80)?.toLowerCase();
  const model = text(member.model, 120);
  const revision = text(member.revision, 240);
  const transportProvider = text(member.transportProvider, 80)?.toLowerCase();
  const transportModel = text(member.transportModel, 240);
  const reasoningTier = text(member.reasoningTier, 80)?.toUpperCase();
  const reasoningSettingRef = text(member.reasoningSettingRef, 500);
  const reasons = [];
  if (!profileId || !provider || !model || !revision) reasons.push('complete-cognitive-identity-required');
  if (!transportProvider || !transportModel) reasons.push('complete-transport-identity-required');
  if (!reasoningTier || !reasoningSettingRef) reasons.push('reasoning-tier-and-setting-required');

  let reasoningEffort = null;
  if (transportProvider === 'ai-gateway') {
    reasoningEffort = parseGatewaySetting(reasoningSettingRef);
    if (!reasoningEffort) reasons.push('ai-gateway-reasoning-setting-unrecognized');
    const creator = transportModel.includes('/') ? transportModel.split('/')[0].toLowerCase() : null;
    if (!creator) reasons.push('ai-gateway-provider-model-slug-required');
    else if (creator !== provider) reasons.push('cognitive-provider-and-gateway-model-creator-mismatch');
  } else {
    reasons.push(`frontier-reasoning-transport-not-yet-proven:${transportProvider || 'unknown'}`);
  }

  if (reasons.length) return failure(reasons);
  return envelope({
    ok: true,
    status: 'FRONTIER_EXECUTOR_WORKER_READY',
    profileId,
    cognitiveIdentity: { provider, model, revision },
    worker: { provider: transportProvider, model: transportModel, reasoningEffort },
    appliedSettingExpectation: { reasoningTier, reasoningSettingRef, reasoningEffort },
    truthBoundary: 'TRANSLATION_IS_NOT_EXECUTION; EXECUTION_RESULT_MUST_ATTEST_THE_REQUESTED_SETTING_AND_OBSERVED_MODEL'
  });
}

export function attestFrontierExecution({ member, workerBinding, executorResult, callabilityEvidence } = {}) {
  if (!workerBinding?.ok || !workerBinding.worker || !workerBinding.appliedSettingExpectation) return failure(['verified-worker-binding-required'], 'FRONTIER_EXECUTION_ATTESTATION_BLOCKED');
  if (!executorResult?.ok) return failure(['successful-executor-result-required'], 'FRONTIER_EXECUTION_ATTESTATION_BLOCKED');
  const profileId = text(member?.profileId, 120)?.toLowerCase();
  if (!profileId || profileId !== workerBinding.profileId) return failure(['profile-binding-mismatch'], 'FRONTIER_EXECUTION_ATTESTATION_BLOCKED');

  const observedTransportModel = text(executorResult.model, 240);
  const identityVerification = text(executorResult.identityVerification, 80)?.toUpperCase();
  const appliedReasoningEffort = text(executorResult.appliedReasoningEffort, 40)?.toLowerCase();
  const appliedReasoningEvidence = text(executorResult.appliedReasoningEvidence, 80)?.toUpperCase();
  const providerRequestId = text(executorResult.providerRequestId, 1000);
  const latencyMs = integer(executorResult.latencyMs, 0, 86_400_000);
  const costCents = integer(executorResult?.usage?.costCents, 0, 100_000_000);
  const reasons = [];
  if (!observedTransportModel || observedTransportModel !== workerBinding.worker.model || identityVerification !== 'OBSERVED') reasons.push('transport-model-identity-not-observed-as-planned');
  if (appliedReasoningEffort !== workerBinding.worker.reasoningEffort || appliedReasoningEvidence !== 'REQUEST_BODY_ATTESTED') reasons.push('planned-reasoning-setting-not-attested-by-executor');
  if (!providerRequestId) reasons.push('provider-request-id-required');
  if (latencyMs == null) reasons.push('measured-latency-required');
  if (costCents == null) reasons.push('metered-cost-required');

  const evidence = callabilityEvidence && typeof callabilityEvidence === 'object' && !Array.isArray(callabilityEvidence) ? callabilityEvidence : null;
  if (!evidence) reasons.push('runtime-callability-revision-evidence-required');
  else {
    if (text(evidence.profileId, 120)?.toLowerCase() !== profileId) reasons.push('callability-profile-mismatch');
    if (text(evidence.status, 80)?.toUpperCase() !== 'CALLABLE_NOW') reasons.push('callability-not-callable-now');
    if (text(evidence.evidenceClass, 80)?.toUpperCase() !== 'OBSERVED_RUNTIME') reasons.push('callability-not-observed-runtime-evidence');
    if (text(evidence.identityVerification, 80)?.toUpperCase() !== 'OBSERVED') reasons.push('callability-identity-not-observed');
    if (text(evidence.observedProvider, 80)?.toLowerCase() !== workerBinding.cognitiveIdentity.provider) reasons.push('callability-provider-mismatch');
    if (text(evidence.observedModel, 120) !== workerBinding.cognitiveIdentity.model) reasons.push('callability-model-mismatch');
    if (text(evidence.observedRevision, 240) !== workerBinding.cognitiveIdentity.revision) reasons.push('callability-revision-mismatch');
    if (text(evidence.observedTransportProvider, 80)?.toLowerCase() !== workerBinding.worker.provider) reasons.push('callability-transport-provider-mismatch');
    if (text(evidence.observedTransportModel, 240) !== workerBinding.worker.model) reasons.push('callability-transport-model-mismatch');
    if (!text(evidence.sourceRef, 1000) || !text(evidence.observedAt, 80)) reasons.push('callability-evidence-pointer-and-time-required');
  }
  if (reasons.length) return failure(reasons, 'FRONTIER_EXECUTION_ATTESTATION_BLOCKED');

  return envelope({
    ok: true,
    status: 'FRONTIER_EXECUTION_ATTESTED',
    execution: {
      profileId,
      ok: true,
      observedProvider: workerBinding.cognitiveIdentity.provider,
      observedModel: workerBinding.cognitiveIdentity.model,
      observedRevision: workerBinding.cognitiveIdentity.revision,
      observedTransportProvider: workerBinding.worker.provider,
      observedTransportModel,
      identityVerification: 'OBSERVED',
      appliedReasoningSettingRef: workerBinding.appliedSettingExpectation.reasoningSettingRef,
      appliedReasoningEffort,
      resultRef: `provider-request://${providerRequestId}`,
      latencyMs,
      costCents,
      claims: []
    },
    evidenceRefs: [text(evidence.sourceRef, 1000)].filter(Boolean),
    truthBoundary: 'REVISION_IDENTITY_COMES_FROM_SEPARATE_OBSERVED_RUNTIME_CALLABILITY_EVIDENCE; REQUEST_BODY_ATTESTATION_PROVES_REQUESTED_REASONING_SETTING_NOT_PROVIDER_INTERNAL_COMPUTE'
  });
}

export async function executeFrontierMember({
  member,
  task,
  modelExecutorFactory,
  callabilityEvidence,
  maxTokens,
  costCeilingCents,
  clock = () => Date.now()
} = {}) {
  const binding = compileFrontierExecutorWorker(member);
  if (!binding.ok) return binding;
  if (typeof modelExecutorFactory !== 'function') return failure(['canonical-model-executor-factory-required'], 'FRONTIER_EXECUTION_BLOCKED');
  if (!task?.taskId || !task?.objective || (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION')) return failure(['bounded-local-preparation-task-required'], 'FRONTIER_EXECUTION_BLOCKED');
  const outputLimit = integer(maxTokens, 1, 128_000);
  const costLimit = integer(costCeilingCents, 0, 10_000_000);
  if (outputLimit == null || costLimit == null) return failure(['bounded-output-and-cost-required'], 'FRONTIER_EXECUTION_BLOCKED');

  let executor;
  try {
    executor = modelExecutorFactory(binding.worker);
  } catch (error) {
    return failure(['frontier-executor-construction-failed'], 'FRONTIER_EXECUTION_BLOCKED', { detail: text(error?.message, 300) });
  }
  if (typeof executor !== 'function') return failure(['callable-frontier-executor-required'], 'FRONTIER_EXECUTION_BLOCKED');

  const start = Number(clock());
  if (!Number.isFinite(start)) return failure(['valid-runtime-clock-required'], 'FRONTIER_EXECUTION_BLOCKED');
  let executorResult;
  try {
    executorResult = await executor({ task, model: binding.worker.model, maxTokens: outputLimit, costCeilingCents: costLimit });
  } catch (error) {
    return failure(['frontier-executor-threw'], 'FRONTIER_EXECUTION_UNCERTAIN', { detail: text(error?.message, 300) });
  }
  const end = Number(clock());
  if (!Number.isFinite(end) || end < start) return failure(['valid-runtime-clock-required'], 'FRONTIER_EXECUTION_BLOCKED');
  if (!executorResult?.ok) return failure(executorResult?.reasonCodes ?? ['frontier-executor-failed'], executorResult?.outcome === 'UNCERTAIN' ? 'FRONTIER_EXECUTION_UNCERTAIN' : 'FRONTIER_EXECUTION_FAILED');

  const latencyMs = Math.round(end - start);
  return attestFrontierExecution({
    member,
    workerBinding: binding,
    executorResult: { ...executorResult, latencyMs },
    callabilityEvidence
  });
}
