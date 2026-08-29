import test from 'node:test';
import assert from 'node:assert/strict';
import {
  employeeRoleIdentityFromTask,
  employeeRoleIdentityErrors,
  bindEmployeeRoleIdentityToResult,
  bindEmployeeRoleIdentityToReceipt,
  bindEmployeeRoleSubmissionPayload
} from '../src/ai-employee-terminal-identity.mjs';

const task = {
  employeeRoleRef: 'employee-role:engineering/capability-gap-analyst@1.0.0',
  employeeRoleDigest: 'a'.repeat(64)
};
const baseResult = { outcome: 'done', decision: 'DONE' };

test('role-bound task identity is complete and stable', () => {
  const identity = employeeRoleIdentityFromTask(task);
  assert.equal(identity.ok, true);
  assert.equal(identity.bound, true);
  assert.equal(identity.employeeRoleRef, task.employeeRoleRef);
  assert.equal(identity.employeeRoleDigest, task.employeeRoleDigest);
});

test('incomplete task binding fails closed', () => {
  const identity = employeeRoleIdentityFromTask({ employeeRoleRef: task.employeeRoleRef });
  assert.equal(identity.ok, false);
  assert.deepEqual(identity.reasonCodes, ['task-employee-role-binding-incomplete']);
});

test('system binds missing role identity into model result', () => {
  const bound = bindEmployeeRoleIdentityToResult({ task, result: baseResult });
  assert.equal(bound.ok, true);
  assert.equal(bound.result.employeeRoleRef, task.employeeRoleRef);
  assert.equal(bound.result.employeeRoleDigest, task.employeeRoleDigest);
  assert.equal('employeeRoleRef' in baseResult, false);
});

test('model cannot substitute a different role identity', () => {
  const bound = bindEmployeeRoleIdentityToResult({
    task,
    result: { ...baseResult, employeeRoleRef: 'employee-role:finance/pricing-analyst@1.0.0' }
  });
  assert.equal(bound.ok, false);
  assert.ok(bound.reasonCodes.includes('model-result-employee-role-ref-conflict'));
});

test('terminal truth requires exact expected role identity', () => {
  assert.deepEqual(employeeRoleIdentityErrors({ result: baseResult, expected: task }), [
    'worker-result-employee-role-ref-required',
    'worker-result-employee-role-digest-required'
  ]);
  assert.deepEqual(employeeRoleIdentityErrors({
    result: { ...baseResult, employeeRoleRef: task.employeeRoleRef, employeeRoleDigest: task.employeeRoleDigest },
    expected: task
  }), []);
});

test('receipt and nested result are bound together', () => {
  const bound = bindEmployeeRoleIdentityToReceipt({ task, receipt: { taskId: 't1', result: baseResult } });
  assert.equal(bound.ok, true);
  assert.equal(bound.receipt.employeeRoleRef, task.employeeRoleRef);
  assert.equal(bound.receipt.result.employeeRoleDigest, task.employeeRoleDigest);
});

test('submission payload binds both result and receipt and preserves generic tasks', () => {
  const bound = bindEmployeeRoleSubmissionPayload({
    task,
    payload: { result: baseResult, receipt: { taskId: 't1' } }
  });
  assert.equal(bound.ok, true);
  assert.equal(bound.payload.result.employeeRoleDigest, task.employeeRoleDigest);
  assert.equal(bound.payload.receipt.employeeRoleDigest, task.employeeRoleDigest);

  const generic = bindEmployeeRoleSubmissionPayload({
    task: {},
    payload: { result: baseResult, receipt: null }
  });
  assert.equal(generic.ok, true);
  assert.equal(generic.bound, false);
  assert.equal('employeeRoleRef' in generic.payload.result, false);
});
