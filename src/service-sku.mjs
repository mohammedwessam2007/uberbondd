import crypto from 'node:crypto';
import { compileFulfillmentPlan } from './service-fulfillment.mjs';

export const SERVICE_SKU_POLICY_VERSION = 'uberbond.service-sku.v1';

export const PRICING_EVIDENCE_CLASSES = Object.freeze([
  'OWNER_HYPOTHESIS',
  'CREATOR_CLAIM',
  'MARKET_OBSERVED',
  'BUYER_QUOTE',
  'VERIFIED_TRANSACTION'
]);

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

const MAX_LIST = 64;
const MAX_COST_ITEMS = 40;

function text(value, max = 800) {
  return String(value ?? '').trim().slice(0, max);
}

function strings(values, max = MAX_LIST) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, max);
}

function int(value, min, max, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function iso(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback).toISOString() : date.toISOString();
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: SERVICE_SKU_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function normalizePricing(input = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const amountCents = raw.amountCents == null ? null : int(raw.amountCents, 0, 1_000_000_000);
  const currency = text(raw.currency, 3).toUpperCase() || null;
  const evidenceClass = text(raw.evidenceClass, 40).toUpperCase() || null;
  const sourceRef = text(raw.sourceRef, 500) || null;
  const observedAt = raw.observedAt ? iso(raw.observedAt) : null;
  const reasons = [];

  if (raw.amountCents != null && amountCents == null) reasons.push('valid-price-amount-required');
  if (amountCents != null && (!currency || !/^[A-Z]{3}$/.test(currency))) reasons.push('valid-price-currency-required');
  if (amountCents != null && !PRICING_EVIDENCE_CLASSES.includes(evidenceClass)) reasons.push('pricing-evidence-class-required');
  if (evidenceClass && !PRICING_EVIDENCE_CLASSES.includes(evidenceClass)) reasons.push('unsupported-pricing-evidence-class');
  if (['MARKET_OBSERVED', 'BUYER_QUOTE', 'VERIFIED_TRANSACTION'].includes(evidenceClass) && !sourceRef) {
    reasons.push('pricing-source-ref-required');
  }
  if (evidenceClass === 'VERIFIED_TRANSACTION' && !/^(payment|receipt|transaction):/i.test(sourceRef || '')) {
    reasons.push('transaction-receipt-ref-required');
  }

  return {
    ok: reasons.length === 0,
    reasonCodes: reasons,
    amountCents,
    currency,
    evidenceClass,
    sourceRef,
    observedAt,
    verifiedMarketPrice: evidenceClass === 'VERIFIED_TRANSACTION',
    claimBoundary: evidenceClass === 'CREATOR_CLAIM'
      ? 'CREATOR_CLAIM_NOT_MARKET_OR_REVENUE_PROOF'
      : evidenceClass === 'OWNER_HYPOTHESIS'
        ? 'OWNER_HYPOTHESIS_NOT_MARKET_OR_REVENUE_PROOF'
        : evidenceClass === 'VERIFIED_TRANSACTION'
          ? 'ONE_VERIFIED_TRANSACTION_NOT_REPEATABILITY_PROOF'
          : 'EVIDENCE_CLASS_RETAINED'
  };
}

function normalizeCostModel(items) {
  const rows = Array.isArray(items) ? items.slice(0, MAX_COST_ITEMS) : [];
  const normalized = [];
  const reasons = [];
  for (const [index, item] of rows.entries()) {
    const name = text(item?.name, 120);
    const status = text(item?.status, 20).toUpperCase();
    const amountCents = item?.amountCents == null ? null : int(item.amountCents, 0, 1_000_000_000);
    const sourceRef = text(item?.sourceRef, 500) || null;
    if (!name) reasons.push(`cost-item-${index}-name-required`);
    if (!['KNOWN', 'UNKNOWN'].includes(status)) reasons.push(`cost-item-${index}-status-required`);
    if (status === 'KNOWN' && amountCents == null) reasons.push(`cost-item-${index}-known-amount-required`);
    if (status === 'UNKNOWN' && item?.amountCents != null) reasons.push(`cost-item-${index}-unknown-cannot-carry-amount`);
    if (status === 'KNOWN' && amountCents != null && !sourceRef) reasons.push(`cost-item-${index}-source-required`);
    normalized.push({ name, status, amountCents, sourceRef });
  }
  const known = normalized.filter(item => item.status === 'KNOWN' && Number.isInteger(item.amountCents));
  const unknown = normalized.filter(item => item.status === 'UNKNOWN');
  return {
    ok: reasons.length === 0,
    reasonCodes: reasons,
    items: normalized,
    knownCostCents: known.reduce((sum, item) => sum + item.amountCents, 0),
    knownItemCount: known.length,
    unknownItemCount: unknown.length,
    completeness: normalized.length === 0 ? 'NO_COST_MODEL' : unknown.length ? 'PARTIAL' : 'KNOWN_FOR_LISTED_ITEMS'
  };
}

export function compileServiceSku({
  skuId,
  offerId = null,
  buyer,
  pain,
  promise,
  inputs = [],
  requiredCapabilities = [],
  setupRequirements = [],
  recurringTrigger = null,
  deliveryRequirements = [],
  acceptanceCriteria = [],
  pricing = {},
  costModel = [],
  failureModes = [],
  supportBurden = [],
  refundRisk = [],
  ownerBurdenMinutes = null,
  distributionConstraints = [],
  maxRevisions = 2,
  supportWindowDays = 30,
  renewalIntervalDays = null,
  date = new Date()
} = {}) {
  const cleanSkuId = text(skuId, 160);
  const cleanOfferId = text(offerId, 160) || null;
  const cleanBuyer = text(buyer, 500);
  const cleanPain = text(pain, 1000);
  const cleanPromise = text(promise, 1000);
  const delivery = strings(deliveryRequirements);
  const acceptance = strings(acceptanceCriteria);
  const capabilities = strings(requiredCapabilities);
  const setup = strings(setupRequirements);
  const trigger = text(recurringTrigger, 500) || null;
  const renewal = renewalIntervalDays == null ? null : int(renewalIntervalDays, 1, 3650);
  const revisions = int(maxRevisions, 0, 20);
  const supportDays = int(supportWindowDays, 0, 3650);
  const ownerMinutes = ownerBurdenMinutes == null ? null : Number(ownerBurdenMinutes);
  const price = normalizePricing(pricing);
  const costs = normalizeCostModel(costModel);
  const reasons = [];

  if (!cleanSkuId) reasons.push('sku-id-required');
  if (!cleanBuyer) reasons.push('buyer-required');
  if (!cleanPain) reasons.push('pain-required');
  if (!cleanPromise) reasons.push('promise-required');
  if (!capabilities.length) reasons.push('required-capabilities-required');
  if (!delivery.length) reasons.push('delivery-requirements-required');
  if (!acceptance.length) reasons.push('acceptance-criteria-required');
  if (!price.ok) reasons.push(...price.reasonCodes);
  if (!costs.ok) reasons.push(...costs.reasonCodes);
  if (revisions == null) reasons.push('bounded-max-revisions-required');
  if (supportDays == null) reasons.push('bounded-support-window-required');
  if (ownerMinutes != null && (!Number.isFinite(ownerMinutes) || ownerMinutes < 0)) reasons.push('valid-owner-burden-minutes-required');
  if (renewalIntervalDays != null && renewal == null) reasons.push('valid-renewal-interval-required');
  if (renewal != null && !trigger) reasons.push('recurring-trigger-required');
  if (trigger && renewal == null) reasons.push('renewal-interval-required-for-recurring-trigger');
  if (reasons.length) return fail(reasons);

  const createdAt = iso(date);
  const identity = {
    skuId: cleanSkuId,
    offerId: cleanOfferId,
    buyer: cleanBuyer,
    pain: cleanPain,
    promise: cleanPromise,
    inputs: strings(inputs),
    capabilities,
    setup,
    trigger,
    delivery,
    acceptance,
    revisions,
    supportDays,
    renewal
  };

  return {
    ok: true,
    policyVersion: SERVICE_SKU_POLICY_VERSION,
    skuId: cleanSkuId,
    skuDigest: hash(identity),
    offerId: cleanOfferId,
    buyer: cleanBuyer,
    pain: cleanPain,
    promise: cleanPromise,
    inputs: identity.inputs,
    requiredCapabilities: capabilities,
    setupRequirements: setup,
    recurring: renewal != null,
    recurringTrigger: trigger,
    deliveryRequirements: delivery,
    acceptanceCriteria: acceptance,
    pricing: price,
    costModel: costs,
    failureModes: strings(failureModes),
    supportBurden: strings(supportBurden),
    refundRisk: strings(refundRisk),
    ownerBurdenMinutes: ownerMinutes,
    distributionConstraints: strings(distributionConstraints),
    maxRevisions: revisions,
    supportWindowDays: supportDays,
    renewalIntervalDays: renewal,
    createdAt,
    commercialTruth: {
      buyerProof: 'NOT_INFERRED_FROM_SKU',
      demandProof: 'NOT_INFERRED_FROM_SKU',
      clearedRevenue: 'NOT_INFERRED_FROM_SKU',
      repeatability: 'NOT_INFERRED_FROM_SKU'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function compileFulfillmentFromSku({ sku, customerRef, date = new Date() } = {}) {
  if (!sku?.ok || sku.policyVersion !== SERVICE_SKU_POLICY_VERSION || !sku.skuId) {
    return fail(['valid-service-sku-required']);
  }
  const plan = compileFulfillmentPlan({
    serviceSkuId: sku.skuId,
    customerRef,
    requirements: sku.deliveryRequirements,
    acceptanceCriteria: sku.acceptanceCriteria,
    maxRevisions: sku.maxRevisions,
    supportWindowDays: sku.supportWindowDays,
    renewalIntervalDays: sku.renewalIntervalDays,
    date
  });
  if (!plan.ok) return fail(['fulfillment-plan-compilation-failed', ...(plan.reasonCodes || [])]);
  return {
    ok: true,
    policyVersion: SERVICE_SKU_POLICY_VERSION,
    status: 'FULFILLMENT_PLAN_COMPILED',
    skuId: sku.skuId,
    fulfillmentPlan: plan,
    commercialTruth: { ...sku.commercialTruth },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
