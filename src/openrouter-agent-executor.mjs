import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OPENROUTER_AGENT_EXECUTOR_VERSION = 'uberbond.openrouter-agent-executor.v1';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_BODY_BYTES = 300_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const PROVIDER_SORTS = new Set(['price', 'throughput', 'latency']);

const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? null), 'utf8');
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const fail = (reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) => ({
  ok: false,
  outcome,
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: zeroEffects(),
  ...extra
});

function validatePricing(pricing) {
  return finite(pricing?.inputUsdPerMillion, 0, 1_000_000) != null
    && finite(pricing?.outputUsdPerMillion, 0, 1_000_000) != null
    && text(pricing?.sourceRef, 500)
    && text(pricing?.verifiedAt, 80)
    && Number.isFinite(Date.parse(pricing.verifiedAt));
}

function usageFrom(payload, pricing) {
  const inputTokens = integer(payload?.usage?.prompt_tokens ?? payload?.usage?.input_tokens, 0, 100_000_000);
  const outputTokens = integer(payload?.usage?.completion_tokens ?? payload?.usage?.output_tokens, 0, 100_000_000);
  const totalTokens = integer(payload?.usage?.total_tokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0)), 0, 100_000_000);
  if (inputTokens == null || outputTokens == null || totalTokens == null || totalTokens < inputTokens + outputTokens) return null;
  const cachedTokens = integer(
    payload?.usage?.prompt_tokens_details?.cached_tokens
      ?? payload?.usage?.inputTokenDetails?.cacheReadTokens
      ?? 0,
    0,
    inputTokens
  );
  if (cachedTokens == null) return null;
  const freshTokens = inputTokens - cachedTokens;
  const inputRate = Number(pricing.inputUsdPerMillion);
  const outputRate = Number(pricing.outputUsdPerMillion);
  const cacheRate = finite(pricing?.cacheReadUsdPerMillion, 0, 1_000_000) ?? inputRate;
  const estimatedUsd = ((freshTokens * inputRate) + (cachedTokens * cacheRate) + (outputTokens * outputRate)) / 1_000_000;
  const observedCostUsd = finite(payload?.usage?.cost, 0, 1_000_000);
  const billedUsd = observedCostUsd ?? estimatedUsd;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: cachedTokens,
    freshInputTokens: freshTokens,
    costUsd: billedUsd,
    costCents: Math.ceil(billedUsd * 100 - 1e-12),
    costBasis: observedCostUsd != null ? 'OPENROUTER_USAGE_COST_OBSERVED' : 'VERIFIED_PRICE_ESTIMATE'
  };
}

function responseText(payload) {
  const value = payload?.choices?.[0]?.message?.content;
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

function workerPayload(task) {
  return JSON.stringify({
    taskId: task.taskId,
    objective: task.objective,
    originAgent: task.originAgent || null,
    targetAgent: task.targetAgent || null,
    parentTask: task.parentTask || null,
    contextRefs: task.contextRefs || [],
    evidenceRefs: task.evidenceRefs || [],
    constraints: task.constraints || [],
    forbiddenActions: task.forbiddenActions || [],
    requiredOutputs: task.requiredOutputs || [],
    acceptanceTests: task.acceptanceTests || [],
    economicObjective: task.economicObjective || '',
    consequenceClass: task.consequenceClass || 'LOCAL_PREPARATION'
  });
}

function requestBody({
  task,
  model,
  maxTokens,
  reasoningEffort,
  providerSort,
  requireZdr,
  allowProviderFallbacks,
  maxPromptPrice,
  maxCompletionPrice,
  sessionId
}) {
  const provider = {
    sort: providerSort,
    allow_fallbacks: allowProviderFallbacks,
    data_collection: 'deny',
    require_parameters: true,
    ...(requireZdr ? { zdr: true } : {}),
    ...(maxPromptPrice != null || maxCompletionPrice != null ? {
      max_price: {
        ...(maxPromptPrice != null ? { prompt: maxPromptPrice } : {}),
        ...(maxCompletionPrice != null ? { completion: maxCompletionPrice } : {})
      }
    } : {})
  };
  return {
    model,
    messages: [
      {
        role: 'system',
        content: [
          'You are a bounded UberBond cloud subagent.',
          'Perform only the supplied local reasoning or artifact-preparation task.',
          'Do not claim external effects, revenue, deployment, sending, purchases, DNS changes, credential changes, or customer acceptance.',
          'Do not invent evidence. Unknown facts remain unresolved.',
          'Return one valid JSON object only.'
        ].join(' ')
      },
      { role: 'user', content: workerPayload(task) }
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: maxTokens,
    provider,
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    ...(sessionId ? { session_id: sessionId } : {})
  };
}

export function createOpenRouterAgentExecutor({
  apiKey,
  enabled = false,
  defaultModel,
  pricing,
  fetchImpl = globalThis.fetch,
  providerSort = 'price',
  requireZdr = true,
  allowProviderFallbacks = true,
  maxPromptPrice = null,
  maxCompletionPrice = null,
  reasoningEffort = null
} = {}) {
  const key = String(apiKey || '');
  const configuredModel = text(defaultModel, 240);
  const sort = text(providerSort, 40).toLowerCase();
  const promptCeiling = maxPromptPrice == null ? null : finite(maxPromptPrice, 0, 1_000_000);
  const completionCeiling = maxCompletionPrice == null ? null : finite(maxCompletionPrice, 0, 1_000_000);
  const validReasoning = reasoningEffort == null || ['none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(String(reasoningEffort).toLowerCase());

  return async function openRouterAgentExecutor({
    task,
    model,
    maxTokens,
    costCeilingCents,
    sessionId = '',
    responseCacheEligible = false,
    responseCacheFreshness = 'UNCLASSIFIED',
    responseCacheTtlSeconds = 300,
    responseCacheClear = false
  } = {}) {
    if (!enabled) return fail(['openrouter-agent-executor-disabled']);
    if (!key || key.length < 12) return fail(['openrouter-api-key-required']);
    if (typeof fetchImpl !== 'function') return fail(['fetch-implementation-required']);
    if (!PROVIDER_SORTS.has(sort)) return fail(['openrouter-provider-sort-invalid']);
    if (!validReasoning) return fail(['openrouter-reasoning-effort-invalid']);
    if (!validatePricing(pricing)) return fail(['verified-openrouter-model-pricing-required']);
    if (maxPromptPrice != null && promptCeiling == null) return fail(['openrouter-max-prompt-price-invalid']);
    if (maxCompletionPrice != null && completionCeiling == null) return fail(['openrouter-max-completion-price-invalid']);
    if (!task?.taskId || !task?.objective) return fail(['valid-agent-task-required']);
    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') {
      return fail(['openrouter-worker-only-accepts-local-preparation']);
    }
    if (responseCacheEligible && String(task?.dataClass || '').trim().toUpperCase() !== 'PUBLIC') {
      return fail(['openrouter-response-cache-public-data-only']);
    }
    if (responseCacheEligible && (!['IMMUTABLE', 'BOUNDED'].includes(responseCacheFreshness) || !Number.isSafeInteger(responseCacheTtlSeconds) || responseCacheTtlSeconds < 1 || responseCacheTtlSeconds > 86400)) {
      return fail(['openrouter-response-cache-freshness-and-ttl-required']);
    }

    const selectedModel = text(model || configuredModel, 240);
    const outputLimit = integer(maxTokens, 1, 128_000);
    const costLimit = integer(costCeilingCents, 0, 10_000_000);
    if (!selectedModel) return fail(['openrouter-model-required']);
    if (outputLimit == null) return fail(['valid-max-output-tokens-required']);
    if (costLimit == null) return fail(['valid-cost-ceiling-required']);

    const body = requestBody({
      task,
      model: selectedModel,
      maxTokens: outputLimit,
      reasoningEffort: reasoningEffort == null ? null : String(reasoningEffort).toLowerCase(),
      providerSort: sort,
      requireZdr,
      allowProviderFallbacks,
      maxPromptPrice: promptCeiling,
      maxCompletionPrice: completionCeiling,
      sessionId: text(sessionId, 240)
    });
    if (bytes(body) > MAX_BODY_BYTES) return fail(['openrouter-request-body-too-large']);

    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-OpenRouter-Cache': responseCacheEligible ? 'true' : 'false',
          ...(responseCacheEligible ? { 'X-OpenRouter-Cache-TTL': String(responseCacheTtlSeconds), ...(responseCacheClear ? { 'X-OpenRouter-Cache-Clear': 'true' } : {}) } : {})
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      return fail(['openrouter-transport-uncertain'], 'UNCERTAIN', { uncertain: true, detail: text(error?.message, 500) });
    }

    const status = integer(response?.status, 0, 999) || 0;
    if (!response?.ok) {
      if ([400, 401, 403, 404, 409, 413, 422, 429].includes(status)) return fail([`openrouter-http-${status}`]);
      return fail([`openrouter-http-${status || 'unknown'}`, 'openrouter-provider-outcome-uncertain'], 'UNCERTAIN', { uncertain: true });
    }

    let raw;
    try {
      const rawText = await response.text();
      if (bytes(rawText) > MAX_RESPONSE_BYTES) return fail(['openrouter-response-too-large'], 'UNCERTAIN', { uncertain: true });
      raw = JSON.parse(rawText);
    } catch (error) {
      return fail(['openrouter-response-json-invalid'], 'UNCERTAIN', { uncertain: true, detail: text(error?.message, 500) });
    }

    const observedModel = text(raw?.model, 240) || null;
    if (!observedModel) return fail(['openrouter-returned-model-identity-required'], 'UNCERTAIN', { uncertain: true });
    if (observedModel !== selectedModel) {
      return fail(['openrouter-model-identity-mismatch'], 'CONFIRMED_FAILURE', {
        requestedModel: selectedModel,
        observedModel
      });
    }

    const metered = usageFrom(raw, pricing);
    if (!metered) return fail(['openrouter-usage-or-pricing-invalid'], 'UNCERTAIN', { uncertain: true });
    if (metered.costCents > costLimit) return fail(['actual-cost-exceeds-reserved-ceiling'], 'CONFIRMED_FAILURE', { usage: metered });

    const bodyText = responseText(raw);
    if (!bodyText) return fail(['openrouter-structured-output-missing'], 'UNCERTAIN', { uncertain: true, usage: metered });

    let result;
    try { result = JSON.parse(bodyText); }
    catch (error) {
      return fail(['openrouter-structured-output-json-invalid'], 'UNCERTAIN', { uncertain: true, usage: metered, detail: text(error?.message, 500) });
    }

    return {
      ok: true,
      outcome: 'COMPLETED',
      provider: 'openrouter',
      providerRequestId: text(raw?.id, 240) || null,
      requestedModel: selectedModel,
      observedModel,
      identityVerification: 'MATCHED',
      providerRouting: {
        sort,
        allowProviderFallbacks,
        dataCollection: 'deny',
        zdrRequired: requireZdr,
        modelFallbacks: 'PROHIBITED_BY_EXECUTOR',
        maxPromptPrice: promptCeiling,
        maxCompletionPrice: completionCeiling,
        sessionIdPresent: Boolean(text(sessionId, 240)),
        responseCacheEligible: responseCacheEligible === true
      },
      reasoningSettingEvidence: reasoningEffort ? 'REQUEST_ATTESTED_ONLY' : 'NOT_REQUESTED',
      usage: metered,
      responseCache: {
        status: ['HIT', 'MISS'].includes(response.headers?.get?.('X-OpenRouter-Cache-Status')) ? response.headers.get('X-OpenRouter-Cache-Status') : 'UNKNOWN',
        ageSeconds: response.headers?.get?.('X-OpenRouter-Cache-Age') ?? null,
        ttlSeconds: response.headers?.get?.('X-OpenRouter-Cache-TTL') ?? null,
        sourceGenerationId: response.headers?.get?.('X-OpenRouter-Cache-Source-Id') ?? null,
        freshness: responseCacheFreshness
      },
      pricingEvidence: {
        sourceRef: text(pricing.sourceRef, 500),
        verifiedAt: text(pricing.verifiedAt, 80),
        inputUsdPerMillion: Number(pricing.inputUsdPerMillion),
        outputUsdPerMillion: Number(pricing.outputUsdPerMillion),
        ...(pricing.cacheReadUsdPerMillion != null ? { cacheReadUsdPerMillion: Number(pricing.cacheReadUsdPerMillion) } : {}),
        costBasis: metered.costBasis
      },
      result,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  };
}
