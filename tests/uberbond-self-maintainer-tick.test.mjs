import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAgentCodeChangeSet, contentSha256 } from '../src/agent-code-change-contract.mjs';
import {
  selfMaintenanceTaskId,
  compileSelfMaintenanceRelayTask,
  validateRelayCandidate
} from '../scripts/uberbond-self-maintainer-tick.mjs';

const BASE = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const BEFORE = 'export const value = 1;\n';
const AFTER = 'export const value = 2;\n';

function candidate(taskId = selfMaintenanceTaskId(BASE), baseRevision = BASE) {
  return compileAgentCodeChangeSet({
    taskId,
    baseRevision,
    consequenceClass: 'LOCAL_PREPARATION',
    summary: 'Bounded autonomous repair for review.',
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    changes: [{
      operation: 'UPDATE',
      path: 'src/example.mjs',
      beforeSha256: contentSha256(BEFORE),
      content: AFTER,
      rationale: 'Exercise canonical bounded change admission.'
    }]
  });
}

test('self-maintenance task identity is stable for the exact main revision', () => {
  assert.equal(selfMaintenanceTaskId(BASE), selfMaintenanceTaskId(BASE));
  assert.notEqual(selfMaintenanceTaskId(BASE), selfMaintenanceTaskId(OTHER));
  assert.equal(selfMaintenanceTaskId('not-a-sha'), null);
});

test('relay task is bounded, deterministic by base and grants no consequential authority', () => {
  const one = compileSelfMaintenanceRelayTask({ baseRevision: BASE, date: new Date('2026-09-05T12:00:00Z') });
  const two = compileSelfMaintenanceRelayTask({ baseRevision: BASE, date: new Date('2026-09-05T13:00:00Z') });
  assert.equal(one.taskId, two.taskId);
  assert.equal(one.consequenceClass, 'LOCAL_PREPARATION');
  assert.equal(one.budget.maxCostCents, 0);
  assert.ok(one.requiredOutputs.includes('codeChangeSet'));
  assert.ok(one.acceptanceTests.includes('npm run check:syntax'));
  assert.ok(one.acceptanceTests.includes('npm run test:deterministic'));
  for (const action of ['merge', 'deploy', 'send', 'spend', 'change-credentials', 'change-dns', 'mutate-production']) {
    assert.ok(one.forbiddenActions.includes(action));
  }
});

test('candidate admission binds worker decision, task id, exact base and full verification', () => {
  const task = compileSelfMaintenanceRelayTask({ baseRevision: BASE });
  const changeSet = candidate(task.taskId, BASE);
  assert.equal(changeSet.ok, true, JSON.stringify(changeSet));
  const admitted = validateRelayCandidate({
    result: { decision: 'PROCEED', codeChangeSet: changeSet },
    task,
    baseRevision: BASE
  });
  assert.equal(admitted.ok, true, JSON.stringify(admitted));
  assert.equal(admitted.status, 'CANDIDATE_ADMITTED');
});

test('candidate admission rejects stale-base and task-identity substitutions', () => {
  const task = compileSelfMaintenanceRelayTask({ baseRevision: BASE });
  for (const changeSet of [candidate(task.taskId, OTHER), candidate('different-task', BASE)]) {
    const result = validateRelayCandidate({ result: { decision: 'PROCEED', codeChangeSet: changeSet }, task, baseRevision: BASE });
    assert.equal(result.ok, false);
  }
});

test('candidate admission refuses non-PROCEED or missing required verification', () => {
  const task = compileSelfMaintenanceRelayTask({ baseRevision: BASE });
  const stop = validateRelayCandidate({ result: { decision: 'STOP', codeChangeSet: candidate(task.taskId, BASE) }, task, baseRevision: BASE });
  assert.equal(stop.ok, false);
  assert.ok(stop.reasonCodes.includes('worker-decision-stop'));

  const weak = compileAgentCodeChangeSet({
    taskId: task.taskId,
    baseRevision: BASE,
    summary: 'Incomplete verification example.',
    verification: ['npm run check:syntax'],
    changes: [{
      operation: 'UPDATE', path: 'src/example.mjs', beforeSha256: contentSha256(BEFORE), content: AFTER,
      rationale: 'Test required verification admission.'
    }]
  });
  const rejected = validateRelayCandidate({ result: { decision: 'PROCEED', codeChangeSet: weak }, task, baseRevision: BASE });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.reasonCodes.includes('candidate-required-verification-missing:npm run test:deterministic'));
});
