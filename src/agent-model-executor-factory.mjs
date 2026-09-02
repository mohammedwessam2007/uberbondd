// The one place that turns a worker's declared provider into a model executor.
//
// agent-worker-job requires a `modelExecutor` function per worker, and outside
// tests nothing built one: every caller in the repository was a test supplying
// its own stub. A worker configuration that arrives as data -- from an
// environment variable, a scheduler, a config file -- cannot carry a function,
// so without this there was no way to configure a worker at all from outside
// the process. The mesh was reachable only from a test file.
//
// Note the name: this is NOT the control plane's `adapterFactory`. That one
// produces a relay *transport* adapter (createTask/readTask) and lives in
// agent-relay-adapter-factory.mjs. This one produces the thing that actually
// calls a model. Conflating the two is easy and was worth naming apart.
//
// This composes the executors that already exist rather than adding a third
// way to reach a provider. It is deliberately thin: pick the executor for the
// declared provider, hand it the credential and pricing evidence from the
// environment, and let the executor enforce its own rules.
//
// Every provider stays DISABLED unless a credential AND pricing evidence are
// both present. A missing credential is not "run it for free" -- it is a
// refusal, surfaced as a reason code, because a worker that silently does
// nothing is indistinguishable from one that has no work.

import { createOpenAIAgentExecutor } from './openai-agent-executor.mjs';
import { createAnthropicAgentExecutor } from './anthropic-agent-executor.mjs';
import { createClaudeCodeSandboxExecutor } from './claude-code-sandbox-executor.mjs';
import { createVercelAIGatewayExecutor } from './vercel-ai-gateway-executor.mjs';

export const AGENT_MODEL_EXECUTOR_FACTORY_POLICY_VERSION = 'agent-model-executor-factory-1.0.0';

const API_PROVIDERS = Object.freeze(['openai', 'anthropic']);
const SANDBOX_PROVIDER = 'claude-code-sandbox';

// The gateway is a fourth lane, added rather than substituted.
//
// It is deliberately NOT in API_PROVIDERS. That list is read by
// `describeProviderReadiness`, whose output feeds `composeActivationInput` and
// therefore the activation gate's provider map. Silently growing it would
// change what the gate scores without anyone deciding to, which is the shape of
// change this project treats as a widening. The gateway row is opt-in, and the
// default readiness answer is byte-identical to what it has always been.
//
// Its env prefix is AI_GATEWAY, not the provider id upper-cased: the credential
// is Vercel's `AI_GATEWAY_API_KEY`, and inventing `VERCEL_AI_GATEWAY_API_KEY`
// to match a naming rule would name a variable that does not exist.
const GATEWAY_PROVIDER = 'vercel-ai-gateway';
const GATEWAY_ENV_PREFIX = 'AI_GATEWAY';
const SUPPORTED_PROVIDERS = Object.freeze([...API_PROVIDERS, SANDBOX_PROVIDER, GATEWAY_PROVIDER]);

function pricingFrom(env, prefix) {
  const input = Number(env[`${prefix}_INPUT_USD_PER_MILLION`]);
  const output = Number(env[`${prefix}_OUTPUT_USD_PER_MILLION`]);
  const sourceRef = String(env[`${prefix}_PRICING_SOURCE`] || '').trim();
  const verifiedAt = String(env[`${prefix}_PRICING_VERIFIED_AT`] || '').trim();
  // Pricing is evidence, not a guess. Without a source reference and a date,
  // any cost this executor reports would be a number the system invented, and
  // the compute ledger would be quietly fictional.
  if (!Number.isFinite(input) || !Number.isFinite(output) || !sourceRef || !verifiedAt) return null;
  return { inputUsdPerMillion: input, outputUsdPerMillion: output, sourceRef, verifiedAt };
}

/**
 * Build the per-worker `modelExecutor` resolver.
 *
 * Returns a function of (worker) -> model executor. It throws for an
 * unconfigured provider rather than returning a no-op, so the failure is
 * attributable instead of appearing as a worker that found nothing to do.
 */
export function createModelExecutorFactory({ env = process.env, sandboxIsolationReceipt = null } = {}) {
  return function modelExecutorFor(worker = {}) {
    const provider = String(worker.provider || '').trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      throw new Error(`unsupported provider "${provider}"; supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }

    if (provider === SANDBOX_PROVIDER) {
      // The Claude Code CLI reports its own token usage and total cost, so this
      // provider needs no pricing evidence env: the number comes from the tool
      // that spent it, which is better evidence than a hand-entered price. The
      // executor refuses with UNCERTAIN when the CLI reports no cost, so a call
      // whose spend is unknown never looks like a free one.
      //
      // This is a local process, not free compute. It still consumes whatever
      // Claude Code account it is configured against.
      const sandboxRoot = String(env.CLAUDE_CODE_SANDBOX_ROOT || '').trim();
      if (!sandboxRoot) throw new Error('claude-code-sandbox worker configured but CLAUDE_CODE_SANDBOX_ROOT is absent');
      if (!sandboxIsolationReceipt) {
        throw new Error('claude-code-sandbox worker configured but no OS isolation receipt was supplied');
      }
      return createClaudeCodeSandboxExecutor({
        enabled: env.CLAUDE_CODE_SANDBOX_ENABLED === 'true',
        sandboxRoot,
        isolationReceipt: sandboxIsolationReceipt,
        env,
        ...(env.CLAUDE_CODE_EXECUTABLE ? { executable: String(env.CLAUDE_CODE_EXECUTABLE) } : {}),
        ...(worker.model ? { defaultModel: worker.model } : {})
      });
    }

    if (provider === GATEWAY_PROVIDER) {
      // One credential in front of many providers. That is the point -- it is
      // the smallest thing that gives `executeWithFailover` somewhere to fail
      // over TO -- and it is also the hazard, because a lane that fronts many
      // models makes "the model I asked for answered" an assumption. The
      // executor refuses to claim that without response evidence.
      const apiKey = String(env.AI_GATEWAY_API_KEY || '');
      const pricing = pricingFrom(env, GATEWAY_ENV_PREFIX);
      if (!apiKey) throw new Error('vercel-ai-gateway worker configured but AI_GATEWAY_API_KEY is absent');
      if (!pricing) throw new Error('vercel-ai-gateway worker configured but pricing evidence is absent or incomplete');
      const timeoutMs = Number(env.AI_GATEWAY_TIMEOUT_MS);
      return createVercelAIGatewayExecutor({
        apiKey,
        pricing,
        enabled: env.AI_GATEWAY_AGENT_ENABLED === 'true',
        gatewayProvider: String(env.AI_GATEWAY_DEFAULT_PROVIDER || '').trim(),
        ...(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
        ...(worker.model ? { defaultModel: worker.model } : {})
      });
    }

    if (provider === 'openai') {
      const apiKey = String(env.OPENAI_API_KEY || '');
      const pricing = pricingFrom(env, 'OPENAI');
      if (!apiKey) throw new Error('openai worker configured but OPENAI_API_KEY is absent');
      if (!pricing) throw new Error('openai worker configured but pricing evidence is absent or incomplete');
      return createOpenAIAgentExecutor({
        apiKey,
        pricing,
        enabled: env.OPENAI_AGENT_ENABLED === 'true',
        ...(worker.model ? { defaultModel: worker.model } : {})
      });
    }

    const apiKey = String(env.ANTHROPIC_API_KEY || '');
    const pricing = pricingFrom(env, 'ANTHROPIC');
    if (!apiKey) throw new Error('anthropic worker configured but ANTHROPIC_API_KEY is absent');
    if (!pricing) throw new Error('anthropic worker configured but pricing evidence is absent or incomplete');
    return createAnthropicAgentExecutor({
      apiKey,
      pricing,
      enabled: env.ANTHROPIC_AGENT_ENABLED === 'true',
      ...(worker.model ? { defaultModel: worker.model } : {})
    });
  };
}

/**
 * The gateway lane's readiness, on its own.
 *
 * Separate from `describeProviderReadiness` on purpose. That function's array
 * is consumed positionally by existing tests and, more importantly, is turned
 * into the activation gate's provider map by `composeActivationInput`. Appending
 * a row by default would change what the gate scores as a side effect of adding
 * a lane, so the gateway is asked for explicitly or not at all.
 */
export function describeGatewayProviderReadiness({ env = process.env } = {}) {
  const hasKey = Boolean(String(env.AI_GATEWAY_API_KEY || ''));
  const pricing = pricingFrom(env, GATEWAY_ENV_PREFIX);
  const enabled = env.AI_GATEWAY_AGENT_ENABLED === 'true';
  const blockers = [];
  if (!hasKey) blockers.push('credential-absent');
  if (!pricing) blockers.push('pricing-evidence-absent');
  if (!enabled) blockers.push('explicitly-disabled');
  return {
    provider: GATEWAY_PROVIDER,
    ready: blockers.length === 0,
    blockers,
    // Presence only. The value never leaves the environment it was read from.
    credentialPresent: hasKey,
    pricingEvidencePresent: Boolean(pricing),
    // Which providers sit behind the one credential is a Vercel dashboard fact,
    // not a repository fact. Claiming a list here would be inventing coverage.
    fanOutProvidersKnownToThisProcess: false
  };
}

/** Which providers this environment could actually drive, and why not if not. */
export function describeProviderReadiness({ env = process.env, sandboxIsolationReceipt = null, includeGateway = false } = {}) {
  const api = API_PROVIDERS.map(provider => {
    const prefix = provider.toUpperCase();
    const hasKey = Boolean(String(env[`${prefix}_API_KEY`] || ''));
    const pricing = pricingFrom(env, prefix);
    const enabled = env[`${prefix}_AGENT_ENABLED`] === 'true';
    const blockers = [];
    if (!hasKey) blockers.push('credential-absent');
    if (!pricing) blockers.push('pricing-evidence-absent');
    if (!enabled) blockers.push('explicitly-disabled');
    return {
      provider,
      ready: blockers.length === 0,
      blockers,
      // Never report the credential itself, only that one exists.
      credentialPresent: hasKey,
      pricingEvidencePresent: Boolean(pricing)
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
    // The CLI reports its own spend, so there is no separate pricing evidence
    // to be present or absent. Saying "true" here would claim a check that was
    // never made; the field means "cost is attributable", and it is.
    credentialPresent: sandboxRoot && isolation,
    pricingEvidencePresent: true
  },
  // Appended last, and only on request, so the three historical rows keep their
  // positions for every caller that reads them by index.
  ...(includeGateway ? [describeGatewayProviderReadiness({ env })] : [])];
}
