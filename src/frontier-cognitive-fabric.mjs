import crypto from 'node:crypto';
import { buildContextPlan } from './frontier-context-spine.mjs';
import { normalizeModelCandidate, normalizeModelBenchmark, routeModel } from './agent-model-router.mjs';
import { validateOrchestrationGraph } from './orchestration-frontier.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_COGNITIVE_FABRIC_VERSION = 'uberbond.frontier-cognitive-fabric-1.0.0';
export const FRONTIER_COGNITIVE_PLAN_SCHEMA = 'uberbond.frontier-cognitive-plan.v1';
export const FRONTIER_COGNITIVE_RECEIPT_SCHEMA = 'uberbond.frontier-cognitive-receipt.v1';

export const FRONTIER_REASONING_TIERS = Object.freeze(['FAST', 'STANDARD', 'DEEP', 'FRONTIER_MAX', 'COUNCIL_MAX']);

const SAFE_DATA_CLASSES = new Set(['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE']);
const TRANSPORT_PROVIDERS = new Set(['openai', 'anthropic', 'ai-gateway', 'open-model', 'claude-code-sandbox']);
const REMOTE_TRANSPORTS = new Set(['openai', 'anthropic', 'ai-gateway']);
const ROLE_NAMES = new Set(['planner', 'researcher', 'builder', 'critic', 'verifier', 'adjudicator', 'general']);
const MAX_PROFILES = 64;
const MAX_COUNCIL = 8;
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
function envelope(extra = {}) {
  return { policyVersion: FRONTIER_COGNITIVE_FABRIC_VERSION, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}
function failure(reasonCodes, status = 'FRONTIER_FABRIC_BLOCKED', extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra });
}
function evidenceFresh(verifiedAt, now, maxAgeMs) {
  const at = Date.parse(verifiedAt || '');
  const current = now instanceof Date ? now.getTime() : Date.parse(now || new Date().toISOString());
  return Number.isFinite(at) && Number.isFinite(current) && at <= current && current - at <= maxAgeMs;
}

function normalizeReasoningBindings(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const tier of FRONTIER_REASONING_TIERS.filter(item => item !== 'COUNCIL_MAX')) {
    if (raw[tier] == null) continue;
    const settingRef = text(raw[tier]?.settingRef ?? raw[tier], 500);
    const sourceRef = text(raw[tier]?.sourceRef, 1000);
    const verifiedAt = timestamp(raw[tier]?.verifiedAt);
    if (!settingRef || !sourceRef || !verifiedAt) return null;
    out[tier] = { settingRef, sourceRef, verifiedAt };
  }
  return out;
}

function normalizeProfile(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reasonCodes: [`invalid-profile:${index}`] };
  const id = text(raw.id, 120)?.toLowerCase();
  const provider = text(raw.provider, 80)?.toLowerCase();
  const model = text(raw.model, 240);
  const revision = text(raw.revision, 240);
  const transportProvider = text(raw.transportProvider, 80)?.toLowerCase();
  const transportModel = text(raw.transportModel ?? model, 240);
  const taskClasses = list(raw.taskClasses ?? ['general'], 64, 160)?.map(item => item.toLowerCase());
  const roles = list(raw.roles ?? ['general'], 16, 80)?.map(item => item.toLowerCase());
  const allowedDataClasses = list(raw.allowedDataClasses ?? ['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE'], 16, 80)?.map(item => item.toUpperCase());
  const reasoningBindings = normalizeReasoningBindings(raw.reasoningBindings ?? {});
  const pricingVerifiedAt = timestamp(raw.pricingVerifiedAt);
  const pricingSourceRef = text(raw.pricingSourceRef, 1000);
  const maxContextTokens = integer(raw.maxContextTokens ?? 1, 1, 5_000_000);
  const maxOutputTokens = integer(raw.maxOutputTokens ?? 1, 1, 1_000_000);
  const centsPerMillionInputTokens = finite(raw.centsPerMillionInputTokens ?? 0, 0, 100_000_000);
  const centsPerMillionOutputTokens = finite(raw.centsPerMillionOutputTokens ?? 0, 0, 100_000_000);
  const identityAliases = list(raw.identityAliases ?? [model], 16, 240);
  const reasons = [];
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) reasons.push(`profile-id-invalid:${index}`);
  if (!provider) reasons.push(`provider-required:${id ?? index}`);
  if (!model) reasons.push(`model-required:${id ?? index}`);
  if (!revision) reasons.push(`revision-required:${id ?? index}`);
  if (!transportProvider || !TRANSPORT_PROVIDERS.has(transportProvider)) reasons.push(`transport-provider-unsupported:${id ?? index}`);
  if (!transportModel) reasons.push(`transport-model-required:${id ?? index}`);
  if (!taskClasses?.length) reasons.push(`task-classes-required:${id ?? index}`);
  if (!roles?.length || roles.some(role => !ROLE_NAMES.has(role))) reasons.push(`recognized-roles-required:${id ?? index}`);
  if (!allowedDataClasses?.length || allowedDataClasses.some(item => !SAFE_DATA_CLASSES.has(item))) reasons.push(`safe-data-classes-required:${id ?? index}`);
  if (!reasoningBindings || !Object.keys(reasoningBindings).length) reasons.push(`reasoning-bindings-required:${id ?? index}`);
  if (!pricingVerifiedAt || !pricingSourceRef) reasons.push(`pricing-evidence-required:${id ?? index}`);
  if (maxContextTokens == null || maxOutputTokens == null || centsPerMillionInputTokens == null || centsPerMillionOutputTokens == null) reasons.push(`capacity-pricing-invalid:${id ?? index}`);
  if (!identityAliases?.length || !identityAliases.includes(model)) reasons.push(`identity-aliases-must-include-canonical-model:${id ?? index}`);
  if ('apiKey' in raw || 'token' in raw || 'secret' in raw || 'password' in raw || 'endpoint' in raw) reasons.push(`secret-or-endpoint-bearing-profile-prohibited:${id ?? index}`);
  if (reasons.length) return { ok: false, reasonCodes: reasons };
  return {
    ok: true,
    profile: {
      id, provider, model, revision, transportProvider, transportModel,
      taskClasses, roles, allowedDataClasses, reasoningBindings,
      pricingVerifiedAt, pricingSourceRef, maxContextTokens, maxOutputTokens,
      centsPerMillionInputTokens, centsPerMillionOutputTokens, identityAliases,
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

function normalizeCallability(raw = {}, profileMap, now, maxAgeMs) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const profileId = text(raw.profileId, 120)?.toLowerCase();
  const profile = profileMap.get(profileId);
  if (!profile) return null;
  const status = text(raw.status, 80)?.toUpperCase();
  const observedProvider = text(raw.observedProvider, 80)?.toLowerCase();
  const observedModel = text(raw.observedModel, 240);
  const observedRevision = text(raw.observedRevision, 240);
  const observedAt = timestamp(raw.observedAt);
  const sourceRef = text(raw.sourceRef, 1000);
  const fresh = observedAt && evidenceFresh(observedAt, now, maxAgeMs);
  const identityMatches = observedProvider === profile.provider
    && profile.identityAliases.includes(observedModel)
    && observedRevision === profile.revision;
  return {
    profileId,
    status: status || 'CONFIGURED_NOT_PROVEN',
    callableNow: status === 'CALLABLE_NOW' && Boolean(sourceRef) && Boolean(fresh) && identityMatches,
    sourceRef,
    observedAt,
    observedProvider,
    observedModel,
    observedRevision,
    fresh: Boolean(fresh),
    identityMatches
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
  const minCouncilSize = integer(raw.minCouncilSize ?? 2, 2, MAX_COUNCIL);
  const maxCouncilSize = integer(raw.maxCouncilSize ?? 4, 2, MAX_COUNCIL);
  const reasons = [];
  if (!missionId || !taskId || !objective) reasons.push('mission-task-objective-required');
  if (!role || !ROLE_NAMES.has(role)) reasons.push('recognized-role-required');
  if (!SAFE_DATA_CLASSES.has(dataClass)) reasons.push('safe-data-class-required');
  if (!FRONTIER_REASONING_TIERS.includes(reasoningTier)) reasons.push('recognized-reasoning-tier-required');
  if (!requiredTags) reasons.push('required-tags-invalid');
  if (contextTokenBudget == null || minCouncilSize == null || maxCouncilSize == null || minCouncilSize > maxCouncilSize) reasons.push('valid-context-and-council-bounds-required');
  return reasons.length ? { ok: false, reasonCodes: reasons } : { ok: true, task: { missionId, taskId, objective, taskClass, role, dataClass, reasoningTier, requiredTags, contextTokenBudget, minCouncilSize, maxCouncilSize } };
}

function latestBenchmarks(benchmarks, taskClass, now, maxAgeMs) {
  const latest = new Map();
  for (const raw of Array.isArray(benchmarks) ? benchmarks : []) {
    const benchmark = raw?.ok === true ? raw : normalizeModelBenchmark(raw, raw?.observedAt ? new Date(raw.observedAt) : new Date(now));
    if (!benchmark?.ok || benchmark.taskClass !== taskClass || !evidenceFresh(benchmark.observedAt, now, maxAgeMs)) continue;
    const current = latest.get(benchmark.candidate.candidateId);
    if (!current || benchmark.observedAt > current.observedAt) latest.set(benchmark.candidate.candidateId, benchmark);
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
  if (!callability?.callableNow) reasons.push(callability ? (callability.identityMatches ? 'callability-evidence-stale-or-incomplete' : 'callability-identity-mismatch') : 'callability-evidence-absent');
  if (REMOTE_TRANSPORTS.has(profile.transportProvider) && task.dataClass === 'SOURCE_CODE' && !profile.allowedDataClasses.includes('SOURCE_CODE')) reasons.push('remote-source-code-disclosure-not-allowed');
  return { ok: reasons.length === 0, reasons, executionTier, binding: binding ?? null };
}

function executorWorker(profile) {
  return { provider: profile.transportProvider, model: profile.transportModel };
}

function rankEligible({ eligible, latest, task, minimumEvidenceConfidence, frontierQualityDelta, random }) {
  const enriched = eligible.map(item => {
    const candidate = candidateFor(item.profile);
    const benchmark = candidate.ok ? latest.get(candidate.candidateId) ?? null : null;
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
      const aScore = a.benchmark.quality * 0.58 + a.benchmark.reliability * 0.32 + a.benchmark.latencyScore * 0.05 + a.benchmark.costEfficiency * 0.05;
      const bScore = b.benchmark.quality * 0.58 + b.benchmark.reliability * 0.32 + b.benchmark.latencyScore * 0.05 + b.benchmark.costEfficiency * 0.05;
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
    purpose: `Independently solve ${task.taskId} without seeing another model's answer.`,
    dependencies: [],
    workerRequirement: `frontier-profile:${profile.id}`,
    ownedFilesOrResponsibility: [`frontier-independent:${profile.id}`],
    inputs: ['mission-objective', ...contextPacket.contextArtifactIds.map(id => `context:${id}`)],
    expectedOutput: `Independent structured answer from ${profile.id}`,
    verification: ['No prior council answer is included in first-pass inputs.', 'Claims must preserve evidence references and uncertainty.'],
    stopCondition: 'One bounded answer or explicit refusal.',
    authorityCeiling: 'LOCAL_PREPARATION',
    implementation: true,
    callableWorkerVerified: true
  };
}

function compileCouncilGraph(selected, task, contextPacket) {
  const independent = selected.map((item, index) => independentNode(item.profile, task, contextPacket, index));
  const independentIds = independent.map(node => node.id);
  const criticProfile = selected[1]?.profile ?? selected[0].profile;
  const adjudicatorProfile = selected[0].profile;
  const critique = {
    id: 'cross_critique',
    purpose: 'Compare independent frontier answers, extract contradictions, unsupported claims and unique useful insights.',
    dependencies: independentIds,
    workerRequirement: `frontier-profile:${criticProfile.id}`,
    ownedFilesOrResponsibility: ['frontier-cross-critique'],
    inputs: independentIds.map(id => `dependency-output:${id}`),
    expectedOutput: 'Structured contradiction and evidence-quality map.',
    verification: ['Majority agreement is not proof.', 'Unsupported claims remain unresolved.'],
    stopCondition: 'Contradictions and evidence gaps are explicitly classified.',
    authorityCeiling: 'LOCAL_PREPARATION',
    implementation: true,
    callableWorkerVerified: true
  };
  const adjudication = {
    id: 'independent_adjudication',
    purpose: 'Produce the canonical bounded recommendation from evidence, critique and unresolved uncertainty.',
    dependencies: [...independentIds, critique.id],
    workerRequirement: `frontier-profile:${adjudicatorProfile.id}`,
    ownedFilesOrResponsibility: ['frontier-adjudication'],
    inputs: [...independentIds.map(id => `dependency-output:${id}`), `dependency-output:${critique.id}`],
    expectedOutput: 'Evidence-bound adjudication with unresolved uncertainty and explicit dissent.',
    verification: ['Adjudication cites verifier evidence.', 'No claim becomes true solely because most models repeated it.'],
    stopCondition: 'Canonical recommendation or explicit unresolved state.',
    authorityCeiling: 'LOCAL_PREPARATION',
    implementation: true,
    callableWorkerVerified: true
  };
  const graph = {
    mode: 'FABLE_GRAPH',
    parentAuthority: 'LOCAL_PREPARATION',
    dataClass: task.dataClass,
    maxDepth: 3,
    maxIterations: 3,
    nodes: [...independent, critique, adjudication]
  };
  return validateOrchestrationGraph(graph);
}

export function compileFrontierCognitivePlan({
  task,
  profiles = [],
  callability = [],
  benchmarks = [],
  contextArtifacts = [],
  minimumEvidenceConfidence = 0.6,
  evidenceMaxAgeMs = DEFAULT_EVIDENCE_MAX_AGE_MS,
  callabilityMaxAgeMs = DEFAULT_CALLABILITY_MAX_AGE_MS,
  frontierQualityDelta = DEFAULT_FRONTIER_QUALITY_DELTA,
  allowDegradedCouncil = false,
  now = new Date(),
  random = () => 0.5
} = {}) {
  const normalizedTask = normalizeTask(task);
  if (!normalizedTask.ok) return failure(normalizedTask.reasonCodes, 'FRONTIER_TASK_INVALID');
  const current = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(current.getTime())) return failure(['valid-current-time-required'], 'FRONTIER_TASK_INVALID');
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > MAX_PROFILES) return failure(['bounded-profile-list-required'], 'FRONTIER_PROFILE_SET_INVALID');
  const profileList = [];
  const reasons = [];
  const ids = new Set();
  for (const [index, raw] of profiles.entries()) {
    const normalized = normalizeProfile(raw, index);
    if (!normalized.ok) reasons.push(...normalized.reasonCodes);
    else if (ids.has(normalized.profile.id)) reasons.push(`duplicate-profile-id:${normalized.profile.id}`);
    else { ids.add(normalized.profile.id); profileList.push(normalized.profile); }
  }
  if (reasons.length) return failure(reasons, 'FRONTIER_PROFILE_SET_INVALID');
  const profileMap = new Map(profileList.map(profile => [profile.id, profile]));
  const callabilityMap = new Map();
  for (const raw of callability) {
    const normalized = normalizeCallability(raw, profileMap, current, callabilityMaxAgeMs);
    if (normalized) callabilityMap.set(normalized.profileId, normalized);
  }
  const context = compileContext(normalizedTask.task, contextArtifacts);
  if (!context.ok) return context;
  const latest = latestBenchmarks(benchmarks, normalizedTask.task.taskClass, current, evidenceMaxAgeMs);
  const eligible = [];
  const blocked = [];
  for (const profile of profileList) {
    const eligibility = profileEligibility(profile, normalizedTask.task, callabilityMap.get(profile.id), current, evidenceMaxAgeMs);
    if (eligibility.ok) eligible.push({ profile, eligibility });
    else blocked.push({ profileId: profile.id, reasonCodes: eligibility.reasons });
  }
  if (!eligible.length) return failure(['no-eligible-callable-frontier-profile'], 'CAPACITY_BLOCKED', { blocked, contextPacket: context.contextPacket });
  const ranked = rankEligible({ eligible, latest, task: normalizedTask.task, minimumEvidenceConfidence, frontierQualityDelta, random });
  if (!ranked.ok) return { ...ranked, blocked, contextPacket: context.contextPacket };

  const basePlan = {
    schemaVersion: FRONTIER_COGNITIVE_PLAN_SCHEMA,
    missionId: normalizedTask.task.missionId,
    task: normalizedTask.task,
    contextPacket: context.contextPacket,
    blockedProfiles: blocked,
    candidateEvidence: ranked.ranked.map(item => ({
      profileId: item.profile.id,
      provider: item.profile.provider,
      model: item.profile.model,
      revision: item.profile.revision,
      transportProvider: item.profile.transportProvider,
      benchmarkId: item.benchmark?.benchmarkId ?? null,
      quality: item.benchmark?.quality ?? null,
      reliability: item.benchmark?.reliability ?? null,
      reasoningSettingRef: item.eligibility.binding.settingRef
    }))
  };

  if (normalizedTask.task.reasoningTier !== 'COUNCIL_MAX') {
    const winner = ranked.ranked[0];
    const plan = {
      ...basePlan,
      mode: 'SINGLE_FRONTIER',
      status: 'FRONTIER_PLAN_READY',
      selected: {
        profileId: winner.profile.id,
        provider: winner.profile.provider,
        model: winner.profile.model,
        revision: winner.profile.revision,
        transportProvider: winner.profile.transportProvider,
        transportModel: winner.profile.transportModel,
        executorWorker: executorWorker(winner.profile),
        reasoningTier: winner.eligibility.executionTier,
        reasoningSettingRef: winner.eligibility.binding.settingRef
      }
    };
    return envelope({ ok: true, status: plan.status, plan, planDigest: sha256(plan) });
  }

  const selected = [];
  const providers = new Set();
  for (const candidate of ranked.ranked) {
    if (selected.length >= normalizedTask.task.maxCouncilSize) break;
    if (!providers.has(candidate.profile.provider) || selected.length + (ranked.ranked.length - selected.length) <= normalizedTask.task.minCouncilSize) {
      selected.push(candidate);
      providers.add(candidate.profile.provider);
    }
  }
  if (selected.length < normalizedTask.task.minCouncilSize) {
    return failure(['council-minimum-cardinality-unavailable'], 'CAPACITY_BLOCKED', { available: selected.length, required: normalizedTask.task.minCouncilSize, blocked, contextPacket: context.contextPacket });
  }
  const providerDiversity = new Set(selected.map(item => item.profile.provider)).size;
  const degraded = providerDiversity < 2;
  if (degraded && !allowDegradedCouncil) {
    return failure(['council-provider-diversity-unavailable'], 'CAPACITY_BLOCKED', { selectedProfiles: selected.map(item => item.profile.id), providerDiversity, blocked, contextPacket: context.contextPacket });
  }
  const graphResult = compileCouncilGraph(selected, normalizedTask.task, context.contextPacket);
  if (!graphResult.ok) return failure(graphResult.reasonCodes, 'FRONTIER_COUNCIL_GRAPH_INVALID');
  const plan = {
    ...basePlan,
    mode: 'COUNCIL_MAX',
    status: degraded ? 'COUNCIL_DEGRADED' : 'COUNCIL_PLAN_READY',
    degradationReasonCodes: degraded ? ['provider-diversity-below-two'] : [],
    providerDiversity,
    members: selected.map(item => ({
      profileId: item.profile.id,
      provider: item.profile.provider,
      model: item.profile.model,
      revision: item.profile.revision,
      transportProvider: item.profile.transportProvider,
      transportModel: item.profile.transportModel,
      executorWorker: executorWorker(item.profile),
      reasoningTier: item.eligibility.executionTier,
      reasoningSettingRef: item.eligibility.binding.settingRef
    })),
    graph: graphResult.graph,
    graphDigest: graphResult.graphDigest,
    independenceInvariant: 'independent first-pass nodes have zero council-result dependencies; critique/adjudication may consume prior outputs only in later explicit phases'
  };
  return envelope({ ok: true, status: plan.status, plan, planDigest: sha256(plan) });
}

export function buildFrontierCognitiveReceipt({ planResult, executions = [], contradictions = [], adjudication = {}, verifierEvidenceRefs = [], now = new Date() } = {}) {
  if (!planResult?.ok || !planResult.plan || !planResult.planDigest) return failure(['verified-frontier-plan-required'], 'FRONTIER_RECEIPT_BLOCKED');
  if (!Array.isArray(executions) || !executions.length) return failure(['bounded-executions-required'], 'FRONTIER_RECEIPT_BLOCKED');
  const selected = planResult.plan.mode === 'COUNCIL_MAX' ? planResult.plan.members : [planResult.plan.selected];
  const expected = new Map(selected.map(item => [item.profileId, item]));
  const normalizedExecutions = [];
  const reasons = [];
  for (const raw of executions) {
    const profileId = text(raw?.profileId, 120)?.toLowerCase();
    const chosen = expected.get(profileId);
    if (!chosen) { reasons.push(`unexpected-execution-profile:${profileId ?? 'unknown'}`); continue; }
    const observedProvider = text(raw?.observedProvider, 80)?.toLowerCase();
    const observedModel = text(raw?.observedModel, 240);
    const observedRevision = text(raw?.observedRevision, 240);
    const identityVerification = text(raw?.identityVerification, 80)?.toUpperCase();
    const identityOk = observedProvider === chosen.provider && observedModel === chosen.model && observedRevision === chosen.revision && identityVerification === 'OBSERVED';
    if (!identityOk) reasons.push(`execution-identity-mismatch:${profileId}`);
    normalizedExecutions.push({
      profileId,
      ok: raw?.ok === true,
      observedProvider,
      observedModel,
      observedRevision,
      identityVerification,
      latencyMs: integer(raw?.latencyMs ?? 0, 0, 86_400_000),
      costCents: integer(raw?.costCents ?? 0, 0, 100_000_000),
      resultRef: text(raw?.resultRef, 1000),
      claims: list(raw?.claims ?? [], 128, 2000) ?? []
    });
  }
  if (reasons.length) return failure(reasons, 'FRONTIER_RECEIPT_BLOCKED', { executions: normalizedExecutions });
  if (planResult.plan.mode === 'COUNCIL_MAX') {
    if (normalizedExecutions.length < planResult.plan.task.minCouncilSize) return failure(['council-execution-cardinality-below-plan'], 'FRONTIER_RECEIPT_BLOCKED');
    if (!Array.isArray(verifierEvidenceRefs) || verifierEvidenceRefs.length === 0) return failure(['independent-verifier-evidence-required'], 'FRONTIER_RECEIPT_BLOCKED');
    const decisionBasis = text(adjudication?.decisionBasis, 240)?.toUpperCase();
    if (!decisionBasis || decisionBasis === 'MAJORITY_ONLY') return failure(['majority-only-adjudication-prohibited'], 'FRONTIER_RECEIPT_BLOCKED');
  }
  const receipt = {
    schemaVersion: FRONTIER_COGNITIVE_RECEIPT_SCHEMA,
    generatedAt: new Date(now).toISOString(),
    planDigest: planResult.planDigest,
    missionId: planResult.plan.missionId,
    taskId: planResult.plan.task.taskId,
    mode: planResult.plan.mode,
    reasoningTier: planResult.plan.task.reasoningTier,
    executions: normalizedExecutions,
    contradictions: Array.isArray(contradictions) ? contradictions.map(item => text(item, 2000)).filter(Boolean) : [],
    adjudication: {
      decision: text(adjudication?.decision, 2000),
      decisionBasis: text(adjudication?.decisionBasis, 240)?.toUpperCase() ?? null,
      unresolved: list(adjudication?.unresolved ?? [], 128, 1000) ?? []
    },
    verifierEvidenceRefs: Array.isArray(verifierEvidenceRefs) ? verifierEvidenceRefs.map(item => text(item, 1000)).filter(Boolean) : [],
    contextArtifactIds: planResult.plan.contextPacket.contextArtifactIds,
    providerSessionStateCanonical: false,
    truthBoundary: 'MODEL_CONSENSUS_IS_NOT_PROOF; CALLABILITY_AND_EXECUTION_IDENTITY_REQUIRE_OBSERVED_EVIDENCE; PROVIDER_SESSION_STATE_IS_CACHE_ONLY',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  return envelope({ ok: true, status: 'FRONTIER_COGNITIVE_RECEIPT_READY', receipt, receiptDigest: sha256(receipt) });
}
