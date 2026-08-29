import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEmployeeRoleContract, bindRoleToTask, validateRoleBoundExecution } from '../src/ai-employee-role-contract.mjs';

function boundTask() {
  const role = compileEmployeeRoleContract({
    roleId: 'capability-gap-analyst',
    department: 'finance-engineering-interface',
    allowedCapabilities: ['read-repository', 'compile-implementation-packet'],
    authorityCeiling: 'IMPLEMENTATION_PACKET_ONLY',
    consequenceClassCeiling: 'LOCAL_PREPARATION',
    evidencePrerequisites: ['current-main-dedupe', 'named-capability-gap'],
    economicMetric: 'founder minutes removed per implementation unit',
    stopConditions: ['existing capability sufficient', 'no economic reason'],
    escalationTarget: 'claude-software-factory',
    outputSchema: 'versioned implementation packet'
  });
  return bindRoleToTask({
    roleContract: role,
    taskAllowedCapabilities: ['read-repository', 'compile-implementation-packet'],
    taskConsequenceClass: 'LOCAL_PREPARATION'
  });
}

test('execution recomputes role digest and rejects capability tampering', () => {
  const task = boundTask();
  assert.equal(validateRoleBoundExecution(task).ok, true);
  const tampered = {
    ...task,
    employeeRoleAllowedCapabilities: [...task.employeeRoleAllowedCapabilities, 'deploy-production']
  };
  const result = validateRoleBoundExecution(tampered);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('employee-role-digest-integrity-mismatch'));
});

test('execution rejects stop-condition or authority tampering under unchanged digest', () => {
  const task = boundTask();
  for (const tampered of [
    { ...task, employeeRoleStopConditions: ['never-stop'] },
    { ...task, employeeRoleAuthorityCeiling: 'UNBOUNDED' }
  ]) {
    const result = validateRoleBoundExecution(tampered);
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('employee-role-digest-integrity-mismatch'));
  }
});
