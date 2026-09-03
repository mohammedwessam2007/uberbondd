import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { ingestOpenModelPage } from './open-model-universe.mjs';

export const OPEN_MODEL_REGISTRY_CRAWLER_VERSION = 'uberbond.open-model-registry-crawler-1.0.0';

const MAX_QUERY_COUNT = 64;
const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_MODELS_PER_QUERY = 5000;
const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? null), 'utf8');
const clone = value => structuredClone(value);

function zeroEffect(extra = {}) {
  return { businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS), ...extra };
}

function safeDiscoveryUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co' || url.pathname !== '/api/models') return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export async function crawlOpenModelRegistry({
  queries = [],
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  observedAt = new Date().toISOString()
} = {}) {
  if (!Array.isArray(queries) || queries.length === 0 || queries.length > MAX_QUERY_COUNT) {
    return zeroEffect({ ok: false, status: 'REGISTRY_CRAWL_INVALID', reasonCodes: ['bounded-nonempty-query-set-required'] });
  }
  if (typeof fetchImpl !== 'function') return zeroEffect({ ok: false, status: 'REGISTRY_CRAWL_INVALID', reasonCodes: ['fetch-implementation-required'] });
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout < 100 || timeout > 120_000) return zeroEffect({ ok: false, status: 'REGISTRY_CRAWL_INVALID', reasonCodes: ['bounded-timeout-required'] });

  const merged = new Map();
  const receipts = [];
  for (const rawUrl of queries) {
    const url = safeDiscoveryUrl(rawUrl);
    if (!url) {
      receipts.push({ url: text(rawUrl, 1000), ok: false, status: 'QUERY_REJECTED', reasonCodes: ['query-not-allowlisted'] });
      continue;
    }

    let response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'UberBond-Open-Model-Foundry/1.0' },
        signal: controller.signal
      });
    } catch (error) {
      receipts.push({ url: url.toString(), ok: false, status: 'NETWORK_FAILURE', reasonCodes: [error?.name === 'AbortError' ? 'registry-timeout' : 'registry-transport-failure'], detail: text(error?.message, 500) });
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (!response?.ok) {
      receipts.push({ url: url.toString(), ok: false, status: 'HTTP_FAILURE', httpStatus: Number(response?.status) || 0, reasonCodes: [`registry-http-${Number(response?.status) || 'unknown'}`] });
      continue;
    }

    let payload;
    try {
      const raw = await response.text();
      if (bytes(raw) > MAX_RESPONSE_BYTES) {
        receipts.push({ url: url.toString(), ok: false, status: 'RESPONSE_REJECTED', reasonCodes: ['registry-response-too-large'] });
        continue;
      }
      payload = JSON.parse(raw);
    } catch (error) {
      receipts.push({ url: url.toString(), ok: false, status: 'RESPONSE_REJECTED', reasonCodes: ['registry-json-invalid'], detail: text(error?.message, 500) });
      continue;
    }

    if (!Array.isArray(payload) || payload.length > MAX_MODELS_PER_QUERY) {
      receipts.push({ url: url.toString(), ok: false, status: 'RESPONSE_REJECTED', reasonCodes: ['bounded-model-array-required'] });
      continue;
    }

    const ingested = ingestOpenModelPage({ source: 'huggingface-hub', models: payload, observedAt });
    if (!ingested.ok) {
      receipts.push({ url: url.toString(), ok: false, status: 'INGESTION_FAILURE', reasonCodes: ingested.reasonCodes || ['ingestion-failed'] });
      continue;
    }
    for (const model of ingested.models) {
      const key = `${model.id}@${model.revision}`;
      const prior = merged.get(key);
      if (!prior || model.downloads > prior.downloads) merged.set(key, model);
    }
    receipts.push({
      url: url.toString(),
      ok: true,
      status: 'QUERY_INGESTED',
      received: ingested.counts.received,
      normalized: ingested.counts.normalized,
      rejected: ingested.counts.rejected,
      observedAt
    });
  }

  return zeroEffect({
    ok: true,
    status: 'OPEN_MODEL_REGISTRY_CRAWL_COMPLETE',
    models: [...merged.values()],
    receipts,
    counts: {
      queriesPlanned: queries.length,
      queriesSucceeded: receipts.filter(item => item.ok).length,
      modelsUnique: merged.size
    },
    checkpoint: {
      schemaVersion: 'uberbond.open-model-crawl-checkpoint.v1',
      observedAt,
      completedQueryUrls: receipts.filter(item => item.ok).map(item => item.url),
      failedQueryUrls: receipts.filter(item => !item.ok).map(item => item.url)
    },
    discoveryAuthority: 'READ_ONLY_PUBLIC_NETWORK',
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE'
  });
}
