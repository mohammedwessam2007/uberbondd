// Vercel AI Gateway adapter for the bounded UberBond agent-worker runtime.
// The gateway is OpenAI-compatible, but its provider/model identity is kept
// observable so routing cannot silently disguise a fallback.

export const VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION = 'vercel-ai-gateway-executor-1.3.0';
export const VERCEL_AI_GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';

import crypto from 'node:crypto';
import { redactSecrets } from './secret-patterns.mjs';

const safeDetail = (error, max = 500) => text(redactSecrets(String(error?.message ?? error ?? '')), max);
const MAX_BODY_BYTES = 300_000;
const MAX_CACHEABLE_CONTEXT_BYTES = 200_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
const CACHEABLE_DATA_CLASSES = new Set(['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE']);
const EXPLICIT_CACHE_CONTROL_MODEL_PREFIXES = Object.freeze(['anthropic/', 'minimax/']);
const text = (v, max = 1000) => String(v ?? '').trim().slice(0, max);
const integer = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : null;
const finite = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : null;
const bytes = v => Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v ?? null), 'utf8');
const failure = (reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) => ({ ok: false, outcome, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], ...extra });

function validatePricing(pricing) {
  return finite(pricing?.inputUsdPerMillion, 0, 1_000_000) != null
    && finite(pricing?.outputUsdPerMillion, 0, 1_000_000) != null
    && text(pricing?.sourceRef, 500).length > 0
    && text(pricing?.verifiedAt, 80).length > 0;
}

function usage(payload, pricing) {
  const inputTokens = integer(payload?.usage?.prompt_tokens ?? payload?.usage?.input_tokens, 0, 100_000_000);
  const outputTokens = integer(payload?.usage?.completion_tokens ?? payload?.usage?.output_tokens, 0, 100_000_000);
  const totalTokens = integer(payload?.usage?.total_tokens, 0, 100_000_000);
  if (inputTokens == null || outputTokens == null || totalTokens == null || totalTokens < inputTokens + outputTokens) return null;
  const inputRate = finite(pricing?.inputUsdPerMillion, 0, 1_000_000);
  const outputRate = finite(pricing?.outputUsdPerMillion, 0, 1_000_000);
  if (inputRate == null || outputRate == null) return null;
  // Deliberately charge the receipt as though every input token were uncached.
  // Cache discounts vary by provider/model and cannot lower a reservation until
  // a separate verified pricing contract proves the applicable cache price.
  const costCents = Math.max(0, Math.ceil(((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000) * 100 - 1e-12));
  return { inputTokens, outputTokens, totalTokens, costCents, costBasis: 'CONFIGURED_CONSERVATIVE_ESTIMATE' };
}

function observedInteger(candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    const value = integer(candidate, 0, 100_000_000);
    return value == null ? { observed: true, valid: false, value: null } : { observed: true, valid: true, value };
  }
  return { observed: false, valid: true, value: 0 };
}

function cacheEvidence(payload, { requested, prefix, dataClass, inputTokens, requestMode }) {
  const read = observedInteger([
    payload?.usage?.prompt_tokens_details?.cached_tokens,
    payload?.usage?.inputTokenDetails?.cacheReadTokens,
    payload?.usage?.cache_read_input_tokens,
    payload?.usage?.cached_input_tokens
  ]);
  const write = observedInteger([
    payload?.usage?.inputTokenDetails?.cacheWriteTokens,
    payload?.usage?.cache_creation_input_tokens,
    payload?.usage?.cacheWriteInputTokens
  ]);
  if (!read.valid || !write.valid) return null;
  if ((read.observed && read.value > inputTokens) || (write.observed && write.value > inputTokens)) return null;
  const observed = read.observed || write.observed;
  return {
    requested,
    requestMode: requested ? requestMode : 'NOT_REQUESTED',
    dataClass: requested ? dataClass : null,
    prefixBytes: requested ? bytes(prefix) : 0,
    prefixSha256: requested && prefix ? crypto.createHash('sha256').update(prefix).digest('hex') : null,
    cacheReadTokens: read.value,
    cacheWriteTokens: write.value,
    observationClass: observed ? 'PROVIDER_USAGE_FIELD_OBSERVED' : 'CACHE_USAGE_FIELDS_NOT_OBSERVED',
    status: read.observed && read.value > 0 ? 'OBSERVED_CACHE_HIT'
      : observed ? 'OBSERVED_NO_CACHE_READ' : 'CACHE_USAGE_FIELDS_NOT_OBSERVED',
    savingsClaim: 'NOT_COMPUTED_WITHOUT_VERIFIED_CACHE_PRICING'
  };
}

function resultText(payload) {
  const choice = payload?.choices?.[0]?.message?.content;
  if (typeof choice === 'string') return choice.trim();
  if (Array.isArray(choice)) return choice.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

function requiresExplicitCacheControl(model) {
  return EXPLICIT_CACHE_CONTROL_MODEL_PREFIXES.some(prefix => model.startsWith(prefix));
}

function requestBody({ task, model, maxTokens, reasoningEffort, cacheableContext }) {
  const messages = [
    { role: 'system', content: 'You are a bounded UberBond worker. Do only local preparation. Never claim external effects, revenue, deployment, sending, purchases, DNS changes, or credential changes. Return only the required structured JSON result.' }
  ];
  // Stable shared context precedes request-specific material so exact-prefix
  // provider caches can reuse it. For Chat Completions providers requiring an
  // explicit marker, Vercel documents cache_control on the message itself.
  // Providers with implicit prefix caching need no nonstandard request option.
  if (cacheableContext) {
    messages.push({
      role: 'system',
      content: cacheableContext,
      ...(requiresExplicitCacheControl(model) ? { cache_control: { type: 'ephemeral' } } : {})
    });
  }
  messages.push({
    role: 'user',
    content: JSON.stringify({ taskId: task.taskId, objective: task.objective, originAgent: task.originAgent, targetAgent: task.targetAgent, parentTask: task.parentTask || null, contextRefs: task.contextRefs || [], evidenceRefs: task.evidenceRefs || [], constraints: task.constraints || [], forbiddenActions: task.forbiddenActions || [], requiredOutputs: task.requiredOutputs || [], acceptanceTests: task.acceptanceTests || [], economicObjective: task.economicObjective || '', consequenceClass: task.consequenceClass || 'LOCAL_PREPARATION' })
  });
  return {
    model,
    temperature: 0,
    max_tokens: maxTokens,
    ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    messages,
    response_format: { type: 'json_object' }
  };
}

export function createVercelAIGatewayExecutor({
  apiKey, enabled = false, defaultModel = 'openai/gpt-5.4', pricing,
  reasoningEffort = null,
  fetchImpl = globalThis.fetch, endpoint = VERCEL_AI_GATEWAY_ENDPOINT, timeoutMs = 60_000
} = {}) {
  const key = String(apiKey || '');
  const requestedReasoningEffort = reasoningEffort == null || String(reasoningEffort).trim() === ''
    ? null
    : text(reasoningEffort, 40).toLowerCase();
  const validReasoning = requestedReasoningEffort == null || REASONING_EFFORTS.has(requestedReasoningEffort);

  return async function vercelAIGatewayExecutor({ task, model, maxTokens, costCeilingCents, cacheableContext = '', cacheableContextDataClass = '' } = {}) {
    if (!enabled) return failure(['ai-gateway-executor-disabled']);
    if (!key || key.length < 12) return failure(['ai-gateway-api-key-required']);
    if (endpoint !== VERCEL_AI_GATEWAY_ENDPOINT) return failure(['ai-gateway-endpoint-not-allowlisted']);
    if (typeof fetchImpl !== 'function') return failure(['fetch-implementation-required']);
    if (!validReasoning) return failure(['ai-gateway-reasoning-effort-unsupported']);
    if (!task?.taskId || !task?.objective) return failure(['valid-agent-task-required']);
    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') return failure(['ai-gateway-worker-only-accepts-local-preparation']);
    if (!validatePricing(pricing)) return failure(['verified-pricing-config-required']);
    const outputLimit = integer(maxTokens, 1, 128_000);
    const costLimit = integer(costCeilingCents, 0, 10_000_000);
    if (outputLimit == null) return failure(['valid-max-output-tokens-required']);
    if (costLimit == null) return failure(['valid-cost-ceiling-required']);
    const selectedModel = text(model || defaultModel, 160);
    if (!selectedModel || !selectedModel.includes('/')) return failure(['gateway-provider-model-slug-required']);
    if (typeof cacheableContext !== 'string') return failure(['cacheable-context-must-be-string']);
    const stablePrefix = cacheableContext.trim();
    const cacheDataClass = text(cacheableContextDataClass, 80).toUpperCase();
    if (stablePrefix && !CACHEABLE_DATA_CLASSES.has(cacheDataClass)) return failure(['cacheable-context-explicit-approved-data-class-required']);
    if (bytes(stablePrefix) > MAX_CACHEABLE_CONTEXT_BYTES) return failure(['ai-gateway-cacheable-context-too-large']);
    const estimatedInputTokens = Math.ceil((bytes(task) + bytes(stablePrefix)) / 4);
    const estimatedCostCents = Math.max(0, Math.ceil(((estimatedInputTokens * Number(pricing.inputUsdPerMillion) + outputLimit * Number(pricing.outputUsdPerMillion)) / 1_000_000) * 100 - 1e-12));
    if (estimatedCostCents > costLimit) return failure(['estimated-cost-exceeds-reserved-ceiling']);
    const body = requestBody({ task, model: selectedModel, maxTokens: outputLimit, reasoningEffort: requestedReasoningEffort, cacheableContext: stablePrefix });
    if (bytes(body) > MAX_BODY_BYTES) return failure(['ai-gateway-request-body-too-large']);
    let response;
    let timeoutHandle;
    try {
      response = await Promise.race([
        fetchImpl(VERCEL_AI_GATEWAY_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        new Promise((_, reject) => { timeoutHandle = setTimeout(() => reject(Object.assign(new Error('request timeout'), { name: 'AbortError' })), timeoutMs); })
      ]);
    } catch (error) {
      return failure([error?.name === 'AbortError' ? 'ai-gateway-timeout-uncertain' : 'ai-gateway-transport-uncertain'], 'UNCERTAIN', { uncertain: true, detail: safeDetail(error) });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
    const status = integer(response?.status, 0, 999) || 0;
    if (!response?.ok) {
      if (status === 429) return failure(['ai-gateway-quota-or-rate-limit-http-429']);
      if (status === 401 || status === 403) return failure([`ai-gateway-http-${status}`, 'ai-gateway-credential-rejected']);
      if (status >= 500) return failure([`ai-gateway-http-${status}`, 'ai-gateway-provider-outage'], 'UNCERTAIN', { uncertain: true });
      return failure([`ai-gateway-http-${status || 'unknown'}`]);
    }
    let raw;
    try {
      const rawText = await response.text();
      if (bytes(rawText) > MAX_RESPONSE_BYTES) return failure(['ai-gateway-response-too-large'], 'UNCERTAIN', { uncertain: true });
      raw = JSON.parse(rawText);
    } catch (error) {
      return failure(['ai-gateway-response-parse-uncertain'], 'UNCERTAIN', { uncertain: true, detail: safeDetail(error) });
    }
    const providerRequestId = text(raw?.id, 240) || null;
    const observedModel = text(raw?.model, 160) || null;
    const observedRevision = text(raw?.model_revision, 240) || null;
    if (observedModel && observedModel !== selectedModel) {
      return failure(['ai-gateway-model-identity-mismatch'], 'CONFIRMED_FAILURE', {
        providerRequestId,
        requestedModel: selectedModel,
        observedModel
      });
    }
    const metered = usage(raw, pricing);
    if (!metered) return failure(['ai-gateway-usage-or-pricing-invalid'], 'UNCERTAIN', { uncertain: true, providerRequestId });
    if (metered.costCents > costLimit) return failure(['actual-cost-exceeds-reserved-ceiling'], 'UNCERTAIN', { uncertain: true, providerRequestId, usage: metered });
    const cacheRequestMode = stablePrefix
      ? (requiresExplicitCacheControl(selectedModel) ? 'CHAT_COMPLETIONS_EXPLICIT_EPHEMERAL' : 'STABLE_PREFIX_IMPLICIT_PROVIDER_CACHE')
      : 'NOT_REQUESTED';
    const observedCache = cacheEvidence(raw, { requested: Boolean(stablePrefix), prefix: stablePrefix, dataClass: cacheDataClass, inputTokens: metered.inputTokens, requestMode: cacheRequestMode });
    if (!observedCache) return failure(['ai-gateway-cache-usage-invalid'], 'UNCERTAIN', { uncertain: true, providerRequestId, usage: metered });
    const bodyText = resultText(raw);
    if (!bodyText) return failure(['ai-gateway-structured-output-missing'], 'UNCERTAIN', { uncertain: true, providerRequestId, usage: metered });
    let result;
    try { result = JSON.parse(bodyText); } catch (error) { return failure(['ai-gateway-structured-output-json-invalid'], 'UNCERTAIN', { uncertain: true, providerRequestId, usage: metered, detail: safeDetail(error) }); }
    return {
      ok: true,
      outcome: 'COMPLETED',
      providerRequestId,
      providerStatus: text(raw?.choices?.[0]?.finish_reason, 80) || 'stop',
      model: observedModel,
      observedRevision,
      identityVerification: observedModel ? 'OBSERVED' : 'UNVERIFIED',
      appliedReasoningEffort: requestedReasoningEffort,
      appliedReasoningEvidence: requestedReasoningEffort ? 'REQUEST_BODY_ATTESTED' : 'NOT_REQUESTED',
      usage: metered,
      cacheEvidence: observedCache,
      pricingEvidence: { sourceRef: text(pricing.sourceRef, 500), verifiedAt: text(pricing.verifiedAt, 80), inputUsdPerMillion: Number(pricing.inputUsdPerMillion), outputUsdPerMillion: Number(pricing.outputUsdPerMillion), costBasis: metered.costBasis },
      result
    };
  };
}
