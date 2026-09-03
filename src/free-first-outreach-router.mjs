// Free-first outreach routing: which zero-cost provider, if any, may carry a
// message of a given purpose.
//
// Two things this module deliberately refuses to do. It never turns a
// researched quota into send authority -- the reviewed pool is transactional,
// lifecycle and opt-in capacity, and proven free cold-B2B transport across all
// of it is zero. And it never lets a runtime observation loosen a published
// policy: an activation receipt can make a provider stricter (a prohibition, an
// auto-charge risk, a smaller observed quota) and never looser, because the
// registry is the evidence of what the provider actually published.
//
// Every exit is fail-closed. UNKNOWN is not allowed; consent-required without
// consent evidence is not allowed; a research record is not an activated
// provider; an activated provider is not a healthy sender; and a healthy sender
// is not authority to contact anyone.
import crypto from 'node:crypto';

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { deriveProviderStatesFromReceipts, stricterColdRule } from './provider-activation-receipt.mjs';

export const FREE_FIRST_ROUTER_VERSION = 'uberbond.free-first-outreach-router-1.0.1';
export const MESSAGE_PURPOSES = Object.freeze([
  'TRANSACTIONAL',
  'CUSTOMER_OPERATIONAL',
  'OPT_IN_MARKETING',
  'PARTNER_OPT_IN',
  'ONE_TO_ONE_B2B',
  'COLD_B2B',
  'INTERNAL',
  'PUSH_OPT_IN',
  'INBOUND_REPLY'
]);
export const PURPOSE_RULES = Object.freeze(['ALLOWED', 'CONSENT_REQUIRED', 'PROHIBITED', 'UNKNOWN']);

function clone(value) { return structuredClone(value); }
function text(value, max = 300) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function iso(value) {
  const raw = text(value, 80);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: FREE_FIRST_ROUTER_VERSION,
    status: 'FREE_FIRST_ROUTE_BLOCKED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function tightest(researched, observed) {
  const values = [researched, observed].filter(value => value != null);
  return values.length ? Math.min(...values) : null;
}

export function normalizeFreeProvider(input = {}) {
  const id = text(input.id, 100)?.toLowerCase() || null;
  const provider = text(input.provider, 120);
  const capabilityType = String(input.capabilityType ?? '').trim().toUpperCase();
  const policyObservedAt = iso(input.policyObservedAt);
  const freePlan = input.freePlan && typeof input.freePlan === 'object' ? input.freePlan : {};
  const quota = input.quota && typeof input.quota === 'object' ? input.quota : {};
  const purposeRules = {};
  for (const purpose of MESSAGE_PURPOSES) {
    const rule = String(input.purposeRules?.[purpose] ?? 'UNKNOWN').trim().toUpperCase();
    purposeRules[purpose] = PURPOSE_RULES.includes(rule) ? rule : 'UNKNOWN';
  }
  return {
    id,
    provider,
    capabilityType,
    policyObservedAt,
    organizationAccountLimit: nonNegativeInteger(input.organizationAccountLimit) ?? 1,
    freePlan: {
      ongoing: freePlan.ongoing === true,
      trial: freePlan.trial === true,
      expiresAt: freePlan.expiresAt == null ? null : iso(freePlan.expiresAt),
      autoChargeAfterExpiry: freePlan.autoChargeAfterExpiry === true
    },
    quota: {
      daily: quota.daily == null ? null : nonNegativeInteger(quota.daily),
      monthly: quota.monthly == null ? null : nonNegativeInteger(quota.monthly),
      recipientCap: quota.recipientCap == null ? null : nonNegativeInteger(quota.recipientCap)
    },
    purposeRules,
    evidenceRefs: Array.isArray(input.evidenceRefs)
      ? input.evidenceRefs.map(ref => text(ref, 500)).filter(Boolean)
      : [],
    notes: text(input.notes, 1000)
  };
}

export function validateFreeProvider(input = {}) {
  const provider = normalizeFreeProvider(input);
  const reasons = [];
  if (!provider.id || !provider.provider) reasons.push('provider-identity-required');
  if (provider.capabilityType !== 'EMAIL_TRANSPORT') reasons.push('email-transport-capability-required');
  if (!provider.policyObservedAt) reasons.push('policy-observed-at-required');
  if (provider.organizationAccountLimit !== 1) reasons.push('single-legitimate-organization-allocation-required');
  if (provider.quota.daily == null && provider.quota.monthly == null) reasons.push('free-quota-required');
  if (provider.freePlan.trial && !provider.freePlan.expiresAt) reasons.push('trial-expiry-required');
  if (provider.freePlan.ongoing && provider.freePlan.trial) reasons.push('free-plan-cannot-be-both-ongoing-and-trial');
  if (!provider.freePlan.ongoing && !provider.freePlan.trial) reasons.push('free-plan-kind-required');
  if (provider.evidenceRefs.length === 0) reasons.push('provider-evidence-reference-required');
  return reasons.length ? fail(reasons, { provider }) : {
    ok: true,
    policyVersion: FREE_FIRST_ROUTER_VERSION,
    status: 'FREE_PROVIDER_VALIDATED',
    provider,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

function boundedCapacity({ daily, monthly, days }) {
  const dailyWindow = daily == null ? Number.POSITIVE_INFINITY : daily * days;
  const monthlyWindow = monthly == null ? Number.POSITIVE_INFINITY : monthly;
  const capacity = Math.min(dailyWindow, monthlyWindow);
  return Number.isFinite(capacity) ? capacity : null;
}

export function freeCapacityForDays(providerInput, days = 30) {
  const validated = validateFreeProvider(providerInput);
  if (!validated.ok) return validated;
  if (!Number.isSafeInteger(days) || days <= 0 || days > 366) return fail(['valid-capacity-window-days-required']);
  const provider = validated.provider;
  const capacity = boundedCapacity({ daily: provider.quota.daily, monthly: provider.quota.monthly, days });
  if (capacity == null) return fail(['bounded-free-quota-required']);
  return {
    ok: true,
    policyVersion: FREE_FIRST_ROUTER_VERSION,
    status: 'FREE_CAPACITY_COMPUTED',
    providerId: provider.id,
    days,
    capacity,
    effectiveDaily: capacity / days,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function aggregateFreeCapacity({ providers = [], days = 30, purpose = null, consentEvidence = false } = {}) {
  const normalizedPurpose = purpose == null ? null : String(purpose).trim().toUpperCase();
  if (normalizedPurpose && !MESSAGE_PURPOSES.includes(normalizedPurpose)) return fail(['invalid-message-purpose']);
  const rows = [];
  const errors = [];
  let capacity = 0;
  for (const input of Array.isArray(providers) ? providers : []) {
    const validated = validateFreeProvider(input);
    if (!validated.ok) {
      errors.push({ providerId: input?.id ?? null, reasonCodes: validated.reasonCodes });
      continue;
    }
    const provider = validated.provider;
    if (normalizedPurpose) {
      const rule = provider.purposeRules[normalizedPurpose];
      if (rule === 'PROHIBITED' || rule === 'UNKNOWN') continue;
      if (rule === 'CONSENT_REQUIRED' && consentEvidence !== true) continue;
    }
    const computed = freeCapacityForDays(provider, days);
    if (!computed.ok) {
      errors.push({ providerId: provider.id, reasonCodes: computed.reasonCodes });
      continue;
    }
    capacity += computed.capacity;
    rows.push({ providerId: provider.id, capacity: computed.capacity, effectiveDaily: computed.effectiveDaily });
  }
  return {
    ok: errors.length === 0,
    policyVersion: FREE_FIRST_ROUTER_VERSION,
    status: errors.length ? 'FREE_CAPACITY_PARTIAL' : 'FREE_CAPACITY_AGGREGATED',
    days,
    purpose: normalizedPurpose,
    capacity,
    effectiveDaily: capacity / days,
    rows,
    errors,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

function usageFor(usageByProvider, providerId) {
  const raw = usageByProvider?.[providerId] || {};
  return {
    dailyUsed: nonNegativeInteger(raw.dailyUsed) ?? 0,
    monthlyUsed: nonNegativeInteger(raw.monthlyUsed) ?? 0,
    reservedUnsent: nonNegativeInteger(raw.reservedUnsent) ?? 0,
    uncertainEffects: nonNegativeInteger(raw.uncertainEffects) ?? 0
  };
}

function liveStateFor(providerStates, providerId) {
  const raw = providerStates?.[providerId] || {};
  const quota = raw.observedQuota && typeof raw.observedQuota === 'object' ? raw.observedQuota : null;
  const coldRule = String(raw.coldB2BRule ?? '').trim().toUpperCase();
  return {
    configured: raw.configured === true,
    active: raw.active === true,
    domainAuthenticated: raw.domainAuthenticated === true,
    providerHealthy: raw.providerHealthy === true,
    autoChargeRisk: raw.autoChargeRisk === true,
    observedQuota: quota ? {
      daily: nonNegativeInteger(quota.daily),
      monthly: nonNegativeInteger(quota.monthly),
      recipientCap: nonNegativeInteger(quota.recipientCap)
    } : null,
    coldB2BRule: PURPOSE_RULES.includes(coldRule) ? coldRule : null,
    receiptState: text(raw.receiptState, 40)
  };
}

function policyAgeDays(observedAt, at) {
  return Math.floor((at.getTime() - new Date(observedAt).getTime()) / 86_400_000);
}

function providerEligibility({ provider, purpose, consentEvidence, usage, state, at, mode, maxPolicyAgeDays, audienceSize }) {
  const reasons = [];
  const registryRule = provider.purposeRules[purpose];
  const rule = purpose === 'COLD_B2B' && state.coldB2BRule
    ? stricterColdRule(registryRule, state.coldB2BRule)
    : registryRule;
  if (rule === 'PROHIBITED') reasons.push('provider-purpose-prohibited');
  if (rule === 'UNKNOWN') reasons.push('provider-purpose-not-proven-allowed');
  if (rule === 'CONSENT_REQUIRED' && consentEvidence !== true) reasons.push('consent-evidence-required-for-provider-purpose');

  const age = policyAgeDays(provider.policyObservedAt, at);
  if (age < 0) reasons.push('provider-policy-observation-from-future');
  if (age > maxPolicyAgeDays) reasons.push('provider-policy-evidence-stale');

  if (provider.freePlan.trial) {
    const expiry = new Date(provider.freePlan.expiresAt);
    if (at.getTime() >= expiry.getTime()) reasons.push('free-trial-expired');
  }
  if (provider.freePlan.autoChargeAfterExpiry || state.autoChargeRisk) reasons.push('auto-charge-free-route-prohibited');
  if (usage.uncertainEffects > 0) reasons.push('provider-has-uncertain-external-effects');

  const observed = mode === 'LIVE' ? state.observedQuota : null;
  const effectiveDaily = tightest(provider.quota.daily, observed?.daily ?? null);
  const effectiveMonthly = tightest(provider.quota.monthly, observed?.monthly ?? null);
  const effectiveRecipientCap = tightest(provider.quota.recipientCap, observed?.recipientCap ?? null);

  const usedDaily = usage.dailyUsed + usage.reservedUnsent;
  const usedMonthly = usage.monthlyUsed + usage.reservedUnsent;
  const remainingDaily = effectiveDaily == null ? Number.POSITIVE_INFINITY : Math.max(0, effectiveDaily - usedDaily);
  const remainingMonthly = effectiveMonthly == null ? Number.POSITIVE_INFINITY : Math.max(0, effectiveMonthly - usedMonthly);
  const remaining = Math.min(remainingDaily, remainingMonthly);
  if (!Number.isFinite(remaining) && effectiveDaily == null && effectiveMonthly == null) reasons.push('bounded-free-quota-required');
  if (remaining <= 0) reasons.push('provider-free-quota-exhausted');

  if (effectiveRecipientCap != null) {
    if (audienceSize != null && audienceSize > effectiveRecipientCap) reasons.push('provider-recipient-cap-exceeded');
    else if (audienceSize == null && mode === 'LIVE') reasons.push('audience-size-required-for-recipient-capped-provider');
  }

  if (mode === 'LIVE') {
    if (state.receiptState === 'STALE') reasons.push('provider-activation-receipt-stale');
    if (state.receiptState === 'MISSING') reasons.push('provider-activation-receipt-missing');
    if (state.receiptState === 'INVALID') reasons.push('provider-activation-receipt-invalid');
    if (!state.configured) reasons.push('provider-not-configured');
    if (!state.active) reasons.push('provider-not-active');
    if (!state.domainAuthenticated) reasons.push('provider-domain-authentication-not-proven');
    if (!state.providerHealthy) reasons.push('provider-health-not-proven');
  }
  return {
    reasons,
    rule,
    remaining,
    remainingDaily,
    remainingMonthly,
    effectiveDaily,
    effectiveMonthly,
    effectiveRecipientCap,
    policyAgeDays: age
  };
}

function resolveProviderStates({ providers, providerStates, activationReceipts, atDate, maxReceiptAgeDays, mode }) {
  const explicit = providerStates && typeof providerStates === 'object' && !Array.isArray(providerStates);

  if (mode === 'LIVE') {
    if (explicit) {
      if (activationReceipts != null) return { ok: false, reasonCodes: ['provider-states-and-activation-receipts-are-mutually-exclusive'] };
      return { ok: false, reasonCodes: ['live-provider-states-must-be-derived-from-activation-receipts'] };
    }
    const receipts = activationReceipts == null ? [] : activationReceipts;
    if (!Array.isArray(receipts)) return { ok: false, reasonCodes: ['activation-receipts-array-required'] };
    const derivation = deriveProviderStatesFromReceipts({
      receipts,
      registryProviders: providers,
      now: atDate,
      maxReceiptAgeDays
    });
    if (!derivation.ok) return { ok: false, reasonCodes: derivation.reasonCodes };
    return { ok: true, states: derivation.providerStates, derivation };
  }

  if (activationReceipts == null) return { ok: true, states: explicit ? providerStates : {}, derivation: null };
  if (!Array.isArray(activationReceipts)) return { ok: false, reasonCodes: ['activation-receipts-array-required'] };
  if (explicit) return { ok: false, reasonCodes: ['provider-states-and-activation-receipts-are-mutually-exclusive'] };
  const derivation = deriveProviderStatesFromReceipts({
    receipts: activationReceipts,
    registryProviders: providers,
    now: atDate,
    maxReceiptAgeDays
  });
  if (!derivation.ok) return { ok: false, reasonCodes: derivation.reasonCodes };
  return { ok: true, states: derivation.providerStates, derivation };
}

export function selectFreeRoute({
  purpose,
  providers = [],
  usageByProvider = {},
  providerStates = null,
  activationReceipts = null,
  audienceSize = null,
  consentEvidence = false,
  at = new Date().toISOString(),
  mode = 'PLAN',
  maxPolicyAgeDays = 45,
  maxReceiptAgeDays = 45
} = {}) {
  const normalizedPurpose = String(purpose ?? '').trim().toUpperCase();
  const normalizedMode = String(mode ?? '').trim().toUpperCase();
  if (!MESSAGE_PURPOSES.includes(normalizedPurpose)) return fail(['invalid-message-purpose']);
  if (!['PLAN', 'LIVE'].includes(normalizedMode)) return fail(['invalid-free-first-routing-mode']);
  if (!Number.isSafeInteger(maxPolicyAgeDays) || maxPolicyAgeDays < 1 || maxPolicyAgeDays > 365) return fail(['valid-policy-age-window-required']);
  if (audienceSize != null && nonNegativeInteger(audienceSize) == null) return fail(['valid-audience-size-required']);
  const atIso = iso(at);
  if (!atIso) return fail(['valid-routing-time-required']);
  const atDate = new Date(atIso);

  const resolved = resolveProviderStates({ providers, providerStates, activationReceipts, atDate, maxReceiptAgeDays, mode: normalizedMode });
  if (!resolved.ok) return fail(resolved.reasonCodes);

  const evaluations = [];
  for (const input of Array.isArray(providers) ? providers : []) {
    const validated = validateFreeProvider(input);
    if (!validated.ok) {
      evaluations.push({ providerId: input?.id ?? null, eligible: false, reasonCodes: validated.reasonCodes });
      continue;
    }
    const provider = validated.provider;
    const usage = usageFor(usageByProvider, provider.id);
    const state = liveStateFor(resolved.states, provider.id);
    const eligibility = providerEligibility({
      provider,
      purpose: normalizedPurpose,
      consentEvidence,
      usage,
      state,
      at: atDate,
      mode: normalizedMode,
      maxPolicyAgeDays,
      audienceSize
    });
    evaluations.push({
      providerId: provider.id,
      provider: provider.provider,
      eligible: eligibility.reasons.length === 0,
      reasonCodes: eligibility.reasons,
      remaining: eligibility.remaining,
      rule: eligibility.rule,
      policyAgeDays: eligibility.policyAgeDays,
      receiptState: state.receiptState,
      trialExpiresAt: provider.freePlan.expiresAt
    });
  }

  const eligible = evaluations.filter(row => row.eligible).sort((a, b) => {
    const aExpiry = a.trialExpiresAt ? new Date(a.trialExpiresAt).getTime() : Number.POSITIVE_INFINITY;
    const bExpiry = b.trialExpiresAt ? new Date(b.trialExpiresAt).getTime() : Number.POSITIVE_INFINITY;
    if (aExpiry !== bExpiry) return aExpiry - bExpiry;
    if (b.remaining !== a.remaining) return b.remaining - a.remaining;
    return a.providerId.localeCompare(b.providerId);
  });

  if (!eligible.length) {
    const purposeBoundary = normalizedPurpose === 'COLD_B2B'
      ? ['no-proven-free-cold-b2b-provider-route']
      : ['no-eligible-free-provider-route'];
    return fail(purposeBoundary, { purpose: normalizedPurpose, mode: normalizedMode, evaluations });
  }
  const selected = eligible[0];
  const route = {
    schemaVersion: 'uberbond-free-first-route-1.0.0',
    routeId: `free_route_${digest([normalizedPurpose, selected.providerId, atIso]).slice(0, 32)}`,
    purpose: normalizedPurpose,
    providerId: selected.providerId,
    provider: selected.provider,
    mode: normalizedMode,
    remainingFreeCapacity: selected.remaining,
    providerRule: selected.rule,
    audienceSize,
    costCents: 0,
    executionAuthority: 'NONE',
    sendBoundary: 'CANONICAL_OUTREACH_OR_OMNICHANNEL_ENGINE_REQUIRED'
  };
  return {
    ok: true,
    policyVersion: FREE_FIRST_ROUTER_VERSION,
    status: 'FREE_ROUTE_SELECTED',
    route,
    evaluations,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function liveUsableCapacity({
  providers = [],
  activationReceipts = [],
  usageByProvider = {},
  providerStates = null,
  purpose = 'TRANSACTIONAL',
  consentEvidence = false,
  audienceSize = null,
  at = new Date().toISOString(),
  days = 30,
  maxPolicyAgeDays = 45,
  maxReceiptAgeDays = 45
} = {}) {
  const normalizedPurpose = String(purpose ?? '').trim().toUpperCase();
  if (!MESSAGE_PURPOSES.includes(normalizedPurpose)) return fail(['invalid-message-purpose']);
  if (!Number.isSafeInteger(days) || days <= 0 || days > 366) return fail(['valid-capacity-window-days-required']);
  const atIso = iso(at);
  if (!atIso) return fail(['valid-routing-time-required']);
  const atDate = new Date(atIso);

  const resolved = resolveProviderStates({
    providers,
    providerStates,
    activationReceipts,
    atDate,
    maxReceiptAgeDays,
    mode: 'LIVE'
  });
  if (!resolved.ok) return fail(resolved.reasonCodes);

  const rows = [];
  let capacity = 0;
  for (const input of Array.isArray(providers) ? providers : []) {
    const validated = validateFreeProvider(input);
    if (!validated.ok) continue;
    const provider = validated.provider;
    const state = liveStateFor(resolved.states, provider.id);
    const eligibility = providerEligibility({
      provider,
      purpose: normalizedPurpose,
      consentEvidence,
      usage: usageFor(usageByProvider, provider.id),
      state,
      at: atDate,
      mode: 'LIVE',
      maxPolicyAgeDays,
      audienceSize
    });
    if (eligibility.reasons.length) continue;
    const bounded = boundedCapacity({ daily: eligibility.effectiveDaily, monthly: eligibility.effectiveMonthly, days });
    if (bounded == null) continue;
    capacity += bounded;
    rows.push({ providerId: provider.id, capacity: bounded });
  }
  return {
    ok: true,
    policyVersion: FREE_FIRST_ROUTER_VERSION,
    status: capacity > 0 ? 'LIVE_USABLE_CAPACITY_COMPUTED' : 'NO_LIVE_USABLE_CAPACITY',
    purpose: normalizedPurpose,
    days,
    capacity,
    effectiveDaily: capacity / days,
    rows,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}