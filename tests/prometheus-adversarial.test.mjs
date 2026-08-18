import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { normalizeMarketSignal } from '../src/market-signal.mjs';
import { extractGenomeCandidate } from '../src/genome-extraction.mjs';
import { scoreOpportunity } from '../src/opportunity-registry.mjs';
import { ingestMarketSignals } from '../src/market-signal-registry.mjs';
import { preparePrometheusEconomicSpine } from '../src/prometheus-economic-spine.mjs';
import { allocateDistribution } from '../src/distribution-channel.mjs';
import { normalizeCommercialOutcome } from '../src/commercial-outcome.mjs';
import { summarizeCommercialLearning } from '../src/commercial-learning.mjs';
import { routeUpgradeDecision } from '../src/self-upgrade.mjs';
import { canaryPromotionGate } from '../src/shadow-canary-contract.mjs';
import { detectContradictions } from '../src/commercial-memory.mjs';

// Cross-module adversarial suite for the (post-reconciliation) canonical
// economic chain -- see docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md.
// Each test targets a specific attack category the mission asked for;
// module-local hostile tests already cover much of this in isolation --
// this file specifically attacks the SEAMS between the surviving modules,
// where a single-module test can't see the failure. Originally written
// against the (now-deleted) parallel A-side spine; retargeted onto the
// canonical B-side chain module-for-module, preserving every attack
// category's intent.

const monday = new Date('2026-07-13T10:00:00.000Z');
const experiment = { ok: true, status: 'READY_FOR_OWNER_REVIEW', experimentId: 'exp-1' };

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-adversarial-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

// --- 1. Evidence laundering ---

test('ATTACK evidence laundering: a real-looking spine decision cannot launder a fabricated dollar figure into a recorded cleared payment', () => {
  const signal = {
    sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'x',
    signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', evidenceClass: 'SYNTHETIC_TEST_FIXTURE'
  };
  const candidate = { id: 'launder-1', name: 'Launder Test' };
  const spine = preparePrometheusEconomicSpine({ signal, candidate, date: monday });
  const outcome = normalizeCommercialOutcome({
    outcome: {
      eventId: 'evt-launder', outcomeType: 'PAYMENT_CLEARED', opportunityId: candidate.id,
      signalId: spine.signal?.signalId, amountCents: 50000000, currency: 'USD', providerEventId: 'fabricated'
    }
  });
  assert.equal(outcome.ok, false, 'a huge fake dollar figure attached to a real-looking spine decision must never launder into a recorded cleared payment without a real payment-truth decision');
  assert.ok(outcome.reasonCodes.includes('payment-truth-decision-required'));
});

test('ATTACK evidence laundering: a MarketSignal cannot claim VERIFIED_FACT while also being marked SYNTHETIC_TEST_FIXTURE', () => {
  const result = normalizeMarketSignal({
    sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'x', signalType: 'PRICE_CHANGE',
    observedAt: '2026-07-13T09:00:00.000Z', evidenceClass: 'SYNTHETIC_TEST_FIXTURE', sourceUrl: 'https://real-looking.example'
  }, { date: monday });
  assert.equal(result.ok, false, 'a synthetic fixture claiming a real sourceUrl must be rejected outright');
});

// --- 2. Duplicate signals ---

test('ATTACK duplicate signals: the same underlying fact submitted twice under persistence still only ingests once', async () => {
  const store = await tempStore();
  const signal = { sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'shared-entity', signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 }, evidenceClass: 'SYNTHETIC_TEST_FIXTURE' };
  const first = await ingestMarketSignals({ store, signals: [signal], date: monday, persist: true });
  const second = await ingestMarketSignals({ store, signals: [signal], date: monday, persist: true }); // same signal, "reused" for a different narrative
  assert.equal(first.accepted.length, 1);
  assert.equal(second.accepted.length, 0, 'the same underlying fact cannot be re-ingested as if it were new evidence');
  assert.equal(second.duplicates.length, 1);
});

// --- 3. Confidence inflation ---

test('ATTACK confidence inflation: piling up many LOW-evidence signals never raises a genome candidate above its weakest tier', () => {
  const strongOne = normalizeMarketSignal({ sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'a', signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 }, evidenceClass: 'VERIFIED_FACT', sourceUrl: 'https://real.example' }, { date: monday });
  const manyWeakOnes = Array.from({ length: 50 }, (_, i) => normalizeMarketSignal({ sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: `weak-${i}`, signalType: 'FEATURE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', evidenceClass: 'HYPOTHESIS' }, { date: monday }));
  const result = extractGenomeCandidate({ signals: [strongOne, ...manyWeakOnes], id: 'inflate-1', priceHint: 49 });
  assert.equal(result.candidate.signalSourceEvidenceClass, 'HYPOTHESIS', '50 weak signals must not be able to outvote quality with quantity');
});

test('ATTACK confidence inflation: an opportunity cannot buy confidence merely by having many UNTAGGED fields', () => {
  const manyBareFields = { id: 'inflate-2', name: 'x' };
  for (let i = 0; i < 30; i += 1) manyBareFields[`extraField${i}`] = 999; // fields the scorer doesn't even recognize
  const result = scoreOpportunity({ candidate: manyBareFields, date: monday });
  assert.equal(result.confidence, 0);
});

// --- 4. BUILD bias ---

test('ATTACK BUILD bias: right at the confidence boundary (0.29 vs 0.30), the router does not round in BUILD\'s favor', () => {
  const justBelow = routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.29, compositeScore: 90 });
  const justAtOrAbove = routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.30, compositeScore: 90 });
  assert.equal(justBelow, 'DEFER');
  assert.equal(justAtOrAbove, 'BUILD');
});

test('ATTACK BUILD bias: mislabeling a commodity as non-commodity is the only way to reach BUILD -- the flag itself, not evidence quality, gates it', () => {
  const asCommodity = routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.9, compositeScore: 95, isCommodity: true });
  const asNonCommodity = routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.9, compositeScore: 95, isCommodity: false });
  assert.notEqual(asCommodity, 'BUILD');
  assert.equal(asNonCommodity, 'BUILD');
});

// --- 5. Channel overconfidence ---

test('ATTACK channel overconfidence: cherry-picking the single best-looking channel among many tiny samples never claims high confidence', () => {
  const channels = Array.from({ length: 14 }, (_, i) => ({ id: `c${i}`, type: 'PARTNER', name: `Channel ${i}` }));
  const outcomes = channels.map(c => ({ channelId: c.id, truthLevel: 'CLEARED_PAYMENT', contributionMarginCents: 1000, ownerMinutes: 1 }));
  const result = allocateDistribution({ experiment, channels, outcomes, date: monday });
  assert.equal(result.status, 'PREPARE_ONLY_RANKED');
  assert.ok(result.plans.every(plan => plan.sampleConfidence <= 0.05), 'no amount of cherry-picking among 1-sample channels should imply real confidence');
});

// --- 6. Fake revenue ---

test('ATTACK fake revenue: claiming outcomeType PAYMENT_CLEARED without a real payment-truth decision cannot record any cleared payment', () => {
  const result = normalizeCommercialOutcome({
    outcome: { eventId: 'evt-fake-1', outcomeType: 'PAYMENT_CLEARED', opportunityId: 'fake-1', amountCents: 999999, currency: 'USD', providerEventId: 'prov-fake' }
  });
  assert.equal(result.ok, false, 'a high-value outcome TYPE cannot fake its way into being recorded without real provider-verified proof');
  assert.ok(result.reasonCodes.includes('payment-truth-decision-required'));
});

test('ATTACK fake revenue: the learning layer only weighs receipts carrying a real provider payment proof, not a bare high-value claim', () => {
  const spoofed = {
    ok: true, outcomeId: 'out-spoof', status: 'RECORDED_CLEARED_PAYMENT', truthLevel: 'CLEARED_PAYMENT',
    outcomeType: 'PAYMENT_CLEARED', eventId: 'evt-spoof', occurredAt: monday.toISOString(),
    lineage: { opportunityId: 'fake-2' }, contributionMarginCents: 999999, ownerMinutes: 1
    // deliberately no paymentProof -- this is what a spoofed receipt looks like
  };
  const summary = summarizeCommercialLearning({ outcomes: [spoofed], date: monday });
  assert.equal(summary.metrics.clearedPaymentCount, 0, 'a receipt with no real provider payment proof must never be counted as verified revenue');
  assert.equal(summary.metrics.rejectedOutcomeCount, 1);
});

// --- 7. Tiny-sample overfitting ---

test('ATTACK tiny-sample overfitting: a single spectacular outcome (100x normal) still carries only the lowest confidence tier', () => {
  const result = allocateDistribution({
    experiment,
    channels: [{ id: 'direct-outbound', type: 'OUTBOUND', name: 'Outbound' }],
    outcomes: [{ channelId: 'direct-outbound', truthLevel: 'CLEARED_PAYMENT', contributionMarginCents: 100000, ownerMinutes: 1 }],
    date: monday
  });
  assert.equal(result.plans[0].sampleConfidence, 0.05);
});

// --- 8. Auto-promotion without economic proof ---

test('ATTACK auto-promotion: owner approval with a merely-present-but-zero-value proof object cannot promote', () => {
  const gate = canaryPromotionGate({ ownerApproved: true, economicProof: { isSynthetic: false, realClearedAmountUsd: 0 } });
  assert.equal(gate.canPromote, false);
});

test('ATTACK auto-promotion: a proof object with a non-numeric realClearedAmountUsd cannot promote', () => {
  const gate = canaryPromotionGate({ ownerApproved: true, economicProof: { isSynthetic: false, realClearedAmountUsd: 'a lot' } });
  assert.equal(gate.canPromote, false);
});

// --- 9. Unsafe consequence escalation ---

test('ATTACK unsafe consequence escalation: a DO_NOT_DISTRIBUTE decision from zero verified outcomes is never silently treated as an authorization to act', () => {
  const result = allocateDistribution({
    experiment,
    channels: [{ id: 'direct-outbound', type: 'OUTBOUND', name: 'Outbound' }],
    outcomes: [],
    date: monday
  });
  assert.equal(result.status, 'DO_NOT_DISTRIBUTE');
  assert.equal(result.plans[0].externalAction, 'DISABLED');
  assert.equal(result.authorization.spend, 'DISABLED');
});

test('ATTACK unsafe consequence escalation: the memory layer flags a contradictory hypothesis rather than letting a later positive outcome silently override an earlier negative one', () => {
  const contradictions = detectContradictions([
    { hypothesis: 'H-escalation', outcomeType: 'REFUND_OR_DISPUTE' },
    { hypothesis: 'H-escalation', outcomeType: 'CLEARED_PAYMENT' }
  ]);
  assert.equal(contradictions.length, 1, 'a later positive outcome must not quietly erase an earlier negative one from the record');
});
