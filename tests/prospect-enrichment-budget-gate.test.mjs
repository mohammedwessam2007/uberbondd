import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEnrichmentBudgetGate } from '../src/prospect-enrichment-budget-gate.mjs';

function basePlan(overrides = {}) {
  return {
    planId: 'plan_1',
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    fields: [
      {
        field: 'work_email',
        skipProviderWork: false,
        waterfall: [
          { provider: 'local-evidence', requiresExternalCall: false, estimatedCostCents: 0 },
          { provider: 'licensed-a', requiresExternalCall: true, estimatedCostCents: 8 },
          { provider: 'licensed-b', requiresExternalCall: true, estimatedCostCents: 12 }
        ]
      }
    ],
    ...overrides
  };
}

test('paid provider planning is deferred by default even when providers exist', () => {
  const result = evaluateEnrichmentBudgetGate({ enrichmentPlan: basePlan() });
  assert.equal(result.fields[0].decision, 'RESEARCH_ONLY__PAID_DEFERRED');
  assert.equal(result.selectedExternalCostCents, 0);
  assert.equal(result.providerCalls, 0);
});

test('fresh sufficient evidence skips all provider work', () => {
  const result = evaluateEnrichmentBudgetGate({
    enrichmentPlan: basePlan({ fields: [{ field: 'work_email', skipProviderWork: true, waterfall: [{ provider: 'licensed-a', requiresExternalCall: true, estimatedCostCents: 8 }] }] }),
    paidPlanningEnabled: true,
    fieldBudgets: { work_email: 100 },
    totalExternalBudgetCents: 100,
    budgetSource: 'owner-configured-test-cap'
  });
  assert.equal(result.fields[0].decision, 'SKIP_PROVIDER_WORK');
  assert.equal(result.selectedExternalCostCents, 0);
});

test('paid planning requires an explicit budget source', () => {
  const result = evaluateEnrichmentBudgetGate({
    enrichmentPlan: basePlan(),
    paidPlanningEnabled: true,
    fieldBudgets: { work_email: 100 },
    totalExternalBudgetCents: 100
  });
  assert.equal(result.fields[0].decision, 'PAID_DEFERRED');
  assert.ok(result.fields[0].reasons.includes('budget-source-required'));
});

test('paid planning requires both field and total caps', () => {
  const missingField = evaluateEnrichmentBudgetGate({ enrichmentPlan: basePlan(), paidPlanningEnabled: true, totalExternalBudgetCents: 100, budgetSource: 'owner-cap' });
  assert.equal(missingField.fields[0].decision, 'PAID_DEFERRED');
  assert.ok(missingField.fields[0].reasons.includes('field-budget-required'));

  const missingTotal = evaluateEnrichmentBudgetGate({ enrichmentPlan: basePlan(), paidPlanningEnabled: true, fieldBudgets: { work_email: 100 }, budgetSource: 'owner-cap' });
  assert.equal(missingTotal.fields[0].decision, 'PAID_DEFERRED');
  assert.ok(missingTotal.fields[0].reasons.includes('total-budget-required'));
});

test('external steps are selected only when they fit both caps', () => {
  const result = evaluateEnrichmentBudgetGate({
    enrichmentPlan: basePlan(),
    paidPlanningEnabled: true,
    fieldBudgets: { work_email: 10 },
    totalExternalBudgetCents: 9,
    budgetSource: 'owner-cap'
  });
  assert.equal(result.fields[0].decision, 'BOUNDED_EXTERNAL_PLAN_AVAILABLE');
  assert.equal(result.fields[0].externalSteps.length, 1);
  assert.equal(result.fields[0].externalSteps[0].provider, 'licensed-a');
  assert.equal(result.fields[0].selectedExternalCostCents, 8);
  assert.equal(result.selectedExternalCostCents, 8);
  assert.equal(result.remainingExternalBudgetCents, 1);
});

test('unknown or zero external cost is never silently treated as free paid work', () => {
  const plan = basePlan({ fields: [{ field: 'phone', skipProviderWork: false, waterfall: [{ provider: 'licensed-unknown', requiresExternalCall: true, estimatedCostCents: 0 }] }] });
  const result = evaluateEnrichmentBudgetGate({ enrichmentPlan: plan, paidPlanningEnabled: true, fieldBudgets: { phone: 100 }, totalExternalBudgetCents: 100, budgetSource: 'owner-cap' });
  assert.equal(result.fields[0].decision, 'PAID_DEFERRED');
  assert.ok(result.fields[0].reasons.includes('external-cost-unknown-or-zero:licensed-unknown'));
});

test('local evidence remains usable when paid escalation is deferred', () => {
  const result = evaluateEnrichmentBudgetGate({ enrichmentPlan: basePlan(), paidPlanningEnabled: true, fieldBudgets: { work_email: 1 }, totalExternalBudgetCents: 1, budgetSource: 'owner-cap' });
  assert.equal(result.fields[0].decision, 'LOCAL_ONLY__PAID_DEFERRED');
  assert.equal(result.fields[0].localSteps.length, 1);
  assert.equal(result.fields[0].externalSteps.length, 0);
});

test('the gate rejects a plan that already claims provider calls or business authority', () => {
  assert.throws(() => evaluateEnrichmentBudgetGate({ enrichmentPlan: basePlan({ providerCalls: 1 }) }), /preparation-only/);
  assert.throws(() => evaluateEnrichmentBudgetGate({ enrichmentPlan: basePlan({ externalEffects: 1 }) }), /preparation-only/);
  assert.throws(() => evaluateEnrichmentBudgetGate({ enrichmentPlan: basePlan({ businessEffectAuthority: 'SEND' }) }), /preparation-only/);
});

test('even a bounded paid plan remains plan-only with zero execution authority', () => {
  const result = evaluateEnrichmentBudgetGate({ enrichmentPlan: basePlan(), paidPlanningEnabled: true, fieldBudgets: { work_email: 50 }, totalExternalBudgetCents: 50, budgetSource: 'owner-cap' });
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.providerCalls, 0);
  assert.equal(result.externalEffects, 0);
  assert.equal(result.executionStatus, 'NOT_RUN');
  assert.ok(result.fields[0].externalSteps.every(step => step.planningAuthority === 'PLAN_ONLY__NO_PROVIDER_CALL'));
});
