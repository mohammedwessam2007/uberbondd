import crypto from 'node:crypto';
import {
  OPEN_MODEL_RUNTIMES,
  OPENAI_API_STYLES,
  planOpenModelRuntime,
  createOpenModelRuntimeExecutor
} from './open-model-runtime-executor.mjs';
import {
  validateOrchestrationGraph,
  readyOrchestrationNodes
} from './orchestration-frontier.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const AVENGERS_ARSENAL_VERSION = 'uberbond.avengers-arsenal-1.0.0';
export const AVENGERS_REGISTRY_SCHEMA = 'uberbond.avengers-arsenal-registry.v1';
export const AVENGERS_READINESS_SCHEMA = 'uberbond.avengers-arsenal-readiness.v1';
export const AVENGERS_PLAN_SCHEMA = 'uberbond.avengers-squad-plan.v1';
export const AVENGERS_EXECUTION_SCHEMA = 'uberbond.avengers-execution-receipt.v1';

const MAX_PROFILES = 64;
const MAX_TOOLS = 128;
const MAX_MISSION_NODES = 32;
const MAX_PARALLEL = 4;
const MAX_FALLBACKS = 3;
const MAX_RESPONSE_BYTES = 1_000_000;
const SAFE_DATA_CLASSES = new Set(['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE']);
const SAFE_CONSEQUENCE_CLASSES = new Set(['NONE', 'LOCAL_PREPARATION']);
const LICENSE_CLASSES = new Set(['PERMISSIVE', 'CONDITIONAL', 'CUSTOM', 'PROPRIETARY', 'UNKNOWN']);
const TOOL_KINDS = new Set(['PROJECT_SKILL', 'DETERMINISTIC_MODULE', 'OPTIONAL_RUNTIME', 'METHOD_ONLY', 'EXTERNAL_ADAPTER']);
const ROLE_NAMES = new Set(['planner', 'researcher', 'builder', 'critic', 'verifier', 'adjudicator', 'general']);

function clone(value) {
  return structuredClone(value);
}

function zeroEffects() {
  return clone(ZERO_EXTERNAL_EFFECTS);
}

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
    const lowered = normalized.toLowerCase();
    if (!seen.has(lowered)) {
      seen.add(lowered);
      out.push(normalized);
    }
  }
  return out;
}

function number(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function envelope(extra = {}) {
  return {
    policyVersion: AVENGERS_ARSENAL_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function failure(reasonCodes, status = 'BLOCKED', extra = {}) {
  return envelope({
    ok: false,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  });
}

function safeEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.username || url.password) return null;
    const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
    if (loopback && url.protocol === 'http:') return url.toString().replace(/\/$/, '');
    if (url.protocol === 'https:') return url.toString().replace(/\/$/, '');
    return null;
  } catch {
    return null;
  }
}

function normalizePricing(raw = {}) {
  const inputUsdPerMillion = number(raw.inputUsdPerMillion, 0, 1_000_000);
  const outputUsdPerMillion = number(raw.outputUsdPerMillion, 0, 1_000_000);
  const infrastructureUsdPerRequest = number(raw.infrastructureUsdPerRequest ?? 0, 0, 1_000_000);
  const sourceRef = text(raw.sourceRef, 1000);
  const verifiedAt = text(raw.verifiedAt, 100);
  if (inputUsdPerMillion == null || outputUsdPerMillion == null || infrastructureUsdPerRequest == null || !sourceRef || !verifiedAt || !Number.isFinite(Date.parse(verifiedAt))) return null;
  return { inputUsdPerMillion, outputUsdPerMillion, infrastructureUsdPerRequest, sourceRef, verifiedAt: new Date(Date.parse(verifiedAt)).toISOString() };
}

function normalizeRights(raw = {}) {
  const licenseClass = text(raw.licenseClass, 80)?.toUpperCase();
  const sourceRef = text(raw.sourceRef, 1000);
  const verifiedAt = text(raw.verifiedAt, 100);
  if (!licenseClass || !LICENSE_CLASSES.has(licenseClass) || !sourceRef || !verifiedAt || !Number.isFinite(Date.parse(verifiedAt))) return null;
  return {
    licenseClass,
    sourceRef,
    verifiedAt: new Date(Date.parse(verifiedAt)).toISOString(),
    executionAllowed: raw.executionAllowed === true,
    commercialUseAllowed: raw.commercialUseAllowed === true
  };
}

function normalizeBenchmark(raw = {}) {
  const quality = number(raw.quality ?? 50, 0, 100);
  const reliability = number(raw.reliability ?? 50, 0, 100);
  const latencyMs = number(raw.latencyMs ?? 60_000, 0, 86_400_000);
  const observedCostCents = number(raw.observedCostCents ?? 0, 0, 10_000_000);
  const sampleSize = integer(raw.sampleSize ?? 0, 0, 1_000_000);
  const verifiedAt = raw.verifiedAt == null ? null : text(raw.verifiedAt, 100);
  if ([quality, reliability, latencyMs, observedCostCents, sampleSize].some(item => item == null)) return null;
  if (verifiedAt && !Number.isFinite(Date.parse(verifiedAt))) return null;
  return { quality, reliability, latencyMs, observedCostCents, sampleSize, verifiedAt: verifiedAt ? new Date(Date.parse(verifiedAt)).toISOString() : null };
}

function normalizeProfile(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reasonCodes: [`invalid-profile:${index}`] };
  const id = text(raw.id, 120)?.toLowerCase();
  const runtime = text(raw.runtime, 80)?.toUpperCase();
  const model = text(raw.model, 500);
  const endpoint = safeEndpoint(raw.endpoint);
  const apiStyle = text(raw.apiStyle ?? 'CHAT_COMPLETIONS', 80)?.toUpperCase();
  const revision = text(raw.revision, 500);
  const taskClasses = list(raw.taskClasses ?? ['general'], 64, 160)?.map(item => item.toLowerCase());
  const roles = list(raw.roles ?? ['general'], 16, 80)?.map(item => item.toLowerCase());
  const pricing = normalizePricing(raw.pricing);
  const rights = normalizeRights(raw.rights);
  const benchmark = normalizeBenchmark(raw.benchmark);
  const apiKeyEnv = raw.apiKeyEnv == null ? null : text(raw.apiKeyEnv, 160);
  const modelListPath = raw.modelListPath == null ? null : text(raw.modelListPath, 300);
  const reasons = [];
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) reasons.push(`invalid-profile-id:${index}`);
  if (!runtime || !OPEN_MODEL_RUNTIMES.includes(runtime)) reasons.push(`unsupported-runtime:${id ?? index}`);
  if (!model) reasons.push(`model-required:${id ?? index}`);
  if (!endpoint) reasons.push(`safe-endpoint-required:${id ?? index}`);
  if (!apiStyle || !OPENAI_API_STYLES.includes(apiStyle)) reasons.push(`api-style-invalid:${id ?? index}`);
  if (!revision) reasons.push(`revision-required:${id ?? index}`);
  if (!taskClasses?.length) reasons.push(`task-classes-required:${id ?? index}`);
  if (!roles?.length || roles.some(role => !ROLE_NAMES.has(role))) reasons.push(`recognized-roles-required:${id ?? index}`);
  if (!pricing) reasons.push(`pricing-evidence-required:${id ?? index}`);
  if (!rights) reasons.push(`rights-evidence-required:${id ?? index}`);
  if (!benchmark) reasons.push(`benchmark-contract-invalid:${id ?? index}`);
  if (apiKeyEnv && !/^[A-Z][A-Z0-9_]{2,159}$/.test(apiKeyEnv)) reasons.push(`api-key-env-invalid:${id ?? index}`);
  if ('apiKey' in raw || 'token' in raw || 'secret' in raw || 'password' in raw) reasons.push(`secret-bearing-profile-prohibited:${id ?? index}`);
  if (reasons.length) return { ok: false, reasonCodes: reasons };
  return {
    ok: true,
    profile: {
      id,
      runtime,
      model,
      endpoint,
      apiStyle,
      revision,
      taskClasses,
      roles,
      pricing,
      rights,
      benchmark,
      apiKeyEnv,
      modelListPath,
      enabled: raw.enabled === true,
      activationApproved: raw.activationApproved === true,
      inferenceProbeApproved: raw.inferenceProbeApproved === true,
      notes: list(raw.notes ?? [], 32, 1000) ?? []
    }
  };
}

function normalizeTool(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reasonCodes: [`invalid-tool:${index}`] };
  const id = text(raw.id, 120)?.toLowerCase();
  const name = text(raw.name, 200);
  const kind = text(raw.kind, 80)?.toUpperCase();
  const path = raw.path == null ? null : text(raw.path, 600);
  const sourceRef = raw.sourceRef == null ? null : text(raw.sourceRef, 1000);
  const roles = list(raw.roles ?? ['general'], 16, 80)?.map(item => item.toLowerCase());
  const reasons = [];
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) reasons.push(`invalid-tool-id:${index}`);
  if (!name) reasons.push(`tool-name-required:${id ?? index}`);
  if (!kind || !TOOL_KINDS.has(kind)) reasons.push(`tool-kind-invalid:${id ?? index}`);
  if (!roles?.length || roles.some(role => !ROLE_NAMES.has(role))) reasons.push(`tool-roles-invalid:${id ?? index}`);
  if ('apiKey' in raw || 'token' in raw || 'secret' in raw || 'password' in raw) reasons.push(`secret-bearing-tool-prohibited:${id ?? index}`);
  if (reasons.length) return { ok: false, reasonCodes: reasons };
  return { ok: true, tool: { id, name, kind, path, sourceRef, roles, runtimeRequired: raw.runtimeRequired === true, notes: list(raw.notes ?? [], 32, 1000) ?? [] } };
}

export function validateAvengersRegistry(registry = {}) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return failure(['registry-object-required'], 'AVENGERS_REGISTRY_INVALID');
  const reasons = [];
  if (registry.schemaVersion !== AVENGERS_REGISTRY_SCHEMA) reasons.push('unsupported-avengers-registry-schema');
  const profiles = Array.isArray(registry.profiles) ? registry.profiles : null;
  const tools = Array.isArray(registry.tools) ? registry.tools : null;
  if (!profiles || profiles.length > MAX_PROFILES) reasons.push('bounded-profile-list-required');
  if (!tools || tools.length > MAX_TOOLS) reasons.push('bounded-tool-list-required');
  const normalizedProfiles = [];
  const normalizedTools = [];
  const ids = new Set();
  for (const [index, raw] of (profiles ?? []).entries()) {
    const result = normalizeProfile(raw, index);
    if (!result.ok) reasons.push(...result.reasonCodes);
    else {
      if (ids.has(result.profile.id)) reasons.push(`duplicate-arsenal-id:${result.profile.id}`);
      ids.add(result.profile.id);
      normalizedProfiles.push(result.profile);
    }
  }
  for (const [index, raw] of (tools ?? []).entries()) {
    const result = normalizeTool(raw, index);
    if (!result.ok) reasons.push(...result.reasonCodes);
    else {
      if (ids.has(result.tool.id)) reasons.push(`duplicate-arsenal-id:${result.tool.id}`);
      ids.add(result.tool.id);
      normalizedTools.push(result.tool);
    }
  }
  if (reasons.length) return failure(reasons, 'AVENGERS_REGISTRY_INVALID', { profiles: normalizedProfiles, tools: normalizedTools });
  const identity = { schemaVersion: registry.schemaVersion, profiles: normalizedProfiles, tools: normalizedTools };
  return envelope({ ok: true, status: 'AVENGERS_REGISTRY_READY', registry: identity, registryDigest: sha256(identity) });
}

function defaultModelListPath(runtime) {
  return runtime === 'OLLAMA' ? '/api/tags' : '/v1/models';
}

function modelListEndpoint(profile) {
  const url = new URL(profile.endpoint);
  url.pathname = profile.modelListPath || defaultModelListPath(profile.runtime);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function listedModels(payload, runtime) {
  if (runtime === 'OLLAMA') {
    return Array.isArray(payload?.models)
      ? payload.models.map(item => text(item?.name ?? item?.model, 500)).filter(Boolean)
      : null;
  }
  return Array.isArray(payload?.data)
    ? payload.data.map(item => text(item?.id, 500)).filter(Boolean)
    : null;
}

async function boundedJsonResponse(response) {
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('runtime-probe-response-too-large');
  return JSON.parse(raw);
}

export async function probeAvengerProfile(profile, {
  fetchImpl = globalThis.fetch,
  probeInference = false,
  secretResolver = name => process.env[name] || '',
  date = new Date()
} = {}) {
  const validated = normalizeProfile(profile);
  if (!validated.ok) return failure(validated.reasonCodes, 'PROFILE_INVALID', { profileId: profile?.id ?? null });
  const p = validated.profile;
  const plan = planOpenModelRuntime({ runtime: p.runtime, model: p.model, endpoint: p.endpoint, apiStyle: p.apiStyle, pricing: p.pricing, enabled: p.enabled });
  if (!plan.ok) return failure(plan.reasonCodes, 'PROFILE_RUNTIME_PLAN_INVALID', { profileId: p.id });
  if (!p.enabled) return envelope({ ok: true, status: 'CONFIGURED_DISABLED', profileId: p.id, runtime: p.runtime, model: p.model, revision: p.revision, callableNow: false });
  if (!p.rights.executionAllowed) return envelope({ ok: true, status: 'RIGHTS_BLOCKED', profileId: p.id, runtime: p.runtime, model: p.model, revision: p.revision, callableNow: false, reasonCodes: ['rights-execution-not-approved'] });
  if (!p.activationApproved) return envelope({ ok: true, status: 'ACTIVATION_NOT_APPROVED', profileId: p.id, runtime: p.runtime, model: p.model, revision: p.revision, callableNow: false, reasonCodes: ['profile-activation-not-approved'] });
  if (typeof fetchImpl !== 'function') return failure(['fetch-implementation-required'], 'PROFILE_PROBE_BLOCKED', { profileId: p.id });

  let response;
  let payload;
  try {
    const headers = {};
    const key = p.apiKeyEnv ? String(secretResolver(p.apiKeyEnv) || '') : '';
    if (key) headers.Authorization = `Bearer ${key}`;
    response = await fetchImpl(modelListEndpoint(p), { method: 'GET', headers });
    if (!response?.ok) return envelope({ ok: true, status: 'ENDPOINT_UNREACHABLE_OR_REFUSED', profileId: p.id, runtime: p.runtime, model: p.model, revision: p.revision, callableNow: false, httpStatus: Number(response?.status || 0) || null });
    payload = await boundedJsonResponse(response);
  } catch (error) {
    return envelope({ ok: true, status: 'ENDPOINT_UNREACHABLE_OR_REFUSED', profileId: p.id, runtime: p.runtime, model: p.model, revision: p.revision, callableNow: false, reasonCodes: [text(error?.message, 300) || 'runtime-probe-failed'] });
  }

  const models = listedModels(payload, p.runtime);
  if (!models) return envelope({ ok: true, status: 'MODEL_LIST_RESPONSE_UNRECOGNIZED', profileId: p.id, runtime: p.runtime, model: p.model, revision: p.revision, callableNow: false });
  const listed = models.includes(p.model);
  if (!listed) return envelope({ ok: true, status: 'MODEL_NOT_LISTED', profileId: p.id, runtime: p.runtime, model: p.model, revision: p.revision, callableNow: false, observedModelCount: models.length });

  if (!probeInference || !p.inferenceProbeApproved) {
    return envelope({
      ok: true,
      status: 'MODEL_LISTED_NOT_INFERENCE_PROVEN',
      profileId: p.id,
      runtime: p.runtime,
      model: p.model,
      revision: p.revision,
      callableNow: false,
      modelListProven: true,
      inferenceProbeApproved: p.inferenceProbeApproved,
      observedAt: new Date(date).toISOString()
    });
  }

  const executor = createOpenModelRuntimeExecutor({
    runtime: p.runtime,
    model: p.model,
    endpoint: p.endpoint,
    apiStyle: p.apiStyle,
    pricing: p.pricing,
    enabled: true,
    apiKey: p.apiKeyEnv ? String(secretResolver(p.apiKeyEnv) || '') : '',
    fetchImpl
  });
  const inference = await executor({
    task: {
      taskId: `avengers-probe-${p.id}`,
      objective: 'Return JSON {"status":"AVENGER_READY"}. This is a zero-business-effect runtime callability probe.',
      consequenceClass: 'LOCAL_PREPARATION',
      requiredOutputs: ['status'],
      acceptanceTests: ['status must equal AVENGER_READY'],
      constraints: ['no external effects']
    },
    maxTokens: 96,
    costCeilingCents: 100
  });
  if (!inference.ok) {
    return envelope({
      ok: true,
      status: 'INFERENCE_PROBE_FAILED',
      profileId: p.id,
      runtime: p.runtime,
      model: p.model,
      revision: p.revision,
      callableNow: false,
      modelListProven: true,
      reasonCodes: inference.reasonCodes ?? ['inference-probe-failed']
    });
  }
  if (inference?.result?.status !== 'AVENGER_READY') {
    return envelope({ ok: true, status: 'INFERENCE_PROBE_OUTPUT_INVALID', profileId: p.id, runtime: p.runtime, model: p.model, revision: p.revision, callableNow: false, modelListProven: true });
  }
  return envelope({
    ok: true,
    status: 'CALLABLE_NOW',
    profileId: p.id,
    runtime: p.runtime,
    model: p.model,
    revision: p.revision,
    callableNow: true,
    modelListProven: true,
    inferenceProven: true,
    observedModel: inference.observedModel,
    identityVerification: inference.identityVerification,
    usage: inference.usage,
    observedAt: new Date(date).toISOString()
  });
}

export async function buildAvengersReadiness(registry, options = {}) {
  const validated = validateAvengersRegistry(registry);
  if (!validated.ok) return validated;
  const profiles = [];
  for (const profile of validated.registry.profiles) profiles.push(await probeAvengerProfile(profile, options));
  const tools = validated.registry.tools.map(tool => ({
    id: tool.id,
    name: tool.name,
    kind: tool.kind,
    roles: tool.roles,
    status: tool.kind === 'METHOD_ONLY'
      ? 'CALLABLE_VIA_UBERBOND_METHOD'
      : tool.runtimeRequired
        ? 'RUNTIME_PROOF_REQUIRED'
        : tool.path
          ? 'PROJECT_SURFACE_DECLARED'
          : 'CONTRACT_DECLARED',
    callableNow: tool.kind === 'METHOD_ONLY' || (!tool.runtimeRequired && Boolean(tool.path)),
    runtimeRequired: tool.runtimeRequired,
    path: tool.path,
    sourceRef: tool.sourceRef
  }));
  const receipt = {
    schemaVersion: AVENGERS_READINESS_SCHEMA,
    generatedAt: new Date(options.date ?? Date.now()).toISOString(),
    registryDigest: validated.registryDigest,
    profiles,
    tools,
    callableModelCount: profiles.filter(item => item.callableNow).length,
    callableToolSurfaceCount: tools.filter(item => item.callableNow).length,
    truthBoundary: 'DISCOVERED_OR_CONFIGURED_IS_NOT_CALLABLE; MODEL_LISTED_IS_NOT_INFERENCE_PROVEN; METHOD_DONOR_IS_NOT_OPTIONAL_RUNTIME_PROOF',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  return envelope({ ok: true, status: 'AVENGERS_READINESS_COMPILED', receipt, receiptDigest: sha256(receipt) });
}

function scoreProfile(profile) {
  const b = profile.benchmark;
  const costPenalty = Math.min(25, b.observedCostCents / 4);
  const latencyPenalty = Math.min(20, b.latencyMs / 5000);
  const evidenceBonus = Math.min(10, Math.log10((b.sampleSize || 0) + 1) * 5);
  return Number((b.quality * 0.46 + b.reliability * 0.44 + evidenceBonus - costPenalty - latencyPenalty).toFixed(3));
}

function normalizeMission(mission = {}) {
  if (!mission || typeof mission !== 'object' || Array.isArray(mission)) return { ok: false, reasonCodes: ['mission-object-required'] };
  const id = text(mission.id, 160)?.toLowerCase();
  const objective = text(mission.objective, 5000);
  const dataClass = text(mission.dataClass ?? 'INTERNAL_NON_SECRET', 80)?.toUpperCase();
  const consequenceClass = text(mission.consequenceClass ?? 'LOCAL_PREPARATION', 80)?.toUpperCase();
  const nodes = Array.isArray(mission.nodes) ? mission.nodes : null;
  const reasons = [];
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) reasons.push('mission-id-required');
  if (!objective) reasons.push('mission-objective-required');
  if (!SAFE_DATA_CLASSES.has(dataClass)) reasons.push('safe-data-class-required');
  if (!SAFE_CONSEQUENCE_CLASSES.has(consequenceClass)) reasons.push('local-preparation-consequence-required');
  if (!nodes || nodes.length === 0 || nodes.length > MAX_MISSION_NODES) reasons.push('bounded-mission-nodes-required');
  const normalizedNodes = [];
  const ids = new Set();
  for (const [index, raw] of (nodes ?? []).entries()) {
    const nodeId = text(raw?.id, 120)?.toLowerCase();
    const purpose = text(raw?.purpose, 2000);
    const taskClass = text(raw?.taskClass ?? 'general', 160)?.toLowerCase();
    const role = text(raw?.role ?? 'general', 80)?.toLowerCase();
    const dependencies = list(raw?.dependencies ?? [], 32, 120)?.map(item => item.toLowerCase());
    const toolIds = list(raw?.toolIds ?? [], 32, 120)?.map(item => item.toLowerCase());
    const acceptanceTests = list(raw?.acceptanceTests ?? ['return valid structured result'], 32, 1000);
    if (!nodeId || !/^[a-z0-9][a-z0-9._-]*$/.test(nodeId)) reasons.push(`node-id-invalid:${index}`);
    if (nodeId && ids.has(nodeId)) reasons.push(`duplicate-node-id:${nodeId}`);
    if (nodeId) ids.add(nodeId);
    if (!purpose) reasons.push(`node-purpose-required:${nodeId ?? index}`);
    if (!taskClass) reasons.push(`task-class-required:${nodeId ?? index}`);
    if (!role || !ROLE_NAMES.has(role)) reasons.push(`recognized-role-required:${nodeId ?? index}`);
    if (!dependencies) reasons.push(`dependencies-invalid:${nodeId ?? index}`);
    if (!toolIds) reasons.push(`tool-ids-invalid:${nodeId ?? index}`);
    if (!acceptanceTests?.length) reasons.push(`acceptance-tests-required:${nodeId ?? index}`);
    normalizedNodes.push({ id: nodeId, purpose, taskClass, role, dependencies: dependencies ?? [], toolIds: toolIds ?? [], acceptanceTests: acceptanceTests ?? [] });
  }
  const nodeIds = new Set(normalizedNodes.map(node => node.id));
  for (const node of normalizedNodes) for (const dep of node.dependencies) if (!nodeIds.has(dep)) reasons.push(`unknown-dependency:${node.id}:${dep}`);
  if (reasons.length) return { ok: false, reasonCodes: [...new Set(reasons)] };
  return { ok: true, mission: { id, objective, dataClass, consequenceClass, nodes: normalizedNodes } };
}

export function compileAvengersSquad({ registry, readiness, mission, maxFallbacks = 2 } = {}) {
  const reg = validateAvengersRegistry(registry);
  if (!reg.ok) return reg;
  const normalizedMission = normalizeMission(mission);
  if (!normalizedMission.ok) return failure(normalizedMission.reasonCodes, 'AVENGERS_MISSION_INVALID');
  const readyReceipt = readiness?.schemaVersion === AVENGERS_READINESS_SCHEMA ? readiness : readiness?.receipt;
  if (!readyReceipt || readyReceipt.registryDigest !== reg.registryDigest) return failure(['matching-readiness-receipt-required'], 'AVENGERS_PLAN_BLOCKED');
  const fallbackCap = integer(maxFallbacks, 0, MAX_FALLBACKS);
  if (fallbackCap == null) return failure(['bounded-fallback-count-required'], 'AVENGERS_PLAN_BLOCKED');
  const callableIds = new Set((readyReceipt.profiles ?? []).filter(item => item.callableNow).map(item => item.profileId));
  const toolMap = new Map((readyReceipt.tools ?? []).map(item => [item.id, item]));
  const assignments = [];
  const reasons = [];
  for (const node of normalizedMission.mission.nodes) {
    for (const toolId of node.toolIds) {
      const tool = toolMap.get(toolId);
      if (!tool) reasons.push(`unknown-tool:${node.id}:${toolId}`);
      else if (!tool.callableNow) reasons.push(`tool-not-callable:${node.id}:${toolId}:${tool.status}`);
    }
    const candidates = reg.registry.profiles
      .filter(profile => callableIds.has(profile.id))
      .filter(profile => profile.taskClasses.includes(node.taskClass) || profile.taskClasses.includes('general'))
      .filter(profile => profile.roles.includes(node.role) || profile.roles.includes('general'))
      .map(profile => ({ profileId: profile.id, score: scoreProfile(profile), model: profile.model, runtime: profile.runtime, revision: profile.revision }))
      .sort((a, b) => b.score - a.score || a.profileId.localeCompare(b.profileId));
    if (!candidates.length) reasons.push(`no-callable-avenger:${node.id}:${node.taskClass}:${node.role}`);
    assignments.push({ nodeId: node.id, role: node.role, taskClass: node.taskClass, primary: candidates[0] ?? null, fallbacks: candidates.slice(1, 1 + fallbackCap), toolIds: node.toolIds });
  }
  if (reasons.length) return failure(reasons, 'AVENGERS_PLAN_BLOCKED', { assignments });
  const graph = {
    mode: normalizedMission.mission.nodes.length === 1 ? 'DIRECT' : 'FABLE_GRAPH',
    parentAuthority: normalizedMission.mission.consequenceClass === 'NONE' ? 'NONE' : 'LOCAL_PREPARATION',
    dataClass: normalizedMission.mission.dataClass,
    maxDepth: 1,
    maxIterations: 4,
    nodes: normalizedMission.mission.nodes.map(node => ({
      id: node.id,
      purpose: node.purpose,
      dependencies: node.dependencies,
      workerRequirement: `avenger:${assignments.find(item => item.nodeId === node.id)?.primary?.profileId}`,
      ownedFilesOrResponsibility: [`mission-node:${node.id}`],
      inputs: ['mission-objective', ...node.dependencies.map(dep => `dependency-output:${dep}`)],
      expectedOutput: `Structured result for ${node.id}`,
      verification: node.acceptanceTests,
      stopCondition: 'Node succeeds through primary or bounded fallback, otherwise mission blocks.',
      authorityCeiling: normalizedMission.mission.consequenceClass === 'NONE' ? 'NONE' : 'LOCAL_PREPARATION',
      implementation: true,
      callableWorkerVerified: true
    }))
  };
  const graphResult = validateOrchestrationGraph(graph);
  if (!graphResult.ok) return failure(graphResult.reasonCodes, 'AVENGERS_GRAPH_INVALID', { assignments });
  const plan = {
    schemaVersion: AVENGERS_PLAN_SCHEMA,
    mission: normalizedMission.mission,
    registryDigest: reg.registryDigest,
    readinessDigest: sha256(readyReceipt),
    graph: graphResult.graph,
    graphDigest: graphResult.graphDigest,
    assignments,
    maxParallel: Math.min(MAX_PARALLEL, normalizedMission.mission.nodes.length),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  return envelope({ ok: true, status: 'AVENGERS_SQUAD_READY', plan, planDigest: sha256(plan) });
}

export function createProfileExecutor(profile, { fetchImpl = globalThis.fetch, secretResolver = name => process.env[name] || '' } = {}) {
  const normalized = normalizeProfile(profile);
  if (!normalized.ok) throw new Error(normalized.reasonCodes.join(','));
  const p = normalized.profile;
  if (!p.enabled || !p.activationApproved || !p.rights.executionAllowed) throw new Error(`profile-not-executable:${p.id}`);
  return createOpenModelRuntimeExecutor({
    runtime: p.runtime,
    model: p.model,
    endpoint: p.endpoint,
    apiStyle: p.apiStyle,
    pricing: p.pricing,
    enabled: true,
    apiKey: p.apiKeyEnv ? String(secretResolver(p.apiKeyEnv) || '') : '',
    fetchImpl
  });
}

async function runNodeAttempt({ assignment, node, mission, profileMap, dependencyResults, fetchImpl, secretResolver, maxTokens, costCeilingCents }) {
  const ordered = [assignment.primary, ...assignment.fallbacks].filter(Boolean);
  const attempts = [];
  for (const candidate of ordered) {
    const profile = profileMap.get(candidate.profileId);
    let executor;
    try { executor = createProfileExecutor(profile, { fetchImpl, secretResolver }); }
    catch (error) {
      attempts.push({ profileId: candidate.profileId, ok: false, reasonCodes: [text(error?.message, 300) || 'executor-construction-failed'] });
      continue;
    }
    const dependencyEvidence = node.dependencies.map(dep => ({ nodeId: dep, result: dependencyResults.get(dep)?.result ?? null }));
    const result = await executor({
      task: {
        taskId: `${mission.id}:${node.id}:${candidate.profileId}`,
        objective: `${mission.objective}\n\nYour Avengers role is ${node.role}. Node purpose: ${node.purpose}. Return a JSON object that directly satisfies the node acceptance tests.`,
        consequenceClass: mission.consequenceClass,
        contextRefs: dependencyEvidence.map(item => JSON.stringify(item)),
        evidenceRefs: assignment.toolIds.map(id => `tool:${id}`),
        requiredOutputs: ['structured node result'],
        acceptanceTests: node.acceptanceTests,
        constraints: ['no business effects', 'do not claim unobserved external actions']
      },
      maxTokens,
      costCeilingCents
    });
    attempts.push({ profileId: candidate.profileId, model: candidate.model, runtime: candidate.runtime, revision: candidate.revision, ok: result.ok === true, outcome: result.outcome ?? result.status ?? null, reasonCodes: result.reasonCodes ?? [], usage: result.usage ?? null });
    if (result.ok) return { ok: true, selected: candidate, result: result.result, attempts };
  }
  return { ok: false, selected: null, result: null, attempts };
}

export async function executeAvengersPlan({
  registry,
  plan,
  fetchImpl = globalThis.fetch,
  secretResolver = name => process.env[name] || '',
  maxTokensPerNode = 2_000,
  costCeilingCentsPerNode = 100,
  date = new Date()
} = {}) {
  const reg = validateAvengersRegistry(registry);
  if (!reg.ok) return reg;
  if (!plan || plan.schemaVersion !== AVENGERS_PLAN_SCHEMA) return failure(['valid-avengers-plan-required'], 'AVENGERS_EXECUTION_BLOCKED');
  if (plan.registryDigest !== reg.registryDigest) return failure(['plan-registry-digest-mismatch'], 'AVENGERS_EXECUTION_BLOCKED');
  const tokens = integer(maxTokensPerNode, 1, 128_000);
  const cents = integer(costCeilingCentsPerNode, 0, 10_000_000);
  if (tokens == null || cents == null) return failure(['valid-execution-bounds-required'], 'AVENGERS_EXECUTION_BLOCKED');
  const graphCheck = validateOrchestrationGraph(plan.graph);
  if (!graphCheck.ok || graphCheck.graphDigest !== plan.graphDigest) return failure(['plan-graph-integrity-failed'], 'AVENGERS_EXECUTION_BLOCKED');

  const profileMap = new Map(reg.registry.profiles.map(profile => [profile.id, profile]));
  const assignmentMap = new Map(plan.assignments.map(item => [item.nodeId, item]));
  const missionNodeMap = new Map(plan.mission.nodes.map(node => [node.id, node]));
  const completed = [];
  const results = new Map();
  const batches = [];
  let providerCalls = 0;

  while (completed.length < plan.mission.nodes.length) {
    const ready = readyOrchestrationNodes(plan.graph, completed);
    if (!ready.ok) return failure(ready.reasonCodes, 'AVENGERS_EXECUTION_BLOCKED', { completed, batches });
    if (!ready.readyNodes.length) return failure(['orchestration-deadlock'], 'AVENGERS_EXECUTION_BLOCKED', { completed, batches });
    const batchNodes = ready.readyNodes.slice(0, plan.maxParallel || MAX_PARALLEL);
    const batchResults = await Promise.all(batchNodes.map(async graphNode => {
      const node = missionNodeMap.get(graphNode.id);
      const assignment = assignmentMap.get(graphNode.id);
      const result = await runNodeAttempt({ assignment, node, mission: plan.mission, profileMap, dependencyResults: results, fetchImpl, secretResolver, maxTokens: tokens, costCeilingCents: cents });
      providerCalls += result.attempts.length;
      return { nodeId: graphNode.id, ...result };
    }));
    batches.push(batchResults.map(item => ({ nodeId: item.nodeId, ok: item.ok, selectedProfileId: item.selected?.profileId ?? null, attempts: item.attempts })));
    const failed = batchResults.find(item => !item.ok);
    if (failed) {
      return envelope({
        ok: false,
        status: 'AVENGERS_NODE_EXHAUSTED_FALLBACKS',
        reasonCodes: [`node-failed:${failed.nodeId}`],
        completed,
        batches,
        providerCalls,
        providerCallAuthority: 'LOCAL_PREPARATION_ONLY',
        externalEffectLedger: { ...zeroEffects(), providerCalls }
      });
    }
    for (const item of batchResults) {
      results.set(item.nodeId, item);
      completed.push(item.nodeId);
    }
  }

  const final = {
    schemaVersion: AVENGERS_EXECUTION_SCHEMA,
    generatedAt: new Date(date).toISOString(),
    planDigest: sha256(plan),
    missionId: plan.mission.id,
    completedNodes: completed,
    results: completed.map(nodeId => ({ nodeId, selectedProfileId: results.get(nodeId).selected.profileId, result: results.get(nodeId).result, attempts: results.get(nodeId).attempts })),
    batches,
    providerCalls,
    businessEffectAuthority: 'NONE',
    providerCallAuthority: 'LOCAL_PREPARATION_ONLY',
    externalEffectLedger: { ...zeroEffects(), providerCalls }
  };
  return envelope({ ok: true, status: 'AVENGERS_MISSION_COMPLETE', receipt: final, receiptDigest: sha256(final) });
}

export function buildDefaultLocalDiscoveryCandidates() {
  return envelope({
    ok: true,
    status: 'LOCAL_DISCOVERY_CANDIDATES_READY',
    candidates: [
      { runtime: 'OLLAMA', endpoint: 'http://127.0.0.1:11434', modelListPath: '/api/tags' },
      { runtime: 'VLLM', endpoint: 'http://127.0.0.1:8000', modelListPath: '/v1/models' },
      { runtime: 'LLAMA_CPP', endpoint: 'http://127.0.0.1:8080', modelListPath: '/v1/models' },
      { runtime: 'SGLANG', endpoint: 'http://127.0.0.1:30000', modelListPath: '/v1/models' },
      { runtime: 'MLX_LM', endpoint: 'http://127.0.0.1:8081', modelListPath: '/v1/models' },
      { runtime: 'TGI', endpoint: 'http://127.0.0.1:8082', modelListPath: '/v1/models' }
    ],
    automaticActivation: false,
    automaticDownload: false,
    arbitraryModelCodeExecution: false
  });
}
