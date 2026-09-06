export const SELF_MAINTAINER_FREE_AI_PROFILE_VERSION = 'self-maintainer-free-ai-profile-1.0.0';

// Official Vercel AI Gateway model page, re-verified 2026-09-07. The model page
// explicitly lists both input and output pricing as Free and positions M2.7 for
// real-world software engineering. This profile is deliberately immutable and
// lives under .github/workflows so the autonomous change path cannot rewrite
// the model identity or convert a zero-cost profile into paid compute.
export const SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE = Object.freeze({
  provider: 'ai-gateway',
  model: 'minimax/minimax-m2.7-free',
  inputUsdPerMillion: 0,
  outputUsdPerMillion: 0,
  pricingSource: 'https://vercel.com/ai-gateway/models/minimax-m2.7-free',
  pricingVerifiedAt: '2026-09-07T00:00:00.000Z',
  businessEffectAuthority: 'NONE',
  spendCeilingCents: 0
});

/**
 * Build the environment seen only by the OIDC-authenticated self-maintainer
 * proposal runtime. The profile cannot be overridden by project env vars:
 * paid-model drift, stale global pricing, or a broad agent-enable toggle may
 * not widen this zero-cost engineering lane. Credential presence is NOT
 * manufactured here; the canonical factory still requires either the existing
 * AI_GATEWAY_API_KEY or Vercel's deployment-scoped VERCEL_OIDC_TOKEN.
 */
export function selfMaintainerFreeAiRuntimeEnv(env = process.env) {
  return {
    ...env,
    AI_GATEWAY_AGENT_ENABLED: 'true',
    AI_GATEWAY_MODEL: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model,
    AI_GATEWAY_INPUT_USD_PER_MILLION: String(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.inputUsdPerMillion),
    AI_GATEWAY_OUTPUT_USD_PER_MILLION: String(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.outputUsdPerMillion),
    AI_GATEWAY_PRICING_SOURCE: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.pricingSource,
    AI_GATEWAY_PRICING_VERIFIED_AT: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.pricingVerifiedAt
  };
}
