export const COMMAND_CENTER_CLIENT_POLICY_VERSION = 'uberbond.command-center-client-policy.v1.0.1';
export const COMMAND_CENTER_CACHE_SCHEMA = 'uberbond.command-center-cache.v1';
export const COMMAND_CENTER_MAX_CACHE_AGE_MS = 6 * 60 * 60 * 1000;
export const COMMAND_CENTER_MAX_LIVE_AGE_MS = 5 * 60 * 1000;
export const COMMAND_CENTER_GRAPH_LIMITS = Object.freeze({ nodes: 260, edges: 620 });

const SECRET_KEY = /(authorization|token|secret|password|cookie|credential|api.?key|session|bearer)/i;
const SECRET_VALUE = /(?:^|\b)(?:bearer\s+[A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|(?:api|access|refresh)[_-]?key\s*[:=]\s*\S+)/i;

export function sanitizeCommandCenterSnapshot(value, depth = 0) {
  if (depth > 10) return '[TRUNCATED_DEPTH]';
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[REDACTED_SECRET_VALUE]' : value;
  if (value === null || ['number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 1000).map(item => sanitizeCommandCenterSnapshot(item, depth + 1));
  if (typeof value !== 'object') return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    out[key] = sanitizeCommandCenterSnapshot(item, depth + 1);
  }
  return out;
}

export function buildLastGoodCache(status, { storedAt = Date.now() } = {}) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) throw new Error('status-object-required');
  if (!Number.isFinite(Number(storedAt))) throw new Error('valid-stored-at-required');
  return {
    schemaVersion: COMMAND_CENTER_CACHE_SCHEMA,
    storedAt: new Date(Number(storedAt)).toISOString(),
    sourceGeneratedAt: typeof status.generatedAt === 'string' ? status.generatedAt : null,
    payload: sanitizeCommandCenterSnapshot(status)
  };
}

export function classifyCachedSnapshot(cache, { now = Date.now(), maxAgeMs = COMMAND_CENTER_MAX_CACHE_AGE_MS, maxFutureSkewMs = 60_000 } = {}) {
  if (!cache || cache.schemaVersion !== COMMAND_CENTER_CACHE_SCHEMA || !cache.payload) return { state: 'UNAVAILABLE', ageMs: null };
  const stored = Date.parse(cache.storedAt);
  const current = Number(now);
  if (!Number.isFinite(stored) || !Number.isFinite(current) || !Number.isFinite(Number(maxAgeMs)) || Number(maxAgeMs) < 0 || !Number.isFinite(Number(maxFutureSkewMs)) || Number(maxFutureSkewMs) < 0) return { state: 'INVALID', ageMs: null };
  if (stored > current + Number(maxFutureSkewMs)) return { state: 'INVALID', ageMs: null };
  const ageMs = Math.max(0, current - stored);
  return { state: ageMs > maxAgeMs ? 'CACHED_STALE' : 'CACHED_LAST_GOOD', ageMs };
}

export function capSynapticGraph(preview, limits = COMMAND_CENTER_GRAPH_LIMITS) {
  const nodes = Array.isArray(preview?.nodes) ? preview.nodes : [];
  const edges = Array.isArray(preview?.edges) ? preview.edges : [];
  const nodeLimit = Math.max(1, Math.min(1000, Number(limits?.nodes) || COMMAND_CENTER_GRAPH_LIMITS.nodes));
  const edgeLimit = Math.max(1, Math.min(3000, Number(limits?.edges) || COMMAND_CENTER_GRAPH_LIMITS.edges));
  const safeNodes = nodes.slice(0, nodeLimit).filter(node => node && typeof node.id === 'string');
  const ids = new Set(safeNodes.map(node => node.id));
  const safeEdges = edges.slice(0, edgeLimit).filter(edge => edge && ids.has(edge.from) && ids.has(edge.to));
  return {
    nodes: safeNodes,
    edges: safeEdges,
    sourceNodeCount: Number(preview?.nodeCount) || nodes.length,
    sourceEdgeCount: Number(preview?.edgeCount) || edges.length,
    truncated: Boolean(preview?.truncated || nodes.length > safeNodes.length || edges.length > safeEdges.length)
  };
}

export function classifyLiveStatus(status, { now = Date.now(), maxLiveAgeMs = COMMAND_CENTER_MAX_LIVE_AGE_MS, maxFutureSkewMs = 60_000 } = {}) {
  if (!status || typeof status !== 'object') return 'UNAVAILABLE';
  if (status.ok === false || status.status === 'REFUSED') return 'UNAVAILABLE';
  const generatedAt = Date.parse(status.generatedAt);
  const current = Number(now);
  const age = current - generatedAt;
  const freshnessValid = Number.isFinite(generatedAt) && Number.isFinite(current) && Number.isFinite(Number(maxLiveAgeMs)) && Number(maxLiveAgeMs) >= 0 && generatedAt <= current + Number(maxFutureSkewMs) && age <= Number(maxLiveAgeMs);
  if (!freshnessValid) return status.truthState === 'OBSERVED' ? 'RUNTIME_PARTIAL' : 'SOURCE_EVIDENCE';
  if (status.truthState === 'OBSERVED') return 'RUNTIME_RECEIPT';
  if (status.truthState === 'PARTIAL_OBSERVABILITY' || status.truthState === 'DEGRADED') return 'RUNTIME_PARTIAL';
  return 'SOURCE_EVIDENCE';
}
