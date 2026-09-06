import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const COMPUTE_SOVEREIGNTY_SCHEMA = 'uberbond.compute-sovereignty.v1';
export const COMPUTE_SOVEREIGNTY_POLICY_VERSION = 'uberbond-compute-sovereignty-1.0.0';

const RIGHTS = new Set(['LOCAL_OWNED', 'OPEN_LICENSED', 'OFFICIAL_FREE_TIER', 'SPONSORED_GRANT', 'PURCHASED_CREDITS', 'PAID_API']);
const FORBIDDEN_ACQUISITION = new Set(['TRIAL_CYCLING', 'IDENTITY_FARMING', 'QUOTA_EVASION', 'LEAKED_CREDENTIAL', 'STOLEN_ACCOUNT', 'BILLING_BYPASS', 'TERMS_BYPASS']);
const MAX_OFFERS = 256;

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function text(value, max = 1000) { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; }
function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) { const n = Number(value); return Number.isSafeInteger(n) && n >= min && n <= max ? n : null; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, status = 'COMPUTE_SOVEREIGNTY_BLOCKED', extra = {}) {
  return { ok: false, policyVersion: COMPUTE_SOVEREIGNTY_POLICY_VERSION, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}

export function normalizeComputeOffer(raw = {}) {
  const provider = text(raw.provider, 100)?.toLowerCase();
  const model = text(raw.model, 200);
  const revision = text(raw.revision, 300);
  const rightsClass = text(raw.rightsClass, 80)?.toUpperCase();
  const acquisitionMode = text(raw.acquisitionMode ?? rightsClass, 80)?.toUpperCase();
  const sourceRef = text(raw.sourceRef, 1500);
  const verifiedAt = text(raw.verifiedAt, 100);
  const contextTokens = integer(raw.contextTokens, 1, 10_000_000);
  const usableTokens = integer(raw.usableTokens ?? 0, 0, 10_000_000_000);
  const costCents = integer(raw.costCents ?? 0, 0, 100_000_000);
  const quality = finite(raw.quality ?? 0, 0, 1);
  const reliability = finite(raw.reliability ?? 0, 0, 1);
  const latencyScore = finite(raw.latencyScore ?? 0, 0, 1);
  const taskClasses = Array.isArray(raw.taskClasses) ? [...new Set(raw.taskClasses.map(x => text(x, 100)?.toLowerCase()).filter(Boolean))].slice(0, 64) : [];
  const reasons = [];
  if (!provider || !model || !revision) reasons.push('provider-model-revision-required');
  if (!RIGHTS.has(rightsClass)) reasons.push('recognized-compute-rights-required');
  if (FORBIDDEN_ACQUISITION.has(acquisitionMode)) reasons.push(`forbidden-compute-acquisition:${acquisitionMode}`);
  if (!sourceRef || !verifiedAt || !Number.isFinite(Date.parse(verifiedAt))) reasons.push('provenance-and-verification-time-required');
  if (contextTokens == null || usableTokens == null || costCents == null) reasons.push('bounded-capacity-and-cost-required');
  if (quality == null || reliability == null || latencyScore == null) reasons.push('bounded-quality-reliability-latency-required');
  if (!taskClasses.length) reasons.push('task-classes-required');
  if (reasons.length) return fail(reasons, 'COMPUTE_OFFER_REJECTED');
  const free = costCents === 0;
  const core = { provider, model, revision, rightsClass, acquisitionMode, sourceRef, verifiedAt: new Date(verifiedAt).toISOString(), contextTokens, usableTokens, costCents, quality, reliability, latencyScore, taskClasses, free };
  return { ok: true, policyVersion: COMPUTE_SOVEREIGNTY_POLICY_VERSION, status: 'COMPUTE_OFFER_ADMISSIBLE', offerId: `compute_offer_${digest(core).slice(0, 24)}`, ...core, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
}

export function compileComputeReusePlan({ rawInputTokens = 0, cacheHitTokens = 0, reusableContextTokens = 0, compressibleTokens = 0, compressionRatio = 1 } = {}) {
  const raw = integer(rawInputTokens, 0, 10_000_000_000);
  const cache = integer(cacheHitTokens, 0, raw ?? 0);
  const reusable = integer(reusableContextTokens, 0, raw ?? 0);
  const compressible = integer(compressibleTokens, 0, raw ?? 0);
  const ratio = finite(compressionRatio, 0.01, 1);
  if ([raw, cache, reusable, compressible, ratio].some(v => v == null)) return fail(['valid-token-reuse-inputs-required'], 'COMPUTE_REUSE_PLAN_INVALID');
  const reused = Math.min(raw, cache + reusable);
  const remaining = Math.max(0, raw - reused);
  const compressedPortion = Math.min(remaining, compressible);
  const compressedTokens = Math.ceil(compressedPortion * ratio);
  const billableEstimate = remaining - compressedPortion + compressedTokens;
  return {
    ok: true,
    policyVersion: COMPUTE_SOVEREIGNTY_POLICY_VERSION,
    status: 'COMPUTE_REUSE_PLAN_READY',
    rawInputTokens: raw,
    reusedTokens: reused,
    compressedSourceTokens: compressedPortion,
    compressedTokens,
    estimatedFreshInputTokens: billableEstimate,
    effectiveAvoidedTokens: raw - billableEstimate,
    effectiveMultiplier: billableEstimate > 0 ? raw / billableEstimate : raw > 0 ? Number.POSITIVE_INFINITY : 1,
    truthBoundary: 'TOKEN_REUSE_AND_COMPRESSION_REDUCE FRESH INFERENCE DEMAND; THEY DO NOT CREATE PROVIDER QUOTA OR ENTITLEMENT',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function allocateSovereignCompute({ taskClass = 'general', offers = [], requiredTokens = 1, minimumQuality = 0, minimumReliability = 0, preferZeroCost = true } = {}) {
  const klass = text(taskClass, 100)?.toLowerCase();
  const need = integer(requiredTokens, 1, 10_000_000_000);
  const q = finite(minimumQuality, 0, 1);
  const r = finite(minimumReliability, 0, 1);
  if (!klass || need == null || q == null || r == null) return fail(['valid-allocation-requirements-required']);
  if (!Array.isArray(offers) || offers.length === 0 || offers.length > MAX_OFFERS) return fail(['bounded-nonempty-offer-list-required']);
  const admissible = offers.map(normalizeComputeOffer).filter(x => x.ok && x.taskClasses.includes(klass) && x.usableTokens > 0 && x.quality >= q && x.reliability >= r);
  if (!admissible.length) return fail(['no-admissible-compute-supply'], 'COMPUTE_CAPACITY_BLOCKED');
  const ranked = admissible.map(offer => {
    const useful = offer.quality * offer.reliability * Math.max(0.05, offer.latencyScore);
    const zeroCostBoost = preferZeroCost && offer.costCents === 0 ? 1000 : 0;
    const economicScore = zeroCostBoost + useful * 100 - offer.costCents / Math.max(1, offer.usableTokens / 1_000_000);
    return { offer, useful, economicScore };
  }).sort((a, b) => b.economicScore - a.economicScore || b.offer.usableTokens - a.offer.usableTokens || a.offer.offerId.localeCompare(b.offer.offerId));
  let remaining = need;
  const allocations = [];
  let totalCostCents = 0;
  for (const item of ranked) {
    if (remaining <= 0) break;
    const tokens = Math.min(remaining, item.offer.usableTokens);
    const proportionalCost = item.offer.usableTokens > 0 ? Math.ceil(item.offer.costCents * (tokens / item.offer.usableTokens)) : 0;
    allocations.push({ offerId: item.offer.offerId, provider: item.offer.provider, model: item.offer.model, revision: item.offer.revision, rightsClass: item.offer.rightsClass, tokens, estimatedCostCents: proportionalCost, sourceRef: item.offer.sourceRef });
    totalCostCents += proportionalCost;
    remaining -= tokens;
  }
  return {
    ok: true,
    policyVersion: COMPUTE_SOVEREIGNTY_POLICY_VERSION,
    status: remaining === 0 ? 'COMPUTE_CAPACITY_ALLOCATED' : 'COMPUTE_CAPACITY_PARTIAL',
    requiredTokens: need,
    allocatedTokens: need - remaining,
    unfilledTokens: remaining,
    totalCostCents,
    zeroCostAllocatedTokens: allocations.filter(x => x.estimatedCostCents === 0).reduce((sum, x) => sum + x.tokens, 0),
    allocations,
    rejectedSupplyCount: offers.length - admissible.length,
    truthBoundary: 'ALLOCATOR OPTIMIZES ONLY AUTHORIZED, PROVENANCED COMPUTE SUPPLY. IT DOES NOT CREATE QUOTA, ACCOUNTS, CREDITS OR PAYMENT AUTHORITY.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export const COMPUTE_RIGHTS_CLASSES = Object.freeze([...RIGHTS]);
export const FORBIDDEN_COMPUTE_ACQUISITION_MODES = Object.freeze([...FORBIDDEN_ACQUISITION]);
