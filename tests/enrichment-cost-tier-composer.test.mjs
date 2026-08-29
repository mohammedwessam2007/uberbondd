import test from 'node:test';
import assert from 'node:assert/strict';
import { composeCostTieredEnrichmentPlan } from '../src/enrichment-cost-tier-composer.mjs';

const providers = [
  {
    id: 'public-company-site', mode: 'public_source', fields: ['industry'],
    configured: true, termsAllowed: true, verifiedFree: true,
    quality: 0.8, successRate: 0.8
  },
  {
    id: 'licensed-company-api', mode: 'licensed_api', fields: ['industry'],
    configured: true, termsAllowed: true, costKnown: true, costCentsPerRecord: 5,
    quality: 0.9, successRate: 0.9
  }
];

const base = {
  accountId: 'acct:1', fields: ['industry'], providers,
  totalBudgetCents: 20, maxExternalCalls: 5, budgetSource: 'budget:test',
  fieldBudgets: { industry: 20 }, providerCostCaps: { 'licensed-company-api': 20 },
  now: '2026-08-29T09:00:00Z'
};

test('pending public evidence work prevents paid provider admission', () => {
  const result = composeCostTieredEnrichmentPlan({
    ...base,
    publicSourcesByField: {
      industry: [{
        id: 'public-http', tier: 'PUBLIC_HTTP', configured: true, allowedPurpose: true,
        termsPurposeRef: 'terms:1', robotsDecisionRef: 'robots:1', publicSourceCheckRef: 'public:1',
        estimatedCostCents: 0
      }]
    }
  });
  assert.equal(result.fields[0].paidProviderAdmission, 'DENY');
  assert.equal(result.fields[0].paidProviderSelected, false);
  assert.equal(result.fields[0].waterfall.fields[0].steps.some(step => step.mode === 'licensed_api'), false);
});

test('paid provider is plan-eligible only after durable lower-tier exhaustion evidence', () => {
  const denied = composeCostTieredEnrichmentPlan(base);
  assert.equal(denied.fields[0].paidProviderAdmission, 'DENY');
  assert.equal(denied.fields[0].paidProviderSelected, false);

  const allowed = composeCostTieredEnrichmentPlan({
    ...base,
    lowerTierExhaustionByField: {
      industry: {
        status: 'EXHAUSTED_INSUFFICIENT_EVIDENCE',
        evidenceRef: 'evidence:lower-tier:1', policyRef: 'policy:public-tier:1',
        observedAt: '2026-08-29T08:00:00Z'
      }
    }
  });
  assert.equal(allowed.fields[0].paidProviderAdmission, 'ALLOW_PLAN_ONLY');
  assert.equal(allowed.fields[0].paidProviderSelected, true);
  assert.equal(allowed.businessEffectAuthority, 'NONE');
  assert.equal(allowed.executionStatus, 'NOT_RUN');
});

test('fresh cache prevents all provider planning for the field', () => {
  const result = composeCostTieredEnrichmentPlan({
    ...base,
    cacheByField: { industry: { hit: true, expired: false, contentHash: 'a'.repeat(64), sourceId: 'official-cache' } }
  });
  assert.equal(result.fields[0].decision, 'CACHE_REUSE_REQUIRED_BEFORE_PROVIDER_WORK');
  assert.equal(result.fields[0].waterfall, null);
  assert.equal(result.fields[0].paidProviderAdmission, 'DENY');
});

test('future lower-tier exhaustion evidence cannot unlock paid provider planning', () => {
  const result = composeCostTieredEnrichmentPlan({
    ...base,
    lowerTierExhaustionByField: {
      industry: {
        status: 'NO_ELIGIBLE_LOWER_TIER',
        evidenceRef: 'evidence:lower-tier:future', policyRef: 'policy:public-tier:1',
        observedAt: '2026-08-30T08:00:00Z'
      }
    }
  });
  assert.equal(result.fields[0].paidProviderAdmission, 'DENY');
  assert.equal(result.fields[0].paidProviderSelected, false);
});
