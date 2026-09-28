import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_DEFERRED_COMPUTE_PLANNER_VERSION = 'uberbond.frontier-deferred-compute-planner.v1';
export const DEFERRED_COMPUTE_MODES = Object.freeze([
  'INTERACTIVE',
  'OPENAI_FLEX',
  'OPENAI_BATCH',
  'ANTHROPIC_BATCH'
]);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) {
  return {
    policyVersion: FRONTIER_DEFERRED_COMPUTE_PLANNER_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function fail(status, reasonCodes, extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra });
}
function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function normalizePricing(raw, prefix) {
  const input = finite(raw?.inputUsdPerMillion);
  const output = finite(raw?.outputUsdPerMillion);
  const sourceRef = text(raw?.sourceRef, 1000);
  const verifiedAt = text(raw?.verifiedAt, 80);
  const cacheRead = raw?.cacheReadUsdPerMillion == null ? null : finite(raw.cacheReadUsdPerMillion);
  const cacheWrite = raw?.cacheWriteUsdPerMillion == null ? null : finite(raw.cacheWriteUsdPerMillion);
  const reasons = [];
  if (input == null || output == null || !sourceRef || !verifiedAt || !Number.isFinite(Date.parse(verifiedAt))) {
    reasons.push(`${prefix}-verified-pricing-required`);
  }
  if (raw?.cacheReadUsdPerMillion != null && cacheRead == null) reasons.push(`${prefix}-cache-read-price-invalid`);
  if (raw?.cacheWriteUsdPerMillion != null && cacheWrite == null) reasons.push(`${prefix}-cache-write-price-invalid`);
  return reasons.length ? { ok: false, reasonCodes: reasons } : {
    ok: true,
    pricing: {
      inputUsdPerMillion: input,
      outputUsdPerMillion: output,
      sourceRef,
      verifiedAt: new Date(Date.parse(verifiedAt)).toISOString(),
      ...(cacheRead != null ? { cacheReadUsdPerMillion: cacheRead } : {}),
      ...(cacheWrite != null ? { cacheWriteUsdPerMillion: cacheWrite } : {})
    }
  };
}

function sameCognitiveIdentity(a, b) {
  return a.provider === b.provider
    && a.model === b.model
    && a.revision === b.revision
    && a.reasoningSettingRef === b.reasoningSettingRef;
}

function normalizeJob(raw, index) {
  const id = text(raw?.jobId, 200)?.toLowerCase();
  const provider = text(raw?.provider, 80)?.toLowerCase();
  const model = text(raw?.model, 200);
  const revision = text(raw?.revision, 240);
  const reasoningSettingRef = text(raw?.reasoningSettingRef, 500);
  const promptPrefixDigest = text(raw?.promptPrefixDigest, 128);
  const inputTokens = integer(raw?.estimatedInputTokens, 0, 100_000_000);
  const cachedInputTokens = integer(raw?.estimatedCachedInputTokens ?? 0, 0, 100_000_000);
  const outputTokens = integer(raw?.maxOutputTokens, 1, 128_000);
  const latestAcceptableDelayMinutes = integer(raw?.latestAcceptableDelayMinutes ?? 0, 0, 7 * 24 * 60);
  const dataClass = text(raw?.dataClass, 80)?.toUpperCase();
  const reasons = [];
  if (!id || !provider || !model || !revision || !reasoningSettingRef) reasons.push(`job-${index}:complete-cognitive-identity-required`);
  if (!promptPrefixDigest || !/^[a-f0-9]{32,128}$/i.test(promptPrefixDigest)) reasons.push(`job-${index}:prompt-prefix-digest-required`);
  if (inputTokens == null || cachedInputTokens == null || cachedInputTokens > inputTokens || outputTokens == null) reasons.push(`job-${index}:valid-token-estimates-required`);
  if (latestAcceptableDelayMinutes == null) reasons.push(`job-${index}:valid-delay-bound-required`);
  if (!['PUBLIC','INTERNAL_NON_SECRET','SOURCE_CODE'].includes(dataClass)) reasons.push(`job-${index}:safe-data-class-required`);
  return reasons.length ? { ok: false, reasonCodes: reasons } : {
    ok: true,
    job: {
      jobId: id, provider, model, revision, reasoningSettingRef, promptPrefixDigest,
      estimatedInputTokens: inputTokens, estimatedCachedInputTokens: cachedInputTokens,
      maxOutputTokens: outputTokens, latestAcceptableDelayMinutes, dataClass
    }
  };
}

function chooseMode(job, capabilities) {
  const provider = job.provider;
  const delay = job.latestAcceptableDelayMinutes;
  if (provider === 'anthropic' && capabilities.anthropicBatch === true && delay >= 1440) return 'ANTHROPIC_BATCH';
  if (provider === 'openai' && capabilities.openaiBatch === true && delay >= 1440) return 'OPENAI_BATCH';
  if (provider === 'openai' && capabilities.openaiFlex === true && delay >= 15) return 'OPENAI_FLEX';
  return 'INTERACTIVE';
}

function costEstimate(job, pricing) {
  const cached = job.estimatedCachedInputTokens;
  const fresh = job.estimatedInputTokens - cached;
  const cacheRate = pricing.cacheReadUsdPerMillion ?? pricing.inputUsdPerMillion;
  const usd = (
    fresh * pricing.inputUsdPerMillion
    + cached * cacheRate
    + job.maxOutputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;
  return Number(usd.toFixed(8));
}

export function planFrontierDeferredCompute({
  jobs = [],
  capabilities = {},
  pricingByMode = {},
  maximumBatchJobs = 100000
} = {}) {
  const maxBatch = integer(maximumBatchJobs, 1, 100000);
  if (!Array.isArray(jobs) || !jobs.length || jobs.length > 100000 || maxBatch == null) {
    return fail('FRONTIER_DEFERRED_COMPUTE_REFUSED', ['bounded-job-list-required']);
  }

  const normalized = [];
  const reasons = [];
  for (const [index, raw] of jobs.entries()) {
    const checked = normalizeJob(raw, index);
    if (!checked.ok) reasons.push(...checked.reasonCodes);
    else normalized.push(checked.job);
  }
  if (reasons.length) return fail('FRONTIER_DEFERRED_COMPUTE_REFUSED', reasons);

  const groups = new Map();
  for (const job of normalized) {
    const mode = chooseMode(job, capabilities);
    const pricingRaw = pricingByMode[mode];
    const checkedPricing = normalizePricing(pricingRaw, mode.toLowerCase());
    if (!checkedPricing.ok) return fail('FRONTIER_DEFERRED_COMPUTE_REFUSED', checkedPricing.reasonCodes, { mode });

    const identity = {
      provider: job.provider,
      model: job.model,
      revision: job.revision,
      reasoningSettingRef: job.reasoningSettingRef,
      promptPrefixDigest: job.promptPrefixDigest,
      dataClass: job.dataClass,
      mode
    };
    const key = digest(identity);
    const bucket = groups.get(key) ?? { identity, pricing: checkedPricing.pricing, jobs: [] };
    if (bucket.jobs.length >= maxBatch && mode.endsWith('BATCH')) {
      return fail('FRONTIER_DEFERRED_COMPUTE_REFUSED', ['batch-job-limit-exceeded'], { mode, maximumBatchJobs: maxBatch });
    }
    bucket.jobs.push(job);
    groups.set(key, bucket);
  }

  const plans = [];
  let totalUsd = 0;
  for (const [groupDigest, group] of groups.entries()) {
    for (const job of group.jobs) {
      if (!sameCognitiveIdentity(job, group.identity)) {
        return fail('FRONTIER_DEFERRED_COMPUTE_REFUSED', ['cognitive-identity-mutation-detected']);
      }
    }
    const jobsWithCost = group.jobs.map(job => ({
      ...job,
      estimatedCostUsd: costEstimate(job, group.pricing)
    }));
    const estimatedCostUsd = Number(jobsWithCost.reduce((sum, job) => sum + job.estimatedCostUsd, 0).toFixed(8));
    totalUsd += estimatedCostUsd;
    plans.push({
      groupDigest,
      mode: group.identity.mode,
      cognitiveIdentity: {
        provider: group.identity.provider,
        model: group.identity.model,
        revision: group.identity.revision,
        reasoningSettingRef: group.identity.reasoningSettingRef
      },
      promptPrefixDigest: group.identity.promptPrefixDigest,
      dataClass: group.identity.dataClass,
      jobs: jobsWithCost,
      jobCount: jobsWithCost.length,
      estimatedCostUsd,
      pricingEvidence: group.pricing,
      sameModelQualityInvariant: 'MODEL_REVISION_AND_REASONING_SETTING_ARE_IDENTICAL_TO_THE_INTERACTIVE_PLAN; DEFERRED_MODE MAY CHANGE PRICE_OR_LATENCY BUT NOT COGNITIVE IDENTITY',
      authority: 'PLAN_ONLY'
    });
  }

  plans.sort((a,b)=>a.mode.localeCompare(b.mode)||a.groupDigest.localeCompare(b.groupDigest));
  return envelope({
    ok: true,
    status: 'FRONTIER_DEFERRED_COMPUTE_PLAN_READY',
    plans,
    groupCount: plans.length,
    jobCount: normalized.length,
    estimatedCostUsd: Number(totalUsd.toFixed(8)),
    executionAuthorized: false,
    qualityLaw: 'DEFERRED_COMPUTE_IS ADMITTED ONLY WHEN THE EXACT MODEL REVISION AND REASONING SETTING ARE PRESERVED; SAVINGS CANNOT BE CREATED BY DOWNGRADING THE BRAIN',
    truthBoundary: 'THIS PLANNER DOES NOT EXECUTE PROVIDER BATCHES OR PROVE DELIVERY LATENCY. EACH MODE REQUIRES CURRENT LIVE PROVIDER AVAILABILITY AND BILLING RECEIPTS BEFORE ECONOMIC CLAIMS ARE PROMOTED.'
  });
}
