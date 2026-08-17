import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  compileCommercialExperiment,
  logCommercialExperiment,
  COMMERCIAL_EXPERIMENT_POLICY_VERSION
} from '../src/commercial-experiment.mjs';
import { preparePrometheusEconomicSpine } from '../src/prometheus-economic-spine.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const referenceDate = new Date('2026-08-18T10:00:00.000Z');

function verified(value) { return { value, claimType: 'VERIFIED_FACT' }; }

function spineDecision(overrides = {}) {
  const candidate = {
    id: 'opp-experiment', name: 'Revenue Reliability Probe', category: 'reliability',
    timeToCashDays: verified(1), recurringTrigger: verified(true), retention: verified(85),
    grossMargin: verified(90), automationPotential: verified(95), founderBurden: verified(10),
    acquisition: verified('proven'), partnerLeverage: verified('moderate'), dataAsset: verified('some'),
    platformDependency: verified('low'), capital: verified('none'), moat: verified('moderate'),
    aiResilience: verified('resilient'), scale: verified('global'), acquisitionValue: verified('medium'),
    founderOwnershipRetainedPercent: verified(100)
  };
  const signal = {
    sourceAdapter: 'web-page-adapter', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT',
    entityIdentity: 'https://example.com/pricing', signalType: 'PRICE_CHANGE',
    observedAt: '2026-08-18T09:00:00.000Z', payload: { price: 49 }, evidenceClass: 'VERIFIED_FACT',
    provenance: 'controlled-public-fetch', sourceUrl: 'https://example.com/pricing',
    verificationState: 'CONTENT_MATCHED', confidence: 0.9
  };
  const prospect = {
    id: 'pros-experiment', company: 'Example Clinic', website: 'https://example.com',
    issue: {
      title: 'Booking flow fails on mobile', category: 'conversion', severity: 4, confidence: 0.9,
      evidenceUrl: 'https://example.com/book', evidenceExcerpt: 'The booking action returns an error on mobile.',
      safeForOutreach: true
    }, score: { total: 80, tier: 'A' }
  };
  return preparePrometheusEconomicSpine({
    signal, candidate, prospect,
    campaign: { id: 'camp-experiment', approved: true },
    cfg: { revenue: { fullAuditPrice: 49, fullAuditCheckoutUrl: 'https://checkout.example/full', founderHourlyRateCents: 0 } },
    date: referenceDate,
    ...overrides
  });
}

test('compiles a measurable probe from the canonical spine without external authority', () => {
  const result = compileCommercialExperiment({
    spineDecision: spineDecision(), channels: [{ id: 'owned-site' }], date: referenceDate
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'READY_FOR_OWNER_REVIEW');
  assert.equal(result.policyVersion, COMMERCIAL_EXPERIMENT_POLICY_VERSION);
  assert.equal(result.stage, 'PROBE');
  assert.equal(result.primaryMetric, 'CLEARED_PAYMENT');
  assert.deepEqual(result.channelIds, ['owned-site']);
  assert.equal(result.budget.status, 'UNKNOWN');
  assert.equal(result.authorization.externalActions, 'OWNER_REQUIRED');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  assert.equal(result.externalEffectLedger.spendCents, 0);
});

test('a review-required spine cannot be promoted into an experiment silently', () => {
  const result = compileCommercialExperiment({
    spineDecision: { ...spineDecision(), status: 'REVIEW_REQUIRED' },
    date: referenceDate
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.blockers.includes('economic-spine-not-prepared'));
});

test('budget and owner-minute inputs remain non-authorizing and invalid values fail closed', () => {
  const supplied = compileCommercialExperiment({ spineDecision: spineDecision(), budgetCents: 5000, maxOwnerMinutes: 30, date: referenceDate });
  assert.equal(supplied.budget.status, 'OWNER_PROVIDED_NOT_AUTHORIZED');
  assert.equal(supplied.budget.authorization, 'OWNER_REQUIRED');
  assert.equal(supplied.externalEffectLedger.spendCents, 0);

  const invalid = compileCommercialExperiment({ spineDecision: spineDecision(), budgetCents: -1, date: referenceDate });
  assert.equal(invalid.status, 'REVIEW_REQUIRED');
  assert.ok(invalid.blockers.includes('invalid-budget'));
});

test('missing spine, lineage, or offer inputs fail closed', () => {
  const missing = compileCommercialExperiment({ date: referenceDate });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 'DENIED');

  const incomplete = compileCommercialExperiment({
    spineDecision: { ok: true, status: 'PREPARED', decisionId: 'd-1', signal: {}, opportunity: {}, offer: {}, experiment: {} },
    date: referenceDate
  });
  assert.equal(incomplete.status, 'REVIEW_REQUIRED');
  assert.ok(incomplete.blockers.includes('signal-lineage-required'));
  assert.ok(incomplete.blockers.includes('opportunity-lineage-required'));
  assert.ok(incomplete.blockers.includes('offer-lineage-required'));
});

test('fixed input and date produce a deterministic experiment packet', () => {
  const a = compileCommercialExperiment({ spineDecision: spineDecision(), channels: ['owned-site'], date: referenceDate });
  const b = compileCommercialExperiment({ spineDecision: spineDecision(), channels: ['owned-site'], date: referenceDate });
  assert.deepEqual(a, b);
});

test('audit logging reuses the existing writer and excludes raw payloads', async () => {
  const calls = [];
  const receipt = await logCommercialExperiment({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-1' }; } }, compileCommercialExperiment({ spineDecision: spineDecision(), date: referenceDate }));
  assert.deepEqual(receipt, { id: 'audit-1' });
  assert.equal(calls[0].type, 'commercial_experiment');
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'payload'), false);
  assert.equal(calls[0].detail.externalEffectLedger.messages, 0);
});

test('queue handler prepares and audits a local experiment only', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-queue' }; } },
    cfg: {}
  });
  const result = await handlers['prometheus.experiment.prepare']({ spineDecision: spineDecision(), date: referenceDate });
  assert.equal(result.status, 'READY_FOR_OWNER_REVIEW');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'commercial_experiment');
});

test('compiler has no provider or filesystem boundary of its own', async () => {
  const source = await fs.readFile(new URL('../src/commercial-experiment.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
