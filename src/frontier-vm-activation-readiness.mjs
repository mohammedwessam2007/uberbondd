import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { qualityInvariantAttestation } from './absolute-frontier-quality-invariant.mjs';

export const FRONTIER_VM_ACTIVATION_READINESS_VERSION = 'uberbond.frontier-vm-activation-readiness.v1';

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const truthy = value => ['1','true','yes','on'].includes(String(value ?? '').trim().toLowerCase());

function envelope(extra = {}) {
  return {
    readinessVersion: FRONTIER_VM_ACTIVATION_READINESS_VERSION,
    absoluteQualityInvariant: qualityInvariantAttestation(),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    spendAuthority: 'NONE',
    providerCallAuthority: 'NONE',
    ...extra
  };
}

export function assessFrontierVmActivationReadiness({
  mode = 'INTERACTIVE',
  env = {},
  campaignConfig = {},
  cloudConfig = {},
  sourceReady = true
} = {}) {
  const normalizedMode = text(mode, 40).toUpperCase();
  const blockers = [];
  const warnings = [];

  if (!['INTERACTIVE','UNATTENDED','ALL'].includes(normalizedMode)) blockers.push('RECOGNIZED_ACTIVATION_MODE_REQUIRED');
  if (!sourceReady) blockers.push('SOURCE_VERIFICATION_REQUIRED');

  const apiKeyPresent = Boolean(text(env.OPENROUTER_API_KEY, 5000));
  const crownSnapshotPresent = Boolean(text(env.UBERMIND_LIVE_CROWN_SNAPSHOT_REF, 2000));
  const freshTaskSourcePresent = Boolean(text(env.UBERMIND_FRESH_TASK_SOURCE_REF, 2000));

  if (!apiKeyPresent) blockers.push('OPENROUTER_API_KEY_REQUIRED');
  if (!crownSnapshotPresent) blockers.push('LIVE_CROWN_SNAPSHOT_REF_REQUIRED');
  if (!freshTaskSourcePresent) blockers.push('FRESH_TASK_SOURCE_REF_REQUIRED');

  const configuredBudget = finite(
    env.UBERMIND_MONTHLY_COGNITION_BUDGET_USD
      ?? campaignConfig?.budget?.monthlyAllInTargetUsd
      ?? cloudConfig?.requiredResources?.find?.(r => r.id === 'cognition-budget')?.default,
    0,
    1_000_000
  );
  const configuredEscrow = finite(
    env.UBERMIND_PROTECTED_CROWN_ESCROW_USD
      ?? campaignConfig?.budget?.protectedCrownEscrowUsd
      ?? cloudConfig?.requiredResources?.find?.(r => r.id === 'crown-escrow')?.default,
    0,
    1_000_000
  );
  const requiredBudget = finite(campaignConfig?.budget?.monthlyAllInTargetUsd ?? 30, 0, 1_000_000);
  const requiredEscrow = finite(campaignConfig?.budget?.protectedCrownEscrowUsd ?? 15, 0, 1_000_000);

  if (configuredBudget == null || requiredBudget == null || configuredBudget !== requiredBudget) {
    blockers.push('MONTHLY_BUDGET_MUST_MATCH_FROZEN_CAMPAIGN');
  }
  if (configuredEscrow == null || requiredEscrow == null || configuredEscrow < requiredEscrow) {
    blockers.push('PROTECTED_CROWN_ESCROW_BELOW_FROZEN_MINIMUM');
  }
  if (configuredBudget != null && configuredEscrow != null && configuredEscrow > configuredBudget) {
    blockers.push('CROWN_ESCROW_CANNOT_EXCEED_MONTHLY_BUDGET');
  }

  const maxIntentionalDelta = Number(campaignConfig?.quality?.maxIntentionalDelta);
  const pairedRegressionAllowed = Number(campaignConfig?.quality?.pairedTaskRegressionAllowed);
  if (maxIntentionalDelta !== 0) blockers.push('MAX_INTENTIONAL_QUALITY_DELTA_MUST_BE_ZERO');
  if (pairedRegressionAllowed !== 0) blockers.push('PAIRED_TASK_REGRESSION_TOLERANCE_MUST_BE_ZERO');

  const unattendedRequested = normalizedMode === 'UNATTENDED' || normalizedMode === 'ALL';
  const interactiveRequested = normalizedMode === 'INTERACTIVE' || normalizedMode === 'ALL';
  const backendEnabled = truthy(env.OPENROUTER_AGENT_ENABLED);

  if (unattendedRequested && !backendEnabled) blockers.push('OPENROUTER_AGENT_ENABLED_TRUE_REQUIRED_FOR_UNATTENDED');
  if (interactiveRequested && !backendEnabled) {
    warnings.push('BACKEND_EXECUTOR_DISABLED__OK_FOR_TYPINGMIND_INTERACTIVE_ONLY');
  }

  const providerSort = text(env.OPENROUTER_PROVIDER_SORT || 'price', 40).toLowerCase();
  if (!['price','throughput','latency'].includes(providerSort)) blockers.push('VALID_OPENROUTER_PROVIDER_SORT_REQUIRED');

  const requireZdr = env.OPENROUTER_REQUIRE_ZDR == null ? true : truthy(env.OPENROUTER_REQUIRE_ZDR);
  if (!requireZdr) warnings.push('OPENROUTER_ZDR_NOT_REQUIRED__REVIEW_PRIVACY_POLICY_BEFORE_PRIVATE_DATA');

  const platformFeeRate = finite(
    env.OPENROUTER_PLATFORM_FEE_RATE
      ?? cloudConfig?.recommendedPolicies?.find?.(r => r.env === 'OPENROUTER_PLATFORM_FEE_RATE')?.default
      ?? 0,
    0,
    1
  );
  if (platformFeeRate == null) blockers.push('VALID_PLATFORM_FEE_RATE_REQUIRED');

  const automaticSpendAuthority = campaignConfig?.budget?.automaticSpendAuthority;
  if (automaticSpendAuthority !== false) blockers.push('AUTOMATIC_SPEND_AUTHORITY_MUST_REMAIN_FALSE');

  const status = blockers.length
    ? 'FRONTIER_VM_ACTIVATION_BLOCKED'
    : unattendedRequested
      ? 'FRONTIER_VM_READY_FOR_CONTROLLED_UNATTENDED_BURN_IN'
      : 'FRONTIER_VM_READY_FOR_CONTROLLED_TYPINGMIND_BURN_IN';

  return envelope({
    ok: blockers.length === 0,
    status,
    mode: normalizedMode,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    sourceReady,
    resources: {
      openRouterCredentialPresent: apiKeyPresent,
      liveCrownSnapshotPresent: crownSnapshotPresent,
      freshTaskSourcePresent,
      backendExecutorEnabled: backendEnabled,
      monthlyAllInTargetUsd: configuredBudget,
      protectedCrownEscrowUsd: configuredEscrow,
      platformFeeRate,
      providerSort,
      requireZdr
    },
    quality: {
      maxIntentionalDelta,
      pairedTaskRegressionAllowed,
      budgetPressureAction: 'QUEUE_DEFER_BATCH_WAIT_NEVER_DOWNGRADE'
    },
    activationAuthority: 'CONTROLLED_BURN_IN_ONLY',
    automaticPromotionAuthority: 'NONE',
    truthBoundary: 'READY means the frozen prerequisites for a controlled paired experiment are present. It does not prove frontier equivalence, compression, novelty, or permission to spend.'
  });
}
