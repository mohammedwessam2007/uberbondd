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

export const AGENT_MODEL_EXECUTOR_FACTORY_POLICY_VERSION = 'agent-model-executor-factory-1.1.0';

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
  })
});

const API_PROVIDERS = Object.freeze(Object.keys(API_PROVIDER_CONFIG));
const SANDBOX_PROVIDER = 'claude-code-sandbox';
const SUPPORTED_PROVIDERS = Object.freeze([...API_PROVIDERS, SANDBOX_PROVIDER]);

export function pricingFrom(env = {}, prefix = '') {
  const input = Number(env[`${prefix}_INPUT_USD_PER_MILLION`]);
  const output = Number(env[`${prefix}_OUTPUT_USD_PER_MILLION`]);
  const sourceRef = String(env[`${prefix}_PRICING_SOURCE`] || '').trim();
  const verifiedAtRaw = String(env[`${prefix}_PRICING_VERIFIED_AT`] || '').trim();
  if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0 || !sourceRef || !verifiedAtRaw) return null;
  const verifiedAtMs = Date.parse(verifiedAtRaw);
  if (!Number.isFinite(verifiedAtMs)) return null;
  return {
    inputUsdPerMillion: input,
    outputUsdPerMillion: output,
    sourceRef,
    verifiedAt: new Date(verifiedAtMs).toISOString()
  };
}

function apiProviderConfig(env, provider) {
  const mapping = API_PROVIDER_CONFIG[provider];
  if (!mapping) return null;
  return {
    apiKey: String(env[mapping.apiKeyEnv] || ''),
    pricing: pricingFrom(env, mapping.prefix),
    enabled: env[mapping.enabledEnv] === 'true'
  };
}

/** Build the per-worker model executor resolver. */
export function createModelExecutorFactory({ env = process.env, sandboxIsolationReceipt = null } = {}) {
  return function modelExecutorFor(worker = {}) {
    const provider = String(worker.provider || '').trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new Error(`unsupported provider "${provider}"; supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }

    if (provider === SANDBOX_PROVIDER) {
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

    const config = apiProviderConfig(env, provider);
    if (!config?.apiKey) throw new Error(`${provider} worker configured but credential is absent`);
    if (!config.pricing) throw new Error(`${provider} worker configured but pricing evidence is absent or incomplete`);

    if (provider === 'openai') {
      return createOpenAIAgentExecutor({
        apiKey: config.apiKey,
        pricing: config.pricing,
        enabled: config.enabled,
        ...(worker.model ? { defaultModel: worker.model } : {})
      });
    }

    if (provider === 'anthropic') {
      return createAnthropicAgentExecutor({
        apiKey: config.apiKey,
        pricing: config.pricing,
        enabled: config.enabled,
        ...(worker.model ? { defaultModel: worker.model } : {})
      });
    }

    return createVercelAIGatewayExecutor({
      apiKey: config.apiKey,
      pricing: config.pricing,
      enabled: config.enabled,
      defaultModel: worker.model || env.AI_GATEWAY_MODEL || 'openai/gpt-5.4'
    });
  };
}

/** Which providers this environment could actually drive, and why not if not. */
export function describeProviderReadiness({ env = process.env, sandboxIsolationReceipt = null } = {}) {
  const api = API_PROVIDERS.map(provider => {
    const config = apiProviderConfig(env, provider);
    const blockers = [];
    if (!config?.apiKey) blockers.push('credential-absent');
    if (!config?.pricing) blockers.push('pricing-evidence-absent');
    if (!config?.enabled) blockers.push('explicitly-disabled');
    return {
      provider,
      ready: blockers.length === 0,
      blockers,
      credentialPresent: Boolean(config?.apiKey),
      pricingEvidencePresent: Boolean(config?.pricing)
    };
  });

  const sandboxRoot = Boolean(String(env.CLAUDE_CODE_SANDBOX_ROOT || '').trim());
  const isolation = Boolean(sandboxIsolationReceipt);
  const sandboxEnabled = env.CLAUDE_CODE_SANDBOX_ENABLED === 'true';
  const sandboxBlockers = [];
  if (!sandboxRoot) sandboxBlockers.push('sandbox-root-absent');
  if (!isolation) sandboxBlockers.push('isolation-receipt-absent');
  if (!sandboxEnabled) sandboxBlockers.push('explicitly-disabled');

  return [...api, {
    provider: SANDBOX_PROVIDER,
    ready: sandboxBlockers.length === 0,
    blockers: sandboxBlockers,
    credentialPresent: sandboxRoot && isolation,
    pricingEvidencePresent: true
  }];
}
