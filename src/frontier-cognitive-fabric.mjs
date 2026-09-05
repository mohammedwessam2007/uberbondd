import crypto from 'node:crypto';
import { buildContextPlan } from './frontier-context-spine.mjs';
import { normalizeModelCandidate, normalizeModelBenchmark, routeModel } from './agent-model-router.mjs';
import { validateOrchestrationGraph } from './orchestration-frontier.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { redactSecrets } from './secret-patterns.mjs';
import { validateFrontierCallabilityProbeReceipt } from './frontier-callability-provenance.mjs';

export const FRONTIER_COGNITIVE_FABRIC_VERSION = 'uberbond.frontier-cognitive-fabric-1.3.1';
export const FRONTIER_COGNITIVE_PLAN_SCHEMA = 'uberbond.frontier-cognitive-plan.v1';
export const FRONTIER_COGNITIVE_RECEIPT_SCHEMA = 'uberbond.frontier-cognitive-receipt.v1';
export const FRONTIER_REASONING_TIERS = Object.freeze(['FAST', 'STANDARD', 'DEEP', 'FRONTIER_MAX', 'COUNCIL_MAX']);

const SAFE_DATA_CLASSES = new Set(['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE']);
const TRANSPORT_PROVIDERS = new Set(['openai', 'anthropic', 'ai-gateway', 'open-model', 'claude-code-sandbox']);
const ROLE_NAMES = new Set(['planner', 'researcher', 'builder', 'critic', 'verifier', 'adjudicator', 'general']);
const EVIDENCE_CLASSES = new Set(['OFFICIAL_SOURCE', 'VERIFIED_RUNTIME']);
const MAX_PROFILES = 64;
const MAX_COUNCIL_RESPONDERS = 6;
const DEFAULT_EVIDENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_CALLABILITY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FRONTIER_QUALITY_DELTA = 0.05;

function clone(value) { return structuredClone(value); }
function zeroEffects() { return clone(ZERO_EXTERNAL_EFFECTS); }
function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function list(value, max = 64, itemMax = 300) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(normalized); }
  }
  return out;
}
function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
function timestamp(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function sha256(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function benchmarkKey(provider, model, revision) { return `${provider}\u0000${model}\u0000${revision}`; }
function envelope(extra = {}) {
  return { policyVersion: FRONTIER_COGNITIVE_FABRIC_VERSION, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}
function failure(reasonCodes, status = 'FRONTIER_FABRIC_BLOCKED', extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra });
}
function evidenceFresh(verifiedAt, now, maxAgeMs) {
  const at = Date.parse(verifiedAt || '');
  const current = now instanceof Date ? now.getTime() : Date.parse(now || '');
  return Number.isFinite(at) && Number.isFinite(current) && at <= current && current - at <= maxAgeMs;
}
function secretFree(value) {
  const raw = String(value ?? '');
  return raw === redactSecrets(raw);
}
function evidenceClass(value) {
  const normalized = text(value, 80)?.toUpperCase();
  return normalized && EVIDENCE_CLASSES.has(normalized) ? normalized : null;
}

function normalizeReasoningBindings(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const tier of FRONTIER_REASONING_TIERS.filter(item => item !== 'COUNCIL_MAX')) {
    if (raw[tier] == null) continue;
    const settingRef = text(raw[tier]?.settingRef, 500);
    const sourceRef = text(raw[tier]?.sourceRef, 1000);
    const verifiedAt = timestamp(raw[tier]?.verifiedAt);
    const klass = evidenceClass(raw[tier]?.evidenceClass);
    if (!settingRef || !sourceRef || !verifiedAt || !klass) return null;
    out[tier] = { settingRef, sourceRef, verifiedAt, evidenceClass: klass };
  }
  return out;
}

function normalizeProfile(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reasonCodes: [`invalid-profile:${index}`] };
  const id = text(raw.id, 120)?.toLowerCase();
  const provider = text(raw.provider, 80)?.toLowerCase();
  const model = text(raw.model, 120);
  const revision = text(raw.revision, 240);
  const transportProvider = text(raw.transportProvider, 80)?.toLowerCase();
  const transportModel = text(raw.transportModel ?? model, 160);
  const transportSourceRef = text(raw.transportSourceRef, 1000);
  const transportVerifiedAt = timestamp(raw.transportVerifiedAt);
  const transportEvidenceClass = evidenceClass(raw.transportEvidenceClass);
  const taskClasses = list(raw.taskClasses ?? ['general'], 64, 160)?.map(item => item.toLowerCase());
  const roles = list(raw.roles ?? ['general'], 16, 80)?.map(item => item.toLowerCase());
  const allowedDataClasses = list(raw.allowedDataClasses ?? ['PUBLIC', 'INTERNAL_NON_SECRET'], 16, 80)?.map(item => item.toUpperCase());
  const reasoningBindings = normalizeReasoningBindings(raw.reasoningBindings ?? {});
  const pricingVerifiedAt = timestamp(raw.pricingVerifiedAt);
  const pricingSourceRef = text(raw.pricingSourceRef, 1000);
  const pricingEvidenceClass = evidenceClass(raw.pricingEvidenceClass);
  const maxContextTokens = integer(raw.maxContextTokens ?? 1, 1, 5_000_000);
  const maxOutputTokens = integer(raw.maxOutputTokens ?? 1, 1, 1_000_000);
  const centsPerMillionInputTokens = finite(raw.centsPerMillionInputTokens ?? 0, 0, 100_000_000);
  const centsPerMillionOutputTokens = finite(raw.centsPerMillionOutputTokens ?? 0, 0, 100_000_000);
  const identityAliases = list(raw.identityAliases ?? [model], 16, 120);
  const reasons = [];
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) reasons.push(`profile-id-invalid:${index}`);
  if (!provider) reasons.push(`provider-required:${id ?? index}`);
  if (!model) reasons.push(`model-identity-exceeds-canonical-router-boundary-or-is-missing:${id ?? index}`);
  if (!revision) reasons.push(`revision-required:${id ?? index}`);
  if (!transportProvider || !TRANSPORT_PROVIDERS.has(transportProvider)) reasons.push(`transport-provider-unsupported:${id ?? index}`);
  if (!transportModel || !transportSourceRef || !transportVerifiedAt || !transportEvidenceClass) reasons.push(`transport-evidence-required:${id ?? index}`);
  if (!taskClasses?.length) reasons.push(`task-classes-required:${id ?? index}`);
  if (!roles?.length || roles.some(role => !ROLE_NAMES.has(role))) reasons.push(`recognized-roles-required:${id ?? index}`);
  if (!allowedDataClasses?.length || allowedDataClasses.some(item => !SAFE_DATA_CLASSES.has(item))) reasons.push(`safe-data-classes-required:${id ?? index}`);
  if (!reasoningBindings || !Object.keys(reasoningBindings).length) reasons.push(`reasoning-bindings-required:${id ?? index}`);
  if (!pricingVerifiedAt || !pricingSourceRef || !pricingEvidenceClass) reasons.push(`pricing-evidence-required:${id ?? index}`);
  if (maxContextTokens == null || maxOutputTokens == null || centsPerMillionInputTokens == null || centsPerMillionOutputTokens == null) reasons.push(`capacity-pricing-invalid:${id ?? index}`);
  if (!identityAliases?.length || !identityAliases.includes(model)) reasons.push(`identity-aliases-must-include-canonical-model:${id ?? index}`);
  if ('apiKey' in raw || 'token' in raw || 'secret' in raw || 'password' in raw || 'endpoint' in raw) reasons.push(`secret-or-endpoint-bearing-profile-prohibited:${id ?? index}`);
  if ([id, provider, model, revision, transportProvider, transportModel, transportSourceRef, pricingSourceRef].some(value => value && !secretFree(value))) reasons.push(`secret-pattern-in-profile-prohibited:${id ?? index}`);
  if (reasons.length) return { ok: false, reasonCodes: reasons };
  return {
    ok: true,
    profile: {
      id, provider, model, revision, transportProvider, transportModel,
      transportSourceRef, transportVerifiedAt, transportEvidenceClass,
      taskClasses, roles, allowedDataClasses, reasoningBindings,
      pricingVerifiedAt, pricingSourceRef, pricingEvidenceClass,
      maxContextTokens, maxOutputTokens, centsPerMillionInputTokens, centsPerMillionOutputTokens,
      identityAliases,
      capabilities: {
        toolUse: raw.capabilities?.toolUse === true,
        multimodal: raw.capabilities?.multimodal === true,
        structuredOutput: raw.capabilities?.structuredOutput !== false,
        longContext: raw.capabilities?.longContext === true
      },
      enabled: raw.enabled !== false
    }
  };
}

function probeMatches(raw, probe) {
  if (!raw || !probe) return false;
  return text(raw.profileId, 120)?.toLowerCase() === probe.profileId
    && text(raw.status, 80)?.toUpperCase() === probe.status
    && text(raw.observedProvider, 80)?.toLowerCase() === probe.observedProvider
    && text(raw.observedModel, 120) === probe.observedModel
    && text(raw.observedRevision, 240) === probe.observedRevision
    && text(raw.observedTransportProvider, 80)?.toLowerCase() === probe.observedTransportProvider
    && text(raw.observedTransportModel, 160) === probe.observedTransportModel
    && timestamp(raw.observedAt) === probe.observedAt
    && text(raw.sourceRef, 1000) === probe.sourceRef
    && text(raw.evidenceClass, 80)?.toUpperCase() === probe.evidenceClass
    && text(raw.identityVerification, 80)?.toUpperCase() === probe.identityVerification;
}

function normalizeCallability(raw = {}, profileMap, now, maxAgeMs, trustedProbeByProfileId = new Map()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const profileId = text(raw.profileId, 120)?.toLowerCase();
  const profile = profileMap.get(profileId);
  if (!profile) return null;
  const status = text(raw.status, 80)?.toUpperCase();
  const observedProvider = text(raw.observedProvider, 80)?.toLowerCase();
  const observedModel = text(raw.observedModel, 120);
  const observedRevision = text(raw.observedRevision, 240);
  const observedTransportProvider = text(raw.observedTransportProvider, 80)?.toLowerCase();
  const observedTransportModel = text(raw.observedTransportModel, 160);
  const observedAt = timestamp(raw.observedAt);
  const sourceRef = text(raw.sourceRef, 1000);
  const klass = text(raw.evidenceClass, 80)?.toUpperCase();
  const identityVerification = text(raw.identityVerification, 80)?.toUpperCase();
  const fresh = Boolean(observedAt && evidenceFresh(observedAt, now, maxAgeMs));
  const identityMatches = observedProvider === profile.provider
    && profile.identityAliases.includes(observedModel)
    && observedRevision === profile.revision
    && observedTransportProvider === profile.transportProvider
    && observedTransportModel === profile.transportModel;
  const observedEvidence = klass === 'OBSERVED_RUNTIME' && identityVerification === 'OBSERVED';
  const provenanceMatches = probeMatches(raw, trustedProbeByProfileId.get(profileId));
  return {
    profileId,
    status: status || 'CONFIGURED_NOT_PROVEN',
    callableNow: status === 'CALLABLE_NOW' && Boolean(sourceRef) && fresh && identityMatches && observedEvidence && provenanceMatches,
    sourceRef,
    observedAt,
    observedProvider,
    observedModel,
    observedRevision,
    observedTransportProvider,
    observedTransportModel,
    fresh,
    identityMatches,
    observedEvidence,
    provenanceMatches
  };
}

function normalizeTask(raw = {}) {
  const missionId = text(raw.missionId, 160)?.toLowerCase();
  const taskId = text(raw.taskId, 160)?.toLowerCase();
  const objective = text(raw.objective, 5000);
  const taskClass = text(raw.taskClass ?? 'general', 160)?.toLowerCase();
  const role = text(raw.role ?? 'general', 80)?.toLowerCase();
  const dataClass = text(raw.dataClass ?? 'INTERNAL_NON_SECRET', 80)?.toUpperCase();
  const reasoningTier = text(raw.reasoningTier ?? 'STANDARD', 80)?.toUpperCase();
  const requiredTags = list(raw.requiredTags ?? [], 128, 240)?.map(item => item.toLowerCase());
  const contextTokenBudget = integer(raw.contextTokenBudget ?? 32_000, 1, 5_000_000);
  const minCouncilSize = integer(raw.minCouncilSize ?? 2, 2, MAX_COUNCIL_RESPONDERS);
  const maxCouncilSize = integer(raw.maxCouncilSize ?? 3, 2, MAX_COUNCIL_RESPONDERS);
  const reasons = [];
  if (!missionId || !taskId || !objective) reasons.push('mission-task-objective-required');
  if (!role || !ROLE_NAMES.has(role)) reasons.push('recognized-role-required');
  if (!SAFE_DATA_CLASSES.has(dataClass)) reasons.push('safe-data-class-required');
  if (!FRONTIER_REASONING_TIERS.includes(reasoningTier)) reasons.push('recognized-reasoning-tier-required');
  if (!requiredTags) reasons.push('required-tags-invalid');
  if (contextTokenBudget == null || minCouncilSize == null || maxCouncilSize == null || minCouncilSize > maxCouncilSize) reasons.push('valid-context-and-council-bounds-required');
  return reasons.length ? { ok: false, reasonCodes: reasons } : { ok: true, task: { missionId, taskId, objective, taskClass, role, dataClass, reasoningTier, requiredTags, contextTokenBudget, minCouncilSize, maxCouncilSize } };
}

function renormalizeBenchmark(raw, taskClass, now, maxAgeMs) {
  const observedRevision = text(raw?.observedRevision ?? raw?.revision, 240);
  const evidenceRef = text(raw?.evidenceRef ?? raw?.sourceRef, 1000);
  const source = raw?.ok === true ? {
    provider: raw.candidate?.provider,
    model: raw.candidate?.model,
    taskClasses: raw.candidate?.taskClasses,
    taskClass: raw.taskClass,
    quality: raw.quality,
    reliability: raw.reliability,
    latencyScore: raw.latencyScore,
    economicImpact: raw.economicImpact,
    evidenceConfidence: raw.evidenceConfidence,
    costEfficiency: raw.costEfficiency
  } : raw;
  const observedAt = timestamp(raw?.observedAt ?? now);
  if (!observedAt || !observedRevision || !evidenceRef) return null;
  const benchmark = normalizeModelBenchmark(source, new Date(observedAt));
  if (!benchmark?.ok || benchmark.taskClass !== taskClass || !evidenceFresh(benchmark.observedAt, now, maxAgeMs)) return null;
  return { ...benchmark, observedRevision, evidenceRef };
}

function latestBenchmarks(benchmarks, taskClass, now, maxAgeMs) {
  const latest = new Map();
  for (const raw of Array.isArray(benchmarks) ? benchmarks : []) {
    const benchmark = renormalizeBenchmark(raw, taskClass, now, maxAgeMs);
    if (!benchmark) continue;
    const key = benchmarkKey(benchmark.candidate.provider, benchmark.candidate.model, benchmark.observedRevision);
    const current = latest.get(key);
    if (!current || benchmark.observedAt > current.observedAt) latest.set(key, benchmark);
  }
  return latest;
}

function candidateFor(profile) {
  return normalizeModelCandidate({
    provider: profile.provider,
    model: profile.model,
    taskClasses: profile.taskClasses,
    enabled: profile.enabled,
    maxContextTokens: profile.maxContextTokens,
    centsPerMillionInputTokens: profile.centsPerMillionInputTokens,
    centsPerMillionOutputTokens: profile.centsPerMillionOutputTokens
  });
}

function profileEligibility(profile, task, callability, now, evidenceMaxAgeMs) {
  const executionTier = task.reasoningTier === 'COUNCIL_MAX' ? 'FRONTIER_MAX' : task.reasoningTier;
  const reasons = [];
  if (!profile.enabled) reasons.push('profile-disabled');
  if (!(profile.taskClasses.includes(task.taskClass) || profile.taskClasses.includes('general'))) reasons.push('task-class-not-supported');
  if (!(profile.roles.includes(task.role) || profile.roles.includes('general'))) reasons.push('role-not-supported');
  if (!profile.allowedDataClasses.includes(task.dataClass)) reasons.push('data-class-not-allowed');
  const binding = profile.reasoningBindings[executionTier];
  if (!binding) reasons.push(`reasoning-tier-not-supported:${executionTier}`);
  else if (!evidenceFresh(binding.verifiedAt, now, evidenceMaxAgeMs)) reasons.push(`reasoning-binding-stale:${executionTier}`);
  if (!evidenceFresh(profile.pricingVerifiedAt, now, evidenceMaxAgeMs)) reasons.push('pricing-evidence-stale');
  if (!evidenceFresh(profile.transportVerifiedAt, now, evidenceMaxAgeMs)) reasons.push('transport-evidence-stale');
  if (!callability?.callableNow) {
    if (!callability) reasons.push('callability-evidence-absent');
    else if (!callability.provenanceMatches) reasons.push('callability-provenance-not-trusted');
    else if (!callability.observedEvidence) reasons.push('callability-not-observed-runtime-evidence');
    else if (!callability.identityMatches) reasons.push('callability-identity-mismatch');
    else reasons.push('callability-evidence-stale-or-incomplete');
  }
  return { ok: reasons.length === 0, reasons, executionTier, binding: binding ?? null };
}

function executorWorker(profile) { return { provider: profile.transportProvider, model: profile.transportModel }; }

function rankEligible({ eligible, latest, task, minimumEvidenceConfidence, frontierQualityDelta, random }) {
  const enriched = eligible.map(item => {
    const candidate = candidateFor(item.profile);
    const benchmark = candidate.ok ? latest.get(benchmarkKey(item.profile.provider, item.profile.model, item.profile.revision)) ?? null : null;
    return { ...item, candidate, benchmark };
  }).filter(item => item.candidate.ok);
  if (!enriched.length) return failure(['no-eligible-candidate'], 'CAPACITY_BLOCKED');

  if (task.reasoningTier === 'FRONTIER_MAX' || task.reasoningTier === 'COUNCIL_MAX') {
    const evidenced = enriched.filter(item => item.benchmark && item.benchmark.evidenceConfidence >= minimumEvidenceConfidence);
    if (!evidenced.length) return failure(['frontier-tier-requires-fresh-quality-evidence'], 'CAPACITY_BLOCKED');
    const bestQuality = Math.max(...evidenced.map(item => item.benchmark.quality));
    const floor = bestQuality - frontierQualityDelta;
    const frontier = evidenced.filter(item => item.benchmark.quality >= floor);
    frontier.sort((a, b) => {
      const aScore = a.benchmark.quality * 0.6 + a.benchmark.reliability * 0.32 + a.benchmark.latencyScore * 0.04 + a.benchmark.costEfficiency * 0.04;
      const bScore = b.benchmark.quality * 0.6 + b.benchmark.reliability * 0.32 + b.benchmark.latencyScore * 0.04 + b.benchmark.costEfficiency * 0.04;
      return bScore - aScore || a.profile.id.localeCompare(b.profile.id);
    });
    return envelope({ ok: true, status: 'FRONTIER_CANDIDATES_RANKED', ranked: frontier, bestQuality, qualityFloor: floor });
  }

  const candidates = enriched.map(item => item.candidate);
  const weights = task.reasoningTier === 'FAST'
    ? { quality: 0.25, reliability: 0.25, latency: 0.25, economicImpact: 0.1, costEfficiency: 0.15 }
    : task.reasoningTier === 'DEEP'
      ? { quality: 0.5, reliability: 0.3, latency: 0.05, economicImpact: 0.1, costEfficiency: 0.05 }
      : undefined;
  const routed = routeModel({ taskClass: task.taskClass, candidates, benchmarks: [...latest.values()], minimumEvidenceConfidence, explorationRate: 0, random, ...(weights ? { weights } : {}) });
  if (!routed.ok) return failure(routed.reasonCodes, 'CAPACITY_BLOCKED');
  const selected = enriched.find(item => item.candidate.candidateId === routed.selected.candidateId);
  const rest = enriched.filter(item => item !== selected).sort((a, b) => (b.benchmark?.quality ?? 0) - (a.benchmark?.quality ?? 0));
  return envelope({ ok: true, status: 'CANDIDATES_RANKED', ranked: [selected, ...rest].filter(Boolean) });
}

function compileContext(task, artifacts) {
  const context = buildContextPlan({ taskId: task.taskId, requiredTags: task.requiredTags, artifacts, tokenBudget: task.contextTokenBudget });
  if (!context.ok) return failure(context.reasonCodes, context.status, { context });
  return envelope({
    ok: true,
    status: 'FRONTIER_CONTEXT_PACKET_READY',
    contextPacket: {
      taskId: task.taskId,
      dataClass: task.dataClass,
      estimatedTokens: context.estimatedTokens,
      tokenBudget: context.tokenBudget,
      contextRefs: context.admitted.map(item => item.contentRef),
      contextArtifactIds: context.admitted.map(item => item.id),
      omittedArtifactIds: context.omitted,
      invariants: [...context.invariants, 'provider-session-state-is-not-canonical-memory', 'minimum-task-scoped-context-only']
    }
  });
}

function independentNode(profile, task, contextPacket, index) {
  return {
    id: `independent_${index + 1}_${profile.id}`,
    purpose: `Independently solve ${task.taskId} without seeing another council answer.`,
    dependencies: [],
    workerRequirement: `frontier-profile:${profile.id}`,
    ownedFilesOrResponsibility: [`frontier-independent:${profile.id}`],
    inputs: ['mission-objective', ...contextPacket.contextArtifactIds.map(id => `context:${id}`)],
    expectedOutput: `Independent structured answer from ${profile.id}`,
    verification: ['No prior council answer is included in first-pass inputs.', 'Claims preserve evidence references and uncertainty.'],
    stopCondition: 'One bounded answer or explicit refusal.',
    authorityCeiling: 'LOCAL_PREPARATION',
    implementation: true,
    callableWorkerVerified: true
  };
}

function compileCouncilGraph(responders, adjudicator, task, contextPacket) {
  const independent = responders.map((item, index) => independentNode(item.profile, task, contextPacket, index));
  const independentIds = independent.map(node => node.id);
  const critiques = responders.map(item => ({
    id: `cross_critique_${item.profile.id}`,
    purpose: `Critique the sealed independent frontier answers after every first pass is complete as ${item.profile.id}.`,
    dependencies: [...independentIds],
    workerRequirement: `frontier-profile:${item.profile.id}`,
    ownedFilesOrResponsibility: [`frontier-cross-critique:${item.profile.id}`],
    inputs: independentIds.map(id => `dependency-output:${id}`),
    expectedOutput: `Structured contradiction and evidence-quality map from ${item.profile.id}.`,
    verification: ['All first-pass answers were sealed before critique.', 'Majority agreement is not proof.', 'Unsupported claims remain unresolved.'],
    stopCondition: 'Contradictions and evidence gaps are classified without producing the final decision.',
    authorityCeiling: 'LOCAL_PREPARATION',
    implementation: true,
    callableWorkerVerified: true
  }));
  const critiqueIds = critiques.map(node => node.id);
  const adjudication = {
    id: 'independent_adjudication',
    purpose: 'Produce the canonical bounded recommendation from sealed independent responses and all responder critiques.',
    dependencies: [...independentIds, ...critiqueIds],
    workerRequirement: `frontier-profile:${adjudicator.profile.id}`,
    ownedFilesOrResponsibility: ['frontier-adjudication'],
    inputs: [...independentIds, ...critiqueIds].map(id => `dependency-output:${id}`),
    expectedOutput: 'Evidence-bound adjudication with unresolved uncertainty and explicit dissent.',
    verification: ['Adjudicator did not author a first-pass response or responder critique in the non-degraded path.', 'No claim becomes true solely because most models repeated it.'],
    stopCondition: 'Canonical recommendation or explicit unresolved state.',
    authorityCeiling: 'LOCAL_PREPARATION',
    implementation: true,
    callableWorkerVerified: true
  };
  return validateOrchestrationGraph({
    mode: 'FABLE_GRAPH',
    parentAuthority: 'LOCAL_PREPARATION',
    dataClass: task.dataClass,
    maxDepth: 1,
    maxIterations: 3,
    nodes: [...independent, ...critiques, adjudication]
  });
}

function planMember(item) {
  return {
    profileId: item.profile.id,
    provider: item.profile.provider,
    model: item.profile.model,
    revision: item.profile.revision,
    identityAliases: item.profile.identityAliases,
    transportProvider: item.profile.transportProvider,
    transportModel: item.profile.transportModel,
    executorWorker: executorWorker(item.profile),
    reasoningTier: item.eligibility.executionTier,
    reasoningSettingRef: item.eligibility.binding.settingRef
  };
}

export function compileFrontierCognitivePlan({
  task,
  profiles = [],
  callability = [],
  callabilityProvenance = null,
  benchmarks = [],
  contextArtifacts = [],
  minimumEvidenceConfidence = 0.6,
  evidenceMaxAgeMs = DEFAULT_EVIDENCE_MAX_AGE_MS,
  callabilityMaxAgeMs = DEFAULT_CALLABILITY_MAX_AGE_MS,
  frontierQualityDelta = DEFAULT_FRONTIER_QUALITY_DELTA,
  allowDegradedCouncil = false,
  degradationPolicyRef = null,
  now = new Date(),
  random = () => 0.5
} = {}) {
  const normalizedTask = normalizeTask(task);
  if (!normalizedTask.ok) return failure(normalizedTask.reasonCodes, 'FRONTIER_TASK_INVALID');
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) return failure(['valid-current-time-required'], 'FRONTIER_TASK_INVALID');
  const confidence = finite(minimumEvidenceConfidence, 0.5, 1);
  const evidenceAge = integer(evidenceMaxAgeMs, 1, 30 * 24 * 60 * 60 * 1000);
  const callabilityAge = integer(callabilityMaxAgeMs, 1, 7 * 24 * 60 * 60 * 1000);
  const qualityDelta = finite(frontierQualityDelta, 0, 0.1);
  if (confidence == null || evidenceAge == null || callabilityAge == null || qualityDelta == null) return failure(['bounded-frontier-policy-parameters-required'], 'FRONTIER_POLICY_INVALID');
  if (allowDegradedCouncil && !text(degradationPolicyRef, 1000)) return failure(['degradation-policy-ref-required'], 'FRONTIER_POLICY_INVALID');
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > MAX_PROFILES) return failure(['bounded-profile-list-required'], 'FRONTIER_PROFILE_SET_INVALID');

  const provenance = validateFrontierCallabilityProbeReceipt({ ...(callabilityProvenance ?? {}), allowSynthetic: true });
  const trustedProbeByProfileId = provenance.ok ? provenance.observationByProfileId : new Map();
  const simulationOnly = provenance.simulationOnly === true;
  const trustedForLiveExecution = provenance.trustedForLiveExecution === true && !simulationOnly;

  const profileList = [];
  const reasons = [];
  const ids = new Set();
  const cognitiveIdentities = new Set();
  for (const [index, raw] of profiles.entries()) {
    const normalized = normalizeProfile(raw, index);
    if (!normalized.ok) reasons.push(...normalized.reasonCodes);
    else {
      const identity = `${normalized.profile.provider}\u0000${normalized.profile.model}\u0000${normalized.profile.revision}`;
      if (ids.has(normalized.profile.id)) reasons.push(`duplicate-profile-id:${normalized.profile.id}`);
      else if (cognitiveIdentities.has(identity)) reasons.push(`duplicate-cognitive-identity:${normalized.profile.provider}:${normalized.profile.model}:${normalized.profile.revision}`);
      else {
        ids.add(normalized.profile.id);
        cognitiveIdentities.add(identity);
        profileList.push(normalized.profile);
      }
    }
  }
  if (reasons.length) return failure(reasons, 'FRONTIER_PROFILE_SET_INVALID');
  const profileMap = new Map(profileList.map(profile => [profile.id, profile]));
  const callabilityMap = new Map();
  for (const raw of callability) {
    const normalized = normalizeCallability(raw, profileMap, current, callabilityAge, trustedProbeByProfileId);
    if (normalized) callabilityMap.set(normalized.profileId, normalized);
  }
  const context = compileContext(normalizedTask.task, contextArtifacts);
  if (!context.ok) return context;
  const latest = latestBenchmarks(benchmarks, normalizedTask.task.taskClass, current, evidenceAge);
  const eligible = [];
  const blocked = [];
  for (const profile of profileList) {
    const eligibility = profileEligibility(profile, normalizedTask.task, callabilityMap.get(profile.id), current, evidenceAge);
    if (eligibility.ok) eligible.push({ profile, eligibility });
    else blocked.push({ profileId: profile.id, reasonCodes: eligibility.reasons });
  }
  if (!eligible.length) return failure(['no-eligible-callable-frontier-profile'], 'CAPACITY_BLOCKED', { blocked, contextPacket: context.contextPacket, callabilityProvenanceValid: provenance.ok === true, simulationOnly, trustedForLiveExecution });
  const ranked = rankEligible({ eligible, latest, task: normalizedTask.task, minimumEvidenceConfidence: confidence, frontierQualityDelta: qualityDelta, random });
  if (!ranked.ok) return { ...ranked, blocked, contextPacket: context.contextPacket, simulationOnly, trustedForLiveExecution };

  const basePlan = {
    schemaVersion: FRONTIER_COGNITIVE_PLAN_SCHEMA,
    missionId: normalizedTask.task.missionId,
    task: normalizedTask.task,
    contextPacket: context.contextPacket,
    blockedProfiles: blocked,
    callabilityProvenanceDigest: provenance.ok ? provenance.receiptDigest : null,
    simulationOnly,
    trustedForLiveExecution,
    truthBoundary: simulationOnly
      ? 'SYNTHETIC_PROVENANCE_TEST_PLAN_NOT_LIVE_AUTHORITY; MODEL_OUTPUT_IS_NOT_EXTERNAL_TRUTH'
      : 'LIVE_EXECUTION_AUTHORITY_REQUIRES_CANONICAL_PRODUCER_ORIGIN; MODEL_OUTPUT_IS_NOT_EXTERNAL_TRUTH',
    candidateEvidence: ranked.ranked.map(item => ({
      profileId: item.profile.id,
      provider: item.profile.provider,
      model: item.profile.model,
      revision: item.profile.revision,
      transportProvider: item.profile.transportProvider,
      transportModel: item.profile.transportModel,
      benchmarkId: item.benchmark?.benchmarkId ?? null,
      benchmarkRevision: item.benchmark?.observedRevision ?? null,
      benchmarkEvidenceRef: item.benchmark?.evidenceRef ?? null,
      quality: item.benchmark?.quality ?? null,
      reliability: item.benchmark?.reliability ?? null,
      reasoningSettingRef: item.eligibility.binding.settingRef
    }))
  };

  if (normalizedTask.task.reasoningTier !== 'COUNCIL_MAX') {
    const winner = ranked.ranked[0];
    const plan = { ...basePlan, mode: 'SINGLE_FRONTIER', status: 'FRONTIER_PLAN_READY', selected: planMember(winner) };
    return envelope({ ok: true, status: plan.status, plan, planDigest: sha256(plan), simulationOnly, trustedForLiveExecution });
  }

  const rankedCouncil = ranked.ranked;
  const responderLimit = Math.min(
    normalizedTask.task.maxCouncilSize,
    allowDegradedCouncil ? rankedCouncil.length : Math.max(0, rankedCouncil.length - 1)
  );
  if (responderLimit < normalizedTask.task.minCouncilSize) {
    return failure(['council-minimum-cardinality-unavailable'], 'CAPACITY_BLOCKED', { available: responderLimit, required: normalizedTask.task.minCouncilSize, blocked, contextPacket: context.contextPacket, simulationOnly, trustedForLiveExecution });
  }

  const responders = [];
  const responderIdsMutable = new Set();
  const responderProviders = new Set();
  for (const candidate of rankedCouncil) {
    if (responders.length >= responderLimit) break;
    if (responderProviders.has(candidate.profile.provider)) continue;
    responders.push(candidate);
    responderIdsMutable.add(candidate.profile.id);
    responderProviders.add(candidate.profile.provider);
  }
  for (const candidate of rankedCouncil) {
    if (responders.length >= responderLimit) break;
    if (responderIdsMutable.has(candidate.profile.id)) continue;
    responders.push(candidate);
    responderIdsMutable.add(candidate.profile.id);
    responderProviders.add(candidate.profile.provider);
  }

  if (responders.length < normalizedTask.task.minCouncilSize) return failure(['council-minimum-cardinality-unavailable'], 'CAPACITY_BLOCKED', { available: responders.length, required: normalizedTask.task.minCouncilSize, blocked, contextPacket: context.contextPacket, simulationOnly, trustedForLiveExecution });
  const providerDiversity = responderProviders.size;
  const diversityDegraded = providerDiversity < 2;
  if (diversityDegraded && !allowDegradedCouncil) return failure(['council-provider-diversity-unavailable'], 'CAPACITY_BLOCKED', { responderProfiles: responders.map(item => item.profile.id), providerDiversity, blocked, contextPacket: context.contextPacket, simulationOnly, trustedForLiveExecution });

  const responderIds = new Set(responders.map(item => item.profile.id));
  let adjudicator = rankedCouncil.find(item => !responderIds.has(item.profile.id)) ?? null;
  let adjudicatorDegraded = false;
  if (!adjudicator) {
    if (!allowDegradedCouncil) return failure(['independent-adjudicator-unavailable'], 'CAPACITY_BLOCKED', { responderProfiles: [...responderIds], blocked, contextPacket: context.contextPacket, simulationOnly, trustedForLiveExecution });
    adjudicator = responders[0];
    adjudicatorDegraded = true;
  }
  const graphResult = compileCouncilGraph(responders, adjudicator, normalizedTask.task, context.contextPacket);
  if (!graphResult.ok) return failure(graphResult.reasonCodes, 'FRONTIER_COUNCIL_GRAPH_INVALID', { simulationOnly, trustedForLiveExecution });
  const degraded = diversityDegraded || adjudicatorDegraded;
  const plan = {
    ...basePlan,
    mode: 'COUNCIL_MAX',
    status: degraded ? 'COUNCIL_DEGRADED' : 'COUNCIL_PLAN_READY',
    degradationPolicyRef: degraded ? text(degradationPolicyRef, 1000) : null,
    degradationReasonCodes: [
      ...(diversityDegraded ? ['provider-diversity-below-two'] : []),
      ...(adjudicatorDegraded ? ['adjudicator-not-independent'] : [])
    ],
    providerDiversity,
    responders: responders.map(planMember),
    adjudicator: planMember(adjudicator),
    members: [...responders, ...(responderIds.has(adjudicator.profile.id) ? [] : [adjudicator])].map(planMember),
    graph: graphResult.graph,
    graphDigest: graphResult.graphDigest,
    independenceInvariant: 'first-pass responders have zero council-result dependencies; responder cross-critique begins only after all first passes; adjudicator is distinct from responders unless an explicit degradation policy is recorded'
  };
  return envelope({ ok: true, status: plan.status, plan, planDigest: sha256(plan), simulationOnly, trustedForLiveExecution });
}

function cleanReceiptText(value, max, reasons, code) {
  const normalized = text(value, max);
  if (normalized && !secretFree(normalized)) reasons.push(code);
  return normalized;
}

export function buildFrontierCognitiveReceipt({ planResult, executions = [], contradictions = [], adjudication = {}, verifierEvidenceRefs = [], now = new Date() } = {}) {
  if (!planResult?.ok || !planResult.plan || !planResult.planDigest) return failure(['verified-frontier-plan-required'], 'FRONTIER_RECEIPT_BLOCKED');
  if (planResult.plan.schemaVersion !== FRONTIER_COGNITIVE_PLAN_SCHEMA || sha256(planResult.plan) !== planResult.planDigest) return failure(['frontier-plan-digest-or-schema-mismatch'], 'FRONTIER_RECEIPT_BLOCKED');
  const simulationOnly = planResult.plan.simulationOnly === true || planResult.simulationOnly === true;
  const trustedForLiveExecution = !simulationOnly && (planResult.plan.trustedForLiveExecution === true || planResult.trustedForLiveExecution === true);
  if (!simulationOnly && !trustedForLiveExecution) return failure(['live-plan-provenance-not-trusted'], 'FRONTIER_RECEIPT_BLOCKED');
  if (!Array.isArray(executions) || !executions.length || executions.length > MAX_PROFILES) return failure(['bounded-executions-required'], 'FRONTIER_RECEIPT_BLOCKED');
  const selected = planResult.plan.mode === 'COUNCIL_MAX' ? planResult.plan.members : [planResult.plan.selected];
  const expected = new Map(selected.map(item => [item.profileId, item]));
  const seen = new Set();
  const normalizedExecutions = [];
  const reasons = [];

  for (const raw of executions) {
    const profileId = text(raw?.profileId, 120)?.toLowerCase();
    const chosen = expected.get(profileId);
    if (!chosen) { reasons.push(`unexpected-execution-profile:${profileId ?? 'unknown'}`); continue; }
    if (seen.has(profileId)) { reasons.push(`duplicate-execution-profile:${profileId}`); continue; }
    seen.add(profileId);
    if (raw?.ok !== true) reasons.push(`execution-not-successful:${profileId}`);
    const observedProvider = text(raw?.observedProvider, 80)?.toLowerCase();
    const observedModel = text(raw?.observedModel, 120);
    const observedRevision = text(raw?.observedRevision, 240);
    const observedTransportProvider = text(raw?.observedTransportProvider, 80)?.toLowerCase();
    const observedTransportModel = text(raw?.observedTransportModel, 160);
    const identityVerification = text(raw?.identityVerification, 80)?.toUpperCase();
    const appliedReasoningSettingRef = text(raw?.appliedReasoningSettingRef, 500);
    const identityOk = observedProvider === chosen.provider
      && chosen.identityAliases.includes(observedModel)
      && observedRevision === chosen.revision
      && observedTransportProvider === chosen.transportProvider
      && observedTransportModel === chosen.transportModel
      && identityVerification === 'OBSERVED';
    if (!identityOk) reasons.push(`execution-identity-mismatch:${profileId}`);
    if (appliedReasoningSettingRef !== chosen.reasoningSettingRef) reasons.push(`reasoning-setting-not-proven:${profileId}`);
    const resultRef = cleanReceiptText(raw?.resultRef, 1000, reasons, `secret-bearing-result-ref:${profileId}`);
    if (!resultRef) reasons.push(`result-ref-required:${profileId}`);
    const claims = list(raw?.claims ?? [], 128, 2000) ?? [];
    if (claims.some(claim => !secretFree(claim))) reasons.push(`secret-bearing-claim:${profileId}`);
    const latencyMs = integer(raw?.latencyMs ?? 0, 0, 86_400_000);
    const costCents = integer(raw?.costCents ?? 0, 0, 100_000_000);
    if (latencyMs == null || costCents == null) reasons.push(`valid-latency-cost-required:${profileId}`);
    normalizedExecutions.push({ profileId, ok: raw?.ok === true, observedProvider, observedModel, observedRevision, observedTransportProvider, observedTransportModel, identityVerification, appliedReasoningSettingRef, latencyMs, costCents, resultRef, claims });
  }

  for (const profileId of expected.keys()) if (!seen.has(profileId)) reasons.push(`missing-execution-profile:${profileId}`);
  if (reasons.length) return failure(reasons, 'FRONTIER_RECEIPT_BLOCKED', { executions: normalizedExecutions, simulationOnly, trustedForLiveExecution });

  const contradictionList = Array.isArray(contradictions) ? contradictions.map(item => text(item, 2000)).filter(Boolean) : [];
  if (contradictionList.some(item => !secretFree(item))) return failure(['secret-bearing-contradiction-prohibited'], 'FRONTIER_RECEIPT_BLOCKED');
  const verifierRefs = Array.isArray(verifierEvidenceRefs) ? verifierEvidenceRefs.map(item => text(item, 1000)).filter(Boolean) : [];
  if (verifierRefs.some(item => !secretFree(item))) return failure(['secret-bearing-verifier-ref-prohibited'], 'FRONTIER_RECEIPT_BLOCKED');

  const adjudicationDecision = text(adjudication?.decision, 2000);
  const adjudicationBasis = text(adjudication?.decisionBasis, 240)?.toUpperCase() ?? null;
  const unresolved = list(adjudication?.unresolved ?? [], 128, 1000) ?? [];
  if ([adjudicationDecision, ...unresolved].filter(Boolean).some(item => !secretFree(item))) return failure(['secret-bearing-adjudication-prohibited'], 'FRONTIER_RECEIPT_BLOCKED');

  if (planResult.plan.mode === 'COUNCIL_MAX') {
    if (!verifierRefs.length) return failure(['independent-verifier-evidence-required'], 'FRONTIER_RECEIPT_BLOCKED');
    if (!adjudicationBasis || adjudicationBasis === 'MAJORITY_ONLY') return failure(['majority-only-adjudication-prohibited'], 'FRONTIER_RECEIPT_BLOCKED');
    const adjudicatorProfileId = text(adjudication?.adjudicatorProfileId, 120)?.toLowerCase();
    if (adjudicatorProfileId !== planResult.plan.adjudicator.profileId) return failure(['adjudicator-identity-mismatch'], 'FRONTIER_RECEIPT_BLOCKED');
    if (planResult.plan.responders.some(item => item.profileId === adjudicatorProfileId) && planResult.plan.status !== 'COUNCIL_DEGRADED') return failure(['adjudicator-not-independent'], 'FRONTIER_RECEIPT_BLOCKED');
    if (adjudication?.independentFromResponders !== true && planResult.plan.status !== 'COUNCIL_DEGRADED') return failure(['adjudicator-independence-not-proven'], 'FRONTIER_RECEIPT_BLOCKED');
  }

  const receipt = {
    schemaVersion: FRONTIER_COGNITIVE_RECEIPT_SCHEMA,
    generatedAt: new Date(now).toISOString(),
    planDigest: planResult.planDigest,
    missionId: planResult.plan.missionId,
    taskId: planResult.plan.task.taskId,
    mode: planResult.plan.mode,
    reasoningTier: planResult.plan.task.reasoningTier,
    simulationOnly,
    trustedForLiveExecution,
    executions: normalizedExecutions,
    contradictions: contradictionList,
    adjudication: {
      decision: adjudicationDecision,
      decisionBasis: adjudicationBasis,
      adjudicatorProfileId: text(adjudication?.adjudicatorProfileId, 120)?.toLowerCase() ?? null,
      independentFromResponders: adjudication?.independentFromResponders === true,
      unresolved
    },
    verifierEvidenceRefs: verifierRefs,
    semanticClaimAuthority: 'NONE',
    semanticVerificationStatus: 'EXTERNAL_EVIDENCE_REQUIRED',
    processVerificationOnly: true,
    contextArtifactIds: planResult.plan.contextPacket.contextArtifactIds,
    providerSessionStateCanonical: false,
    truthBoundary: `${simulationOnly ? 'SYNTHETIC_PROVENANCE_TEST_RECEIPT_NOT_LIVE_AUTHORITY; ' : ''}MODEL_CONSENSUS_AND_PROCESS_DIGESTS_ARE_NOT_EXTERNAL_SEMANTIC_PROOF; CALLABILITY_AND_EXECUTION_IDENTITY_REQUIRE_OBSERVED_EVIDENCE; APPLIED_REASONING_SETTING_MUST_MATCH_PLAN; PROVIDER_SESSION_STATE_IS_CACHE_ONLY`,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  return envelope({ ok: true, status: 'FRONTIER_COGNITIVE_RECEIPT_READY', receipt, receiptDigest: sha256(receipt), simulationOnly, trustedForLiveExecution });
}
