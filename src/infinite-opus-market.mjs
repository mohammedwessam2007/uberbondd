import { semanticHash } from './semantic-closure-kernel.mjs';

// Per-token USD strings become per-million rates by moving the decimal point six
// places in the string itself. Multiplying the parsed float by 1e6 is not exact:
// '0.0000001' became 0.09999999999999999 instead of 0.1.
export const perTokenUsdToPerMillion = value => {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const digits = fraction.padEnd(6, '0');
  const perMillion = Number(`${whole}${digits.slice(0, 6)}.${digits.slice(6) || '0'}`);
  return Number.isFinite(perMillion) ? perMillion : null;
};
const rate = perTokenUsdToPerMillion;
export function compileInfiniteOpusMarket(payload, { verifiedAt, ttlMs = 86400000 } = {}) {
  const at = Date.parse(verifiedAt);
  if (!Number.isFinite(at) || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 86400000 || !Array.isArray(payload?.data) || payload.data.length > 10000) throw new Error('bounded-current-market-observation-required');
  const expiresAt = new Date(at + ttlMs).toISOString(), ids = new Set();
  const records = payload.data.map(row => {
    if (typeof row.id !== 'string' || ids.has(row.id)) throw new Error('unique-market-identities-required');
    ids.add(row.id);
    const pricing = row.pricing ?? {}, parameters = row.supported_parameters ?? [];
    const input = rate(pricing.prompt), output = rate(pricing.completion);
    return { model: row.id, modelRevision: row.canonical_slug ?? null, provider: 'openrouter',
      sourceRef: 'https://openrouter.ai/api/v1/models', sourceRecordHash: semanticHash(row), verifiedAt, expiresAt,
      inputUsdPerMillion: input, outputUsdPerMillion: output,
      cacheReadUsdPerMillion: rate(pricing.input_cache_read), cacheWriteUsdPerMillion: rate(pricing.input_cache_write),
      cacheWrite1hUsdPerMillion: rate(pricing.input_cache_write_1h),
      priceOverrides: (pricing.overrides ?? []).map(tier => ({ minPromptTokens: tier.min_prompt_tokens,
        inputUsdPerMillion: rate(tier.prompt), outputUsdPerMillion: rate(tier.completion),
        cacheReadUsdPerMillion: rate(tier.input_cache_read), cacheWriteUsdPerMillion: rate(tier.input_cache_write) })),
      otherChargesPerUnit: Object.fromEntries(Object.entries(pricing).filter(([k]) => !['prompt','completion','input_cache_read','input_cache_write','input_cache_write_1h','overrides'].includes(k))),
      contextTokens: row.context_length ?? null, maxOutputTokens: row.top_provider?.max_completion_tokens ?? null,
      tools: parameters.includes('tools'), structuredOutput: parameters.includes('structured_outputs'),
      modalities: row.architecture?.input_modalities ?? [], supportedParameters: parameters,
      batch: row.id.endsWith(':batch'), flex: 'UNKNOWN', privacy: 'ROUTE_DEPENDENT_UNVERIFIED',
      rateLimits: row.per_request_limits ?? 'UNKNOWN', latency: 'UNKNOWN', throughput: 'UNKNOWN', reliability: 'UNKNOWN',
      callableOnOwnerAccount: 'UNKNOWN', routeEndpoint: row.links?.details ? 'https://openrouter.ai' + row.links.details : null,
      priceAdmission: input !== null && output !== null ? 'PUBLIC_PRICE_CANDIDATE' : 'DYNAMIC_OR_UNKNOWN_PRICE_REFUSED',
      semanticAuthority: 'NONE' };
  }).sort((a,b) => a.model.localeCompare(b.model));
  return { schemaVersion: 'uberbond.infinite-opus.market.v1', verifiedAt, expiresAt,
    sourceRef: 'https://openrouter.ai/api/v1/models', sourceHash: semanticHash(payload),
    recordCount: records.length, records, promotedCrowns: [], taskClassWinners: {},
    publicCatalogProvesAccountCallability: false, providerInferenceCallsPerformed: 0 };
}

export function selectCurrentPrice(snapshot, model, now = Date.now()) {
  const row = snapshot?.records?.find(r => r.model === model);
  if (!row || row.priceAdmission !== 'PUBLIC_PRICE_CANDIDATE' || Date.parse(row.verifiedAt) > now || Date.parse(row.expiresAt) <= now || !Number.isFinite(Date.parse(row.expiresAt))) throw new Error('fresh-fixed-price-record-required');
  return structuredClone(row);
}
