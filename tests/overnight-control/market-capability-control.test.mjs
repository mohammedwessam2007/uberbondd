import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketCapabilityRegistry,
  normalizeCapabilityPrimitive
} from '../../src/overnight/control/market-capability-registry.mjs';
import {
  runCapabilityTournament,
  scoreCapabilityPrimitive
} from '../../src/overnight/control/capability-tournament.mjs';

const DATE = new Date('2026-08-25T03:00:00.000Z');

function capability(overrides = {}) {
  return {
    id: 'journey-observability',
    family: 'revenue-journey',
    primitive: 'synthetic-journey-diagnostic',
    label: 'Synthetic journey diagnostic',
    marketAnalogues: ['Microsoft Clarity', 'Revenue Journey Assurance'],
    existingModules: [{ path: 'src/overnight/journey/index.mjs', coverage: 'COMPOSED' }],
    reuseState: 'COMPOSE_REQUIRED',
    priority: 'P0',
    evidenceState: 'IMPLEMENTED_TEST_VERIFIED',
    economics: {
      expectedRevenueCents: 10000,
      deliveryCostCents: 1000,
      conversionProbability: 0.2,
      recurringProbability: 0.5,
      founderMinutes: 20,
      buildMinutes: 10,
      runCostCents: 50,
      riskPenaltyCents: 10,
      evidenceConfidence: 0.7
    },
    ...overrides
  };
}

test('registry normalizes, deduplicates exact entries, and rejects conflicting duplicates', () => {
  const exact = capability();
  const duplicate = buildMarketCapabilityRegistry({ entries: [exact, exact] });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.registryCount, 1);
  assert.equal(duplicate.duplicates.length, 1);

  const conflict = buildMarketCapabilityRegistry({ entries: [
    exact,
    capability({ id: 'journey-observability-alt', label: 'Different claim' })
  ] });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflicts.length, 1);
  assert.ok(conflict.reasonCodes.includes('conflicting-capability-duplicate'));
});

test('unknown economics are not selected and remain explicit', () => {
  const normalized = normalizeCapabilityPrimitive(capability({ economics: {} }));
  assert.equal(normalized.ok, true);
  const scored = scoreCapabilityPrimitive(normalized.capability, { date: DATE });
  assert.equal(scored.status, 'UNKNOWN_ECONOMICS');
  assert.equal(scored.eligibleForSelection, false);
  assert.ok(scored.reasonCodes.includes('unknown-economic-expectedRevenueCents'));
});

test('complete economics can select a capability but never authorize external effects', () => {
  const result = runCapabilityTournament({
    capabilities: [capability()],
    sourceCommit: '2a76f3947a700a89d91d31977c4c6f8703b02f6d',
    date: DATE,
    budgetCents: 5000,
    founderMinuteBudget: 100,
    maxSelections: 1
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'TOURNAMENT_COMPLETE');
  assert.equal(result.selected.length, 1);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.deepEqual(result.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
});

test('budget exhaustion blocks a candidate rather than borrowing an unknown budget', () => {
  const result = runCapabilityTournament({
    capabilities: [capability()],
    sourceCommit: '2a76f3947a700a89d91d31977c4c6f8703b02f6d',
    date: DATE,
    budgetCents: 10,
    founderMinuteBudget: 100,
    maxSelections: 1
  });
  assert.equal(result.status, 'BUDGET_EXHAUSTED');
  assert.equal(result.selected.length, 0);
  assert.ok(result.blocked.some(item => item.reasonCodes.includes('budget-exhausted')));
});

test('expiry and kill switches fail closed', () => {
  const expired = runCapabilityTournament({
    capabilities: [capability({ expiresAt: '2026-08-24T23:59:59.000Z' })],
    sourceCommit: '2a76f3947a700a89d91d31977c4c6f8703b02f6d',
    date: DATE,
    budgetCents: 5000,
    founderMinuteBudget: 100
  });
  assert.equal(expired.status, 'NO_ELIGIBLE_CAPABILITIES');
  assert.equal(expired.selected.length, 0);
  assert.ok(expired.blocked.some(item => item.reasonCodes.includes('capability-expired')));

  const killed = runCapabilityTournament({
    capabilities: [capability()],
    sourceCommit: '2a76f3947a700a89d91d31977c4c6f8703b02f6d',
    date: DATE,
    budgetCents: 5000,
    founderMinuteBudget: 100,
    killSwitches: { overnight: true }
  });
  assert.equal(killed.status, 'KILL_SWITCH_BLOCKED');
  assert.equal(killed.selected.length, 0);
});

test('every tournament emits an owner-review manifest and receipt', () => {
  const result = runCapabilityTournament({
    capabilities: [capability()],
    sourceCommit: '2a76f3947a700a89d91d31977c4c6f8703b02f6d',
    date: DATE,
    budgetCents: 5000,
    founderMinuteBudget: 100
  });
  assert.equal(result.artifacts.ok, true);
  assert.equal(result.artifacts.manifest.ok, true);
  assert.equal(result.artifacts.receipt.ok, true);
  assert.equal(result.artifacts.manifest.execution.implementation, 'NOT_AUTHORIZED');
  assert.equal(result.artifacts.receipt.decision, 'OWNER_REVIEW_REQUIRED');
  assert.equal(result.artifacts.receipt.externalEffectLedger.spendCents, 0);
});
