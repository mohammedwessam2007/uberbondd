import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeModelSupply } from './open-model-foundry.mjs';

export const OPEN_MODEL_UNIVERSE_VERSION = 'uberbond.open-model-universe-1.0.0';

export const OPEN_MODEL_REGISTRIES = Object.freeze([
  Object.freeze({
    id: 'huggingface-hub',
    kind: 'PUBLIC_MODEL_HUB',
    endpoint: 'https://huggingface.co/api/models',
    status: 'ACTIVE_DISCOVERY_SOURCE',
    notes: 'Primary broad discovery source. Registry observations are candidates, never execution proof.'
  }),
  Object.freeze({
    id: 'modelscope',
    kind: 'PUBLIC_MODEL_HUB',
    endpoint: 'https://www.modelscope.cn/',
    status: 'SUPPLEMENTAL_SOURCE_REQUIRES_ADAPTER_VALIDATION',
    notes: 'Supplemental model ecosystem. Runtime/model metadata must be normalized before admission.'
  }),
  Object.freeze({
    id: 'ollama-library',
    kind: 'RUNTIME_MODEL_LIBRARY',
    endpoint: 'https://ollama.com/library',
    status: 'SUPPLEMENTAL_SOURCE_REQUIRES_ADAPTER_VALIDATION',
    notes: 'Useful packaging/runtime source; library presence is not a license or quality claim.'
  })
]);

export const OPEN_MODEL_RUNTIME_HINTS = Object.freeze([
  'VLLM', 'SGLANG', 'LLAMA_CPP', 'OLLAMA', 'MLX_LM', 'TGI',
  'TRANSFORMERS', 'DIFFUSERS', 'SENTENCE_TRANSFORMERS', 'CUSTOM_OPENAI_COMPATIBLE'
]);

const PERMISSIVE_LICENSES = new Set([
  'apache-2.0', 'mit', 'bsd-2-clause', 'bsd-3-clause', 'isc', 'cc0-1.0', 'unlicense'
]);
const COPYLEFT_OR_CONDITIONAL = new Set([
  'gpl-2.0', 'gpl-3.0', 'lgpl-2.1', 'lgpl-3.0', 'agpl-3.0', 'mpl-2.0'
]);

function clone(value) { return structuredClone(value); }
function text(value, max = 1200) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function list(value, max = 512, itemMax = 300) {
  if (!Array.isArray(value) || value.length > max) return [];
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (normalized && !seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}
function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
function iso(value) {
  const normalized = text(value, 100);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function zeroEffect(extra = {}) {
  return { businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS), ...extra };
}

export function classifyOpenModelLicense(value) {
  const license = text(value, 200)?.toLowerCase() || 'unknown';
  if (PERMISSIVE_LICENSES.has(license)) return { license, class: 'PERMISSIVE', automaticCommercialEligibility: false };
  if (COPYLEFT_OR_CONDITIONAL.has(license)) return { license, class: 'COPYLEFT_OR_CONDITIONAL_REVIEW', automaticCommercialEligibility: false };
  if (license === 'unknown' || license === 'other' || license === 'custom') return { license, class: 'UNKNOWN_OR_CUSTOM_REVIEW', automaticCommercialEligibility: false };
  return { license, class: 'MODEL_SPECIFIC_REVIEW', automaticCommercialEligibility: false };
}

function licenseFrom(raw, tags) {
  const cardLicense = raw?.cardData?.license || raw?.card_data?.license || raw?.license;
  if (cardLicense) return text(cardLicense, 200)?.toLowerCase() || 'unknown';
  const tag = tags.find(item => item.toLowerCase().startsWith('license:'));
  return tag ? tag.split(':').slice(1).join(':').toLowerCase() : 'unknown';
}

function runtimeHints(tags, raw = {}) {
  const normalized = new Set(tags.map(item => item.toLowerCase()));
  const apps = list(raw.apps || raw?.cardData?.apps || [], 64, 120).map(item => item.toLowerCase());
  for (const app of apps) normalized.add(app);
  const hints = new Set();
  const has = (...needles) => needles.some(needle => [...normalized].some(tag => tag.includes(needle)));
  if (has('vllm')) hints.add('VLLM');
  if (has('sglang')) hints.add('SGLANG');
  if (has('gguf', 'llama.cpp', 'llama-cpp')) hints.add('LLAMA_CPP');
  if (has('ollama')) hints.add('OLLAMA');
  if (has('mlx')) hints.add('MLX_LM');
  if (has('text-generation-inference', 'tgi')) hints.add('TGI');
  if (has('transformers', 'pytorch', 'safetensors')) hints.add('TRANSFORMERS');
  if (has('diffusers')) hints.add('DIFFUSERS');
  if (has('sentence-transformers')) hints.add('SENTENCE_TRANSFORMERS');
  return [...hints];
}

export function normalizeHubModel(raw = {}, { source = 'huggingface-hub', observedAt = new Date().toISOString() } = {}) {
  const id = text(raw.id || raw.modelId || raw.model_id, 400);
  const revision = text(raw.sha || raw.revision || raw.commit, 400);
  const tags = list(raw.tags || [], 512, 300);
  const pipelineTag = text(raw.pipeline_tag || raw.pipelineTag || 'unknown', 200)?.toLowerCase();
  const lastModified = iso(raw.lastModified || raw.last_modified || raw.updatedAt);
  const observation = iso(observedAt);
  if (!id || !observation) return zeroEffect({ ok: false, status: 'DISCOVERY_RECORD_INVALID', reasonCodes: ['model-id-and-observation-required'] });

  const license = licenseFrom(raw, tags);
  const licenseDecision = classifyOpenModelLicense(license);
  const gated = raw.gated === true || raw.gated === 'auto' || raw.gated === 'manual';
  const privateModel = raw.private === true;
  const weightsLikelyAvailable = tags.some(tag => ['safetensors', 'pytorch', 'gguf', 'mlx', 'onnx'].some(format => tag.toLowerCase().includes(format)));

  return zeroEffect({
    ok: true,
    status: 'OPEN_MODEL_DISCOVERED',
    discovery: {
      schemaVersion: 'uberbond.open-model-discovery.v1',
      source,
      id,
      revision: revision || 'UNOBSERVED_REVISION',
      author: text(raw.author || id.split('/')[0], 300),
      pipelineTag,
      tags,
      lastModified,
      observedAt: observation,
      downloads: finiteNumber(raw.downloads),
      likes: finiteNumber(raw.likes),
      gated,
      private: privateModel,
      license: licenseDecision,
      weightsLikelyAvailable,
      runtimeHints: runtimeHints(tags, raw),
      inferenceProviders: list(raw.inferenceProviderMapping ? Object.keys(raw.inferenceProviderMapping) : raw.inference_providers || [], 128, 200),
      admissionState: privateModel ? 'REJECT_PRIVATE_DISCOVERY' : gated ? 'GATED_REVIEW_REQUIRED' : 'DISCOVERED_UNSCREENED',
      executionAuthority: 'NONE',
      commercialTruthAuthority: 'NONE'
    }
  });
}

export function ingestOpenModelPage({ source = 'huggingface-hub', models = [], observedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(models) || models.length > 5000) return zeroEffect({ ok: false, status: 'MODEL_PAGE_INVALID', reasonCodes: ['bounded-model-page-required'] });
  const byKey = new Map();
  const rejected = [];
  for (const raw of models) {
    const normalized = normalizeHubModel(raw, { source, observedAt });
    if (!normalized.ok) { rejected.push({ id: raw?.id || null, reasonCodes: normalized.reasonCodes }); continue; }
    const model = normalized.discovery;
    const key = `${model.id}@${model.revision}`;
    const prior = byKey.get(key);
    if (!prior || model.downloads > prior.downloads) byKey.set(key, model);
  }
  return zeroEffect({
    ok: true,
    status: 'OPEN_MODEL_PAGE_INGESTED',
    models: [...byKey.values()],
    rejected,
    counts: { received: models.length, normalized: byKey.size, rejected: rejected.length },
    executionAuthority: 'NONE'
  });
}

export function planHuggingFaceDiscovery(input = {}) {
  const limit = Math.min(Math.max(Number(input.limit || 100), 1), 1000);
  const url = new URL('https://huggingface.co/api/models');
  if (text(input.search, 300)) url.searchParams.set('search', input.search.trim());
  if (text(input.author, 200)) url.searchParams.set('author', input.author.trim());
  if (text(input.pipelineTag, 200)) url.searchParams.set('pipeline_tag', input.pipelineTag.trim());
  if (text(input.app, 120)) url.searchParams.set('apps', input.app.trim());
  if (input.gated === false) url.searchParams.set('gated', 'false');
  if (text(input.sort, 100)) url.searchParams.set('sort', input.sort.trim());
  url.searchParams.set('limit', String(limit));
  return zeroEffect({
    ok: true,
    status: 'DISCOVERY_QUERY_PLAN_ONLY',
    source: 'huggingface-hub',
    url: url.toString(),
    maxRecords: limit,
    networkAuthority: 'NONE',
    note: 'A caller with read-only network authority may execute this query and pass the returned page into ingestOpenModelPage.'
  });
}

export function planOpenModelUniverseSweep({ pipelineTags = [], runtimeApps = [], perQueryLimit = 100 } = {}) {
  const tasks = list(pipelineTags, 128, 200);
  const apps = list(runtimeApps, 64, 120);
  const limit = Math.min(Math.max(Number(perQueryLimit || 100), 1), 1000);
  const queries = [];
  if (tasks.length === 0 && apps.length === 0) queries.push(planHuggingFaceDiscovery({ limit, gated: false, sort: 'downloads' }).url);
  for (const pipelineTag of tasks) queries.push(planHuggingFaceDiscovery({ pipelineTag, limit, gated: false, sort: 'downloads' }).url);
  for (const app of apps) queries.push(planHuggingFaceDiscovery({ app, limit, gated: false, sort: 'downloads' }).url);
  return zeroEffect({
    ok: true,
    status: 'OPEN_MODEL_UNIVERSE_SWEEP_PLAN_ONLY',
    queries: [...new Set(queries)],
    checkpointRequired: true,
    rateBudgetRequired: true,
    networkAuthority: 'NONE',
    executionAuthority: 'NONE'
  });
}

export function buildFoundryAdmissionCandidate({ discovery, runtimeObservation = {} } = {}) {
  if (!discovery?.id || !discovery?.observedAt) return zeroEffect({ ok: false, status: 'ADMISSION_INVALID', reasonCodes: ['normalized-discovery-required'] });
  const licenseObserved = discovery.license?.license && discovery.license.license !== 'unknown';
  const revisionObserved = discovery.revision && discovery.revision !== 'UNOBSERVED_REVISION';
  const runtimeCostKnown = runtimeObservation.runtimeCostKnown === true;
  const weightsObserved = runtimeObservation.weightsAvailable === true;
  if (!licenseObserved || !revisionObserved || !runtimeCostKnown || !weightsObserved) {
    return zeroEffect({
      ok: false,
      status: 'ADMISSION_BLOCKED',
      reasonCodes: [
        !licenseObserved ? 'license-observation-required' : null,
        !revisionObserved ? 'revision-observation-required' : null,
        !runtimeCostKnown ? 'runtime-cost-observation-required' : null,
        !weightsObserved ? 'weight-availability-observation-required' : null
      ].filter(Boolean)
    });
  }
  const candidate = normalizeModelSupply({
    id: `open-model.${discovery.id}`,
    provider: runtimeObservation.provider || 'open-model-runtime',
    model: discovery.id,
    revision: discovery.revision,
    supplyType: runtimeObservation.hosted === true ? 'HOSTED_OPEN_WEIGHT' : 'OPEN_WEIGHT',
    state: 'DISCOVERED',
    license: discovery.license.license,
    weightsAvailable: true,
    taskClasses: runtimeObservation.taskClasses || [discovery.pipelineTag],
    modalities: runtimeObservation.modalities || ['TEXT'],
    toolCapabilities: runtimeObservation.toolCapabilities || [],
    contextTokens: runtimeObservation.contextTokens || 1,
    benchmarkScore: 0,
    reliabilityScore: 0,
    inputCostPerMillionUsd: runtimeObservation.inputCostPerMillionUsd || 0,
    outputCostPerMillionUsd: runtimeObservation.outputCostPerMillionUsd || 0,
    infrastructureCostPerHourUsd: runtimeObservation.infrastructureCostPerHourUsd || 0,
    minimumVramGb: runtimeObservation.minimumVramGb || 0,
    runtimeCostKnown: true,
    permissionEligible: false,
    evidenceRefs: [
      `registry:${discovery.source}:${discovery.id}@${discovery.revision}`,
      ...(runtimeObservation.evidenceRefs || [])
    ]
  });
  return candidate.ok
    ? zeroEffect({ ok: true, status: 'FOUNDRY_ADMISSION_CANDIDATE_CREATED', supply: candidate.supply, promotionAuthority: 'NONE' })
    : candidate;
}
