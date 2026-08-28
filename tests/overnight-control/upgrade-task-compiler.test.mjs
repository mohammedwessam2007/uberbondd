import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { compileUpgradeTaskPlan } from '../../src/overnight/control/upgrade-task-compiler.mjs';

const DATE = new Date('2026-08-26T03:00:00.000Z');
const SOURCE_COMMIT = '2a76f3947a700a89d91d31977c4c6f8703b02f6d';

function tournament(overrides = {}) {
  return {
    ok: true,
    status: 'TOURNAMENT_COMPLETE',
    sourceCommit: SOURCE_COMMIT,
    tournamentId: 'overnight_tournament_1',
    registryDigest: 'registry_digest_1',
    expiresAt: '2026-08-27T03:00:00.000Z',
    selected: [{
      id: 'outbound-sequencing',
      label: 'Evidence-bound outbound sequencing',
      family: 'distribution',
      status: 'SELECTED',
      priority: 'P0',
      reuseState: 'REUSE_READY',
      existingModulePaths: ['src/outreach-automation.mjs', 'src/send-safety.mjs'],
      score: 42,
      economicConfidence: 0.4,
      estimatedCostCents: 0,
      estimatedFounderMinutes: 15,
      reasonCodes: []
    }],
    ...overrides
  };
}

test('compiles a selected capability into an ordered bounded task graph', () => {
  const plan = compileUpgradeTaskPlan({ tournament: tournament(), date: DATE });
  assert.equal(plan.ok, true);
  assert.equal(plan.status, 'PLAN_ONLY_OWNER_REVIEW');
  assert.equal(plan.selectedCount, 1);
  assert.equal(plan.taskCount, 6);
  assert.deepEqual(plan.tasks.map(task => task.phase), [
    'EVIDENCE_RESEARCH', 'IMPLEMENTATION', 'DETERMINISTIC_TEST',
    'INDEPENDENT_REVIEW', 'HOSTILE_REVIEW', 'PROMOTION_REVIEW'
  ]);
  assert.equal(plan.tasks[1].parentTaskId, plan.tasks[0].taskId);
  assert.equal(plan.tasks[3].actor, 'GPT_REVIEW');
  assert.equal(plan.tasks[3].workerIdentityRule, 'MUST_DIFFER_FROM_IMPLEMENTATION_WORKER');
  assert.equal(plan.tasks[1].execution, 'NOT_RUN');
});

test('task plan preserves authority boundaries and never reports external effects', () => {
  const plan = compileUpgradeTaskPlan({ tournament: tournament(), date: DATE });
  assert.deepEqual(plan.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
  assert.equal(plan.authority.providerCalls, 'DISABLED');
  assert.equal(plan.authority.sovereignty, 'UNCHANGED');
  assert.ok(plan.tasks.every(task => task.externalEffectLedger.providerCalls === 0));
  assert.ok(plan.tasks.every(task => task.constraints.some(item => item.includes('no provider calls'))));
  assert.ok(plan.tasks.every(task => task.review.selfReviewAccepted === false));
});

test('protected modules are visible to reviewers but implementation remains non-sovereignty-only', () => {
  const plan = compileUpgradeTaskPlan({
    tournament: tournament({ selected: [{
      ...tournament().selected[0],
      id: 'payment-truth-review',
      existingModulePaths: ['src/payments.mjs', 'src/provider-adapter-contract.mjs']
    }] }),
    date: DATE
  });
  const implementation = plan.tasks.find(task => task.phase === 'IMPLEMENTATION');
  assert.deepEqual(implementation.reuse.protectedModulePaths, ['src/payments.mjs']);
  assert.match(implementation.implementationTarget, /non-sovereignty files only/);
  assert.ok(implementation.constraints.some(item => item.includes('do not edit or weaken sovereignty')));
});

test('incomplete, expired, non-terminal, or invalid tournaments fail closed', () => {
  assert.equal(compileUpgradeTaskPlan({ date: DATE }).reasonCodes[0], 'completed-tournament-required');
  assert.ok(compileUpgradeTaskPlan({ tournament: tournament({ status: 'REVIEW_REQUIRED' }), date: DATE }).reasonCodes.includes('tournament-not-complete'));
  assert.ok(compileUpgradeTaskPlan({ tournament: tournament({ expiresAt: '2026-08-26T02:59:59.000Z' }), date: DATE }).reasonCodes.includes('tournament-expired'));
  assert.ok(compileUpgradeTaskPlan({ tournament: tournament({ selected: [{ ...tournament().selected[0], status: 'BLOCKED_BUDGET' }] }), date: DATE }).reasonCodes.includes('invalid-selected-capability'));
});

test('duplicate selected capabilities are rejected instead of creating duplicate work', () => {
  const item = tournament().selected[0];
  const result = compileUpgradeTaskPlan({ tournament: tournament({ selected: [item, { ...item, label: 'same capability, different label' }] }), date: DATE });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('invalid-selected-capability'));
  assert.equal(result.rejected[0].reason, 'duplicate-selected-capability');
});

test('same inputs produce the same task plan and compiler has no I/O boundary', async () => {
  const first = compileUpgradeTaskPlan({ tournament: tournament(), date: DATE });
  const second = compileUpgradeTaskPlan({ tournament: tournament(), date: DATE });
  assert.deepEqual(first, second);
  const source = await fs.readFile(new URL('../../src/overnight/control/upgrade-task-compiler.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
