import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  compileUpgradeProposal,
  compileEngineeringMissionPacket,
  evaluateUpgradeGate,
  logSelfUpgradeReceipt,
  SELF_UPGRADE_POLICY_VERSION
} from '../src/self-upgrade.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

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

test('self-upgrade module has no provider, process, filesystem, or deployment boundary', async () => {
  const source = await fs.readFile(new URL('../src/self-upgrade.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(|spawn\(|exec\(|child_process|process\.env/i);
});
