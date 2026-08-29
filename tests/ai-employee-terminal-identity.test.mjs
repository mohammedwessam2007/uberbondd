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

// A declared role on a task that grants none was accepted silently and carried
// forward into the durable submission payload. The mismatch checks all compared
// a declaration against an expectation, so the one case they could not see was
// an expectation of nothing: a generic worker naming itself
// `employee:executive/cfo` passed every one of them and the claim reached the
// relay receipt.
//
// That is exactly "generic work must never accidentally become privileged
// employee work", arriving through the only direction nobody was checking.
//
// It is refused rather than stripped. Stripping hides the attempt; a worker
// claiming an authority it was not admitted under is a signal worth keeping.

const PRIVILEGED = { employeeRoleRef: 'employee:executive/cfo', employeeRoleDigest: 'd'.repeat(64) };
const GENERIC_TASK = { taskId: 't-generic', targetAgent: 'chatgpt' };

test('a result may not declare a role the task never granted', () => {
  const errors = employeeRoleIdentityErrors({ result: PRIVILEGED, expected: {} });
  assert.deepEqual(errors, ['worker-result-employee-role-not-granted']);
});

test('either half of an ungranted claim is enough to refuse it', () => {
  assert.deepEqual(
    employeeRoleIdentityErrors({ result: { employeeRoleRef: 'employee:x' }, expected: {} }),
    ['worker-result-employee-role-not-granted']);
  assert.deepEqual(
    employeeRoleIdentityErrors({ result: { employeeRoleDigest: 'a'.repeat(64) }, expected: {} }),
    ['worker-result-employee-role-not-granted']);
});

test('a genuinely generic result still passes (positive control)', () => {
  assert.deepEqual(employeeRoleIdentityErrors({ result: { outcome: 'done' }, expected: {} }), []);
  assert.deepEqual(employeeRoleIdentityErrors({ result: {}, expected: {} }), []);
});

test('the result binder refuses an ungranted claim instead of carrying it', () => {
  const bound = bindEmployeeRoleIdentityToResult({
    task: GENERIC_TASK,
    result: { outcome: 'done', ...PRIVILEGED }
  });
  assert.equal(bound.ok, false);
  assert.ok(bound.reasonCodes.includes('model-result-employee-role-not-granted'));
});

test('the receipt binder refuses an ungranted claim, including a nested one', () => {
  const envelope = bindEmployeeRoleIdentityToReceipt({ task: GENERIC_TASK, receipt: { ...PRIVILEGED } });
  assert.equal(envelope.ok, false);
  assert.ok(envelope.reasonCodes.includes('receipt-employee-role-not-granted'));

  // The claim hiding one level down must not survive either.
  const nested = bindEmployeeRoleIdentityToReceipt({
    task: GENERIC_TASK,
    receipt: { note: 'clean envelope', result: { outcome: 'done', ...PRIVILEGED } }
  });
  assert.equal(nested.ok, false);
  assert.ok(nested.reasonCodes.includes('model-result-employee-role-not-granted'));
});

test('the submission payload cannot launder an ungranted role to the relay', () => {
  const payload = bindEmployeeRoleSubmissionPayload({
    task: GENERIC_TASK,
    payload: { taskId: 't-generic', workerId: 'w1', status: 'COMPLETED', result: { outcome: 'done', ...PRIVILEGED } }
  });
  assert.equal(payload.ok, false);
  assert.ok(payload.reasonCodes.includes('model-result-employee-role-not-granted'));
});

test('a generic submission still binds cleanly (positive control)', () => {
  const payload = bindEmployeeRoleSubmissionPayload({
    task: GENERIC_TASK,
    payload: { taskId: 't-generic', workerId: 'w1', status: 'COMPLETED', result: { outcome: 'done' }, receipt: { note: 'fine' } }
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.bound, false);
  assert.equal(payload.payload.result.employeeRoleRef, undefined);
});

test('a bound task still overwrites with the admitted identity (positive control)', () => {
  const task = { taskId: 't-priv', ...PRIVILEGED };
  const payload = bindEmployeeRoleSubmissionPayload({
    task,
    // A bound task requires a receipt: the identity has to be stamped on
    // something durable, not only on the result body.
    payload: { taskId: 't-priv', workerId: 'w1', status: 'COMPLETED', result: { outcome: 'done' }, receipt: { note: 'work receipt' } }
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.bound, true);
  assert.equal(payload.payload.receipt.employeeRoleRef, PRIVILEGED.employeeRoleRef);
  assert.equal(payload.payload.result.employeeRoleRef, PRIVILEGED.employeeRoleRef);
  assert.equal(payload.payload.result.employeeRoleDigest, PRIVILEGED.employeeRoleDigest);
});
