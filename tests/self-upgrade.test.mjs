import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  compileUpgradeProposal,
  compileEngineeringMissionPacket,
  evaluateUpgradeGate,
  logSelfUpgradeReceipt,
  routeUpgradeDecision,
  UPGRADE_DECISIONS,
  SELF_UPGRADE_POLICY_VERSION
} from '../src/self-upgrade.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';
import { scoreOpportunity, incrementalBuildDistance } from '../src/opportunity-registry.mjs';

const date = new Date('2026-08-18T12:00:00.000Z');

function proposal(overrides = {}) {
  return compileUpgradeProposal({
    problem: 'Reduce repeated owner repair work in the local task flow',
    evidenceRefs: ['audit:repair-1', 'test:baseline-1'],
    expectedEconomicEffect: { expectedOwnerMinutesSaved: 30, confidence: 0.4, assumptions: ['measured on local fixtures'] },
    buildCost: { engineeringMinutes: 90 },
    risk: { level: 'LOW', categories: ['regression'], mitigations: ['keep rollback'] },
    affectedCapabilities: ['task-universe-engine'],
    acceptanceCriteria: ['all deterministic tests pass', 'no owner repair increase'],
    rollbackPlan: 'Revert the isolated commit and retain the prior contract',
    date,
    ...overrides
  });
}

test('proposal requires evidence, acceptance, rollback, and owner authority', () => {
  const missing = compileUpgradeProposal({ problem: 'x', date });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('evidence-references-required'));
  assert.ok(missing.reasonCodes.includes('acceptance-criteria-required'));
  assert.ok(missing.reasonCodes.includes('rollback-plan-required'));
  const nonOwner = proposal({ requiredAuthorization: 'AUTONOMOUS' });
  assert.equal(nonOwner.ok, false);
  assert.ok(nonOwner.reasonCodes.includes('owner-authorization-required'));
});

test('proposal is deterministic and keeps unknown economics explicit', () => {
  const a = proposal({ proposalId: undefined, expectedEconomicEffect: undefined, buildCost: undefined });
  const b = proposal({ proposalId: undefined, expectedEconomicEffect: undefined, buildCost: undefined });
  assert.deepEqual(a, b);
  assert.equal(a.status, 'REVIEW_REQUIRED');
  assert.equal(a.expectedEconomicEffect.status, 'UNKNOWN');
  assert.equal(a.buildCost.status, 'UNKNOWN');
  assert.equal(a.execution.status, 'NOT_RUN');
});

test('malformed evidence references cannot create a reviewable proposal', () => {
  const result = proposal({ evidenceRefs: ['https://private.example/raw-secret', 'creator-claim'] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('evidence-reference-format-invalid'));
});

test('mission packet is bounded, excludes lite, and carries mandatory forbidden actions', () => {
  const result = compileEngineeringMissionPacket({
    proposal: proposal(),
    repositoryScope: ['src/', 'lite/', 'tests/', 'src/'],
    requiredTests: ['npm run check', 'node --test tests/self-upgrade.test.mjs'],
    acceptanceGate: ['zero critical failures', 'no external effects'],
    date
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PREPARED');
  assert.deepEqual(result.repositoryScope, ['src/', 'tests/']);
  assert.ok(result.forbiddenActions.includes('deploy'));
  assert.ok(result.forbiddenActions.includes('change-credentials'));
  assert.equal(result.authority, 'OWNER_REQUIRED');
  assert.equal(result.execution.status, 'NOT_RUN');
});

test('mission packet rejects missing tests or an invalid proposal', () => {
  const invalid = compileEngineeringMissionPacket({ proposal: { proposalId: 'x', status: 'PREPARED' }, date });
  assert.equal(invalid.ok, false);
  const noTests = compileEngineeringMissionPacket({ proposal: proposal(), acceptanceGate: ['gate'], date });
  assert.equal(noTests.ok, false);
  assert.ok(noTests.reasonCodes.includes('required-tests-needed'));
});

test('passing local tests produce shadow readiness, never promotion authority', () => {
  const result = evaluateUpgradeGate({
    proposal: proposal(),
    testResults: { total: 20, passed: 20, failed: 0, criticalFailures: [] },
    baseline: 0.92,
    candidate: 0.94,
    ownerRepairCountBaseline: 3,
    ownerRepairCountCandidate: 3,
    date
  });
  assert.equal(result.status, 'SHADOW_READY');
  assert.equal(result.promotion.status, 'PROMOTION_BLOCKED');
  assert.equal(result.promotion.authority, 'OWNER_REQUIRED');
  assert.equal(result.execution.deployment, false);
});

test('failed tests, regressions, and external-proof claims cannot pass the gate', () => {
  const result = evaluateUpgradeGate({
    proposal: proposal(),
    testResults: { total: 20, passed: 19, failed: 1, criticalFailures: ['security'] },
    baseline: 0.92,
    candidate: 0.80,
    ownerRepairCountBaseline: 3,
    ownerRepairCountCandidate: 4,
    externalProof: true,
    date
  });
  assert.equal(result.status, 'REPAIR_REQUIRED');
  assert.ok(result.reasonCodes.includes('tests-not-passing'));
  assert.ok(result.reasonCodes.includes('candidate-regresses-baseline'));
  assert.ok(result.reasonCodes.includes('owner-repairs-increased'));
  assert.ok(result.reasonCodes.includes('external-proof-cannot-be-inferred-locally'));
});

test('incomplete test results remain repair-required rather than guessed green', () => {
  const result = evaluateUpgradeGate({ proposal: proposal(), testResults: { passed: 10 }, date });
  assert.equal(result.status, 'REPAIR_REQUIRED');
  assert.ok(result.reasonCodes.includes('complete-test-receipt-required'));
});

test('receipts store references and decisions, not raw proposal payloads', async () => {
  const calls = [];
  const result = proposal();
  await logSelfUpgradeReceipt({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'receipt-1' }; } }, 'upgrade_proposal', result);
  assert.equal(calls[0].type, 'upgrade_proposal');
  assert.equal(calls[0].detail.problem, undefined);
  assert.equal(calls[0].detail.policyVersion, SELF_UPGRADE_POLICY_VERSION);
});

test('handlers prepare and audit all three local-only stages', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; } },
    cfg: {}
  });
  const created = await handlers['prometheus.upgrade.propose']({
    problem: 'Improve local evidence coverage', evidenceRefs: ['audit:1'],
    acceptanceCriteria: ['coverage is measured'], rollbackPlan: 'revert commit', date
  });
  assert.equal(created.ok, true);
  const packet = await handlers['prometheus.engineering.packet']({
    proposal: created, requiredTests: ['npm run check'], acceptanceGate: ['zero failures'], date
  });
  assert.equal(packet.ok, true);
  const gate = await handlers['prometheus.upgrade.evaluate']({
    proposal: created, testResults: { total: 1, passed: 1, failed: 0 }, date
  });
  assert.equal(gate.status, 'SHADOW_READY');
  assert.deepEqual(calls.map(call => call.type), ['upgrade_proposal', 'engineering_mission_packet', 'upgrade_gate_evaluation']);
});

// Ported from tests/upgrade-proposal.test.mjs (see
// docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md -- Pair 6): the
// BUILD/BUY router's own hostile coverage, now driven directly since it
// lives in this module after reconciliation.

test('a low composite score always REJECTs, regardless of how cheap the build looks', () => {
  assert.equal(routeUpgradeDecision({ buildDistance: 0, confidence: 1, compositeScore: 10 }), 'REJECT');
});

test('a commodity never routes to BUILD, no matter how low the build distance is', () => {
  const decision = routeUpgradeDecision({ buildDistance: 0, confidence: 1, compositeScore: 90, isCommodity: true });
  assert.notEqual(decision, 'BUILD');
  assert.ok(['BUY', 'PARTNER'].includes(decision));
});

test('right at the confidence boundary (0.29 vs 0.30), the router does not round in BUILD\'s favor', () => {
  assert.equal(routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.29, compositeScore: 90 }), 'DEFER');
  assert.equal(routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.30, compositeScore: 90 }), 'BUILD');
});

test('a genuinely cheap, evidenced, non-commodity opportunity can route to BUILD -- the router is not rigged to always defer', () => {
  assert.equal(routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.8, compositeScore: 80, isCommodity: false }), 'BUILD');
});

test('a moderate build distance routes to ADAPT, a high one defers even with strong evidence', () => {
  assert.equal(routeUpgradeDecision({ buildDistance: 0.5, confidence: 0.8, compositeScore: 80 }), 'ADAPT');
  assert.equal(routeUpgradeDecision({ buildDistance: 0.9, confidence: 0.9, compositeScore: 90 }), 'DEFER');
});

test('missing/malformed numeric inputs fall back to the most conservative interpretation, never crash', () => {
  assert.equal(routeUpgradeDecision({}), 'REJECT');
});

test('proposal composes directly with real scoreOpportunity/incrementalBuildDistance and records the routed decision', () => {
  const opportunityScore = scoreOpportunity({
    candidate: {
      id: 'opp-1', name: 'Test', timeToCashDays: { value: 1, claimType: 'VERIFIED_FACT' },
      automationPotential: { value: 90, claimType: 'VERIFIED_FACT' }, founderBurden: { value: 5, claimType: 'VERIFIED_FACT' },
      recurringTrigger: { value: true, claimType: 'VERIFIED_FACT' }, retention: { value: 85, claimType: 'VERIFIED_FACT' },
      grossMargin: { value: 90, claimType: 'VERIFIED_FACT' }
    },
    date
  });
  const buildDistanceResult = incrementalBuildDistance(['deterministic-audit'], ['deterministic-audit', 'payment-truth']);
  const expectedDecision = routeUpgradeDecision({
    buildDistance: buildDistanceResult.distance, confidence: opportunityScore.confidence, compositeScore: opportunityScore.compositeScore
  });
  const result = proposal({ opportunityScore, buildDistanceResult });
  assert.equal(result.decision, expectedDecision);
  if (expectedDecision === 'REJECT') {
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('rejected-insufficient-economic-value'));
  } else {
    assert.equal(result.ok, true);
    assert.ok(UPGRADE_DECISIONS.includes(result.decision));
  }
});

test('a router REJECT blocks the proposal outright -- there is no economic case worth a reviewable proposal', () => {
  const opportunityScore = scoreOpportunity({ candidate: { id: 'opp-weak', name: 'Weak' }, date });
  const buildDistanceResult = incrementalBuildDistance(['nonexistent-cap'], []);
  const result = proposal({ opportunityScore, buildDistanceResult });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('rejected-insufficient-economic-value'));
  assert.equal(result.decision, 'REJECT');
});

test('without opportunityScore/buildDistanceResult, the decision stays NOT_EVALUATED and does not block review', () => {
  const result = proposal();
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'NOT_EVALUATED');
});

test('self-upgrade module has no provider, process, filesystem, or deployment boundary', async () => {
  const source = await fs.readFile(new URL('../src/self-upgrade.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(|spawn\(|exec\(|child_process|process\.env/i);
});
