// Deterministic, plan-only enrichment waterfall for the overnight intent lane.
// It ranks already-described providers and emits bounded work. It never calls
// a provider, performs network I/O, spends money, or authorizes outreach.
import { sha256 } from '../../omnia-v9/canonical.mjs';
import {
  EVIDENCE_CLASSES,
  PROSPECT_SOURCE_TYPES,
  clampEvidenceClassToSource,
  normalizeEnrichmentObservation,
  PROSPECT_EVIDENCE_VERSION,
  evaluateContactRoute
} from '../../prospect-evidence-reconciliation.mjs';

export const BUDGETED_ENRICHMENT_WATERFALL_VERSION = 'uberbond.overnight.budgeted-enrichment-waterfall.v1';

export const ENRICHMENT_PROVIDER_MODES = Object.freeze([
  'local',
  'public_source',
  'licensed_api',
  'licensed_export',
  'model_inference'
]);

const MODE_SOURCE_TYPE = Object.freeze({
  local: 'first_party',
  public_source: 'public_website',
  licensed_api: 'provider_api',
  licensed_export: 'licensed_provider',
  model_inference: 'model_inference'
});

const EVIDENCE_WEIGHT = Object.freeze({
  DIRECT_FIRST_PARTY: 1,
  DIRECT_PUBLIC: 0.85,
  LICENSED_PROVIDER: 0.75,
  ATTRIBUTED: 0.45,
  MODEL_INFERENCE: 0.1
});

const SOURCE_ORDER = Object.freeze({
  first_party: 5,
  owner_import: 5,
  public_website: 4,
  public_profile: 4,
  licensed_provider: 3,
  provider_api: 3,
  search_engine: 2,
  model_inference: 1
});

const CONTACT_FIELDS = new Set(['work_email', 'email', 'email_verification', 'phone', 'contact_route']);
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_MS = 30 * DAY_MS;
const DEFAULT_HALF_LIFE_MS = 14 * DAY_MS;
const MAX_RECORDS = 1000;
const MAX_FIELDS = 100;
const MAX_PROVIDERS = 200;
const MAX_RECORD_COUNT = 100000;

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function clamp(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function cents(value, fallback = 0, max = 100_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.round(parsed)));
}

function count(value, fallback = 1, max = MAX_RECORD_COUNT) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.round(parsed)));
}

function dateValue(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || '');
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} requires a valid date`);
  return date;
}

function uniqueFields(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(item => text(item, 120).toLowerCase())
    .filter(Boolean))].slice(0, MAX_FIELDS);
}

function uniqueStrings(values, max = 20) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(item => text(item, 180))
    .filter(Boolean))].slice(0, max);
}

function decay(ageMs, halfLifeMs) {
  if (!Number.isFinite(ageMs) || halfLifeMs <= 0) return 0;
  return Math.pow(0.5, Math.max(0, ageMs) / halfLifeMs);
}

function valueDigest(value) {
  try {
    return sha256(value === undefined ? null : value);
  } catch {
    return null;
  }
}

function normalizeVerificationState(value) {
  const normalized = text(value || 'UNVERIFIED', 60).toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
  return ['UNVERIFIED', 'SOURCE_REACHABLE', 'CONTENT_MATCHED', 'CONTRADICTED'].includes(normalized)
    ? normalized
    : 'UNVERIFIED';
}

function normalizeProvider(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('enrichment provider must be an object');
  const id = text(input.id || input.provider, 120).toLowerCase();
  if (!id) throw new Error('enrichment provider needs id');
  const mode = text(input.mode || '', 40).toLowerCase();
  if (!ENRICHMENT_PROVIDER_MODES.includes(mode)) throw new Error(`unsupported enrichment provider mode: ${mode || 'empty'}`);
  const fields = uniqueFields(input.fields);
  if (!fields.length) throw new Error(`enrichment provider ${id} needs fields`);
  const sourceType = text(input.sourceType || MODE_SOURCE_TYPE[mode], 60).toLowerCase();
  if (!PROSPECT_SOURCE_TYPES.includes(sourceType)) throw new Error(`unsupported enrichment source type: ${sourceType}`);
  const declaredEvidenceClass = text(input.evidenceClass || (mode === 'local' ? 'DIRECT_FIRST_PARTY' : mode === 'public_source' ? 'DIRECT_PUBLIC' : mode === 'model_inference' ? 'MODEL_INFERENCE' : 'LICENSED_PROVIDER'), 60).toUpperCase();
  if (!EVIDENCE_CLASSES.includes(declaredEvidenceClass)) throw new Error(`unsupported provider evidence class: ${declaredEvidenceClass}`);
  const clamped = clampEvidenceClassToSource(sourceType, declaredEvidenceClass);
  const external = mode !== 'local';
  const configured = external ? input.configured === true : input.configured !== false;
  const termsAllowed = external ? input.termsAllowed === true : true;
  const pricingSource = text(input.pricingSource, 500);
  const pricingVerifiedAt = text(input.pricingVerifiedAt, 80);
  const fixedCostCents = cents(input.fixedCostCents, 0);
  const perRecordInput = input.costCentsPerRecord ?? input.estimatedCostCents;
  const costCentsPerRecord = cents(perRecordInput, 0);
  const explicitlyFree = input.verifiedFree === true;
  const costKnown = !external || input.costKnown === true || explicitlyFree || Boolean(pricingSource && pricingVerifiedAt);
  const quality = clamp(input.quality, 0.5);
  const successRate = clamp(input.successRate ?? input.historicalSuccessRate, 0.5);
  const maxCallsPerRun = count(input.maxCallsPerRun, 1, MAX_FIELDS);
  const maxRecordsPerCall = count(input.maxRecordsPerCall, 1000, MAX_RECORD_COUNT);
  const fieldQuality = Object.fromEntries(fields.map(field => [field, clamp(input.qualityByField?.[field], quality)]));
  return {
    version: BUDGETED_ENRICHMENT_WATERFALL_VERSION,
    id,
    label: text(input.label || id, 180),
    mode,
    fields,
    sourceType,
    declaredEvidenceClass,
    evidenceClass: clamped.evidenceClass,
    evidenceClassClamped: clamped.clamped,
    evidenceWeight: EVIDENCE_WEIGHT[clamped.evidenceClass] ?? 0,
    external,
    configured,
    termsAllowed,
    costKnown,
    pricingSource,
    pricingVerifiedAt,
    fixedCostCents,
    costCentsPerRecord,
    quality,
    successRate,
    fieldQuality,
    maxCallsPerRun,
    maxRecordsPerCall,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE'
  };
}

function providerCost(provider, recordCount) {
  return cents(provider.fixedCostCents + provider.costCentsPerRecord * recordCount);
}

function providerUtility(provider, field) {
  const quality = provider.fieldQuality[field] ?? provider.quality;
  const evidence = provider.evidenceWeight;
  const source = SOURCE_ORDER[provider.sourceType] || 0;
  // Ordering is evidence-first. Cost is used only as a tie-breaker during
  // selection, never as a reason to treat weak evidence as strong evidence.
  return Number((quality * provider.successRate * evidence * 100 + source * 3 + (provider.mode === 'local' ? 6 : 0)).toFixed(6));
}

function normalizeObservation(raw, { now }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'malformed-observation' };
  if (raw.provenance === 'SYNTHETIC_TEST_FIXTURE' || raw.evidenceClass === 'SYNTHETIC_TEST_FIXTURE') {
    return { ok: false, reason: 'synthetic-observation-cannot-be-external-evidence' };
  }
  if (raw.version === PROSPECT_EVIDENCE_VERSION && raw.sourceType && raw.evidenceClass) {
    const clamped = clampEvidenceClassToSource(raw.sourceType, raw.evidenceClass);
    if (clamped.evidenceClass !== raw.evidenceClass && raw.evidenceClassClamped !== true) {
      return { ok: false, reason: 'evidence-class-source-mismatch' };
    }
  }
  try {
    const observation = raw.version === PROSPECT_EVIDENCE_VERSION
      ? { ...raw }
      : normalizeEnrichmentObservation(raw, { now });
    const observedMs = Date.parse(observation.observedAt || '');
    if (!Number.isFinite(observedMs)) return { ok: false, reason: 'invalid-observation-date' };
    if (observedMs > now.getTime() + 5 * 60 * 1000) return { ok: false, reason: 'observation-in-the-future' };
    return {
      ok: true,
      observation,
      verificationState: normalizeVerificationState(raw.verificationState || observation.verificationState)
    };
  } catch (error) {
    return { ok: false, reason: text(error?.message || 'invalid-observation', 180) };
  }
}

function fieldPolicy(field, policies = {}) {
  const configured = policies?.[field] || {};
  return {
    minConfidence: clamp(configured.minConfidence, CONTACT_FIELDS.has(field) ? 0.8 : 0.65),
    maxAgeMs: cents(configured.maxAgeMs, DEFAULT_MAX_AGE_MS, 3650 * DAY_MS),
    halfLifeMs: cents(configured.halfLifeMs, DEFAULT_HALF_LIFE_MS, 3650 * DAY_MS),
    requiresNonInferred: configured.requiresNonInferred !== false,
    requiresTrace: configured.requiresTrace !== false
  };
}

function summarizeFieldEvidence(field, rawObservations, { now, policies }) {
  const policy = fieldPolicy(field, policies);
  const inputs = Array.isArray(rawObservations) ? rawObservations.slice(0, MAX_RECORDS) : [];
  const rejected = [];
  const records = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const result = normalizeObservation(inputs[index], { now });
    if (!result.ok) {
      rejected.push({ index, reason: result.reason });
      continue;
    }
    const observation = result.observation;
    if (text(observation.field, 120).toLowerCase() !== field) {
      rejected.push({ index, reason: 'observation-field-mismatch' });
      continue;
    }
    const observedMs = Date.parse(observation.observedAt);
    const ageMs = Math.max(0, now.getTime() - observedMs);
    const expiresAtMs = Date.parse(observation.expiresAt || '');
    const stale = ageMs > policy.maxAgeMs || (Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime());
    const inferred = observation.inferred === true || observation.evidenceClass === 'MODEL_INFERENCE';
    const verificationState = result.verificationState;
    const confidenceKnown = Number.isFinite(Number(observation.confidence));
    const confidence = confidenceKnown ? clamp(observation.confidence) : 0;
    const evidenceWeight = EVIDENCE_WEIGHT[observation.evidenceClass] ?? 0;
    const freshnessDecay = decay(ageMs, policy.halfLifeMs);
    const tracePresent = Boolean(observation.sourceUrl || observation.sourceRecordId || observation.sourceType === 'owner_import');
    const effectiveConfidence = stale || verificationState === 'CONTRADICTED' || !confidenceKnown
      ? 0
      : Number((confidence * evidenceWeight * freshnessDecay * (verificationState === 'CONTENT_MATCHED' ? 1 : verificationState === 'SOURCE_REACHABLE' ? 0.8 : 0.5)).toFixed(6));
    records.push({
      observationId: text(observation.observationId, 180),
      field,
      sourceType: text(observation.sourceType, 60),
      evidenceClass: text(observation.evidenceClass, 60),
      verificationState,
      sourceUrl: text(observation.sourceUrl, 500) || null,
      sourceRecordId: text(observation.sourceRecordId, 180) || null,
      observedAt: observation.observedAt,
      ageMs,
      freshnessDecay: Number(freshnessDecay.toFixed(6)),
      confidence: confidenceKnown ? Number(confidence.toFixed(3)) : null,
      effectiveConfidence,
      inferred,
      stale,
      tracePresent,
      valueDigest: valueDigest(observation.value)
    });
  }

  const active = records.filter(item => !item.stale && item.verificationState !== 'CONTRADICTED');
  const direct = active.filter(item => !item.inferred && EVIDENCE_WEIGHT[item.evidenceClass] >= EVIDENCE_WEIGHT.DIRECT_PUBLIC);
  const directValues = new Set(direct.map(item => item.valueDigest).filter(Boolean));
  const conflict = directValues.size > 1;
  const candidates = conflict ? [] : active.filter(item => item.effectiveConfidence > 0);
  const sorted = [...candidates].sort((a, b) => b.effectiveConfidence - a.effectiveConfidence
    || (SOURCE_ORDER[b.sourceType] || 0) - (SOURCE_ORDER[a.sourceType] || 0)
    || String(b.observedAt).localeCompare(String(a.observedAt))
    || a.observationId.localeCompare(b.observationId));
  const preferred = sorted[0] || null;
  const satisfies = Boolean(preferred
    && preferred.effectiveConfidence >= policy.minConfidence
    && (!policy.requiresNonInferred || !preferred.inferred)
    && (!policy.requiresTrace || preferred.tracePresent));
  let status = 'NO_EVIDENCE';
  if (conflict) status = 'CONFLICT';
  else if (!active.length && records.length) status = 'STALE_ONLY';
  else if (preferred) status = satisfies ? 'READY' : 'WEAK_EVIDENCE';

  return {
    field,
    policy,
    status,
    satisfies,
    confidence: conflict || !preferred ? 0 : preferred.effectiveConfidence,
    preferredObservationId: preferred?.observationId || null,
    preferredValueDigest: preferred?.valueDigest || null,
    conflict,
    rejected,
    records
  };
}

function contactSuppression({ accountSuppressed, contactRoutes, suppressions, now }) {
  const routes = Array.isArray(contactRoutes) ? contactRoutes.slice(0, MAX_RECORDS) : [];
  const decisions = [];
  for (const item of routes) {
    const route = typeof item === 'string' ? item : item?.route || item?.email;
    try {
      decisions.push(evaluateContactRoute({
        route,
        verifications: typeof item === 'string' ? [] : item?.verifications || [],
        suppressions,
        now
      }));
    } catch {
      decisions.push({ status: 'REVIEW_INVALID_ROUTE', usableForHandoff: false, reasonCodes: ['invalid-contact-route'] });
    }
  }
  return {
    accountSuppressed: accountSuppressed === true,
    decisions,
    blocked: accountSuppressed === true || decisions.some(item => item.status === 'BLOCKED_SUPPRESSED'),
    blockedCount: decisions.filter(item => item.status === 'BLOCKED_SUPPRESSED').length
  };
}

function providerBlockReasons(provider) {
  const reasons = [];
  if (provider.external && !provider.configured) reasons.push('provider-not-configured');
  if (provider.external && !provider.termsAllowed) reasons.push('terms-or-purpose-not-confirmed');
  if (provider.external && !provider.costKnown) reasons.push('provider-cost-unknown');
  if (provider.evidenceWeight <= 0) reasons.push('provider-evidence-class-unknown');
  return reasons;
}

function compactProvider(provider) {
  return {
    id: provider.id,
    label: provider.label,
    mode: provider.mode,
    fields: provider.fields,
    sourceType: provider.sourceType,
    declaredEvidenceClass: provider.declaredEvidenceClass,
    evidenceClass: provider.evidenceClass,
    evidenceClassClamped: provider.evidenceClassClamped,
    evidenceWeight: provider.evidenceWeight,
    external: provider.external,
    configured: provider.configured,
    termsAllowed: provider.termsAllowed,
    costKnown: provider.costKnown,
    fixedCostCents: provider.fixedCostCents,
    costCentsPerRecord: provider.costCentsPerRecord,
    maxCallsPerRun: provider.maxCallsPerRun,
    maxRecordsPerCall: provider.maxRecordsPerCall,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Rank and select a bounded enrichment waterfall. All selected steps remain
 * PLAN_ONLY__NO_PROVIDER_CALL until a separate activation authority admits a
 * provider consequence.
 */
export function planBudgetedEnrichmentWaterfall({
  accountId = '',
  fields = [],
  providers = [],
  existingEvidence = {},
  fieldPolicies = {},
  fieldBudgets = {},
  providerCostCaps = {},
  totalBudgetCents = 0,
  budgetSource = '',
  maxExternalCalls = 0,
  maxProvidersPerField = 3,
  recordCount = 1,
  accountSuppressed = false,
  intentLedger = null,
  contactRoutes = [],
  suppressions = [],
  now = new Date()
} = {}) {
  const normalizedAccountId = text(accountId, 240);
  if (!normalizedAccountId) throw new Error('accountId is required for enrichment planning');
  const at = dateValue(now, 'enrichment planning now');
  const requestedFields = uniqueFields(fields);
  if (!requestedFields.length) throw new Error('enrichment planning needs fields');
  const normalizedProviders = (Array.isArray(providers) ? providers : []).slice(0, MAX_PROVIDERS).map(normalizeProvider);
  const totalCap = cents(totalBudgetCents);
  const externalCallCap = cents(maxExternalCalls, 0, MAX_FIELDS);
  const providerLimit = Math.max(1, Math.min(10, Math.round(Number(maxProvidersPerField) || 1)));
  const rows = count(recordCount, 1, MAX_RECORD_COUNT);
  const suppression = contactSuppression({
    accountSuppressed: accountSuppressed === true || intentLedger?.summary?.accountSuppressed === true,
    contactRoutes,
    suppressions: Array.isArray(suppressions) ? suppressions.slice(0, MAX_RECORDS) : [],
    now: at
  });

  const selectedCostByProvider = new Map();
  const selectedCallsByProvider = new Map();
  let selectedCost = 0;
  let selectedCalls = 0;
  let selectedPaidSteps = 0;
  const fieldsResult = [];

  for (const field of requestedFields) {
    const evidence = summarizeFieldEvidence(field, existingEvidence?.[field], { now: at, policies: fieldPolicies });
    const contactField = CONTACT_FIELDS.has(field);
    const suppressedField = contactField && suppression.blocked;
    const candidates = normalizedProviders
      .filter(provider => provider.fields.includes(field))
      .map(provider => ({ provider, utility: providerUtility(provider, field), blocked: providerBlockReasons(provider) }))
      .sort((a, b) => (b.provider.mode === 'local' ? 1 : 0) - (a.provider.mode === 'local' ? 1 : 0)
        || b.utility - a.utility
        || providerCost(a.provider, rows) - providerCost(b.provider, rows)
        || a.provider.id.localeCompare(b.provider.id));
    const blocked = candidates.filter(item => item.blocked.length).map(item => ({
      provider: item.provider.id,
      reasons: item.blocked,
      evidenceClass: item.provider.evidenceClass,
      evidenceClassClamped: item.provider.evidenceClassClamped
    }));
    const steps = [];
    const selectionReasons = [];

    if (evidence.satisfies) {
      fieldsResult.push({
        field,
        evidence,
        decision: 'SKIP_PROVIDER_WORK',
        selectionReasons: ['fresh-non-conflicting-evidence-satisfies-field'],
        candidates: candidates.map(item => ({ provider: item.provider.id, utility: item.utility })),
        blocked,
        steps,
        selectedExternalCostCents: 0,
        selectedExternalCalls: 0
      });
      continue;
    }

    if (suppressedField) {
      fieldsResult.push({
        field,
        evidence,
        decision: 'SUPPRESSED_CONTACT_FIELD',
        selectionReasons: ['suppression-dominates-enrichment'],
        candidates: candidates.map(item => ({ provider: item.provider.id, utility: item.utility })),
        blocked,
        steps,
        selectedExternalCostCents: 0,
        selectedExternalCalls: 0
      });
      continue;
    }

    for (const candidate of candidates) {
      if (steps.length >= providerLimit) break;
      const provider = candidate.provider;
      if (candidate.blocked.length) continue;
      const cost = providerCost(provider, rows);
      const calls = provider.external ? 1 : 0;
      if (provider.external && selectedCalls + calls > externalCallCap) {
        selectionReasons.push(`external-call-cap:${provider.id}`);
        continue;
      }
      const fieldCap = cents(fieldBudgets?.[field]);
      const providerCap = cents(providerCostCaps?.[provider.id], totalCap);
      const providerSelectedCost = selectedCostByProvider.get(provider.id) || 0;
      if (provider.external && cost > fieldCap - steps.reduce((sum, item) => sum + item.estimatedCostCents, 0)) {
        selectionReasons.push(`field-budget-cap:${provider.id}`);
        continue;
      }
      if (provider.external && cost > totalCap - selectedCost) {
        selectionReasons.push(`total-budget-cap:${provider.id}`);
        continue;
      }
      if (provider.external && cost > providerCap - providerSelectedCost) {
        selectionReasons.push(`provider-budget-cap:${provider.id}`);
        continue;
      }
      if (provider.external && cost > 0 && !text(budgetSource, 500)) {
        selectionReasons.push(`budget-source-required:${provider.id}`);
        continue;
      }
      const contactSafe = !contactField || ['DIRECT_FIRST_PARTY', 'DIRECT_PUBLIC', 'LICENSED_PROVIDER'].includes(provider.evidenceClass);
      if (contactField && !contactSafe) {
        selectionReasons.push(`private-contact-evidence-insufficient:${provider.id}`);
        continue;
      }
      steps.push({
        order: steps.length + 1,
        provider: provider.id,
        mode: provider.mode,
        utility: candidate.utility,
        evidenceClass: provider.evidenceClass,
        evidenceClassClamped: provider.evidenceClassClamped,
        sourceType: provider.sourceType,
        estimatedCostCents: cost,
        requiresProviderCall: provider.external,
        stopAfterSatisfyingField: true,
        planningAuthority: 'PLAN_ONLY__NO_PROVIDER_CALL'
      });
      if (provider.external) {
        selectedCost += cost;
        selectedCalls += calls;
        selectedPaidSteps += cost > 0 ? 1 : 0;
        selectedCostByProvider.set(provider.id, providerSelectedCost + cost);
        selectedCallsByProvider.set(provider.id, (selectedCallsByProvider.get(provider.id) || 0) + calls);
      }
    }

    if (!steps.length) {
      selectionReasons.push('no-step-fits-declared-bounds');
    }
    const hasLocal = steps.some(step => !step.requiresProviderCall);
    const hasExternal = steps.some(step => step.requiresProviderCall);
    const decision = hasExternal
      ? 'BOUNDED_WATERFALL_AVAILABLE'
      : hasLocal
        ? 'LOCAL_ONLY__EXTERNAL_DEFERRED'
        : candidates.length && blocked.length === candidates.length
          ? 'NO_EXECUTABLE_PROVIDER'
          : 'EXTERNAL_DEFERRED';
    fieldsResult.push({
      field,
      evidence,
      decision,
      selectionReasons: uniqueStrings(selectionReasons, 30),
      candidates: candidates.map(item => ({ provider: item.provider.id, utility: item.utility })),
      blocked,
      steps,
      selectedExternalCostCents: steps.reduce((sum, item) => sum + (item.requiresProviderCall ? item.estimatedCostCents : 0), 0),
      selectedExternalCalls: steps.filter(item => item.requiresProviderCall).length
    });
  }

  const planId = sha256({
    accountId: normalizedAccountId,
    fields: fieldsResult.map(item => ({
      field: item.field,
      decision: item.decision,
      preferredObservationId: item.evidence.preferredObservationId,
      steps: item.steps
    })),
    totalBudgetCents: totalCap,
    maxExternalCalls: externalCallCap,
    recordCount: rows
  });

  return {
    version: BUDGETED_ENRICHMENT_WATERFALL_VERSION,
    planId: `waterfall_${planId.slice(0, 24)}`,
    accountId: normalizedAccountId,
    generatedAt: at.toISOString(),
    requestedFields,
    providers: normalizedProviders.map(compactProvider),
    fields: fieldsResult,
    suppression: {
      accountSuppressed: suppression.accountSuppressed,
      blockedContactRoutes: suppression.blockedCount,
      contactFieldEnrichmentBlocked: suppression.blocked,
      businessEffectAuthority: 'NONE'
    },
    budget: {
      totalBudgetCents: totalCap,
      selectedCostCents: selectedCost,
      remainingBudgetCents: Math.max(0, totalCap - selectedCost),
      maxExternalCalls: externalCallCap,
      selectedExternalCalls: selectedCalls,
      remainingExternalCalls: Math.max(0, externalCallCap - selectedCalls),
      selectedPaidSteps,
      budgetSource: text(budgetSource, 500) || null,
      withinCaps: selectedCost <= totalCap && selectedCalls <= externalCallCap
    },
    selectedCostByProvider: Object.fromEntries([...selectedCostByProvider.entries()].sort(([a], [b]) => a.localeCompare(b))),
    selectedCallsByProvider: Object.fromEntries([...selectedCallsByProvider.entries()].sort(([a], [b]) => a.localeCompare(b))),
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    executionStatus: 'NOT_RUN',
    note: 'This is a bounded plan only. It performs no provider call, network request, spend, contact inference, outreach or authorization.'
  };
}

export const BUDGETED_ENRICHMENT_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  networkRequests: 0,
  moneySpentCents: 0,
  messagesSent: 0,
  businessEffectAuthority: 'NONE'
});
