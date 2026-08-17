import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { runCommercialSpine } from '../src/commercial-spine.mjs';
import { canaryPromotionGate } from '../src/shadow-canary-contract.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-spine-e2e-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function verified(value) { return { value, claimType: 'VERIFIED_FACT' }; }

function syntheticSignal(overrides = {}) {
  return {
    sourceAdapter: 'e2e-test', sourceKind: 'WEB_PAGE', entityType: 'PRODUCT', entityIdentity: 'https://synthetic.example/pricing',
    signalType: 'PRICE_CHANGE', observedAt: '2026-07-13T09:00:00.000Z', payload: { price: 49 },
    evidenceClass: 'SYNTHETIC_TEST_FIXTURE', // labeled unmistakably, never claims a real sourceUrl
    ...overrides
  };
}

const fullCandidateOverrides = {
  timeToCashDays: verified(1), recurringTrigger: verified(true), retention: verified(85),
  grossMargin: verified(90), automationPotential: verified(95), founderBurden: verified(10),
  acquisition: verified('proven'), partnerLeverage: verified('moderate'), dataAsset: verified('some'),
  platformDependency: verified('low'), capital: verified('none'), moat: verified('moderate'),
  aiResilience: verified('resilient'), scale: verified('global'), acquisitionValue: verified('medium'),
  founderOwnershipRetainedPercent: verified(100)
};

test('END TO END: a labeled SYNTHETIC_TEST_FIXTURE signal travels the entire spine and produces all required stage outputs', async () => {
  const store = await tempStore();
  const result = await runCommercialSpine({
    store, rawSignals: [syntheticSignal()], date: monday,
    opportunityId: 'e2e-opp-1', opportunityName: 'End-to-end synthetic probe', opportunityCategory: 'test',
    priceHint: 49, candidateOverrides: fullCandidateOverrides, requiredCapabilities: ['deterministic-audit'],
    isSynthetic: true, simulatedOutcomeType: 'CLEARED_PAYMENT', budgetUsd: 100
  });

  assert.equal(result.ok, true, JSON.stringify(result));

  // 1. an opportunity
  assert.equal(result.scoredOpportunity.ok, true);
  assert.ok(result.scoredOpportunity.compositeScore > 0);

  // 2. a capability-gap result
  assert.ok(result.buildDistanceResult);
  assert.ok(Number.isFinite(result.buildDistanceResult.distance));

  // 3. a bounded experiment
  assert.equal(result.experiment.ok, true);
  assert.equal(result.experiment.maxBudgetUsd, 100);

  // 4. a distribution decision
  assert.equal(result.distributionDecision.ok, true);
  assert.ok(['SELECT_CHANNEL', 'DO_NOTHING'].includes(result.distributionDecision.decision));

  // 5. a simulated outcome
  assert.ok(result.outcome);
  assert.equal(result.outcome.type, 'CLEARED_PAYMENT');
  const outcomeNode = result.outcomeGraph.nodes.find(n => n.type === 'SimulatedOutcome' || n.type === 'RealOutcome');
  assert.equal(outcomeNode.type, 'SimulatedOutcome', 'a synthetic run must never produce a RealOutcome node');

  // 6. a learning record
  assert.equal(result.learningRecord.ok, true);
  assert.equal(result.learningRecord.truthClass, 'SYNTHETIC_TEST_FIXTURE');

  // 7. an upgrade proposal
  assert.ok(['BUILD', 'BUY', 'PARTNER', 'ADAPT', 'DEFER', 'REJECT'].includes(result.upgradeProposal.decision));

  // 8. an engineering mission packet (this fixture is evidenced strongly
  // enough and cheap enough to reach BUILD, so the packet must be real)
  assert.equal(result.upgradeProposal.decision, 'BUILD');
  assert.equal(result.engineeringPacket.ok, true);
  assert.ok(result.engineeringPacket.forbiddenPaths.includes('lite/'));
});

test('CRITICAL INVARIANT: the synthetic run can never reach ECONOMICALLY_PROVEN, even with owner approval', async () => {
  const store = await tempStore();
  const result = await runCommercialSpine({
    store, rawSignals: [syntheticSignal()], date: monday,
    opportunityId: 'e2e-opp-2', opportunityName: 'Synthetic canary attempt', opportunityCategory: 'test',
    priceHint: 49, candidateOverrides: fullCandidateOverrides,
    isSynthetic: true, simulatedOutcomeType: 'CLEARED_PAYMENT',
    ownerApproved: true, realEconomicProof: { realClearedAmountUsd: 999999 } // an attempted evidence-laundering input
  });
  assert.equal(result.canaryProof.isSynthetic, true, 'the spine must force isSynthetic through onto any proof object, regardless of what the caller claims');
  const gate = canaryPromotionGate({ ownerApproved: true, economicProof: result.canaryProof });
  assert.equal(gate.canPromote, false);
  assert.equal(gate.resultingStage, 'CANARY');
  assert.ok(gate.reasons.includes('economic-proof-is-synthetic-not-real'));
});

test('a genuinely real (non-synthetic) run with real owner approval and real positive proof CAN reach ECONOMICALLY_PROVEN -- the gate is not rigged to always fail', async () => {
  const store = await tempStore();
  const result = await runCommercialSpine({
    store, rawSignals: [syntheticSignal({ evidenceClass: 'VERIFIED_FACT', sourceUrl: 'https://real.example/pricing' })], date: monday,
    opportunityId: 'e2e-opp-3', opportunityName: 'Real run', opportunityCategory: 'test',
    priceHint: 49, candidateOverrides: fullCandidateOverrides,
    isSynthetic: false, simulatedOutcomeType: 'CLEARED_PAYMENT',
    ownerApproved: true, realEconomicProof: { realClearedAmountUsd: 49 }
  });
  assert.equal(result.canaryProof.isSynthetic, false);
  const gate = canaryPromotionGate({ ownerApproved: true, economicProof: result.canaryProof });
  assert.equal(gate.canPromote, true);
  assert.equal(gate.resultingStage, 'ECONOMICALLY_PROVEN');
});

test('malformed input (missing opportunityId) is rejected cleanly, never throws', async () => {
  const store = await tempStore();
  const result = await runCommercialSpine({ store, rawSignals: [syntheticSignal()], date: monday });
  assert.equal(result.ok, false);
});

test('isSynthetic defaults to true (the safe choice) even if the caller forgets to set it', async () => {
  const store = await tempStore();
  const result = await runCommercialSpine({
    store, rawSignals: [syntheticSignal()], date: monday,
    opportunityId: 'e2e-opp-4', opportunityName: 'Default safety', priceHint: 49, simulatedOutcomeType: 'CLICK_OPEN'
  });
  assert.equal(result.isSynthetic, true);
});

test('running the exact same synthetic batch twice is replay-safe: zero duplicate signal-ingestion receipts', async () => {
  const store = await tempStore();
  await runCommercialSpine({ store, rawSignals: [syntheticSignal()], date: monday, opportunityId: 'e2e-opp-5', priceHint: 49 });
  const second = await runCommercialSpine({ store, rawSignals: [syntheticSignal()], date: new Date(monday.getTime() + 1000), opportunityId: 'e2e-opp-5', priceHint: 49 });
  assert.equal(second.ingestion.counts.accepted, 0);
  assert.equal(second.ingestion.counts.duplicates, 1);
});

test('the pipeline never sends anything or calls a real provider', async () => {
  const store = await tempStore();
  await runCommercialSpine({
    store, rawSignals: [syntheticSignal()], date: monday, opportunityId: 'e2e-opp-6', priceHint: 49, simulatedOutcomeType: 'CLEARED_PAYMENT'
  });
  assert.equal((await store.list('messages')).length, 0);
  const source = await fs.readFile(new URL('../src/commercial-spine.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sendEmail|gmail\.mjs|fetch\(|http\.request|https\.request/);
});
