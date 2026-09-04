// Vercel AI Gateway adapter for the bounded UberBond agent-worker runtime.
// The gateway is OpenAI-compatible, but its provider/model identity is kept
// observable so routing cannot silently disguise a fallback.

import crypto from 'node:crypto';
import { redactSecrets } from './secret-patterns.mjs';

export const VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION = 'vercel-ai-gateway-executor-1.1.0';
export const VERCEL_AI_GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';

/**
 * A transport or provider error message is written by someone else and lands in
 * a durable receipt. A client that echoes the request it failed on -- ordinary
 * behaviour -- puts the Authorization header into that string, so copying it
 * verbatim writes the gateway key into task history. The success path was
 * already checked for the key; the failure paths are where it actually appears.
 */
const safeDetail = (error, max = 500) => text(redactSecrets(String(error?.message ?? error ?? '')), max);

const MAX_BODY_BYTES = 300_000;
const MAX_CACHEABLE_CONTEXT_BYTES = 200_000;
const MAX_RESPONSE_BYTES = 1_000_000;
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
  // Deliberately conservative. Cache savings are not subtracted unless a
  // separately verified cache-read price is supplied by a future pricing
  // contract. A cache hit may make the provider bill smaller than this receipt,
  // never larger because we assumed a discount that did not exist.
  const costCents = Math.ceil(((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000) * 100 - 1e-12);
  return { inputTokens, outputTokens, totalTokens, costCents, costBasis: 'CONFIGURED_CONSERVATIVE_ESTIMATE_CACHE_SAVINGS_NOT_ASSUMED' };
}

function observedInteger(candidates) {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      const value = integer(candidate, 0, 100_000_000);
      return { observed: value != null, value: value ?? 0 };
    }
  }
  return { observed: false, value: 0 };
}

function cacheEvidence(payload, prefix) {
  const read = observedInteger([
    payload?.usage?.inputTokenDetails?.cacheReadTokens,
    payload?.usage?.prompt_tokens_details?.cached_tokens,
    payload?.usage?.cache_read_input_tokens,
    payload?.usage?.cacheReadInputTokens
  ]);
  const write = observedInteger([
    payload?.usage?.inputTokenDetails?.cacheWriteTokens,
    payload?.usage?.cache_creation_input_tokens,
    payload?.usage?.cacheWriteInputTokens
  ]);
  const cacheObserved = read.observed || write.observed;
  return {
    requested: true,
    mode: 'auto',
    prefixBytes: bytes(prefix),
    prefixSha256: prefix ? crypto.createHash('sha256').update(prefix).digest('hex') : null,
    cacheReadTokens: read.value,
    cacheWriteTokens: write.value,
    status: read.observed && read.value > 0 ? 'OBSERVED_CACHE_HIT'
      : cacheObserved ? 'OBSERVED_NO_CACHE_READ' : 'CACHE_USAGE_FIELDS_NOT_OBSERVED',
    savingsClaim: 'NOT_COMPUTED_WITHOUT_VERIFIED_CACHE_PRICING'
  };
}

function resultText(payload) {
  const choice = payload?.choices?.[0]?.message?.content;
  if (typeof choice === 'string') return choice.trim();
  if (Array.isArray(choice)) return choice.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

function requestBody({ task, model, maxTokens, cacheableContext }) {
  const messages = [
    { role: 'system', content: 'You are a bounded UberBond worker. Do only local preparation. Never claim external effects, revenue, deployment, sending, purchases, DNS changes, or credential changes. Return only the required structured JSON result.' }
  ];
  // Stable heavy context goes before request-specific task material so providers
  // that cache exact prefixes can reuse it. No timestamp/task id is inserted
  // before this block. The context itself is never copied into the receipt.
  if (cacheableContext) messages.push({ role: 'system', content: cacheableContext });
  messages.push({
    role: 'user',
    content: JSON.stringify({ taskId: task.taskId, objective: task.objective, originAgent: task.originAgent, targetAgent: task.targetAgent, parentTask: task.parentTask || null, contextRefs: task.contextRefs || [], evidenceRefs: task.evidenceRefs || [], constraints: task.constraints || [], forbiddenActions: task.forbiddenActions || [], requiredOutputs: task.requiredOutputs || [], acceptanceTests: task.acceptanceTests || [], economicObjective: task.economicObjective || '', consequenceClass: task.consequenceClass || 'LOCAL_PREPARATION' })
  });
  return {
    model,
    temperature: 0,
    max_tokens: maxTokens,
    messages,
    providerOptions: { gateway: { caching: 'auto' } },
    response_format: { type: 'json_object' }
  };
}

export function createVercelAIGatewayExecutor({
  apiKey, enabled = false, defaultModel = 'openai/gpt-5.4', pricing,
  fetchImpl = globalThis.fetch, endpoint = VERCEL_AI_GATEWAY_ENDPOINT, timeoutMs = 60_000
} = {}) {
  const key = String(apiKey || '');
  return async function vercelAIGatewayExecutor({ task, model, maxTokens, costCeilingCents, cacheableContext = '' } = {}) {
    if (!enabled) return failure(['ai-gateway-executor-disabled']);
    if (!key || key.length < 12) return failure(['ai-gateway-api-key-required']);
    if (endpoint !== VERCEL_AI_GATEWAY_ENDPOINT) return failure(['ai-gateway-endpoint-not-allowlisted']);
    if (typeof fetchImpl !== 'function') return failure(['fetch-implementation-required']);
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
    if (bytes(stablePrefix) > MAX_CACHEABLE_CONTEXT_BYTES) return failure(['ai-gateway-cacheable-context-too-large']);
    const estimatedInputTokens = Math.ceil((bytes(task) + bytes(stablePrefix)) / 4);
    const estimatedCostCents = Math.ceil(((estimatedInputTokens * Number(pricing.inputUsdPerMillion) + outputLimit * Number(pricing.outputUsdPerMillion)) / 1_000_000) * 100 - 1e-12);
    if (estimatedCostCents > costLimit) return failure(['estimated-cost-exceeds-reserved-ceiling']);
    const body = requestBody({ task, model: selectedModel, maxTokens: outputLimit, cacheableContext: stablePrefix });
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
    const metered = usage(raw, pricing);
    if (!metered) return failure(['ai-gateway-usage-or-pricing-invalid'], 'UNCERTAIN', { uncertain: true, providerRequestId });
    if (metered.costCents > costLimit) return failure(['actual-cost-exceeds-reserved-ceiling'], 'UNCERTAIN', { uncertain: true, providerRequestId, usage: metered });
    const bodyText = resultText(raw);
    if (!bodyText) return failure(['ai-gateway-structured-output-missing'], 'UNCERTAIN', { uncertain: true, providerRequestId, usage: metered });
    let result;
    try { result = JSON.parse(bodyText); } catch (error) { return failure(['ai-gateway-structured-output-json-invalid'], 'UNCERTAIN', { uncertain: true, providerRequestId, usage: metered, detail: safeDetail(error) }); }
    return {
      ok: true, outcome: 'COMPLETED', providerRequestId, providerStatus: text(raw?.choices?.[0]?.finish_reason, 80) || 'stop',
      model: text(raw?.model, 160) || null, identityVerification: raw?.model ? 'OBSERVED' : 'UNVERIFIED', usage: metered,
      cacheEvidence: cacheEvidence(raw, stablePrefix),
      pricingEvidence: { sourceRef: text(pricing.sourceRef, 500), verifiedAt: text(pricing.verifiedAt, 80), inputUsdPerMillion: Number(pricing.inputUsdPerMillion), outputUsdPerMillion: Number(pricing.outputUsdPerMillion), costBasis: metered.costBasis },
      result
    };
  };
}
