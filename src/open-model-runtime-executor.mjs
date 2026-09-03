import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OPEN_MODEL_RUNTIME_EXECUTOR_VERSION = 'uberbond.open-model-runtime-executor-1.0.1';
export const OPEN_MODEL_RUNTIMES = Object.freeze([
  'VLLM', 'SGLANG', 'LLAMA_CPP', 'OLLAMA', 'MLX_LM', 'TGI',
  'TRANSFORMERS_HTTP', 'DIFFUSERS_HTTP', 'SENTENCE_TRANSFORMERS_HTTP',
  'CUSTOM_OPENAI_COMPATIBLE'
]);
export const OPENAI_API_STYLES = Object.freeze(['CHAT_COMPLETIONS', 'RESPONSES']);

const MAX_BODY_BYTES = 300_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? null), 'utf8');
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const failure = (reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) => ({ ok: false, outcome, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra });

function safeEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.username || url.password) return null;
    const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
    if (loopback && url.protocol === 'http:') return url;
    if (url.protocol === 'https:') return url;
    return null;
  } catch {
    return null;
  }
}

function validatePricing(pricing) {
  return finite(pricing?.inputUsdPerMillion, 0, 1_000_000) != null
    && finite(pricing?.outputUsdPerMillion, 0, 1_000_000) != null
    && finite(pricing?.infrastructureUsdPerRequest ?? 0, 0, 1_000_000) != null
    && text(pricing?.sourceRef, 500).length > 0
    && text(pricing?.verifiedAt, 80).length > 0;
}

function meteredUsage(payload, pricing) {
  const inputTokens = integer(payload?.usage?.prompt_tokens ?? payload?.usage?.input_tokens, 0, 100_000_000);
  const outputTokens = integer(payload?.usage?.completion_tokens ?? payload?.usage?.output_tokens, 0, 100_000_000);
  const totalTokens = integer(payload?.usage?.total_tokens ?? ((inputTokens ?? 0) + (outputTokens ?? 0)), 0, 100_000_000);
  if (inputTokens == null || outputTokens == null || totalTokens == null || totalTokens < inputTokens + outputTokens) return null;
  const inputRate = finite(pricing?.inputUsdPerMillion, 0, 1_000_000);
  const outputRate = finite(pricing?.outputUsdPerMillion, 0, 1_000_000);
  const infrastructure = finite(pricing?.infrastructureUsdPerRequest ?? 0, 0, 1_000_000);
  if (inputRate == null || outputRate == null || infrastructure == null) return null;
  const usd = ((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000) + infrastructure;
  const costCents = Math.ceil(usd * 100 - 1e-12);
  return { inputTokens, outputTokens, totalTokens, costCents, costBasis: 'CONFIGURED_RUNTIME_ESTIMATE' };
}

function resultText(payload, apiStyle) {
  if (apiStyle === 'RESPONSES') {
    if (typeof payload?.output_text === 'string') return payload.output_text.trim();
    const parts = Array.isArray(payload?.output) ? payload.output.flatMap(item => item?.content || []) : [];
    return parts.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map(part => typeof part?.text === 'string' ? part.text : '').join('').trim();
  return '';
}

function requestBody({ task, model, maxTokens, apiStyle }) {
  const system = 'You are a bounded UberBond worker. Perform only the assigned local reasoning or artifact preparation. Never claim external effects, revenue, deployment, messages, purchases, DNS changes, credential changes, or customer acceptance. Return the required structured JSON result only.';
  const payload = JSON.stringify({
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
  if (apiStyle === 'RESPONSES') {
    return { model, input: [{ role: 'system', content: system }, { role: 'user', content: payload }], max_output_tokens: maxTokens, temperature: 0 };
  }
  return { model, temperature: 0, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: payload }], response_format: { type: 'json_object' } };
}

function endpointFor(base, apiStyle) {
  const url = new URL(base.toString());
  const normalized = url.pathname.replace(/\/$/, '');
  if (/\/v1\/(chat\/completions|responses)$/.test(normalized)) return url.toString();
  url.pathname = `${normalized}/v1/${apiStyle === 'RESPONSES' ? 'responses' : 'chat/completions'}`.replace(/\/+/g, '/');
  return url.toString();
}

export function planOpenModelRuntime(input = {}) {
  const runtime = text(input.runtime, 80).toUpperCase();
  const model = text(input.model, 400);
  const apiStyle = text(input.apiStyle || 'CHAT_COMPLETIONS', 80).toUpperCase();
  const endpoint = safeEndpoint(input.endpoint);
  const enabled = input.enabled === true;
  const reasonCodes = [];
  if (!OPEN_MODEL_RUNTIMES.includes(runtime)) reasonCodes.push('recognized-open-model-runtime-required');
  if (!model) reasonCodes.push('model-id-required');
  if (!OPENAI_API_STYLES.includes(apiStyle)) reasonCodes.push('recognized-openai-api-style-required');
  if (!endpoint) reasonCodes.push('safe-runtime-endpoint-required');
  if (!validatePricing(input.pricing)) reasonCodes.push('verified-runtime-pricing-required');
  if (reasonCodes.length) return failure(reasonCodes);
  return {
    ok: true,
    status: enabled ? 'OPEN_MODEL_RUNTIME_CONFIGURED' : 'OPEN_MODEL_RUNTIME_DISABLED',
    runtime,
    model,
    apiStyle,
    endpointClass: ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(endpoint.hostname) ? 'LOOPBACK' : 'HTTPS_REMOTE',
    endpointOrigin: endpoint.origin,
    pricingEvidence: {
      sourceRef: text(input.pricing.sourceRef, 500),
      verifiedAt: text(input.pricing.verifiedAt, 80),
      inputUsdPerMillion: Number(input.pricing.inputUsdPerMillion),
      outputUsdPerMillion: Number(input.pricing.outputUsdPerMillion),
      infrastructureUsdPerRequest: Number(input.pricing.infrastructureUsdPerRequest ?? 0)
    },
    executionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function createOpenModelRuntimeExecutor({
  runtime,
  model,
  endpoint,
  apiStyle = 'CHAT_COMPLETIONS',
  pricing,
  enabled = false,
  apiKey = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 60_000
} = {}) {
  const plan = planOpenModelRuntime({ runtime, model, endpoint, apiStyle, pricing, enabled });
  const key = String(apiKey || '');
  return async function openModelRuntimeExecutor({ task, maxTokens, costCeilingCents } = {}) {
    if (!plan.ok) return plan;
    if (!enabled) return failure(['open-model-runtime-disabled']);
    if (typeof fetchImpl !== 'function') return failure(['fetch-implementation-required']);
    if (!task?.taskId || !task?.objective) return failure(['valid-agent-task-required']);
    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') return failure(['open-model-worker-only-accepts-local-preparation']);
    const outputLimit = integer(maxTokens, 1, 128_000);
    const costLimit = integer(costCeilingCents, 0, 10_000_000);
    if (outputLimit == null) return failure(['valid-max-output-tokens-required']);
    if (costLimit == null) return failure(['valid-cost-ceiling-required']);
    const estimatedInputTokens = Math.ceil(bytes(task) / 4);
    const estimatedUsd = ((estimatedInputTokens * Number(pricing.inputUsdPerMillion) + outputLimit * Number(pricing.outputUsdPerMillion)) / 1_000_000) + Number(pricing.infrastructureUsdPerRequest ?? 0);
    const estimatedCostCents = Math.ceil(estimatedUsd * 100 - 1e-12);
    if (estimatedCostCents > costLimit) return failure(['estimated-cost-exceeds-reserved-ceiling']);

    const body = requestBody({ task, model, maxTokens: outputLimit, apiStyle: apiStyle.toUpperCase() });
    if (bytes(body) > MAX_BODY_BYTES) return failure(['open-model-request-body-too-large']);
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;

    let response;
    let timeoutHandle;
    try {
      response = await Promise.race([
        fetchImpl(endpointFor(safeEndpoint(endpoint), apiStyle.toUpperCase()), { method: 'POST', headers, body: JSON.stringify(body) }),
        new Promise((_, reject) => { timeoutHandle = setTimeout(() => reject(Object.assign(new Error('request timeout'), { name: 'AbortError' })), timeoutMs); })
      ]);
    } catch (error) {
      return failure([error?.name === 'AbortError' ? 'open-model-runtime-timeout' : 'open-model-runtime-transport-failure'], 'CONFIRMED_FAILURE', { detail: text(error?.message, 500) });
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    const status = integer(response?.status, 0, 999) || 0;
    if (!response?.ok) {
      if (status === 429) return failure(['open-model-runtime-rate-limit-http-429']);
      if (status === 401 || status === 403) return failure([`open-model-runtime-http-${status}`, 'open-model-runtime-credential-rejected']);
      if (status >= 500) return failure([`open-model-runtime-http-${status}`, 'open-model-runtime-provider-outage']);
      return failure([`open-model-runtime-http-${status || 'unknown'}`]);
    }

    let raw;
    try {
      const rawText = await response.text();
      if (bytes(rawText) > MAX_RESPONSE_BYTES) return failure(['open-model-runtime-response-too-large']);
      raw = JSON.parse(rawText);
    } catch (error) {
      return failure(['open-model-runtime-response-json-invalid'], 'CONFIRMED_FAILURE', { detail: text(error?.message, 500) });
    }

    const observedModel = text(raw?.model, 400) || null;
    if (observedModel && observedModel !== model) {
      return failure(['open-model-runtime-model-identity-mismatch'], 'CONFIRMED_FAILURE', {
        configuredModel: model,
        observedModel,
        identityVerification: 'MISMATCH'
      });
    }

    const usage = meteredUsage(raw, pricing);
    if (!usage) return failure(['open-model-runtime-usage-invalid']);
    if (usage.costCents > costLimit) return failure(['actual-cost-exceeds-reserved-ceiling'], 'CONFIRMED_FAILURE', { usage });
    const bodyText = resultText(raw, apiStyle.toUpperCase());
    if (!bodyText) return failure(['open-model-runtime-structured-output-missing']);
    let result;
    try { result = JSON.parse(bodyText); }
    catch (error) { return failure(['open-model-runtime-structured-output-json-invalid'], 'CONFIRMED_FAILURE', { usage, detail: text(error?.message, 500) }); }

    return {
      ok: true,
      outcome: 'COMPLETED',
      runtime: runtime.toUpperCase(),
      configuredModel: model,
      observedModel,
      identityVerification: observedModel ? 'MATCHED' : 'UNVERIFIED',
      providerRequestId: text(raw?.id, 240) || null,
      usage,
      pricingEvidence: {
        sourceRef: text(pricing.sourceRef, 500),
        verifiedAt: text(pricing.verifiedAt, 80),
        costBasis: usage.costBasis
      },
      result,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  };
}
