import { sha256 } from './omnia-v9/canonical.mjs';

export const ENRICHMENT_PLANNER_VERSION = 'uberbond.prospect-enrichment-planner.v1';

const MODES = new Set(['local', 'licensed_api', 'licensed_export', 'public_source']);
const EVIDENCE_TIERS = Object.freeze({ direct_first_party: 100, direct_public: 85, licensed_provider: 75, attributed: 45, model_inference: 10 });

function text(value, max = 300) { return String(value ?? '').trim().slice(0, max); }
function clamp(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function iso(value) {
  const parsed = new Date(value || '');
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function unique(values, max = 50) {
  return [...new Set((Array.isArray(values) ? values : []).map(item => text(item, 100).toLowerCase()).filter(Boolean))].slice(0, max);
}

export function normalizeEnrichmentProviderDescriptor(input = {}) {
  const id = text(input.id || input.provider, 120).toLowerCase();
  if (!id) throw new Error('Enrichment provider needs id');
  const mode = text(input.mode || 'licensed_api', 40).toLowerCase();
  if (!MODES.has(mode)) throw new Error(`Unsupported enrichment provider mode: ${mode}`);
  const fields = unique(input.fields);
  if (!fields.length) throw new Error('Enrichment provider needs at least one field');
  const external = mode === 'licensed_api';
  const configured = external ? input.configured === true : true;
  const termsAllowed = input.termsAllowed === true || !external;
  const evidenceTier = text(input.evidenceTier || (mode === 'local' ? 'direct_first_party' : mode === 'public_source' ? 'direct_public' : 'licensed_provider'), 60).toLowerCase();
  if (!(evidenceTier in EVIDENCE_TIERS)) throw new Error(`Unsupported evidence tier: ${evidenceTier}`);
  const estimatedCostCents = Math.max(0, Math.round(Number(input.estimatedCostCents) || 0));
  const pricingSource = text(input.pricingSource, 500);
  const pricingVerifiedAt = iso(input.pricingVerifiedAt);
  const paid = estimatedCostCents > 0;
  const pricingEvidenceComplete = !paid || Boolean(pricingSource && pricingVerifiedAt);
  return {
    version: ENRICHMENT_PLANNER_VERSION,
    id, label: text(input.label || id, 160), mode, fields, external, configured, termsAllowed,
    evidenceTier,
    quality: Number(clamp(input.quality, mode === 'local' ? 0.9 : 0.7).toFixed(3)),
    historicalSuccessRate: Number(clamp(input.historicalSuccessRate, 0.5).toFixed(3)),
    estimatedCostCents,
    pricingSource,
    pricingVerifiedAt,
    pricingEvidenceComplete,
    estimatedLatencyMs: Math.max(0, Math.round(Number(input.estimatedLatencyMs) || 0)),
    maxRecordsPerRun: Math.max(1, Math.min(100000, Math.round(Number(input.maxRecordsPerRun) || 1000))),
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE'
  };
}

function utility(provider) {
  const evidence = EVIDENCE_TIERS[provider.evidenceTier] || 0;
  const quality = provider.quality * 30;
  const success = provider.historicalSuccessRate * 20;
  const costPenalty = Math.min(20, provider.estimatedCostCents / 5);
  const latencyPenalty = Math.min(10, provider.estimatedLatencyMs / 2000);
  const localBonus = provider.mode === 'local' ? 8 : 0;
  return Number((evidence + quality + success + localBonus - costPenalty - latencyPenalty).toFixed(3));
}

export function planEnrichmentWaterfall({ fields = [], providers = [], existingEvidence = {}, maxExternalProvidersPerField = 3 } = {}) {
  const requestedFields = unique(fields);
  if (!requestedFields.length) throw new Error('Enrichment waterfall needs fields');
  const normalizedProviders = providers.map(item => item?.version === ENRICHMENT_PLANNER_VERSION ? { ...item } : normalizeEnrichmentProviderDescriptor(item));
  const externalCap = Math.max(0, Math.min(10, Math.round(Number(maxExternalProvidersPerField) || 0)));
  const fieldPlans = requestedFields.map(field => {
    const existing = existingEvidence?.[field] || null;
    const candidates = normalizedProviders.filter(provider => provider.fields.includes(field));
    const blocked = [];
    const executable = [];
    for (const provider of candidates) {
      if (provider.external && !provider.configured) {
        blocked.push({ provider: provider.id, reason: 'provider-not-configured' });
        continue;
      }
      if (provider.external && !provider.termsAllowed) {
        blocked.push({ provider: provider.id, reason: 'terms-or-purpose-not-confirmed' });
        continue;
      }
      if (!provider.pricingEvidenceComplete) {
        blocked.push({ provider: provider.id, reason: 'paid-provider-pricing-evidence-incomplete' });
        continue;
      }
      executable.push({ ...provider, utility: utility(provider) });
    }
    executable.sort((a, b) => b.utility - a.utility || a.estimatedCostCents - b.estimatedCostCents || a.id.localeCompare(b.id));
    const local = executable.filter(provider => !provider.external);
    const external = executable.filter(provider => provider.external).slice(0, externalCap);
    const waterfall = [...local, ...external].map((provider, index) => ({
      order: index + 1,
      provider: provider.id,
      mode: provider.mode,
      evidenceTier: provider.evidenceTier,
      utility: provider.utility,
      estimatedCostCents: provider.estimatedCostCents,
      estimatedLatencyMs: provider.estimatedLatencyMs,
      requiresExternalCall: provider.external,
      status: provider.external ? 'PLANNED_EXTERNAL_CALL_REQUIRES_SEPARATE_AUTHORITY' : 'LOCAL_READ_ONLY'
    }));
    return {
      field,
      existingEvidence: existing,
      skipProviderWork: Boolean(existing?.satisfies === true && existing?.stale !== true && existing?.conflict !== true),
      waterfall,
      blocked,
      stopRule: field === 'work_email' || field === 'email_verification'
        ? 'Stop only on exact source-backed contact evidence that satisfies the verification policy; inferred private addresses never satisfy the field.'
        : 'Stop on a non-conflicting, non-stale, source-backed value that satisfies the field policy.'
    };
  });
  const projectedExternalCostCents = fieldPlans.reduce((sum, plan) => sum + (plan.skipProviderWork ? 0 : plan.waterfall.reduce((inner, item) => inner + (item.requiresExternalCall ? item.estimatedCostCents : 0), 0)), 0);
  const digest = sha256({ requestedFields, fieldPlans: fieldPlans.map(plan => ({ field: plan.field, skipProviderWork: plan.skipProviderWork, waterfall: plan.waterfall, blocked: plan.blocked })) });
  return {
    version: ENRICHMENT_PLANNER_VERSION,
    planId: `enrichplan_${digest.slice(0, 24)}`,
    requestedFields,
    fields: fieldPlans,
    projectedExternalCostCents,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    executionStatus: 'NOT_RUN',
    note: 'This object ranks possible enrichment steps only. It never calls a provider and never authorizes outreach.'
  };
}
