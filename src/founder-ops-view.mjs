import { buildFounderCommandCenter } from './founder-command-center.mjs';
import { buildPrometheusControlTower } from './prometheus-control-tower.mjs';
import { currentPaymentCollectionRoutes } from './current-payment-collection.mjs';

export const FOUNDER_OPS_VIEW_VERSION = 'uberbond.founder-ops-view.v2';

function providerPosture(env = {}) {
  const routes = currentPaymentCollectionRoutes();
  const primary = routes.find(route => route.selectedForCurrentLaunch === true) || null;
  return {
    selectedCollectionProvider: primary?.provider || null,
    selectedCollectionState: primary?.state || 'NO_CURRENT_COLLECTION_ROUTE',
    selectedCollectionLiveReady: primary?.liveReady === true,
    selectedCollectionReasonCodes: [...(primary?.reasonCodes || [])],
    preservedProviderRoutes: routes.filter(route => route.selectedForCurrentLaunch !== true)
      .map(route => ({ provider: route.provider, priority: route.priority, state: route.state, liveReady: route.liveReady === true })),
    databaseConfigured: Boolean(env.DATABASE_URL),
    adminAuthConfigured: Boolean(env.ADMIN_TOKEN),
    outboundEnabled: String(env.OUTBOUND_ENABLED || '').toLowerCase() === 'true',
    outboundDryRun: String(env.OUTBOUND_DRY_RUN ?? 'true').toLowerCase() !== 'false',
    businessEffectAuthority: 'NONE'
  };
}

function launchability({ commandCenter, provider, prometheus }) {
  const localReasons = [];
  const externalReasons = [];
  if (!provider.databaseConfigured) localReasons.push('database-not-configured');
  if (!provider.adminAuthConfigured) localReasons.push('admin-auth-not-configured');
  if (!provider.outboundEnabled) localReasons.push('outbound-disabled-or-not-configured');
  if (provider.outboundDryRun) localReasons.push('outbound-dry-run');
  if (!provider.selectedCollectionLiveReady) externalReasons.push('collection-provider-account-setup-not-proven');

  const outbound = commandCenter?.outbound || {};
  if (outbound?.killSwitch?.globalOutboundPaused === true) localReasons.push('outbound-globally-paused');
  if (Number(outbound?.reservations?.unknownOutcome || 0) > 0) localReasons.push('outbound-provider-outcome-reconciliation-required');
  if (Number(outbound?.staleRecoveryPreview?.wouldRecover || 0) > 0) localReasons.push('stale-outbound-reservation-recovery-required');
  if (Number(outbound?.staleRecoveryPreview?.wouldQuarantine || 0) > 0) localReasons.push('outbound-quarantine-review-required');

  const money = prometheus?.money || {};
  const externalReality = {
    clearedPaymentCount: Number.isFinite(Number(money.clearedPaymentCount)) ? Number(money.clearedPaymentCount) : 0,
    clearedRevenueCents: Number.isFinite(Number(money.clearedRevenueCents)) ? Number(money.clearedRevenueCents) : null,
    acceptedDeliveries: prometheus?.businesses?.acceptedDeliveries ?? 'UNKNOWN',
    customers: prometheus?.businesses?.customers ?? 'UNKNOWN'
  };
  const localConfigurationGatesClear = localReasons.length === 0;

  return {
    internalSoftwarePathDeclared: Boolean(commandCenter?.canonicalFirstCashPath?.sku),
    canonicalSku: commandCenter?.canonicalFirstCashPath?.sku || null,
    canonicalPriceUsd: commandCenter?.canonicalFirstCashPath?.priceUsd ?? null,
    canonicalPaymentMethod: commandCenter?.canonicalFirstCashPath?.paymentMethod || null,
    localConfigurationGates: localReasons,
    externalActivationBlockers: [...localReasons, ...externalReasons],
    collectionProvider: provider.selectedCollectionProvider,
    collectionState: provider.selectedCollectionState,
    collectionLiveReady: provider.selectedCollectionLiveReady,
    collectionReasonCodes: [...provider.selectedCollectionReasonCodes],
    localConfigurationGatesClear,
    launchNowProven: false,
    launchNowWhyNotProven: 'Sender/DNS/legal/provider-callability/customer reality are external evidence and are never inferred from environment configuration or an empty local blocker list.',
    externalReality,
    nextSafeOutboundAction: outbound?.nextSafeAction || null,
    note: localConfigurationGatesClear
      ? 'Local configuration and currently observable local blockers are clear. This is NOT launch proof. The selected collection account may still require provider/owner setup, and sender/DNS/legal/customer/payment/delivery reality remains external evidence.'
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
