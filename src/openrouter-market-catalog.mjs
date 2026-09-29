import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OPENROUTER_MARKET_CATALOG_VERSION = 'uberbond.openrouter-market-catalog.v1';
export const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const stable = value => Array.isArray(value) ? value.map(stable) : (!value || typeof value !== 'object') ? value : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const envelope = extra => ({ catalogVersion: OPENROUTER_MARKET_CATALOG_VERSION, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra });
const fail = (status, reasonCodes, extra = {}) => envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra });

function dollarsPerMillion(perToken) {
  const n = finite(perToken, 0, 1000);
  return n == null ? null : n * 1_000_000;
}

function normalizeModel(row, observedAt) {
  const id = text(row?.id, 240);
  const prompt = dollarsPerMillion(row?.pricing?.prompt);
  const completion = dollarsPerMillion(row?.pricing?.completion);
  if (!id || prompt == null || completion == null) return null;
  const cacheRead = dollarsPerMillion(row?.pricing?.input_cache_read ?? row?.pricing?.cache_read);
  const cacheWrite = dollarsPerMillion(row?.pricing?.input_cache_write ?? row?.pricing?.cache_write);
  const contextLength = Number.isSafeInteger(Number(row?.context_length)) && Number(row.context_length) > 0 ? Number(row.context_length) : null;
  const supported = Array.isArray(row?.supported_parameters) ? row.supported_parameters.map(x => text(x, 100)).filter(Boolean) : [];
  return {
    candidateId: `openrouter:${id}`,
    transport: 'openrouter',
    model: id,
    name: text(row?.name, 240) || id,
    providerFamily: id.split('/')[0],
    contextLength,
    supportedParameters: supported,
    pricing: {
      inputUsdPerMillion: prompt,
      outputUsdPerMillion: completion,
      ...(cacheRead != null ? { cacheReadUsdPerMillion: cacheRead } : {}),
      ...(cacheWrite != null ? { cacheWriteUsdPerMillion: cacheWrite } : {}),
      sourceRef: `openrouter://models/${id}`,
      verifiedAt: observedAt
    },
    discoveryEvidence: 'OPENROUTER_PUBLIC_CATALOG_OBSERVED',
    semanticAuthority: 'NONE'
  };
}

export function compileOpenRouterCatalogSnapshot(payload, { observedAt = new Date().toISOString() } = {}) {
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return fail('OPENROUTER_CATALOG_REFUSED', ['valid-observation-time-required']);
  const rows = Array.isArray(payload?.data) ? payload.data : null;
  if (!rows) return fail('OPENROUTER_CATALOG_REFUSED', ['openrouter-model-data-array-required']);
  const models = rows.map(row => normalizeModel(row, new Date(observedMs).toISOString())).filter(Boolean)
    .sort((a, b) => a.model.localeCompare(b.model));
  if (!models.length) return fail('OPENROUTER_CATALOG_REFUSED', ['priced-openrouter-model-required']);
  const snapshotBody = {
    observedAt: new Date(observedMs).toISOString(),
    modelCount: models.length,
    models
  };
  return envelope({
    ok: true,
    status: 'OPENROUTER_MARKET_SNAPSHOT_READY',
    ...snapshotBody,
    snapshotDigest: digest(snapshotBody),
    truthBoundary: 'CATALOG_PRESENCE_AND_LIST_PRICING_ARE_DISCOVERY_EVIDENCE_ONLY. CALLABILITY, EXACT_REASONING_SETTING, QUALITY, AND PRODUCTION AUTHORITY REQUIRE SEPARATE RECEIPTS.'
  });
}

export async function observeOpenRouterCatalog({ fetchImpl = globalThis.fetch, apiKey = '' } = {}) {
  if (typeof fetchImpl !== 'function') return fail('OPENROUTER_CATALOG_OBSERVATION_REFUSED', ['fetch-implementation-required']);
  let response;
  try {
    response = await fetchImpl(OPENROUTER_MODELS_ENDPOINT, {
      headers: {
        Accept: 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${String(apiKey)}` } : {})
      }
    });
  } catch (error) {
    return fail('OPENROUTER_CATALOG_OBSERVATION_UNCERTAIN', ['openrouter-catalog-transport-failure'], { detail: text(error?.message, 500) });
  }
  if (!response?.ok) return fail('OPENROUTER_CATALOG_OBSERVATION_REFUSED', [`openrouter-catalog-http-${response?.status || 'unknown'}`]);
  let payload;
  try { payload = JSON.parse(await response.text()); }
  catch (error) { return fail('OPENROUTER_CATALOG_OBSERVATION_REFUSED', ['openrouter-catalog-json-invalid'], { detail: text(error?.message, 500) }); }
  return compileOpenRouterCatalogSnapshot(payload);
}
