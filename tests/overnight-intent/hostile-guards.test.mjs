import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildAccountIntentLedger } from '../../src/overnight/intent/account-intent-ledger.mjs';
import { planBudgetedEnrichmentWaterfall } from '../../src/overnight/intent/budgeted-enrichment-waterfall.mjs';

const NOW = new Date('2026-08-25T00:00:00.000Z');

function signal(overrides = {}) {
  return {
    sourceAdapter: 'controlled-test-adapter',
    sourceKind: 'WEB_PAGE',
    entityType: 'COMPANY',
    entityIdentity: 'account-1',
    signalType: 'HIRING_CHANGE',
    observedAt: '2026-08-24T00:00:00.000Z',
    payload: { hiring: true },
    evidenceClass: 'VERIFIED_FACT',
    verificationState: 'CONTENT_MATCHED',
    provenance: 'controlled-fixture',
    sourceUrl: 'https://example.com/evidence',
    confidence: 0.95,
    accountId: 'account-1',
    ...overrides
  };
}

function licensedProvider(overrides = {}) {
  return {
    id: 'licensed-email',
    mode: 'licensed_api',
    fields: ['work_email'],
    configured: true,
    termsAllowed: true,
    evidenceClass: 'LICENSED_PROVIDER',
    costCentsPerRecord: 8,
    pricingSource: 'https://provider.example/pricing',
    pricingVerifiedAt: '2026-08-24T00:00:00.000Z',
    quality: 0.9,
    successRate: 0.9,
    ...overrides
  };
}

test('hostile: synthetic evidence cannot promote into external intent', () => {
  const ledger = buildAccountIntentLedger({
    accountId: 'account-1',
    now: NOW,
    signals: [signal({
      evidenceClass: 'SYNTHETIC_TEST_FIXTURE',
      sourceUrl: undefined,
      provenance: 'synthetic-fixture'
    })]
  });
  assert.equal(ledger.acceptedCount, 1);
  assert.equal(ledger.summary.syntheticEvidenceCount, 1);
  assert.equal(ledger.summary.intentScore, 0);
  assert.equal(ledger.records[0].usableForIntent, false);
  assert.equal(Object.hasOwn(ledger.records[0], 'payload'), false);

  const rejectedPromotion = buildAccountIntentLedger({
    accountId: 'account-1',
    now: NOW,
    signals: [signal({
      evidenceClass: 'SYNTHETIC_TEST_FIXTURE',
      sourceUrl: 'https://real.example/evidence'
    })]
  });
  assert.equal(rejectedPromotion.acceptedCount, 0);
  assert.match(rejectedPromotion.rejected[0].reason, /synthetic-fixture-must-not-carry-a-sourceUrl/);
});

test('hostile: stale evidence decays and cannot satisfy an enrichment field', () => {
  const plan = planBudgetedEnrichmentWaterfall({
    accountId: 'account-1',
    fields: ['company_profile'],
    now: NOW,
    existingEvidence: {
      company_profile: [{
        field: 'company_profile',
        value: { industry: 'clinic' },
        sourceType: 'public_website',
        evidenceClass: 'DIRECT_PUBLIC',
        sourceUrl: 'https://example.com/about',
        observedAt: '2026-05-01T00:00:00.000Z',
        confidence: 1,
        verificationState: 'CONTENT_MATCHED'
      }]
    },
    providers: [{
      id: 'local-refresh',
      mode: 'local',
      fields: ['company_profile'],
      quality: 0.9,
      successRate: 0.9
    }]
  });
  assert.equal(plan.fields[0].evidence.status, 'STALE_ONLY');
  assert.equal(plan.fields[0].evidence.satisfies, false);
  assert.equal(plan.fields[0].decision, 'LOCAL_ONLY__EXTERNAL_DEFERRED');
  assert.equal(plan.fields[0].steps[0].provider, 'local-refresh');
});

test('hostile: suppression dominates a fresher valid contact result', () => {
  const plan = planBudgetedEnrichmentWaterfall({
    accountId: 'account-1',
    fields: ['work_email'],
    now: NOW,
    maxExternalCalls: 10,
    totalBudgetCents: 100,
    fieldBudgets: { work_email: 100 },
    budgetSource: 'owner-test-cap',
    contactRoutes: [{
      route: 'buyer@example.com',
      verifications: [
        { route: 'buyer@example.com', state: 'SUPPRESSED', checkedAt: '2026-08-01T00:00:00.000Z' },
        { route: 'buyer@example.com', state: 'VALID', checkedAt: '2026-08-24T00:00:00.000Z' }
      ]
    }],
    providers: [licensedProvider()]
  });
  assert.equal(plan.suppression.contactFieldEnrichmentBlocked, true);
  assert.equal(plan.fields[0].decision, 'SUPPRESSED_CONTACT_FIELD');
  assert.equal(plan.fields[0].steps.length, 0);
  assert.equal(plan.budget.selectedCostCents, 0);
});

test('hostile: provider costs cannot bypass field, total, or call ceilings', () => {
  const plan = planBudgetedEnrichmentWaterfall({
    accountId: 'account-1',
    fields: ['work_email', 'phone'],
    now: NOW,
    maxExternalCalls: 1,
    totalBudgetCents: 10,
    fieldBudgets: { work_email: 10, phone: 10 },
    budgetSource: 'owner-test-cap',
    providers: [
      licensedProvider({ id: 'email-provider', fields: ['work_email'] }),
      licensedProvider({ id: 'phone-provider', fields: ['phone'] })
    ]
  });
  assert.equal(plan.budget.withinCaps, true);
  assert.ok(plan.budget.selectedCostCents <= 10);
  assert.ok(plan.budget.selectedExternalCalls <= 1);
  assert.equal(plan.budget.selectedCostCents, 8);
  assert.equal(plan.fields[0].steps.length, 1);
  assert.equal(plan.fields[1].steps.length, 0);
  assert.match(plan.fields[1].selectionReasons.join('|'), /total-budget-cap|external-call-cap/);
  assert.equal(plan.providerCalls, 0);
  assert.equal(plan.externalEffects, 0);
  assert.equal(plan.businessEffectAuthority, 'NONE');
});

test('hostile: model evidence is clamped and cannot satisfy private contact fields', () => {
  const plan = planBudgetedEnrichmentWaterfall({
    accountId: 'account-1',
    fields: ['work_email'],
    now: NOW,
    maxExternalCalls: 1,
    providers: [{
      id: 'model-guesser',
      mode: 'model_inference',
      fields: ['work_email'],
      evidenceClass: 'DIRECT_FIRST_PARTY',
      configured: true,
      termsAllowed: true,
      verifiedFree: true,
      quality: 1,
      successRate: 1
    }]
  });
  assert.equal(plan.providers[0].evidenceClass, 'MODEL_INFERENCE');
  assert.equal(plan.providers[0].evidenceClassClamped, true);
  assert.equal(plan.fields[0].steps.length, 0);
  assert.match(plan.fields[0].selectionReasons.join('|'), /private-contact-evidence-insufficient/);
});

test('new lane is pure and has no provider or network invocation', async () => {
  for (const path of [
    '../../src/overnight/intent/account-intent-ledger.mjs',
    '../../src/overnight/intent/budgeted-enrichment-waterfall.mjs'
  ]) {
    const source = await fs.readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\b(fetch|http\.request|https\.request|readFile|writeFile)\s*\(/);
  }
});
