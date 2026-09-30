// The one place that turns a worker's declared provider into a model executor.
//
// Provider readiness is evidence, not naming convention. Each provider maps to
// its exact protected runtime variables so an identifier such as `ai-gateway`
// can never accidentally become the nonexistent `AI-GATEWAY_*` environment
// prefix. Capability never creates authority and no credential value is ever
// returned by the readiness surface.

import { createOpenAIAgentExecutor } from './openai-agent-executor.mjs';
import { createAnthropicAgentExecutor } from './anthropic-agent-executor.mjs';
import { createClaudeCodeSandboxExecutor } from './claude-code-sandbox-executor.mjs';
import { createVercelAIGatewayExecutor } from './vercel-ai-gateway-executor.mjs';
import { createOpenModelRuntimeExecutor } from './open-model-runtime-executor.mjs';
import { createOpenRouterAgentExecutor } from './openrouter-agent-executor.mjs';

export const AGENT_MODEL_EXECUTOR_FACTORY_POLICY_VERSION = 'agent-model-executor-factory-1.7.0';
const canonicalModelExecutorFactories = new WeakSet();

const API_PROVIDER_CONFIG = Object.freeze({
  openai: Object.freeze({
    prefix: 'OPENAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    enabledEnv: 'OPENAI_AGENT_ENABLED'
  }),
  anthropic: Object.freeze({
    prefix: 'ANTHROPIC',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    enabledEnv: 'ANTHROPIC_AGENT_ENABLED'
  }),
  'ai-gateway': Object.freeze({
    prefix: 'AI_GATEWAY',
    apiKeyEnv: 'AI_GATEWAY_API_KEY',
    enabledEnv: 'AI_GATEWAY_AGENT_ENABLED'
  }),
  openrouter: Object.freeze({
    prefix: 'OPENROUTER',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    enabledEnv: 'OPENROUTER_AGENT_ENABLED'
  })
});

const API_PROVIDERS = Object.freeze(Object.keys(API_PROVIDER_CONFIG));
const OPEN_MODEL_PROVIDER = 'open-model';
const SANDBOX_PROVIDER = 'claude-code-sandbox';
const SUPPORTED_PROVIDERS = Object.freeze([...API_PROVIDERS, OPEN_MODEL_PROVIDER, SANDBOX_PROVIDER]);
const CASH_PERIMETER_MODES = new Set(['', 'OPENROUTER_ONLY']);
function cashPerimeterMode(env = {}) {
  const mode = String(env.INFINITE_OPUS_CASH_ROUTE_MODE || '').trim().toUpperCase();
  if (!CASH_PERIMETER_MODES.has(mode)) throw new Error('unsupported Infinite Opus cash perimeter mode');
  return mode;
}
function zeroCashPricing(pricing) {
  return pricing && Number(pricing.inputUsdPerMillion) === 0 && Number(pricing.outputUsdPerMillion) === 0
    && Number(pricing.infrastructureUsdPerRequest ?? 0) === 0;
}
function assertCashPerimeter(env, provider, pricing = null) {
  const mode = cashPerimeterMode(env);
  if (mode !== 'OPENROUTER_ONLY') return;
  if (provider === 'openrouter' || provider === SANDBOX_PROVIDER) return;
  if (provider === OPEN_MODEL_PROVIDER && zeroCashPricing(pricing)) return;
  throw new Error(`provider "${provider}" blocked by Infinite Opus OpenRouter-only cash perimeter`);
}

export function pricingFrom(env = {}, prefix = '') {
  const input = Number(env[`${prefix}_INPUT_USD_PER_MILLION`]);
  const output = Number(env[`${prefix}_OUTPUT_USD_PER_MILLION`]);
  const sourceRef = String(env[`${prefix}_PRICING_SOURCE`] || '').trim();
  const verifiedAtRaw = String(env[`${prefix}_PRICING_VERIFIED_AT`] || '').trim();
  if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0 || !sourceRef || !verifiedAtRaw) return null;
  const verifiedAtMs = Date.parse(verifiedAtRaw);
  if (!Number.isFinite(verifiedAtMs)) return null;
  const base = {
    inputUsdPerMillion: input,
    outputUsdPerMillion: output,
    sourceRef,
    verifiedAt: new Date(verifiedAtMs).toISOString()
  };
  const cacheWriteRaw = env[`${prefix}_CACHE_WRITE_USD_PER_MILLION`];
  const cacheReadRaw = env[`${prefix}_CACHE_READ_USD_PER_MILLION`];
  if (cacheWriteRaw == null && cacheReadRaw == null) return base;
  const cacheWrite = Number(cacheWriteRaw);
  const cacheRead = Number(cacheReadRaw);
  if (!Number.isFinite(cacheWrite) || cacheWrite < 0 || !Number.isFinite(cacheRead) || cacheRead < 0) return null;
  return { ...base, cacheWriteUsdPerMillion: cacheWrite, cacheReadUsdPerMillion: cacheRead };
}

function pricingEvidenceFromObject(raw = {}) {
  const input = Number(raw?.inputUsdPerMillion);
  const output = Number(raw?.outputUsdPerMillion);
  const sourceRef = String(raw?.sourceRef || '').trim();
  const verifiedAtRaw = String(raw?.verifiedAt || '').trim();
  if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0 || !sourceRef || !Number.isFinite(Date.parse(verifiedAtRaw))) return null;
  const out = {
    inputUsdPerMillion: input,
    outputUsdPerMillion: output,
    sourceRef,
    verifiedAt: new Date(Date.parse(verifiedAtRaw)).toISOString()
  };
  if (raw?.cacheReadUsdPerMillion != null) {
    const cacheRead = Number(raw.cacheReadUsdPerMillion);
    if (!Number.isFinite(cacheRead) || cacheRead < 0) return null;
    out.cacheReadUsdPerMillion = cacheRead;
  }
  return out;
}

function openModelPricingFrom(env = {}) {
  const base = pricingFrom(env, 'OPEN_MODEL');
  const infrastructureUsdPerRequest = Number(env.OPEN_MODEL_INFRASTRUCTURE_USD_PER_REQUEST ?? 0);
  if (!base || !Number.isFinite(infrastructureUsdPerRequest) || infrastructureUsdPerRequest < 0) return null;
  return { ...base, infrastructureUsdPerRequest };
}

function apiProviderConfig(env, provider, worker = {}) {
  const mapping = API_PROVIDER_CONFIG[provider];
  if (!mapping) return null;
  const staticCredential = String(env[mapping.apiKeyEnv] || '');
  // Vercel injects a short-lived OIDC identity into deployed workloads. AI
  // Gateway accepts that bearer in place of a static API key, so the canonical
  // runtime can stay keyless in production while preserving the exact same
  // provider/model/revision and spend-evidence gates. Never use OIDC as a
  // fallback for OpenAI/Anthropic direct adapters; it is Vercel-scoped only.
  const vercelOidcCredential = provider === 'ai-gateway'
    ? String(env.VERCEL_OIDC_TOKEN || '')
    : '';
  const requestedServiceTier = String(worker?.serviceTier || '').trim().toLowerCase();
  const basePricing = provider === 'openrouter'
    ? (pricingEvidenceFromObject(worker?.pricing) || pricingFrom(env, mapping.prefix))
    : pricingFrom(env, mapping.prefix);
  const tierPricing = provider === 'openai' && requestedServiceTier === 'flex'
    ? pricingFrom(env, 'OPENAI_FLEX')
    : null;
  return {
    apiKey: staticCredential || vercelOidcCredential,
    pricing: tierPricing || basePricing,
    pricingTier: tierPricing ? 'FLEX_VERIFIED' : 'BASE_VERIFIED',
    requestedServiceTier: requestedServiceTier || null,
    enabled: env[mapping.enabledEnv] === 'true'
  };
}

function openModelProviderConfig(env, worker = {}) {
  return {
    runtime: String(env.OPEN_MODEL_RUNTIME || '').trim().toUpperCase(),
    model: String(worker.model || env.OPEN_MODEL_MODEL || '').trim(),
    endpoint: String(env.OPEN_MODEL_ENDPOINT || '').trim(),
    apiStyle: String(env.OPEN_MODEL_API_STYLE || 'CHAT_COMPLETIONS').trim().toUpperCase(),
    apiKey: String(env.OPEN_MODEL_API_KEY || ''),
    pricing: openModelPricingFrom(env),
    enabled: env.OPEN_MODEL_AGENT_ENABLED === 'true'
  };
}

function workerReasoningEffort(worker = {}) {
  const raw = String(worker.reasoningEffort || '').trim().toLowerCase();
  return raw || null;
}

function workerServiceTier(worker = {}) {
  const raw = String(worker.serviceTier || '').trim().toLowerCase();
  return raw || null;
}

/** Build the per-worker model executor resolver. */
export function createModelExecutorFactory({ env = process.env, sandboxIsolationReceipt = null, fetchImpl = globalThis.fetch } = {}) {
  const modelExecutorFor = function modelExecutorFor(worker = {}) {
    const provider = String(worker.provider || '').trim().toLowerCase();
    const reasoningEffort = workerReasoningEffort(worker);
    const serviceTier = workerServiceTier(worker);
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new Error(`unsupported provider "${provider}"; supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }

    if (provider === SANDBOX_PROVIDER) {
      assertCashPerimeter(env, provider);
      if (reasoningEffort || serviceTier) throw new Error('reasoning/service-tier setting not supported by canonical claude-code-sandbox executor');
      const sandboxRoot = String(env.CLAUDE_CODE_SANDBOX_ROOT || '').trim();
      if (!sandboxRoot) throw new Error('claude-code-sandbox worker configured but CLAUDE_CODE_SANDBOX_ROOT is absent');
      if (!sandboxIsolationReceipt) throw new Error('claude-code-sandbox worker configured but no OS isolation receipt was supplied');
      return createClaudeCodeSandboxExecutor({
        enabled: env.CLAUDE_CODE_SANDBOX_ENABLED === 'true',
        sandboxRoot,
        isolationReceipt: sandboxIsolationReceipt,
        env,
        ...(env.CLAUDE_CODE_EXECUTABLE ? { executable: String(env.CLAUDE_CODE_EXECUTABLE) } : {}),
        ...(worker.model ? { defaultModel: worker.model } : {})
      });
    }

    if (provider === OPEN_MODEL_PROVIDER) {
      if (reasoningEffort || serviceTier) throw new Error('reasoning/service-tier setting not supported by canonical open-model executor');
      const config = openModelProviderConfig(env, worker);
      if (!config.runtime) throw new Error('open-model worker configured but OPEN_MODEL_RUNTIME is absent');
      if (!config.model) throw new Error('open-model worker configured but model identity is absent');
      if (!config.endpoint) throw new Error('open-model worker configured but OPEN_MODEL_ENDPOINT is absent');
      if (!config.pricing) throw new Error('open-model worker configured but pricing evidence is absent or incomplete');
      assertCashPerimeter(env, provider, config.pricing);
      return createOpenModelRuntimeExecutor({
        runtime: config.runtime,
        model: config.model,
        endpoint: config.endpoint,
        apiStyle: config.apiStyle,
        apiKey: config.apiKey,
        pricing: config.pricing,
        enabled: config.enabled,
        fetchImpl
      });
    }

    const config = apiProviderConfig(env, provider, worker);
    if (!config?.apiKey) throw new Error(`${provider} worker configured but credential is absent`);
    if (!config.pricing) throw new Error(`${provider} worker configured but pricing evidence is absent or incomplete`);
    assertCashPerimeter(env, provider, config.pricing);

    if (provider === 'openai') {
      return createOpenAIAgentExecutor({
        apiKey: config.apiKey,
        pricing: config.pricing,
        enabled: config.enabled,
        fetchImpl,
        ...(worker.model ? { defaultModel: worker.model } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(serviceTier ? { serviceTier } : {})
      });
    }

    if (provider === 'anthropic') {
      if (serviceTier) throw new Error('service-tier setting not supported by canonical anthropic executor');
      return createAnthropicAgentExecutor({
        apiKey: config.apiKey,
        pricing: config.pricing,
        enabled: config.enabled,
        fetchImpl,
        ...(worker.model ? { defaultModel: worker.model } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {})
      });
    }

    if (provider === 'openrouter') {
      if (serviceTier) throw new Error('service-tier setting not supported by canonical OpenRouter executor');
      const providerSort = String(worker.providerSort || env.OPENROUTER_PROVIDER_SORT || 'price').trim().toLowerCase();
      const requireZdr = String(env.OPENROUTER_REQUIRE_ZDR ?? 'true').toLowerCase() !== 'false';
      const allowProviderFallbacks = String(env.OPENROUTER_ALLOW_PROVIDER_FALLBACKS ?? 'true').toLowerCase() !== 'false';
      const maxPromptPriceRaw = worker.maxPromptPrice ?? env.OPENROUTER_MAX_PROMPT_USD_PER_MILLION;
      const maxCompletionPriceRaw = worker.maxCompletionPrice ?? env.OPENROUTER_MAX_COMPLETION_USD_PER_MILLION;
      return createOpenRouterAgentExecutor({
        apiKey: config.apiKey,
        pricing: config.pricing,
        enabled: config.enabled,
        fetchImpl,
        defaultModel: worker.model,
        providerSort,
        requireZdr,
        allowProviderFallbacks,
        ...(maxPromptPriceRaw !== '' && maxPromptPriceRaw != null ? { maxPromptPrice: Number(maxPromptPriceRaw) } : {}),
        ...(maxCompletionPriceRaw !== '' && maxCompletionPriceRaw != null ? { maxCompletionPrice: Number(maxCompletionPriceRaw) } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {})
      });
    }

    if (serviceTier) throw new Error('service-tier setting not supported by canonical ai-gateway executor');
    return createVercelAIGatewayExecutor({
      apiKey: config.apiKey,
      pricing: config.pricing,
      enabled: config.enabled,
      fetchImpl,
      defaultModel: worker.model || env.AI_GATEWAY_MODEL || 'openai/gpt-5.4',
      ...(reasoningEffort ? { reasoningEffort } : {})
    });
  };
  canonicalModelExecutorFactories.add(modelExecutorFor);
  return modelExecutorFor;
}

export function isCanonicalModelExecutorFactory(value) {
  return typeof value === 'function' && canonicalModelExecutorFactories.has(value);
}

/** Which providers this environment could actually drive, and why not if not. */
export function describeProviderReadiness({ env = process.env, sandboxIsolationReceipt = null } = {}) {
  const api = API_PROVIDERS.map(provider => {
    const config = apiProviderConfig(env, provider);
    const blockers = [];
    if (!config?.apiKey) blockers.push('credential-absent');
    if (provider !== 'openrouter' && !config?.pricing) blockers.push('pricing-evidence-absent');
    if (!config?.enabled) blockers.push('explicitly-disabled');
    if (cashPerimeterMode(env) === 'OPENROUTER_ONLY' && provider !== 'openrouter') blockers.push('infinite-opus-openrouter-only-cash-perimeter');
    return {
      provider,
      ready: blockers.length === 0,
      blockers,
      credentialPresent: Boolean(config?.apiKey),
      pricingEvidencePresent: Boolean(config?.pricing),
      ...(provider === 'openrouter' ? { pricingEvidenceMode: 'PER_MODEL_REQUIRED_AT_EXECUTION' } : {})
    };
  });

  const openModel = openModelProviderConfig(env);
  const openModelBlockers = [];
  if (!openModel.runtime) openModelBlockers.push('runtime-absent');
  if (!openModel.model) openModelBlockers.push('model-identity-absent');
  if (!openModel.endpoint) openModelBlockers.push('runtime-endpoint-absent');
  if (!openModel.pricing) openModelBlockers.push('pricing-evidence-absent');
  if (!openModel.enabled) openModelBlockers.push('explicitly-disabled');
  if (cashPerimeterMode(env) === 'OPENROUTER_ONLY' && !zeroCashPricing(openModel.pricing)) openModelBlockers.push('infinite-opus-nonzero-open-model-cost-blocked');

  const sandboxRoot = Boolean(String(env.CLAUDE_CODE_SANDBOX_ROOT || '').trim());
  const isolation = Boolean(sandboxIsolationReceipt);
  const sandboxEnabled = env.CLAUDE_CODE_SANDBOX_ENABLED === 'true';
  const sandboxBlockers = [];
  if (!sandboxRoot) sandboxBlockers.push('sandbox-root-absent');
  if (!isolation) sandboxBlockers.push('isolation-receipt-absent');
  if (!sandboxEnabled) sandboxBlockers.push('explicitly-disabled');

  return [...api, {
    provider: OPEN_MODEL_PROVIDER,
    ready: openModelBlockers.length === 0,
    blockers: openModelBlockers,
    credentialPresent: Boolean(openModel.apiKey),
    credentialRequired: false,
    pricingEvidencePresent: Boolean(openModel.pricing),
    runtimePresent: Boolean(openModel.runtime),
    modelIdentityPresent: Boolean(openModel.model),
    endpointPresent: Boolean(openModel.endpoint)
  }, {
    provider: SANDBOX_PROVIDER,
    ready: sandboxBlockers.length === 0,
    blockers: sandboxBlockers,
    credentialPresent: sandboxRoot && isolation,
    pricingEvidencePresent: true
  }];
}
