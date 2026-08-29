import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileEmployeeRoleContract,
  bindRoleToTask,
  validateRoleBoundExecution
} from '../src/ai-employee-role-contract.mjs';

function role(overrides = {}) {
  return compileEmployeeRoleContract({
    roleId: 'capability-gap-analyst',
    department: 'finance-engineering-interface',
    allowedCapabilities: ['read-repository', 'compile-implementation-packet'],
    authorityCeiling: 'IMPLEMENTATION_PACKET_ONLY',
    consequenceClassCeiling: 'LOCAL_PREPARATION',
    evidencePrerequisites: ['current-main-dedupe', 'named-capability-gap'],
    economicMetric: 'founder minutes removed per implementation unit',
    stopConditions: ['existing capability sufficient', 'no economic reason'],
    escalationTarget: 'claude-software-factory',
    outputSchema: 'versioned implementation packet',
    ...overrides
  });
}

test('unknown and incomplete employee roles fail closed', () => {
  const unknown = role({ roleId: 'supreme-unbounded-founder' });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.reasonCodes.includes('unknown-employee-role'));
  const missing = compileEmployeeRoleContract({ roleId: 'evidence-critic' });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('employee-role-capabilities-required'));
});

test('role identity is deterministic and changes when the contract changes', () => {
  const a = role();
  const b = role();
  const changed = role({ stopConditions: ['existing capability sufficient', 'budget missing'] });
  assert.equal(a.ok, true);
  assert.equal(a.roleDigest, b.roleDigest);
  assert.notEqual(a.roleDigest, changed.roleDigest);
  assert.match(a.roleDigest, /^[a-f0-9]{64}$/);
});

test('role cannot expand parent capability set', () => {
  const result = bindRoleToTask({
    roleContract: role(),
    taskAllowedCapabilities: ['read-repository'],
    taskConsequenceClass: 'LOCAL_PREPARATION'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('employee-role-capability-expands-parent-task'));
});

test('role can only narrow within parent task', () => {
  const result = bindRoleToTask({
    roleContract: role(),
    taskAllowedCapabilities: ['read-repository', 'compile-implementation-packet', 'write-branch'],
    taskConsequenceClass: 'LOCAL_PREPARATION'
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'TASK_BOUND');
  assert.deepEqual(result.employeeRoleAllowedCapabilities, ['read-repository', 'compile-implementation-packet']);
});

test('execution eligibility requires durable role identity', () => {
  const denied = validateRoleBoundExecution({ taskId: 'legacy' });
  assert.equal(denied.ok, false);
  assert.ok(denied.reasonCodes.includes('employee-role-ref-required-for-execution'));

  const bound = bindRoleToTask({
    roleContract: role(),
    taskAllowedCapabilities: ['read-repository', 'compile-implementation-packet'],
    taskConsequenceClass: 'LOCAL_PREPARATION'
  });
  const eligible = validateRoleBoundExecution(bound);
  assert.equal(eligible.ok, true);
  assert.equal(eligible.employeeRoleDigest, role().roleDigest);
});
