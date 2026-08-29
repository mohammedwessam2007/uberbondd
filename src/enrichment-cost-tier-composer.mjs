import crypto from 'node:crypto';
import { compileEvidenceAcquisitionPlan } from './cost-aware-public-evidence-tier.mjs';
import { planBudgetedEnrichmentWaterfall } from './overnight/intent/budgeted-enrichment-waterfall.mjs';

export const COST_TIERED_ENRICHMENT_COMPOSER_VERSION = 'uberbond.cost-tiered-enrichment-composer.v1';
const EXHAUSTION_STATES = new Set(['EXHAUSTED_INSUFFICIENT_EVIDENCE', 'NO_ELIGIBLE_LOWER_TIER']);
const PAID_MODES = new Set(['licensed_api', 'licensed_export']);
const LOWER_MODES = new Set(['local', 'public_source']);
const text = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fields = values => [...new Set((Array.isArray(values) ? values : []).map(v => text(v, 120).toLowerCase()).filter(Boolean))].slice(0, 100);
const zeroEffects = () => ({ providerCalls: 0, networkRequests: 0, moneySpentCents: 0, messagesSent: 0 });

function normalizeExhaustion(input, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'lower-tier-exhaustion-evidence-required' };
  const status = String(input.status ?? '').trim().toUpperCase();
  const evidenceRef = text(input.evidenceRef, 240);
  const policyRef = text(input.policyRef, 240);
  const observed = new Date(input.observedAt || '');
  if (!EXHAUSTION_STATES.has(status)) return { ok: false, reason: 'invalid-lower-tier-exhaustion-status' };
  if (!evidenceRef) return { ok: false, reason: 'lower-tier-exhaustion-evidence-ref-required' };
  if (!policyRef) return { ok: false, reason: 'lower-tier-exhaustion-policy-ref-required' };
  if (!Number.isFinite(observed.getTime())) return { ok: false, reason: 'lower-tier-exhaustion-observed-at-required' };
  if (observed.getTime() > now.getTime() + 300_000) return { ok: false, reason: 'future-lower-tier-exhaustion-evidence' };
  return { ok: true, status, evidenceRef, policyRef, observedAt: observed.toISOString() };
}

function lowerTierPending(acquisitionPlan) {
  if (!acquisitionPlan?.ok) return true;
  if (acquisitionPlan.plan?.cacheFresh) return true;
  return (acquisitionPlan.plan?.steps || []).some(step => ['DNS_PUBLIC', 'OFFICIAL_REGISTRY', 'PUBLIC_HTTP', 'PUBLIC_BROWSER'].includes(step.tier));
}

export function composeCostTieredEnrichmentPlan(input = {}) {
  const accountId = text(input.accountId, 240);
  const requestedFields = fields(input.fields);
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  if (!accountId) throw new Error('accountId is required');
  if (!requestedFields.length) throw new Error('fields are required');
  if (!Number.isFinite(now.getTime())) throw new Error('valid now required');

  let remainingBudgetCents = Math.max(0, Math.round(Number(input.totalBudgetCents || 0)));
  let remainingExternalCalls = Math.max(0, Math.round(Number(input.maxExternalCalls || 0)));
  const outputFields = [];
  let selectedCostCents = 0;
  let selectedExternalCalls = 0;

  for (const field of requestedFields) {
    const acquisition = compileEvidenceAcquisitionPlan({
      targetRef: accountId,
      field,
      occurrenceKey: text(input.occurrenceKey, 300) || `enrich:${accountId}:${field}`,
      cache: input.cacheByField?.[field] || {},
      sources: input.publicSourcesByField?.[field] || []
    });
    if (!acquisition.ok) {
      outputFields.push({ field, decision: 'PUBLIC_EVIDENCE_PLAN_BLOCKED', acquisition, paidProviderAdmission: 'DENY', waterfall: null });
      continue;
    }

    const exhaustion = normalizeExhaustion(input.lowerTierExhaustionByField?.[field], now);
    const pendingLower = lowerTierPending(acquisition);
    const cacheFresh = acquisition.plan?.cacheFresh === true;

    if (cacheFresh) {
      outputFields.push({
        field,
        decision: 'CACHE_REUSE_REQUIRED_BEFORE_PROVIDER_WORK',
        acquisition,
        lowerTierExhaustion: exhaustion.ok ? exhaustion : null,
        paidProviderAdmission: 'DENY',
        waterfall: null,
        reasonCodes: ['fresh-cache-must-be-consumed-before-provider-work']
      });
      continue;
    }

    const paidAllowed = exhaustion.ok && !pendingLower;
    const providerSubset = (Array.isArray(input.providers) ? input.providers : []).filter(provider => {
      const mode = String(provider?.mode ?? '').trim().toLowerCase();
      if (paidAllowed) return true;
      return LOWER_MODES.has(mode) && !PAID_MODES.has(mode);
    });

    const waterfall = planBudgetedEnrichmentWaterfall({
      accountId,
      fields: [field],
      providers: providerSubset,
      existingEvidence: input.existingEvidence || {},
      fieldPolicies: input.fieldPolicies || {},
      fieldBudgets: input.fieldBudgets || {},
      providerCostCaps: input.providerCostCaps || {},
      totalBudgetCents: remainingBudgetCents,
      budgetSource: input.budgetSource || '',
      maxExternalCalls: remainingExternalCalls,
      maxProvidersPerField: input.maxProvidersPerField || 3,
      recordCount: input.recordCount || 1,
      accountSuppressed: input.accountSuppressed === true,
      intentLedger: input.intentLedger || null,
      contactRoutes: input.contactRoutes || [],
      suppressions: input.suppressions || [],
      now
    });
    const cost = waterfall.budget?.selectedCostCents || 0;
    const calls = waterfall.budget?.selectedExternalCalls || 0;
    selectedCostCents += cost;
    selectedExternalCalls += calls;
    remainingBudgetCents = Math.max(0, remainingBudgetCents - cost);
    remainingExternalCalls = Math.max(0, remainingExternalCalls - calls);

    const paidSelected = (waterfall.fields?.[0]?.steps || []).some(step => PAID_MODES.has(step.mode));
    const decision = paidAllowed
      ? 'LOWER_TIER_EXHAUSTED__BOUNDED_WATERFALL_ADMITTED'
      : pendingLower
        ? 'LOWER_COST_EVIDENCE_PENDING'
        : 'LOWER_TIER_EXHAUSTION_RECEIPT_REQUIRED_BEFORE_PAID_PROVIDER';
    outputFields.push({
      field,
      decision,
      acquisition,
      lowerTierExhaustion: exhaustion.ok ? exhaustion : null,
      paidProviderAdmission: paidAllowed ? 'ALLOW_PLAN_ONLY' : 'DENY',
      paidProviderSelected: paidSelected,
      waterfall,
      reasonCodes: paidAllowed ? [] : [exhaustion.reason || (pendingLower ? 'lower-cost-evidence-work-remains' : 'lower-tier-exhaustion-evidence-required')]
    });
  }

  const planCore = outputFields.map(item => ({ field: item.field, decision: item.decision, acquisitionPlanId: item.acquisition?.plan?.planId || null, waterfallPlanId: item.waterfall?.planId || null, paidProviderAdmission: item.paidProviderAdmission }));
  return {
    ok: outputFields.every(item => item.acquisition?.ok !== false),
    version: COST_TIERED_ENRICHMENT_COMPOSER_VERSION,
    planId: `cost_enrich_${sha({ accountId, planCore }).slice(0, 28)}`,
    accountId,
    generatedAt: now.toISOString(),
    fields: outputFields,
    budget: {
      totalBudgetCents: Math.max(0, Math.round(Number(input.totalBudgetCents || 0))),
      selectedCostCents,
      remainingBudgetCents,
      maxExternalCalls: Math.max(0, Math.round(Number(input.maxExternalCalls || 0))),
      selectedExternalCalls,
      remainingExternalCalls
    },
    law: 'NO_LICENSED_PROVIDER_PLAN_UNTIL_CACHE_AND_LEGITIMATE_LOWER_COST_PUBLIC_EVIDENCE_ARE_EXHAUSTED_WITH_DURABLE_EVIDENCE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    executionStatus: 'NOT_RUN'
  };
}
