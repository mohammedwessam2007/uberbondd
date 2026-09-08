import { buildFounderCommandCenter } from './founder-command-center.mjs';
import { buildPrometheusControlTower } from './prometheus-control-tower.mjs';

export const FOUNDER_OPS_VIEW_VERSION = 'uberbond.founder-ops-view.v1';

function providerPosture(env = {}) {
  const paypalEnvironment = String(env.PAYPAL_ENVIRONMENT || '').trim().toUpperCase() || 'UNSPECIFIED';
  const liveMode = paypalEnvironment === 'LIVE';
  const sandboxMode = paypalEnvironment === 'SANDBOX';
  const liveCreds = Boolean(env.PAYPAL_LIVE_CLIENT_ID && env.PAYPAL_LIVE_CLIENT_SECRET && env.PAYPAL_LIVE_WEBHOOK_ID);
  const sandboxCreds = Boolean(env.PAYPAL_SANDBOX_CLIENT_ID && env.PAYPAL_SANDBOX_CLIENT_SECRET && env.PAYPAL_SANDBOX_WEBHOOK_ID);
  return {
    paypalEnvironment,
    paypalCredentialSetConfigured: liveMode ? liveCreds : sandboxMode ? sandboxCreds : false,
    commercialProviderConfigurationPresent: liveMode && liveCreds,
    sandboxProviderConfigurationPresent: sandboxMode && sandboxCreds,
    databaseConfigured: Boolean(env.DATABASE_URL),
    adminAuthConfigured: Boolean(env.ADMIN_TOKEN),
    outboundEnabled: String(env.OUTBOUND_ENABLED || '').toLowerCase() === 'true',
    outboundDryRun: String(env.OUTBOUND_DRY_RUN ?? 'true').toLowerCase() !== 'false',
    businessEffectAuthority: 'NONE'
  };
}

function launchability({ commandCenter, provider, prometheus }) {
  const reasons = [];
  if (!provider.databaseConfigured) reasons.push('database-not-configured');
  if (!provider.adminAuthConfigured) reasons.push('admin-auth-not-configured');
  if (!provider.commercialProviderConfigurationPresent) reasons.push('live-paypal-provider-configuration-not-proven');
  if (!provider.outboundEnabled) reasons.push('outbound-disabled-or-not-configured');
  if (provider.outboundDryRun) reasons.push('outbound-dry-run');

  const outbound = commandCenter?.outbound || {};
  if (outbound?.killSwitch?.globalOutboundPaused === true) reasons.push('outbound-globally-paused');
  if (Number(outbound?.reservations?.unknownOutcome || 0) > 0) reasons.push('outbound-provider-outcome-reconciliation-required');
  if (Number(outbound?.staleRecoveryPreview?.wouldRecover || 0) > 0) reasons.push('stale-outbound-reservation-recovery-required');
  if (Number(outbound?.staleRecoveryPreview?.wouldQuarantine || 0) > 0) reasons.push('outbound-quarantine-review-required');

  const money = prometheus?.money || {};
  const externalReality = {
    clearedPaymentCount: Number.isFinite(Number(money.clearedPaymentCount)) ? Number(money.clearedPaymentCount) : 0,
    clearedRevenueCents: Number.isFinite(Number(money.clearedRevenueCents)) ? Number(money.clearedRevenueCents) : null,
    acceptedDeliveries: prometheus?.businesses?.acceptedDeliveries ?? 'UNKNOWN',
    customers: prometheus?.businesses?.customers ?? 'UNKNOWN'
  };
  const localConfigurationGatesClear = reasons.length === 0;

  return {
    internalSoftwarePathDeclared: Boolean(commandCenter?.canonicalFirstCashPath?.sku),
    canonicalSku: commandCenter?.canonicalFirstCashPath?.sku || null,
    canonicalPriceUsd: commandCenter?.canonicalFirstCashPath?.priceUsd ?? null,
    canonicalPaymentMethod: commandCenter?.canonicalFirstCashPath?.paymentMethod || null,
    externalActivationBlockers: reasons,
    localConfigurationGatesClear,
    launchNowProven: false,
    launchNowWhyNotProven: 'Sender/DNS/legal/provider-callability/customer reality are external evidence and are never inferred from environment configuration or an empty local blocker list.',
    externalReality,
    nextSafeOutboundAction: outbound?.nextSafeAction || null,
    note: localConfigurationGatesClear
      ? 'Local configuration and currently observable local blockers are clear. This is NOT launch proof and does not prove provider callability, sender/DNS/legal readiness, a customer, payment, delivery, acceptance, or retention.'
      : 'Software is present but at least one local/provider/operator gate is not currently clear.',
    businessEffectAuthority: 'NONE'
  };
}

export async function buildFounderOpsView({
  store,
  cfg = {},
  revenueEngine = null,
  env = process.env,
  now = new Date(),
  auditLimit = 300,
  runtime = {}
} = {}) {
  const at = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  if (!store || typeof store.list !== 'function') {
    return {
      ok: false,
      status: 'FOUNDER_OPS_UNAVAILABLE',
      reasonCodes: ['live-store-required'],
      businessEffectAuthority: 'NONE'
    };
  }

  const [commandCenter, prometheus] = await Promise.all([
    buildFounderCommandCenter({ store, cfg, revenueEngine, date: at, auditLimit }),
    buildPrometheusControlTower({ store, cfg, revenueEngine, date: at, auditLimit })
  ]);

  if (!commandCenter?.ok || !prometheus?.ok) {
    return {
      ok: false,
      status: 'FOUNDER_OPS_UNAVAILABLE',
      reasonCodes: [
        !commandCenter?.ok ? 'founder-command-center-unavailable' : null,
        !prometheus?.ok ? 'prometheus-control-tower-unavailable' : null
      ].filter(Boolean),
      businessEffectAuthority: 'NONE'
    };
  }

  const provider = providerPosture(env);
  const ownerActionQueue = Array.isArray(commandCenter.ownerActionQueue)
    ? commandCenter.ownerActionQueue.slice(0, 3)
    : [];

  return {
    ok: true,
    schemaVersion: FOUNDER_OPS_VIEW_VERSION,
    status: 'FOUNDER_OPS_READ_ONLY',
    generatedAt: at.toISOString(),
    runtime: {
      platform: runtime.platform || (env.VERCEL ? 'VERCEL' : 'NODE'),
      environment: runtime.environment || env.VERCEL_ENV || env.NODE_ENV || 'unknown',
      sourceCommit: runtime.sourceCommit || env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || null,
      region: runtime.region || env.VERCEL_REGION || null
    },
    firstCash: {
      whatCanMakeMoneyFirst: commandCenter.whatCanMakeMoneyFirst,
      canonicalPath: commandCenter.canonicalFirstCashPath,
      offerReadiness: commandCenter.offerReadiness,
      deliveryReadiness: commandCenter.deliveryReadiness,
      paymentTruth: commandCenter.paymentTruth,
      nonBlockingLegacyCheckoutGaps: commandCenter.nonBlockingLegacyCheckoutGaps
    },
    launchability: launchability({ commandCenter, provider, prometheus }),
    operations: {
      money: prometheus.money,
      distribution: prometheus.distribution,
      intelligence: prometheus.intelligence,
      product: prometheus.product,
      aiWorkforce: prometheus.aiWorkforce,
      businesses: prometheus.businesses
    },
    owner: {
      actionsRequired: ownerActionQueue.length,
      actionQueue: ownerActionQueue,
      maximumBindingActions: 3
    },
    providerPosture: provider,
    privacy: {
      rawPersonalCivilizationReachable: false,
      privateVaultDataIncluded: false,
      networkLifeStateAccessAuthorized: false,
      founderInteractivePrivateRuntimeExists: true,
      note: 'This network surface never imports or reads the Personal Civilization private vault. Founder-private state remains founder-interactive only.'
    },
    truthBoundary: 'READ-ONLY LIVE OPERATIONAL SUMMARY. CONFIGURATION PRESENCE IS NOT PROVIDER CALLABILITY OR LAUNCH PROOF. PREPARATION IS NOT CUSTOMER TRUTH. DELIVERY_READY IS NOT CUSTOMER_ACCEPTED. NO PRIVATE LIFE PAYLOAD IS READ OR RETURNED.',
    businessEffectAuthority: 'NONE'
  };
}
