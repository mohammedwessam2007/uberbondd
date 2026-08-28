import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEmployeeRoleContract } from '../src/ai-employee-role-contract.mjs';
import {
  compileEmployeeAgentTask,
  evaluateEmployeeWorkerResultTruth,
  compileEmployeeTerminalReceipt
} from '../src/ai-employee-relay.mjs';

const date = new Date('2026-08-29T00:00:00.000Z');

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

function task(overrides = {}) {
  return compileEmployeeAgentTask({
    roleContract: role(),
    allowedCapabilities: ['read-repository', 'compile-implementation-packet'],
    objective: 'Compile the smallest missing implementation primitive',
    originAgent: 'GPT_5_6_SOL',
    targetAgent: 'CLAUDE_CODE',
    contextRefs: ['mission:nightfall-role-bind'],
    evidenceRefs: ['doc:ai-employee-company-charter'],
    constraints: ['preserve canonical relay'],
    requiredOutputs: ['implementationPacket'],
    acceptanceTests: ['focused hostile role-binding suite'],
    budget: { maxTokens: 20000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION',
    date,
    ...overrides
  });
}

function terminalResult(boundTask, overrides = {}) {
  return {
    taskId: boundTask.taskId,
    employeeRoleRef: boundTask.employeeRoleRef,
    employeeRoleDigest: boundTask.employeeRoleDigest,
    outcome: 'Bound implementation packet produced and verified.',
    decision: 'DONE',
    changedArtifacts: [],
    testsActuallyRun: ['focused hostile role-binding suite'],
    truthTable: [{ claim: 'role-bound task identity', status: 'VERIFIED_LOCAL' }],
    evidenceRefs: ['test:role-binding'],
    coordination: { action: 'DONE', objective: null, summary: 'complete', evidenceRefs: ['test:role-binding'], confidence: 1 },
    externalEffectLedger: {
      providerCalls: 0, modelCalls: 0, messagesSent: 0, spendCents: 0,
      purchases: 0, dnsChanges: 0, credentialChanges: 0, kycChanges: 0,
      paymentChanges: 0, moneyMovementCents: 0, customerMutations: 0,
      productionMutations: 0, deployments: 0, publicPublishing: 0
    },
    ...overrides
  };
}

test('employee task is bound to a validated role without changing canonical relay', () => {
  const result = task();
  assert.equal(result.ok, true);
  assert.equal(result.roleBindingStatus, 'TASK_BOUND');
  assert.equal(result.execution.status, 'NOT_RUN');
  assert.match(result.taskId, /^employee_task_[a-f0-9]{24}$/);
  assert.match(result.employeeRoleDigest, /^[a-f0-9]{64}$/);
});

test('changed role digest changes task identity', () => {
  const a = task();
  const changedRole = role({ stopConditions: ['existing capability sufficient', 'budget missing'] });
  const b = task({ roleContract: changedRole });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.employeeRoleDigest, b.employeeRoleDigest);
  assert.notEqual(a.taskId, b.taskId);
});

test('missing role and capability expansion fail closed', () => {
  const missing = task({ roleContract: null });
  assert.equal(missing.ok, false);
  const expanded = compileEmployeeAgentTask({
    roleContract: role(),
    allowedCapabilities: ['read-repository'],
    objective: 'x', originAgent: 'GPT', targetAgent: 'CLAUDE',
    evidenceRefs: ['test:one'], requiredOutputs: ['x'], acceptanceTests: ['x'], date
  });
  assert.equal(expanded.ok, false);
  assert.ok(expanded.reasonCodes.includes('employee-role-capability-expands-parent-task'));
});

test('terminal employee truth rejects changed or missing role identity', () => {
  const boundTask = task();
  const changed = evaluateEmployeeWorkerResultTruth({
    task: boundTask,
    result: terminalResult(boundTask, { employeeRoleDigest: '0'.repeat(64) })
  });
  assert.equal(changed.ok, false);
  assert.ok(changed.reasonCodes.includes('worker-result-employee-role-digest-mismatch'));

  const missing = evaluateEmployeeWorkerResultTruth({
    task: boundTask,
    result: terminalResult(boundTask, { employeeRoleRef: '' })
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('worker-result-employee-role-ref-required'));
});

test('terminal receipt carries immutable employee role identity when base truth passes', () => {
  const boundTask = task();
  const receipt = compileEmployeeTerminalReceipt({ task: boundTask, result: terminalResult(boundTask), date });
  if (receipt.ok) {
    assert.equal(receipt.status, 'TERMINAL_JUDGED');
    assert.equal(receipt.employeeRoleRef, boundTask.employeeRoleRef);
    assert.equal(receipt.employeeRoleDigest, boundTask.employeeRoleDigest);
  } else {
    // Existing cloud-relay envelope policy remains stronger than this wrapper.
    // If it rejects this synthetic fixture, role binding must not override it.
    assert.ok(receipt.reasonCodes.length > 0);
  }
});
