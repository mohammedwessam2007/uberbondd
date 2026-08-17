import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  preparePrometheusEconomicSpine,
  logPrometheusEconomicSpineDecision,
  PROMETHEUS_ECONOMIC_SPINE_POLICY_VERSION
} from '../src/prometheus-economic-spine.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const referenceDate = new Date('2026-08-18T10:00:00.000Z');

function verified(value) {
  return { value, claimType: 'VERIFIED_FACT' };
}

function strongCandidate(overrides = {}) {
  return {
    id: 'opp-agent-readiness',
    name: 'Agent Readiness Audit',
    category: 'agentic-commerce',
    signalId: undefined,
    timeToCashDays: verified(1),
    recurringTrigger: verified(true),
    retention: verified(85),
    grossMargin: verified(90),
    automationPotential: verified(95),
    founderBurden: verified(10),
    acquisition: verified('proven'),
    partnerLeverage: verified('moderate'),
    dataAsset: verified('some'),
    platformDependency: verified('low'),
    capital: verified('none'),
    moat: verified('moderate'),
    aiResilience: verified('resilient'),
    scale: verified('global'),
    acquisitionValue: verified('medium'),
    founderOwnershipRetainedPercent: verified(100),
    ...overrides
  };
}

function baseSignal(overrides = {}) {
  return {
    sourceAdapter: 'web-page-adapter',
    sourceKind: 'WEB_PAGE',
    entityType: 'PRODUCT',
    entityIdentity: 'https://example.com/pricing',
    signalType: 'PRICE_CHANGE',
    observedAt: '2026-08-18T09:00:00.000Z',
    payload: { price: 49 },
    evidenceClass: 'VERIFIED_FACT',
    provenance: 'controlled-public-fetch',
    sourceUrl: 'https://example.com/pricing',
    verificationState: 'CONTENT_MATCHED',
    confidence: 0.9,
    ...overrides
  };
}

function baseProspect(overrides = {}) {
  return {
    id: 'pros-1',
    company: 'Example Clinic',
    website: 'https://example.com',
    issue: {
      title: 'Booking flow fails on mobile',
      category: 'conversion',
      severity: 4,
      confidence: 0.9,
      evidenceUrl: 'https://example.com/book',
      evidenceExcerpt: 'The booking action returns an error on mobile.',
      safeForOutreach: true
    },
    score: { total: 80, tier: 'A' },
    ...overrides
  };
}

function baseConfig(overrides = {}) {
  return {
    revenue: {
      fullAuditPrice: 49,
      fullAuditCheckoutUrl: 'https://checkout.example/full',
      founderHourlyRateCents: 0,
      ...overrides.revenue
    }
  };
}

function baseInput(overrides = {}) {
  return {
    signal: baseSignal(),
    candidate: strongCandidate(),
    prospect: baseProspect(),
    campaign: { id: 'camp-1', approved: true },
    cfg: baseConfig(),
    date: referenceDate,
    ...overrides
  };
}

test('composes signal, genome, opportunity score, offer, and dry-run experiment into one packet', () => {
  const result = preparePrometheusEconomicSpine(baseInput());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PREPARED');
  assert.equal(result.policyVersion, PROMETHEUS_ECONOMIC_SPINE_POLICY_VERSION);
  assert.equal(result.signal.evidenceClass, 'VERIFIED_FACT');
  assert.equal(result.opportunity.id, 'opp-agent-readiness');
  assert.equal(result.opportunity.score.dataSufficiency, 'STRONG');
  assert.equal(result.offer.readyToOffer, true);
  assert.equal(result.experiment.mode, 'DRY_RUN_PREPARATION_ONLY');
  assert.equal(result.experiment.status, 'READY_FOR_OWNER_REVIEW');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  assert.equal(result.externalEffectLedger.spendCents, 0);
});

test('preparation never advances the promotion ladder without an explicit gate', () => {
  const result = preparePrometheusEconomicSpine(baseInput({
    candidate: strongCandidate({ promotionStage: 'EVIDENCED' })
  }));
  assert.equal(result.opportunity.promotion.stage, 'EVIDENCED');
  assert.equal(result.opportunity.promotion.advanced, false);
});

test('a synthetic signal may be scored locally but cannot become commercially ready', () => {
  const result = preparePrometheusEconomicSpine(baseInput({
    signal: baseSignal({ evidenceClass: 'SYNTHETIC_TEST_FIXTURE', sourceUrl: undefined })
  }));
  assert.equal(result.ok, true);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('synthetic-evidence-not-commercial'));
  assert.equal(result.offer.readyToOffer, true);
  assert.equal(result.experiment.status, 'BLOCKED');
});

test('weak signal evidence requires review even when the downstream offer packet is complete', () => {
  const result = preparePrometheusEconomicSpine(baseInput({
    signal: baseSignal({ evidenceClass: 'HYPOTHESIS', sourceUrl: undefined })
  }));
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('signal-evidence-below-commercial-threshold'));
});

test('stale or contradicted signals cannot pass the commercial gate', () => {
  const stale = preparePrometheusEconomicSpine(baseInput({
    signal: baseSignal({ observedAt: '2026-06-01T09:00:00.000Z' })
  }));
  assert.equal(stale.status, 'REVIEW_REQUIRED');
  assert.ok(stale.reasonCodes.includes('signal-stale'));

  const contradicted = preparePrometheusEconomicSpine(baseInput({
    signal: baseSignal({ verificationState: 'CONTRADICTED' })
  }));
  assert.equal(contradicted.status, 'REVIEW_REQUIRED');
  assert.ok(contradicted.reasonCodes.includes('signal-contradicted'));
});

test('missing evidence or checkout stays review-required and reports exact blockers', () => {
  const result = preparePrometheusEconomicSpine(baseInput({
    prospect: baseProspect({ issue: { title: 'Unknown issue' } }),
    cfg: baseConfig({ revenue: { fullAuditCheckoutUrl: '' } })
  }));
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('offer-not-ready'));
  assert.ok(result.reasonCodes.includes('incomplete-evidence'));
  assert.equal(result.offer.paymentRequirement.checkoutReadiness.configured, false);
});

test('a candidate linked to a different signal is denied, never silently relinked', () => {
  const result = preparePrometheusEconomicSpine(baseInput({
    candidate: strongCandidate({ signalId: 'not-the-signal' })
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'DENIED');
  assert.ok(result.reasonCodes.includes('signal-opportunity-link-mismatch'));
});

test('invalid or missing signal and candidate fail closed', () => {
  const noSignal = preparePrometheusEconomicSpine({ candidate: strongCandidate(), date: referenceDate });
  assert.equal(noSignal.ok, false);
  assert.equal(noSignal.status, 'DENIED');

  const noCandidate = preparePrometheusEconomicSpine({ signal: baseSignal(), date: referenceDate });
  assert.equal(noCandidate.ok, false);
  assert.equal(noCandidate.status, 'DENIED');
});

test('an unapproved campaign cannot become ready for external action', () => {
  const result = preparePrometheusEconomicSpine(baseInput({
    campaign: { id: 'camp-1', approved: false }
  }));
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('campaign-approval-required'));
  assert.equal(result.experiment.authorization.externalActions, 'OWNER_REQUIRED');
});

test('the decision id and packet are deterministic for a fixed reference date', () => {
  const a = preparePrometheusEconomicSpine(baseInput());
  const b = preparePrometheusEconomicSpine(baseInput());
  assert.deepEqual(a, b);
});

test('logging uses the existing audit writer and does not create a parallel store', async () => {
  const calls = [];
  const store = {
    log: async (type, detail) => {
      calls.push({ type, detail });
      return { id: 'audit-1' };
    }
  };
  const result = preparePrometheusEconomicSpine(baseInput());
  const receipt = await logPrometheusEconomicSpineDecision(store, result);
  assert.deepEqual(receipt, { id: 'audit-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'prometheus_economic_spine');
  assert.equal(calls[0].detail.decisionId, result.decisionId);
  assert.equal(calls[0].detail.externalEffectLedger.providerCalls, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'payload'), false);
});

test('the queue handler prepares and audits without invoking any provider', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    cfg: baseConfig(),
    store: {
      log: async (type, detail) => {
        calls.push({ type, detail });
        return { id: 'audit-queue-1' };
      }
    }
  });
  const result = await handlers['prometheus.opportunity.prepare'](baseInput());
  assert.equal(result.status, 'PREPARED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'prometheus_economic_spine');
  assert.equal(result.externalEffectLedger.messages, 0);
});

test('the composition module is local-only by source inspection', async () => {
  const source = await fs.readFile(new URL('../src/prometheus-economic-spine.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
