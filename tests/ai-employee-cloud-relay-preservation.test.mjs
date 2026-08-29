import test from 'node:test';
import assert from 'node:assert/strict';

import { compileEmployeeRoleContract, validateRoleBoundExecution } from '../src/ai-employee-role-contract.mjs';
import { compileEmployeeAgentTask } from '../src/ai-employee-relay.mjs';
import { createCloudRelayTask, claimCloudRelayTask } from '../src/cloud-agent-relay.mjs';

function fixture() {
  const jobs = [];
  const store = {
    async log() { return { id: 'audit-1' }; },
    async list() { return jobs.map(item => structuredClone(item)); },
    async findOne(_key, filters = {}) {
      const job = jobs.find(item => Object.entries(filters).every(([key, value]) => item[key] === value));
      return job ? structuredClone(job) : null;
    },
    async claimJobsByType(type, targetAgent, workerId) {
      const job = jobs.find(item => item.type === type && item.status === 'queued' && item.payload.targetAgent === targetAgent);
      if (!job) return [];
      Object.assign(job, { status: 'active', lockedBy: workerId, lockedAt: '2026-08-29T04:10:00.000Z', heartbeatAt: '2026-08-29T04:10:00.000Z', attempts: 1 });
      return [structuredClone(job)];
    }
  };
  const queue = {
    async enqueue(type, payload, options) {
      const duplicate = jobs.find(item => item.dedupeKey === options.dedupeKey);
      if (duplicate) return structuredClone(duplicate);
      const job = {
        id: `job-${jobs.length + 1}`,
        type,
        queue: options.queue,
        status: 'queued',
        payload: structuredClone(payload),
        attempts: 0,
        maxAttempts: options.maxAttempts,
        dedupeKey: options.dedupeKey,
        runAt: '2026-08-29T04:10:00.000Z',
        createdAt: '2026-08-29T04:10:00.000Z'
      };
      jobs.push(job);
      return structuredClone(job);
    }
  };
  return { jobs, store, queue };
}

function employeeTask() {
  const role = compileEmployeeRoleContract({
    roleId: 'capability-gap-analyst',
    version: '1.0.0',
    department: 'engineering',
    allowedCapabilities: ['repository-read', 'code-preparation'],
    authorityCeiling: 'local preparation only',
    consequenceClassCeiling: 'LOCAL_PREPARATION',
    evidencePrerequisites: ['task-context'],
    economicMetric: 'verified bounded task completion per founder minute',
    stopConditions: ['task-complete', 'authority-boundary-reached'],
    escalationTarget: 'chatgpt-integrator',
    outputSchema: 'outcome, testsActuallyRun, truthTable, externalEffectLedger, decision'
  });
  assert.equal(role.ok, true);
  const task = compileEmployeeAgentTask({
    roleContract: role,
    allowedCapabilities: ['repository-read', 'code-preparation'],
    objective: 'Prepare a bounded code repair',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    contextRefs: ['doc:current-handoff'],
    evidenceRefs: ['evidence:current-main'],
    requiredOutputs: ['outcome', 'testsActuallyRun'],
    acceptanceTests: ['role identity survives transport'],
    budget: { maxTokens: 1000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION',
    date: new Date('2026-08-29T04:10:00.000Z')
  });
  assert.equal(task.ok, true);
  return task;
}

test('canonical cloud relay recompilation preserves immutable AI employee role fields', async () => {
  const f = fixture();
  const task = employeeTask();
  const queued = await createCloudRelayTask({ ...f, input: task, date: new Date('2026-08-29T04:10:00.000Z') });
  assert.equal(queued.ok, true);
  assert.equal(queued.taskId, task.taskId);
  assert.equal(queued.employeeRoleRef, task.employeeRoleRef);
  assert.equal(queued.employeeRoleDigest, task.employeeRoleDigest);
  assert.deepEqual(queued.employeeRoleAllowedCapabilities, task.employeeRoleAllowedCapabilities);
  assert.equal(validateRoleBoundExecution(queued).ok, true);
});

test('claimed cloud task remains role-bound and worker-gate eligible', async () => {
  const f = fixture();
  const task = employeeTask();
  await createCloudRelayTask({ ...f, input: task, date: new Date('2026-08-29T04:10:00.000Z') });
  const claim = await claimCloudRelayTask({
    store: f.store,
    targetAgent: 'claude-code',
    workerId: 'claude-code:test'
  });
  assert.equal(claim.ok, true);
  assert.equal(claim.task.employeeRoleRef, task.employeeRoleRef);
  assert.equal(claim.task.employeeRoleDigest, task.employeeRoleDigest);
  assert.equal(validateRoleBoundExecution(claim.task).ok, true);
});

test('generic relay task behavior remains role-free and backward compatible', async () => {
  const f = fixture();
  const queued = await createCloudRelayTask({
    ...f,
    input: {
      taskId: 'generic-task-1',
      objective: 'Prepare generic local work',
      originAgent: 'chatgpt',
      targetAgent: 'claude-code',
      evidenceRefs: ['task:generic'],
      requiredOutputs: ['outcome'],
      acceptanceTests: ['bounded'],
      consequenceClass: 'LOCAL_PREPARATION'
    }
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.taskId, 'generic-task-1');
  assert.equal('employeeRoleRef' in queued, false);
});
