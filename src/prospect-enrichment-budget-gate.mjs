export const ENRICHMENT_BUDGET_GATE_VERSION = 'uberbond.prospect-enrichment-budget-gate.v1';

function cents(value, fallback = 0, max = 100_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(max, Math.round(parsed)));
}

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 120)).filter(Boolean))];
}

export function evaluateEnrichmentBudgetGate({
  enrichmentPlan,
  fieldBudgets = {},
  totalExternalBudgetCents = 0,
  paidPlanningEnabled = false,
  budgetSource = '',
  allowResearchOnlyWithoutBudget = true
} = {}) {
  if (!enrichmentPlan || typeof enrichmentPlan !== 'object') throw new Error('enrichmentPlan is required');
  if (!Array.isArray(enrichmentPlan.fields)) throw new Error('enrichmentPlan.fields must be an array');
  if (enrichmentPlan.providerCalls !== 0 || enrichmentPlan.externalEffects !== 0 || enrichmentPlan.businessEffectAuthority !== 'NONE') {
    throw new Error('enrichmentPlan must be preparation-only');
  }

  const totalCap = cents(totalExternalBudgetCents);
  const source = text(budgetSource, 500);
  const fieldDecisions = [];
  let selectedExternalCostCents = 0;

  for (const fieldPlan of enrichmentPlan.fields) {
    const field = text(fieldPlan?.field, 120);
    if (!field) continue;
    const fieldCap = cents(fieldBudgets?.[field]);
    const skip = fieldPlan.skipProviderWork === true;
    const waterfall = Array.isArray(fieldPlan.waterfall) ? fieldPlan.waterfall : [];
    const localSteps = waterfall.filter(step => step?.requiresExternalCall !== true);
    const externalSteps = waterfall.filter(step => step?.requiresExternalCall === true);
    const reasons = [];
    const selectedExternalSteps = [];

    if (skip) {
      reasons.push('existing-evidence-satisfies-field');
      fieldDecisions.push({ field, decision: 'SKIP_PROVIDER_WORK', reasons, localSteps: [], externalSteps: [], selectedExternalCostCents: 0 });
      continue;
    }

    if (localSteps.length) reasons.push('local-or-read-only-evidence-first');

    if (!externalSteps.length) {
      fieldDecisions.push({ field, decision: localSteps.length ? 'LOCAL_ONLY' : 'NO_EXECUTABLE_PROVIDER', reasons, localSteps, externalSteps: [], selectedExternalCostCents: 0 });
      continue;
    }

    if (!paidPlanningEnabled) {
      reasons.push('paid-planning-disabled');
      fieldDecisions.push({
        field,
        decision: allowResearchOnlyWithoutBudget ? 'RESEARCH_ONLY__PAID_DEFERRED' : 'PAID_DEFERRED',
        reasons,
        localSteps,
        externalSteps: [],
        selectedExternalCostCents: 0
      });
      continue;
    }

    if (!source) {
      reasons.push('budget-source-required');
      fieldDecisions.push({ field, decision: 'PAID_DEFERRED', reasons, localSteps, externalSteps: [], selectedExternalCostCents: 0 });
      continue;
    }

    if (fieldCap <= 0 || totalCap <= 0) {
      reasons.push(fieldCap <= 0 ? 'field-budget-required' : 'total-budget-required');
      fieldDecisions.push({ field, decision: 'PAID_DEFERRED', reasons, localSteps, externalSteps: [], selectedExternalCostCents: 0 });
      continue;
    }

    let fieldSpend = 0;
    for (const step of externalSteps) {
      const stepCost = cents(step?.estimatedCostCents);
      if (stepCost <= 0) {
        reasons.push(`external-cost-unknown-or-zero:${text(step?.provider, 120)}`);
        continue;
      }
      if (fieldSpend + stepCost > fieldCap) continue;
      if (selectedExternalCostCents + fieldSpend + stepCost > totalCap) continue;
      selectedExternalSteps.push({ ...step, planningAuthority: 'PLAN_ONLY__NO_PROVIDER_CALL' });
      fieldSpend += stepCost;
    }

    if (!selectedExternalSteps.length) reasons.push('no-external-step-fits-budget');
    selectedExternalCostCents += fieldSpend;
    fieldDecisions.push({
      field,
      decision: selectedExternalSteps.length ? 'BOUNDED_EXTERNAL_PLAN_AVAILABLE' : (localSteps.length ? 'LOCAL_ONLY__PAID_DEFERRED' : 'PAID_DEFERRED'),
      reasons,
      localSteps,
      externalSteps: selectedExternalSteps,
      selectedExternalCostCents: fieldSpend
    });
  }

  const blockedReasons = unique(fieldDecisions.flatMap(item => item.reasons.filter(reason => reason.includes('required') || reason.includes('disabled'))));
  return {
    version: ENRICHMENT_BUDGET_GATE_VERSION,
    planId: text(enrichmentPlan.planId, 160),
    paidPlanningEnabled: paidPlanningEnabled === true,
    budgetSource: source,
    totalExternalBudgetCents: totalCap,
    selectedExternalCostCents,
    remainingExternalBudgetCents: Math.max(0, totalCap - selectedExternalCostCents),
    fields: fieldDecisions,
    blockedReasons,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    executionStatus: 'NOT_RUN',
    note: 'This gate can authorize only a bounded plan. Provider invocation, spend and outreach remain separately governed consequences.'
  };
}
