import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { buildDefaultLocalDiscoveryCandidates } from './avengers-arsenal.mjs';

export const AVENGERS_LOCAL_DISCOVERY_VERSION = 'uberbond.avengers-local-discovery-1.0.0';
const MAX_RESPONSE_BYTES = 1_000_000;

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function text(value, max = 500) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function safeLoopbackEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
    if (!loopback || url.protocol !== 'http:' || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
function listEndpoint(candidate) {
  const url = safeLoopbackEndpoint(candidate.endpoint);
  if (!url) return null;
  url.pathname = candidate.modelListPath || (candidate.runtime === 'OLLAMA' ? '/api/tags' : '/v1/models');
  url.search = '';
  url.hash = '';
  return url.toString();
}
function extractModels(payload, runtime) {
  if (runtime === 'OLLAMA') {
    return Array.isArray(payload?.models)
      ? payload.models.map(item => text(item?.name ?? item?.model)).filter(Boolean)
      : null;
  }
  return Array.isArray(payload?.data)
    ? payload.data.map(item => text(item?.id)).filter(Boolean)
    : null;
}

export async function discoverLocalRuntimeModels({
  candidates = buildDefaultLocalDiscoveryCandidates().candidates,
  fetchImpl = globalThis.fetch,
  date = new Date(),
  timeoutMs = 1500
} = {}) {
  if (!Array.isArray(candidates) || candidates.length > 32) {
    return { ok: false, status: 'LOCAL_DISCOVERY_INVALID', reasonCodes: ['bounded-candidate-list-required'], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, status: 'LOCAL_DISCOVERY_INVALID', reasonCodes: ['fetch-implementation-required'], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  }
  const runtimes = [];
  for (const candidate of candidates) {
    const endpoint = listEndpoint(candidate);
    if (!endpoint) {
      runtimes.push({ runtime: candidate?.runtime ?? null, endpoint: candidate?.endpoint ?? null, status: 'UNSAFE_CANDIDATE_REJECTED', models: [] });
      continue;
    }
    let timer;
    try {
      const response = await Promise.race([
        fetchImpl(endpoint, { method: 'GET' }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('probe-timeout')), timeoutMs); })
      ]);
      if (!response?.ok) {
        runtimes.push({ runtime: candidate.runtime, endpoint: candidate.endpoint, status: 'NOT_REACHABLE', httpStatus: Number(response?.status || 0) || null, models: [] });
        continue;
      }
      const raw = await response.text();
      if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
        runtimes.push({ runtime: candidate.runtime, endpoint: candidate.endpoint, status: 'RESPONSE_TOO_LARGE', models: [] });
        continue;
      }
      const payload = JSON.parse(raw);
      const models = extractModels(payload, candidate.runtime);
      if (!models) {
        runtimes.push({ runtime: candidate.runtime, endpoint: candidate.endpoint, status: 'UNRECOGNIZED_MODEL_LIST', models: [] });
        continue;
      }
      runtimes.push({
        runtime: candidate.runtime,
        endpoint: candidate.endpoint,
        status: 'RUNTIME_VISIBLE_MODELS_DISCOVERED',
        models,
        modelCount: models.length,
        promotionAuthority: 'NONE',
        inferenceProven: false
      });
    } catch (error) {
      runtimes.push({ runtime: candidate.runtime, endpoint: candidate.endpoint, status: 'NOT_REACHABLE', reason: text(error?.message, 200), models: [] });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const receipt = {
    schemaVersion: 'uberbond.avengers-local-discovery.v1',
    version: AVENGERS_LOCAL_DISCOVERY_VERSION,
    generatedAt: new Date(date).toISOString(),
    runtimes,
    visibleRuntimeCount: runtimes.filter(item => item.status === 'RUNTIME_VISIBLE_MODELS_DISCOVERED').length,
    visibleModelCount: runtimes.reduce((sum, item) => sum + (item.models?.length || 0), 0),
    truthBoundary: 'RUNTIME_VISIBILITY_AND_MODEL_LISTING_DO_NOT_PROVE_INFERENCE_CALLABILITY_REVISION_LICENSE_BENCHMARK_QUALITY_OR_ACTIVATION',
    automaticDownload: false,
    automaticActivation: false,
    arbitraryModelCodeExecution: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  return { ok: true, status: 'LOCAL_DISCOVERY_COMPLETE', receipt, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
}
