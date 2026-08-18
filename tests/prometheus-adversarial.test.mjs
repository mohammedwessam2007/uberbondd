import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { runCommercialSpine } from '../src/commercial-spine.mjs';
import { normalizeMarketSignal } from '../src/market-signal.mjs';
import { extractGenomeCandidate } from '../src/genome-extraction.mjs';
import { scoreOpportunity } from '../src/opportunity-registry.mjs';
import { ingestSignals } from '../src/signal-ingestion.mjs';
import { listChannels } from '../src/distribution-channel-registry.mjs';
import { allocateDistribution } from '../src/distribution-allocator.mjs';
import { routeUpgradeDecision } from '../src/upgrade-proposal.mjs';
import { canaryPromotionGate } from '../src/shadow-canary-contract.mjs';
import { deriveLearningRecord, aggregateLearning } from '../src/revenue-weighted-learning.mjs';
import { detectContradictions } from '../src/commercial-memory.mjs';

// Cross-module adversarial suite for the economic spine. Each test targets
// a specific attack category the mission asked for; module-local hostile
// tests already cover much of this in isolation -- this file specifically
// attacks the SEAMS between modules, where a single-module test can't see
// the failure.

const monday = new Date('2026-07-13T10:00:00.000Z');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-adversarial-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function verified(value) { return { value, claimType: 'VERIFIED_FACT' }; }
const fullCandidateOverrides = {
  timeToCashDays: verified(1), recurringTrigger: verified(true), retention: verified(85),
  grossMargin: verified(90), automationPotential: verified(95), founderBurden: verified(10),
  acquisition: verified('proven'), partnerLeverage: verified('moderate'), dataAsset: verified('some'),
  platformDependency: verified('low'), capital: verified('none'), moat: verified('moderate'),
  aiResilience: verified('resilient'), scale: verified('global'), acquisitionValue: verified('medium'),
  founderOwnershipRetainedPercent: verified(100)
};

// --- 1. Evidence laundering ---

test('ATTACK evidence laundering: a synthetic run cannot launder its outcome into a claim of real economic proof', async () => {
  const store = await tempStore();
  const result = await runCommercialSpine({
    store, rawSignals: [{ sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'x', signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', evidenceClass: 'SYNTHETIC_TEST_FIXTURE' }],
    date: monday, opportunityId: 'launder-1', priceHint: 49, candidateOverrides: fullCandidateOverrides,
    isSynthetic: true, simulatedOutcomeType: 'CLEARED_PAYMENT',
    ownerApproved: true, realEconomicProof: { realClearedAmountUsd: 500000 }
  });
  const gate = canaryPromotionGate({ ownerApproved: true, economicProof: result.canaryProof });
  assert.equal(gate.canPromote, false, 'a huge fake dollar figure attached to a synthetic run must never launder into ECONOMICALLY_PROVEN');
});

test('ATTACK evidence laundering: a MarketSignal cannot claim VERIFIED_FACT while also being marked SYNTHETIC_TEST_FIXTURE', () => {
  const result = normalizeMarketSignal({
    sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'x', signalType: 'PRICE_CHANGE',
    observedAt: '2026-07-13T09:00:00.000Z', evidenceClass: 'SYNTHETIC_TEST_FIXTURE', sourceUrl: 'https://real-looking.example'
  }, { date: monday });
  assert.equal(result.ok, false, 'a synthetic fixture claiming a real sourceUrl must be rejected outright');
});

// --- 2. Duplicate signals ---

test('ATTACK duplicate signals: the same underlying fact submitted under two different opportunityIds still only ingests once', async () => {
  const store = await tempStore();
  const signal = { sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'shared-entity', signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 }, evidenceClass: 'SYNTHETIC_TEST_FIXTURE' };
  const first = await ingestSignals({ store, signals: [signal], date: monday });
  const second = await ingestSignals({ store, signals: [signal], date: monday }); // same signal, "reused" for a different narrative
  assert.equal(first.counts.accepted, 1);
  assert.equal(second.counts.accepted, 0, 'the same underlying fact cannot be re-ingested as if it were new evidence for a second opportunity');
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

test('ATTACK channel overconfidence: cherry-picking the single best-looking channel among many tiny samples still can\'t win', () => {
  const channels = listChannels({ outbound: { enabled: true, dryRun: false } }).map((c, i) => ({ ...c, id: c.id }));
  // Simulate 14 channels each with exactly 1 lucky outcome -- an attacker
  // scanning for "the one that looks best" should still find none clear
  // the confidence bar.
  const outcomes = channels.map(c => ({ channelId: c.id, clearedRevenueUsd: 1000, costUsd: 1 }));
  const experiment = { ok: true };
  const result = allocateDistribution({ experiment, channels, historicalOutcomes: outcomes, budgetUsd: 500, minConfidenceToAct: 0.5, date: monday });
  assert.equal(result.decision, 'DO_NOTHING', 'no amount of cherry-picking among 1-sample channels should produce a confident winner');
});

// --- 6. Fake revenue ---

test('ATTACK fake revenue: setting outcomeType to a "cleared payment" string does not make a record real -- only the isSynthetic flag governs truthClass', () => {
  const record = deriveLearningRecord({ outcomeType: 'CLEARED_RECURRING_CONTRIBUTION_MARGIN', isSynthetic: true, magnitude: 1000, date: monday });
  const aggregate = aggregateLearning([record]);
  assert.equal(aggregate.real.totalWeight, 0, 'a high-value outcome TYPE cannot fake its way into the real aggregate without isSynthetic:false');
});

test('ATTACK fake revenue: RevenueEngine-style negative-refund netting cannot be spoofed through the learning layer -- magnitude alone cannot go negative to fake a refund', () => {
  const record = deriveLearningRecord({ outcomeType: 'CLEARED_PAYMENT', magnitude: -100, isSynthetic: false, date: monday });
  assert.equal(record.weight, 0, 'a negative magnitude must clamp to zero, never invert into a phantom negative-revenue trick');
});

// --- 7. Tiny-sample overfitting ---

test('ATTACK tiny-sample overfitting: a single spectacular outcome (100x normal) still can\'t clear the confidence bar alone', () => {
  const channels = listChannels({ outbound: { enabled: true, dryRun: false } });
  const outcomes = [{ channelId: 'direct-outbound', clearedRevenueUsd: 100000, costUsd: 1 }];
  const experiment = { ok: true };
  const result = allocateDistribution({ experiment, channels, historicalOutcomes: outcomes, budgetUsd: 500, date: monday });
  assert.equal(result.decision, 'DO_NOTHING');
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

test('ATTACK unsafe consequence escalation: a DO_NOTHING distribution decision is never silently treated as an authorization to act', async () => {
  const store = await tempStore();
  const result = await runCommercialSpine({
    store, rawSignals: [{ sourceAdapter: 't', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'x', signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 }, evidenceClass: 'SYNTHETIC_TEST_FIXTURE' }],
    date: monday, opportunityId: 'escalation-1', priceHint: 49, candidateOverrides: fullCandidateOverrides, budgetUsd: 0
  });
  assert.equal(result.distributionDecision.decision, 'DO_NOTHING');
  // The spine itself must never call a provider regardless of the
  // decision -- verified structurally (no sendEmail/fetch import anywhere
  // in the orchestrator) in commercial-spine-e2e.test.mjs; here we assert
  // the actual decision object carries no implicit authorization field.
  assert.equal(result.distributionDecision.selectedChannel, null);
});

test('ATTACK unsafe consequence escalation: the memory layer flags a contradictory hypothesis rather than letting a later positive outcome silently override an earlier negative one', () => {
  const contradictions = detectContradictions([
    { hypothesis: 'H-escalation', outcomeType: 'REFUND_OR_DISPUTE' },
    { hypothesis: 'H-escalation', outcomeType: 'CLEARED_PAYMENT' }
  ]);
  assert.equal(contradictions.length, 1, 'a later positive outcome must not quietly erase an earlier negative one from the record');
});
