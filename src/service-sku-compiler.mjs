// Deterministic product/service SKU compiler for UberBond.
//
// This is an internal preparation primitive. It turns an evidence-tagged
// opportunity + vertical + capability slice + offer policy into a bounded
// ServiceSKU, DeliveryPlan, AcceptanceContract and MonitoringPlan. It does not
// authorize sale, messaging, deployment, payment, or customer-system mutation.

export const SERVICE_SKU_POLICY_VERSION = 'service-sku-compiler-1.0.0';

export const SERVICE_SKU_ZERO_EFFECTS = Object.freeze({
  messages: 0,
  calls: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  customerMutations: 0,
  paymentEffects: 0,
  spendCents: 0
});

const ALLOWED_PRICE_CLASSES = new Set([
  'UNRESOLVED',
  'HYPOTHESIS',
  'CREATOR_CLAIM',
  'OPERATOR_CLAIM',
  'BUYER_SIGNAL',
  'COMPANY_CLAIM',
  'VERIFIED_FACT'
]);

const ALLOWED_EXECUTION_AUTHORITY = new Set([
  'LOCAL_PREPARATION_ONLY',
  'SHADOW_ONLY',
  'CANARY_REQUIRES_AUTHORIZATION',
  'EXTERNAL_REQUIRES_AUTHORIZATION'
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(item => text(item)).filter(Boolean))]
    : [];
}

function finiteNonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizePrice(price = {}) {
  const amountUsd = finiteNonNegative(price.amountUsd);
  const interval = ['ONE_TIME', 'MONTHLY', 'ANNUAL', 'USAGE', 'CUSTOM'].includes(price.interval)
    ? price.interval
    : 'CUSTOM';
  const claimType = ALLOWED_PRICE_CLASSES.has(price.claimType) ? price.claimType : 'UNRESOLVED';
  return {
    amountUsd,
    interval,
    claimType,
    verifiedTransactionEvidence: price.verifiedTransactionEvidence === true,
    sourceRefs: stringList(price.sourceRefs)
  };
}

function requireObject(value, reason) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason, policyVersion: SERVICE_SKU_POLICY_VERSION };
  }
  return null;
}

function normalizeCapability(capability) {
  if (typeof capability === 'string') {
    return { id: capability.trim(), status: 'REQUIRED', evidenceRefs: [] };
  }
  if (!capability || typeof capability !== 'object') return null;
  const id = text(capability.id);
  if (!id) return null;
  return {
    id,
    status: ['REQUIRED', 'AVAILABLE', 'PARTIAL', 'MISSING', 'EXTERNAL'].includes(capability.status)
      ? capability.status
      : 'REQUIRED',
    evidenceRefs: stringList(capability.evidenceRefs)
  };
}

function normalizeCapabilities(capabilities) {
  const map = new Map();
  for (const raw of Array.isArray(capabilities) ? capabilities : []) {
    const normalized = normalizeCapability(raw);
    if (!normalized) continue;
    const previous = map.get(normalized.id);
    if (!previous) {
      map.set(normalized.id, normalized);
      continue;
    }
    // Fail closed toward the weaker/more constrained status when duplicate
    // capability declarations disagree.
    const rank = { AVAILABLE: 0, PARTIAL: 1, REQUIRED: 2, EXTERNAL: 3, MISSING: 4 };
    const status = rank[normalized.status] > rank[previous.status] ? normalized.status : previous.status;
    map.set(normalized.id, {
      id: normalized.id,
      status,
      evidenceRefs: [...new Set([...previous.evidenceRefs, ...normalized.evidenceRefs])]
    });
  }
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function buildDeliveryPlan({ skuId, deliverables, capabilities, integrations, evidenceRequiredBeforeSale }) {
  const missingCapabilities = capabilities.filter(item => item.status === 'MISSING').map(item => item.id);
  const externalCapabilities = capabilities.filter(item => item.status === 'EXTERNAL').map(item => item.id);
  return {
    planId: `${skuId}:delivery`,
    status: missingCapabilities.length ? 'BLOCKED_MISSING_CAPABILITY' : 'PREPARATION_READY',
    deliverables,
    requiredCapabilities: capabilities,
    requiredIntegrations: integrations,
    preSaleEvidenceGate: evidenceRequiredBeforeSale,
    missingCapabilities,
    externalCapabilities,
    externalExecutionAuthority: 'NONE_GRANTED'
  };
}

function buildAcceptanceContract({ skuId, deliverables, acceptanceTests }) {
  const tests = acceptanceTests.length
    ? acceptanceTests
    : deliverables.map(item => `Customer-authorized evidence proves exact delivery of: ${item}`);
  return {
    contractId: `${skuId}:acceptance`,
    status: 'NOT_EVALUATED',
    exactScopeBindingRequired: true,
    exactVersionBindingRequired: true,
    customerEvidenceRequired: true,
    selfAcceptanceForbidden: true,
    acceptanceTests: tests,
    allowedTerminalStates: ['ACCEPTED', 'REJECTED_WITH_REASON', 'REPAIR_REQUIRED'],
    syntheticEvidenceMayAccept: false
  };
}

function buildMonitoringPlan({ skuId, monitoringSignals, killConditions, expansionRoutes }) {
  return {
    planId: `${skuId}:monitoring`,
    status: 'PREPARED',
    signals: monitoringSignals,
    killConditions,
    expansionRoutes,
    commercialTruthMetrics: [
      'clearedPayment',
      'acceptedDelivery',
      'secondPayment',
      'renewal',
      'refundOrDispute',
      'grossContributionMargin'
    ],
    vanityMetricsCannotPromote: true
  };
}

export function compileServiceSku(input = {}) {
  const malformed = requireObject(input, 'malformed-service-sku-input');
  if (malformed) return malformed;

  const opportunity = input.opportunity;
  const opportunityMalformed = requireObject(opportunity, 'malformed-opportunity');
  if (opportunityMalformed) return opportunityMalformed;

  const opportunityId = text(opportunity.opportunityId || opportunity.id);
  const vertical = text(input.vertical);
  const offerName = text(input.offerPolicy?.name || opportunity.mechanismName?.value || opportunity.name || opportunityId);
  const buyer = clone(input.offerPolicy?.buyer || opportunity.buyer?.value || opportunity.buyer || null);

  if (!opportunityId) return { ok: false, reason: 'missing-opportunity-id', policyVersion: SERVICE_SKU_POLICY_VERSION };
  if (!vertical) return { ok: false, reason: 'missing-vertical', policyVersion: SERVICE_SKU_POLICY_VERSION };
  if (!offerName) return { ok: false, reason: 'missing-offer-name', policyVersion: SERVICE_SKU_POLICY_VERSION };

  const capabilities = normalizeCapabilities(input.capabilities);
  if (!capabilities.length) return { ok: false, reason: 'missing-capability-slice', policyVersion: SERVICE_SKU_POLICY_VERSION };

  const deliverables = stringList(input.offerPolicy?.deliverables);
  if (!deliverables.length) return { ok: false, reason: 'missing-deliverables', policyVersion: SERVICE_SKU_POLICY_VERSION };

  const exclusions = stringList(input.offerPolicy?.exclusions);
  const integrations = stringList(input.offerPolicy?.integrations);
  const evidenceRequiredBeforeSale = stringList(input.offerPolicy?.evidenceRequiredBeforeSale);
  const acceptanceTests = stringList(input.offerPolicy?.acceptanceTests);
  const ownerActions = stringList(input.offerPolicy?.ownerActions);
  const killConditions = stringList(input.offerPolicy?.killConditions);
  const expansionRoutes = stringList(input.offerPolicy?.expansionRoutes);
  const monitoringSignals = stringList(input.offerPolicy?.monitoringSignals);
  const supportHypothesis = text(input.offerPolicy?.supportHypothesis) || 'UNRESOLVED';
  const slaHypothesis = text(input.offerPolicy?.slaHypothesis) || 'UNRESOLVED';
  const price = normalizePrice(input.offerPolicy?.price);
  const setupPrice = normalizePrice(input.offerPolicy?.setupPrice);
  const executionAuthority = ALLOWED_EXECUTION_AUTHORITY.has(input.offerPolicy?.executionAuthority)
    ? input.offerPolicy.executionAuthority
    : 'LOCAL_PREPARATION_ONLY';

  const contributionInputs = {
    priceAmountUsd: price.amountUsd,
    setupAmountUsd: setupPrice.amountUsd,
    estimatedMonthlyDeliveryCostUsd: finiteNonNegative(input.offerPolicy?.estimatedMonthlyDeliveryCostUsd),
    estimatedSetupCostUsd: finiteNonNegative(input.offerPolicy?.estimatedSetupCostUsd)
  };

  const recurringContributionMarginUsd = price.amountUsd != null && contributionInputs.estimatedMonthlyDeliveryCostUsd != null
    ? Math.max(0, price.amountUsd - contributionInputs.estimatedMonthlyDeliveryCostUsd)
    : null;

  const skuId = `sku:${opportunityId}:${vertical.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const deliveryPlan = buildDeliveryPlan({ skuId, deliverables, capabilities, integrations, evidenceRequiredBeforeSale });
  const acceptanceContract = buildAcceptanceContract({ skuId, deliverables, acceptanceTests });
  const monitoringPlan = buildMonitoringPlan({ skuId, monitoringSignals, killConditions, expansionRoutes });

  const pricingIsVerifiedByTransaction = price.claimType === 'VERIFIED_FACT' && price.verifiedTransactionEvidence === true;
  const pricingTruth = pricingIsVerifiedByTransaction
    ? 'TRANSACTION_VERIFIED_PRICE'
    : `${price.claimType}_PRICE__NOT_TRANSACTION_PROOF`;

  return {
    ok: true,
    policyVersion: SERVICE_SKU_POLICY_VERSION,
    sku: {
      skuId,
      opportunityId,
      vertical,
      name: offerName,
      buyer,
      job: clone(input.offerPolicy?.job || opportunity.painOrTrigger?.value || opportunity.painOrTrigger || null),
      deliverables,
      exclusions,
      integrations,
      capabilities,
      price,
      setupPrice,
      pricingTruth,
      supportHypothesis,
      slaHypothesis,
      evidenceRequiredBeforeSale,
      ownerActions,
      executionAuthority,
      externalConsequenceGranted: false,
      contributionInputs,
      recurringContributionMarginUsd,
      killConditions,
      expansionRoutes,
      truth: {
        sale: 'NOT_PROVEN',
        payment: 'EXTERNAL_PROOF_REQUIRED',
        delivery: 'NOT_STARTED',
        acceptance: 'NOT_EVALUATED',
        retention: 'NOT_PROVEN'
      }
    },
    deliveryPlan,
    acceptanceContract,
    monitoringPlan,
    externalEffectLedger: { ...SERVICE_SKU_ZERO_EFFECTS }
  };
}

export function compileServicePortfolio({ opportunity, vertical, capabilitySets = [], offerPolicies = [] } = {}) {
  if (!Array.isArray(offerPolicies) || !offerPolicies.length) {
    return { ok: false, reason: 'missing-offer-policies', policyVersion: SERVICE_SKU_POLICY_VERSION };
  }
  const capabilityMap = new Map(
    (Array.isArray(capabilitySets) ? capabilitySets : []).map(item => [item.id, item.capabilities])
  );
  const compiled = [];
  const failures = [];
  for (const policy of offerPolicies) {
    const result = compileServiceSku({
      opportunity,
      vertical,
      capabilities: policy.capabilitySetId ? capabilityMap.get(policy.capabilitySetId) : policy.capabilities,
      offerPolicy: policy
    });
    if (result.ok) compiled.push(result);
    else failures.push({ offerName: policy?.name || null, reason: result.reason });
  }
  return {
    ok: failures.length === 0,
    policyVersion: SERVICE_SKU_POLICY_VERSION,
    compiled,
    failures,
    externalEffectLedger: { ...SERVICE_SKU_ZERO_EFFECTS }
  };
}
