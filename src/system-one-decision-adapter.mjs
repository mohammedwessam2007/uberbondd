// Provider-neutral System-One decision adapter with a direct TypeSafe/Jev transport.
//
// This module deliberately separates capability from authority. Constructing an
// adapter, compiling a question set, or inspecting readiness performs no network
// I/O. A provider call occurs only when the adapter is enabled AND the caller
// explicitly sets providerCallAuthorized=true. No business/external action is
// authorized by a semantic judgement.

import crypto from 'node:crypto';

export const SYSTEM_ONE_DECISION_ADAPTER_VERSION = 'uberbond.system-one-decision-adapter.v1';
export const TYPESAFE_DEFAULT_BASE_URL = 'https://api.typesafe.ai';
export const TYPESAFE_DEFAULT_MODEL = 'jev-latest';
export const TYPESAFE_SYSTEM_ONE_PATH = '/v1/systemone';
export const SYSTEM_ONE_MAX_QUESTIONS = 256;
export const SYSTEM_ONE_MAX_INPUT_BYTES = 512_000;
export const SYSTEM_ONE_MAX_RESPONSE_BYTES = 2_000_000;
export const SYSTEM_ONE_DEFAULT_TIMEOUT_MS = 10_000;

const QUESTION_TYPES = new Set(['noul', 'choice', 'score']);
const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

function fail(status, reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: SYSTEM_ONE_DECISION_ADAPTER_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

function safeBaseUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isJsonCompatible(value, depth = 0) {
  if (depth > 20) return false;
  if (value === null) return true;
  if (['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => isJsonCompatible(item, depth + 1));
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return false;
    return Object.entries(value).every(([key, child]) => typeof key === 'string' && isJsonCompatible(child, depth + 1));
  }
  return false;
}

function validateQuestion(name, question) {
  const reasons = [];
  if (!text(name, 120)) reasons.push('question-name-required');
  if (!question || typeof question !== 'object' || !QUESTION_TYPES.has(question.type)) reasons.push('valid-question-type-required');
  if (question && !isJsonCompatible(question.instructions ?? null)) reasons.push('question-instructions-must-be-json-compatible');
  if (question?.type === 'choice') {
    if (!question.criteria || Array.isArray(question.criteria) || typeof question.criteria !== 'object') reasons.push('choice-criteria-map-required');
    else if (Object.keys(question.criteria).length < 2) reasons.push('choice-requires-at-least-two-criteria');
    else if (!isJsonCompatible(question.criteria)) reasons.push('choice-criteria-must-be-json-compatible');
  }
  if (question?.type === 'score') {
    if (!Array.isArray(question.criteria) || question.criteria.length < 2) reasons.push('score-requires-at-least-two-criteria');
    else if (!isJsonCompatible(question.criteria)) reasons.push('score-criteria-must-be-json-compatible');
  }
  if (question?.type === 'noul' && question.criteria != null && !isJsonCompatible(question.criteria)) reasons.push('noul-criteria-must-be-json-compatible');
  return reasons.map(reason => `${name}:${reason}`);
}

export function noul(instructions = null, criteria = undefined) {
  return { type: 'noul', instructions, ...(criteria === undefined ? {} : { criteria }) };
}

export function choice(instructions, criteria) {
  return { type: 'choice', instructions, criteria };
}

export function score(instructions, criteria) {
  return { type: 'score', instructions, criteria };
}

export function compileSystemOneRequest({ state, questions = {}, model = TYPESAFE_DEFAULT_MODEL } = {}) {
  const reasons = [];
  if (!isJsonCompatible(state)) reasons.push('state-must-be-json-compatible');
  if (!questions || Array.isArray(questions) || typeof questions !== 'object') reasons.push('questions-map-required');
  const entries = questions && typeof questions === 'object' && !Array.isArray(questions) ? Object.entries(questions) : [];
  if (!entries.length) reasons.push('at-least-one-question-required');
  if (entries.length > SYSTEM_ONE_MAX_QUESTIONS) reasons.push('question-count-exceeds-bound');
  for (const [name, question] of entries) reasons.push(...validateQuestion(name, question));
  const selectedModel = text(model, 160);
  if (!selectedModel) reasons.push('model-required');
  const payload = { state, questions, model: selectedModel };
  const inputBytes = Buffer.byteLength(JSON.stringify(payload));
  if (inputBytes > SYSTEM_ONE_MAX_INPUT_BYTES) reasons.push('request-exceeds-byte-bound');
  if (reasons.length) return fail('SYSTEM_ONE_REQUEST_REFUSED', reasons, { inputBytes, questionCount: entries.length });
  return {
    ok: true,
    policyVersion: SYSTEM_ONE_DECISION_ADAPTER_VERSION,
    status: 'SYSTEM_ONE_REQUEST_COMPILED',
    payload,
    inputBytes,
    questionCount: entries.length,
    requestDigest: `sha256:${digest(payload)}`,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function pricingEvidence(pricing = {}) {
  const input = finite(pricing.inputUsdPerMillion);
  const output = finite(pricing.outputUsdPerMillion);
  const sourceRef = text(pricing.sourceRef, 500);
  const verifiedAt = text(pricing.verifiedAt, 80);
  const verifiedAtMs = Date.parse(verifiedAt);
  if (input == null || input < 0 || output == null || output < 0 || !sourceRef || !Number.isFinite(verifiedAtMs)) return null;
  return { inputUsdPerMillion: input, outputUsdPerMillion: output, sourceRef, verifiedAt: new Date(verifiedAtMs).toISOString() };
}

function meterUsage(rawUsage, pricing) {
  const inputTokens = finite(rawUsage?.input_tokens);
  const outputTokens = finite(rawUsage?.output_tokens);
  if (inputTokens == null || inputTokens < 0 || outputTokens == null || outputTokens < 0) return null;
  const costUsd = (inputTokens * pricing.inputUsdPerMillion + outputTokens * pricing.outputUsdPerMillion) / 1_000_000;
  return {
    inputTokens,
    outputTokens,
    costUsd,
    costCents: costUsd * 100
  };
}

function normalizeAnswer(question, answer) {
  if (!answer || typeof answer !== 'object' || answer.type !== question.type) return null;
  if (question.type === 'noul') {
    const probability = finite(answer.noul);
    if (probability == null || probability < 0 || probability > 1) return null;
    return { type: 'noul', probability, confidence: Math.abs(probability - 0.5) * 2 };
  }
  if (question.type === 'choice') {
    const selected = text(answer.choice, 160);
    const confidence = finite(answer.confidence);
    if (!selected || !(selected in question.criteria) || confidence == null || confidence < 0 || confidence > 1) return null;
    const probabilities = {};
    for (const label of Object.keys(question.criteria)) {
      const value = finite(answer.probabilities?.[label]);
      if (value == null || value < 0 || value > 1) return null;
      probabilities[label] = value;
    }
    return { type: 'choice', choice: selected, confidence, probabilities };
  }
  const expectedScore = finite(answer.score);
  const confidence = finite(answer.confidence);
  if (expectedScore == null || confidence == null || confidence < 0 || confidence > 1 || expectedScore < 0 || expectedScore > question.criteria.length - 1) return null;
  const probabilities = {};
  for (let i = 0; i < question.criteria.length; i++) {
    const value = finite(answer.probabilities?.[String(i)] ?? answer.probabilities?.[i]);
    if (value == null || value < 0 || value > 1) return null;
    probabilities[String(i)] = value;
  }
  return { type: 'score', score: expectedScore, confidence, probabilities, criteria: [...question.criteria] };
}

export function inspectSystemOneReadiness({
  provider = 'typesafe-direct', apiKey = '', enabled = false, pricing = null,
  baseUrl = TYPESAFE_DEFAULT_BASE_URL, model = TYPESAFE_DEFAULT_MODEL
} = {}) {
  const blockers = [];
  if (provider !== 'typesafe-direct') blockers.push('unsupported-provider');
  if (!text(apiKey, 10)) blockers.push('credential-absent');
  if (!pricingEvidence(pricing || {})) blockers.push('pricing-evidence-absent');
  if (enabled !== true) blockers.push('explicitly-disabled');
  if (!safeBaseUrl(baseUrl)) blockers.push('invalid-base-url');
  if (!text(model, 160)) blockers.push('model-identity-absent');
  return {
    ok: blockers.length === 0,
    policyVersion: SYSTEM_ONE_DECISION_ADAPTER_VERSION,
    status: blockers.length ? 'SYSTEM_ONE_PROVIDER_NOT_READY' : 'SYSTEM_ONE_PROVIDER_READY',
    provider,
    model: text(model, 160) || null,
    credentialPresent: Boolean(text(apiKey, 10)),
    pricingEvidencePresent: Boolean(pricingEvidence(pricing || {})),
    enabled: enabled === true,
    blockers,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function createSystemOneDecisionAdapter({
  provider = 'typesafe-direct',
  apiKey = '',
  baseUrl = TYPESAFE_DEFAULT_BASE_URL,
  model = TYPESAFE_DEFAULT_MODEL,
  enabled = false,
  pricing = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = SYSTEM_ONE_DEFAULT_TIMEOUT_MS
} = {}) {
  const resolvedBaseUrl = safeBaseUrl(baseUrl);
  const resolvedPricing = pricingEvidence(pricing || {});
  const readiness = () => inspectSystemOneReadiness({ provider, apiKey, enabled, pricing, baseUrl, model });

  async function evaluate({ state, questions, providerCallAuthorized = false, signal = null } = {}) {
    const compiled = compileSystemOneRequest({ state, questions, model });
    if (!compiled.ok) return compiled;
    const ready = readiness();
    if (!ready.ok) return fail('SYSTEM_ONE_PROVIDER_NOT_READY', ready.blockers, { provider, model: text(model, 160) || null, requestDigest: compiled.requestDigest });
    if (providerCallAuthorized !== true) return fail('SYSTEM_ONE_PROVIDER_CALL_NOT_AUTHORIZED', ['explicit-provider-call-authorization-required'], { provider, model, requestDigest: compiled.requestDigest });
    if (typeof fetchImpl !== 'function') return fail('SYSTEM_ONE_TRANSPORT_UNAVAILABLE', ['fetch-implementation-required']);

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal?.aborted) abortFromCaller();
    signal?.addEventListener?.('abort', abortFromCaller, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('system-one-timeout')), Math.max(1, Number(timeoutMs) || SYSTEM_ONE_DEFAULT_TIMEOUT_MS));
    const startedAt = Date.now();
    let response;
    try {
      response = await fetchImpl(`${resolvedBaseUrl}${TYPESAFE_SYSTEM_ONE_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'uberbond-system-one/1'
        },
        body: JSON.stringify(compiled.payload),
        signal: controller.signal
      });
    } catch (error) {
      return fail('SYSTEM_ONE_PROVIDER_OUTCOME_UNKNOWN', ['provider-call-failed-or-timed-out', 'no-blind-retry'], {
        provider,
        model,
        requestDigest: compiled.requestDigest,
        detail: text(error?.message, 300),
        uncertain: true,
        externalEffectLedger: { ...ZERO_EFFECTS, providerCalls: 1 }
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', abortFromCaller);
    }

    const httpStatus = Number(response?.status) || 0;
    let rawText = '';
    try { rawText = await response.text(); } catch { rawText = ''; }
    const responseBytes = Buffer.byteLength(rawText);
    if (responseBytes > SYSTEM_ONE_MAX_RESPONSE_BYTES) return fail('SYSTEM_ONE_PROVIDER_RESPONSE_REFUSED', ['response-exceeds-byte-bound'], { provider, httpStatus, responseBytes, externalEffectLedger: { ...ZERO_EFFECTS, providerCalls: 1 } });
    let raw;
    try { raw = rawText ? JSON.parse(rawText) : null; } catch { raw = null; }
    if (!response?.ok) {
      const reasons = [`provider-http-${httpStatus || 'unknown'}`];
      if ([401, 403].includes(httpStatus)) reasons.push('credential-rejected');
      if (httpStatus === 429) reasons.push('provider-rate-limited');
      if (httpStatus >= 500) reasons.push('provider-outage');
      return fail('SYSTEM_ONE_PROVIDER_REJECTED', reasons, {
        provider, httpStatus, requestDigest: compiled.requestDigest,
        uncertain: httpStatus >= 500,
        externalEffectLedger: { ...ZERO_EFFECTS, providerCalls: 1 }
      });
    }

    if (!raw || typeof raw !== 'object' || !raw.answers || typeof raw.answers !== 'object') return fail('SYSTEM_ONE_PROVIDER_RESPONSE_REFUSED', ['answers-map-required'], { provider, httpStatus, externalEffectLedger: { ...ZERO_EFFECTS, providerCalls: 1 } });
    const observedModel = text(raw.model, 160);
    if (!observedModel) return fail('SYSTEM_ONE_PROVIDER_RESPONSE_REFUSED', ['observed-model-required'], { provider, httpStatus, externalEffectLedger: { ...ZERO_EFFECTS, providerCalls: 1 } });
    const usage = meterUsage(raw.usage, resolvedPricing);
    if (!usage) return fail('SYSTEM_ONE_PROVIDER_RESPONSE_REFUSED', ['valid-token-usage-required'], { provider, httpStatus, externalEffectLedger: { ...ZERO_EFFECTS, providerCalls: 1 } });

    const answers = {};
    for (const [name, question] of Object.entries(compiled.payload.questions)) {
      const normalized = normalizeAnswer(question, raw.answers[name]);
      if (!normalized) return fail('SYSTEM_ONE_PROVIDER_RESPONSE_REFUSED', [`invalid-answer:${name}`], { provider, httpStatus, externalEffectLedger: { ...ZERO_EFFECTS, providerCalls: 1 } });
      answers[name] = normalized;
    }

    return {
      ok: true,
      policyVersion: SYSTEM_ONE_DECISION_ADAPTER_VERSION,
      status: 'SYSTEM_ONE_DECISION_OBSERVED',
      provider,
      requestedModel: model,
      observedModel,
      requestDigest: compiled.requestDigest,
      questionCount: compiled.questionCount,
      latencyMs: Date.now() - startedAt,
      answers,
      usage,
      pricingEvidence: resolvedPricing,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EFFECTS, providerCalls: 1, spendCents: usage.costCents }
    };
  }

  return Object.freeze({
    policyVersion: SYSTEM_ONE_DECISION_ADAPTER_VERSION,
    provider,
    model,
    readiness,
    evaluate
  });
}
