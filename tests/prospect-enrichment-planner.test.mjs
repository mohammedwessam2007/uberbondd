import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEnrichmentProviderDescriptor,
  planEnrichmentWaterfall
} from '../src/prospect-enrichment-planner.mjs';

function localProvider(overrides = {}) {
  return normalizeEnrichmentProviderDescriptor({
    id: 'local-evidence', mode: 'local', fields: ['company_profile', 'technology'],
    evidenceTier: 'direct_first_party', quality: 0.9, historicalSuccessRate: 0.95,
    ...overrides
  });
}

function paidProvider(overrides = {}) {
  return normalizeEnrichmentProviderDescriptor({
    id: 'provider-a', mode: 'licensed_api', fields: ['work_email', 'email_verification'],
    configured: true, termsAllowed: true, evidenceTier: 'licensed_provider',
    quality: 0.8, historicalSuccessRate: 0.8, estimatedCostCents: 5,
    pricingSource: 'https://example.com/pricing', pricingVerifiedAt: '2026-08-22T00:00:00Z',
    estimatedLatencyMs: 500, ...overrides
  });
}

test('planner is preparation-only and performs zero provider calls', () => {
  const plan = planEnrichmentWaterfall({ fields: ['company_profile'], providers: [localProvider()] });
  assert.equal(plan.executionStatus, 'NOT_RUN');
  assert.equal(plan.providerCalls, 0);
  assert.equal(plan.externalEffects, 0);
  assert.equal(plan.businessEffectAuthority, 'NONE');
});

test('satisfied existing evidence skips provider work for that field', () => {
  const plan = planEnrichmentWaterfall({
    fields: ['company_profile'], providers: [localProvider()],
    existingEvidence: { company_profile: { satisfies: true, stale: false, conflict: false } }
  });
  assert.equal(plan.fields[0].skipProviderWork, true);
  assert.equal(plan.projectedExternalCostCents, 0);
});

test('stale existing evidence does not suppress refresh plan', () => {
  const plan = planEnrichmentWaterfall({
    fields: ['company_profile'], providers: [localProvider()],
    existingEvidence: { company_profile: { satisfies: true, stale: true, conflict: false } }
  });
  assert.equal(plan.fields[0].skipProviderWork, false);
});

test('conflicting existing evidence does not suppress refresh plan', () => {
  const plan = planEnrichmentWaterfall({
    fields: ['company_profile'], providers: [localProvider()],
    existingEvidence: { company_profile: { satisfies: true, stale: false, conflict: true } }
  });
  assert.equal(plan.fields[0].skipProviderWork, false);
});

test('unconfigured external provider is blocked instead of silently planned', () => {
  const provider = paidProvider({ configured: false });
  const plan = planEnrichmentWaterfall({ fields: ['work_email'], providers: [provider] });
  assert.equal(plan.fields[0].waterfall.length, 0);
  assert.deepEqual(plan.fields[0].blocked, [{ provider: 'provider-a', reason: 'provider-not-configured' }]);
});

test('provider with unconfirmed allowed purpose is blocked', () => {
  const provider = paidProvider({ termsAllowed: false });
  const plan = planEnrichmentWaterfall({ fields: ['work_email'], providers: [provider] });
  assert.equal(plan.fields[0].waterfall.length, 0);
  assert.equal(plan.fields[0].blocked[0].reason, 'terms-or-purpose-not-confirmed');
});

test('paid provider without pricing evidence is blocked', () => {
  const provider = paidProvider({ pricingSource: '', pricingVerifiedAt: '' });
  const plan = planEnrichmentWaterfall({ fields: ['work_email'], providers: [provider] });
  assert.equal(plan.fields[0].waterfall.length, 0);
  assert.equal(plan.fields[0].blocked[0].reason, 'paid-provider-pricing-evidence-incomplete');
});

test('local evidence is ordered before external provider calls when both cover the field', () => {
  const local = localProvider({ fields: ['technology'] });
  const external = paidProvider({ id: 'provider-tech', fields: ['technology'], estimatedCostCents: 1, quality: 1, historicalSuccessRate: 1 });
  const plan = planEnrichmentWaterfall({ fields: ['technology'], providers: [external, local] });
  assert.equal(plan.fields[0].waterfall[0].provider, 'local-evidence');
  assert.equal(plan.fields[0].waterfall[0].requiresExternalCall, false);
});

test('external provider cap bounds planned calls per field', () => {
  const providers = [0, 1, 2, 3].map(index => paidProvider({ id: `provider-${index}`, estimatedCostCents: index + 1 }));
  const plan = planEnrichmentWaterfall({ fields: ['work_email'], providers, maxExternalProvidersPerField: 2 });
  assert.equal(plan.fields[0].waterfall.filter(item => item.requiresExternalCall).length, 2);
});

test('planner cost is a projection, not evidence that money was spent', () => {
  const plan = planEnrichmentWaterfall({ fields: ['work_email'], providers: [paidProvider()] });
  assert.equal(plan.projectedExternalCostCents, 5);
  assert.equal(plan.externalEffects, 0);
  assert.equal(plan.executionStatus, 'NOT_RUN');
});

test('work email stop rule explicitly rejects inferred private addresses', () => {
  const plan = planEnrichmentWaterfall({ fields: ['work_email'], providers: [paidProvider()] });
  assert.match(plan.fields[0].stopRule, /inferred private addresses never satisfy/i);
});

test('unsupported provider mode fails closed', () => {
  assert.throws(() => normalizeEnrichmentProviderDescriptor({ id: 'x', mode: 'scrape-anything', fields: ['work_email'] }), /Unsupported enrichment provider mode/);
});
