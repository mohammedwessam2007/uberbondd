import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { compileRelayTaskFromIntent, compileAutonomyEmployeeRole } from '../src/agent-autonomy-relay-adapter.mjs';
import { validateRoleBoundExecution } from '../src/ai-employee-role-contract.mjs';

const date = new Date('2026-08-29T04:00:00.000Z');

function session() {
  return compileAutonomySession({
    objective: 'Improve UberBond safely',
    allowedAgents: ['chatgpt', 'claude-code'],
    startAgent: 'chatgpt',
    date
  });
}

function intentFor({ targetAgent, kind }) {
  const s = session();
  const intent = compileTaskIntent({
    session: s,
    originAgent: 'uberbond',
    targetAgent,
    kind,
    objective: `Perform ${kind} without external business effects`,
    contextRefs: ['doc:current-handoff'],
    evidenceRefs: ['evidence:current-main'],
    acceptanceTests: ['role identity is immutable', 'zero external business effects'],
    date
  });
  return { s, intent };
}

test('research TaskIntent compiles into a role-bound evidence-critic employee task', () => {
  const { s, intent } = intentFor({ targetAgent: 'chatgpt', kind: 'RESEARCH_REQUIRED' });
  assert.equal(intent.ok, true);
  const task = compileRelayTaskFromIntent(intent, s, date);
  assert.equal(task.ok, true);
  assert.equal(task.employeeRoleRef, 'uberbond-role:intelligence/evidence-critic@1.0.0');
  assert.match(task.employeeRoleDigest, /^[a-f0-9]{64}$/);
  assert.equal(task.autonomyIntentTaskId, intent.taskId);
  assert.equal(task.autonomyRoleSelection, 'DETERMINISTIC_BY_INTENT_KIND_AND_TARGET');
  assert.equal(validateRoleBoundExecution(task).ok, true);
});

test('engineering and repair TaskIntent compile into capability-gap-analyst employee tasks', () => {
  for (const kind of ['ENGINEERING_REQUIRED', 'REPAIR_REQUIRED']) {
    const { s, intent } = intentFor({ targetAgent: 'claude-code', kind });
    const task = compileRelayTaskFromIntent(intent, s, date);
    assert.equal(task.ok, true, kind);
    assert.equal(task.employeeRoleRef, 'uberbond-role:engineering/capability-gap-analyst@1.0.0');
    assert.equal(validateRoleBoundExecution(task).ok, true);
  }
});

test('review TaskIntent selects QA employee identity', () => {
  const { s, intent } = intentFor({ targetAgent: 'chatgpt', kind: 'REVIEW_REQUIRED' });
  const task = compileRelayTaskFromIntent(intent, s, date);
  assert.equal(task.ok, true);
  assert.equal(task.employeeRoleRef, 'uberbond-role:delivery/qa-evaluator@1.0.0');
  assert.equal(validateRoleBoundExecution(task).ok, true);
});

test('generic scheduled work still receives a deterministic role from target agent', () => {
  const { s, intent } = intentFor({ targetAgent: 'claude-code', kind: 'GENERAL' });
  const role = compileAutonomyEmployeeRole(intent);
  assert.equal(role.ok, true);
  assert.equal(role.roleRef, 'uberbond-role:engineering/capability-gap-analyst@1.0.0');
  const task = compileRelayTaskFromIntent(intent, s, date);
  assert.equal(task.ok, true);
  assert.equal(validateRoleBoundExecution(task).ok, true);
});

test('role identity participates in immutable employee task identity', () => {
  const { s, intent } = intentFor({ targetAgent: 'chatgpt', kind: 'RESEARCH_REQUIRED' });
  const first = compileRelayTaskFromIntent(intent, s, date);
  const second = compileRelayTaskFromIntent(intent, s, date);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.taskId, second.taskId);
  assert.equal(first.employeeRoleDigest, second.employeeRoleDigest);
  assert.notEqual(first.taskId, intent.taskId);
});

test('tampering with the origin-bound role is rejected before worker execution', () => {
  const { s, intent } = intentFor({ targetAgent: 'chatgpt', kind: 'RESEARCH_REQUIRED' });
  const task = compileRelayTaskFromIntent(intent, s, date);
  const tampered = {
    ...task,
    employeeRoleAllowedCapabilities: [...task.employeeRoleAllowedCapabilities, 'deploy-production']
  };
  const eligibility = validateRoleBoundExecution(tampered);
  assert.equal(eligibility.ok, false);
  assert.ok(eligibility.reasonCodes.includes('employee-role-digest-integrity-mismatch'));
});

test('role-bound origin preserves zero-effect autonomy constraints', () => {
  const { s, intent } = intentFor({ targetAgent: 'claude-code', kind: 'ENGINEERING_REQUIRED' });
  const task = compileRelayTaskFromIntent(intent, s, date);
  assert.equal(task.ok, true);
  assert.equal(task.consequenceClass, 'LOCAL_PREPARATION');
  for (const forbidden of ['send', 'spend', 'purchase', 'deploy', 'push', 'merge', 'change-credentials', 'change-dns', 'contact-anyone', 'mutate-production']) {
    assert.ok(task.forbiddenActions.includes(forbidden), forbidden);
  }
  assert.equal(task.budget.maxCostCents, 0);
});
