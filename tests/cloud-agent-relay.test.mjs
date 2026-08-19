import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_RELAY_JOB_TYPE,
  claimCloudRelayTask,
  createCloudRelayTask,
  listCloudRelayTasks,
  submitCloudRelayResult
} from '../src/cloud-agent-relay.mjs';

function fixture() {
  const jobs = [];
  const logs = [];
  let next = 1;
  const store = {
    logs,
    async log(type, detail) {
      logs.push({ type, detail });
      return { id: `audit-${logs.length}` };
    },
    async list(_key, options = {}) {
      const rows = jobs.filter(job => !options.filters?.type || job.type === options.filters.type);
      return rows.slice(0, options.limit || rows.length).map(job => structuredClone(job));
    },
    async claimJobsByType(type, targetAgent, workerId) {
      const job = jobs.find(item => item.type === type && item.status === 'queued' && item.payload.targetAgent === targetAgent);
      if (!job) return [];
      Object.assign(job, { status: 'active', lockedBy: workerId, lockedAt: '2026-08-19T10:00:00.000Z', heartbeatAt: '2026-08-19T10:00:00.000Z', attempts: 1 });
      return [structuredClone(job)];
    },
    async completeJobIfOwned(id, workerId, result) {
      const job = jobs.find(item => item.id === id && item.status === 'active' && item.lockedBy === workerId);
      if (!job) return null;
      Object.assign(job, { status: 'completed', result, lockedBy: null });
      return structuredClone(job);
    },
    async failJobIfOwned(id, workerId) {
      const job = jobs.find(item => item.id === id && item.status === 'active' && item.lockedBy === workerId);
      if (!job) return null;
      Object.assign(job, { status: 'dead-letter', lockedBy: null });
      return structuredClone(job);
    }
  };
  const queue = {
    async enqueue(type, payload, options) {
      const job = {
        id: `job-${next++}`,
        type,
        queue: options.queue,
        status: 'queued',
        payload: structuredClone(payload),
        attempts: 0,
        maxAttempts: options.maxAttempts,
        runAt: '2026-08-19T10:00:00.000Z',
        createdAt: '2026-08-19T10:00:00.000Z'
      };
      jobs.push(job);
      return structuredClone(job);
    }
  };
  return { store, queue, jobs, logs };
}

function input(overrides = {}) {
  return {
    taskId: 'task-chatgpt-1',
    objective: 'Implement the bounded relay consumer contract',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    requiredOutputs: ['outcome', 'testsActuallyRun'],
    acceptanceTests: ['deterministic relay test passes'],
    evidenceRefs: ['task:chatgpt-brief'],
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function result(overrides = {}) {
  return {
    outcome: 'Implemented the local relay consumer contract.',
    changedArtifacts: ['src/cloud-agent-relay.mjs'],
    testsActuallyRun: [{ command: 'node --test tests/cloud-agent-relay.test.mjs', result: 'PASS' }],
    truthTable: { relay: 'PASS_LOCAL', liveProvider: 'NOT_RUN' },
    externalEffectLedger: {
      providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
      credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
    },
    decision: 'PROCEED',
    ...overrides
  };
}

test('cloud relay queues a compiled task without claiming execution', async () => {
  const f = fixture();
  const created = await createCloudRelayTask({ ...f, date: new Date('2026-08-19T10:00:00.000Z'), input: input() });
  assert.equal(created.ok, true);
  assert.equal(created.status, 'QUEUED');
  assert.equal(created.execution.status, 'QUEUED');
  assert.equal(created.externalEffectLedger.providerCalls, 0);
  assert.equal(f.jobs[0].type, AGENT_RELAY_JOB_TYPE);
  assert.equal(f.logs[0].type, 'cloud_agent_relay_task_created');
});

test('cloud relay rejects invalid or secret-bearing packets', async () => {
  const f = fixture();
  const invalid = await createCloudRelayTask({ ...f, input: input({ objective: '' }) });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.reasonCodes.includes('objective-required'));
  const secret = await createCloudRelayTask({ ...f, input: input({ metadata: { apiKey: 'not-stored' } }) });
  assert.equal(secret.ok, false);
  assert.ok(secret.reasonCodes.includes('secret-or-oversized-task-rejected'));
});

test('cloud relay claims one task for the designated worker and filters status', async () => {
  const f = fixture();
  await createCloudRelayTask({ ...f, input: input() });
  const listed = await listCloudRelayTasks({ store: f.store, targetAgent: 'claude-code', status: 'queued' });
  assert.equal(listed.count, 1);
  const claim = await claimCloudRelayTask({ store: f.store, targetAgent: 'claude-code', workerId: 'claude-code:test' });
  assert.equal(claim.ok, true);
  assert.equal(claim.status, 'CLAIMED');
  assert.equal(claim.task.taskId, 'task-chatgpt-1');
  assert.equal(f.jobs[0].lockedBy, 'claude-code:test');
});

test('cloud relay enforces lease ownership and accepts a bounded result receipt', async () => {
  const f = fixture();
  await createCloudRelayTask({ ...f, input: input() });
  const claim = await claimCloudRelayTask({ store: f.store, targetAgent: 'claude-code', workerId: 'claude-code:test' });
  const wrong = await submitCloudRelayResult({ store: f.store, taskId: claim.taskId, workerId: 'claude-code:other', result: result() });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.reasonCodes.includes('lease-owner-mismatch'));
  const submitted = await submitCloudRelayResult({
    store: f.store,
    taskId: claim.taskId,
    workerId: 'claude-code:test',
    status: 'COMPLETED',
    result: result(),
    receipt: { tests: ['relay-contract'] }
  });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.status, 'RECEIVED');
  assert.equal(f.jobs[0].status, 'completed');
  assert.equal(f.logs.at(-1).type, 'cloud_agent_relay_result_received');
});

test('cloud relay rejects nonzero effects and cannot submit twice', async () => {
  const f = fixture();
  await createCloudRelayTask({ ...f, input: input() });
  const claim = await claimCloudRelayTask({ store: f.store, targetAgent: 'claude-code', workerId: 'claude-code:test' });
  const unsafe = await submitCloudRelayResult({
    store: f.store,
    taskId: claim.taskId,
    workerId: 'claude-code:test',
    result: result({ externalEffectLedger: { providerCalls: 1 } })
  });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.reasonCodes.includes('nonzero-external-effect-ledger-rejected'));
  const failed = await submitCloudRelayResult({
    store: f.store,
    taskId: claim.taskId,
    workerId: 'claude-code:test',
    status: 'FAILED',
    result: result()
  });
  assert.equal(failed.ok, true);
  const replay = await submitCloudRelayResult({
    store: f.store,
    taskId: claim.taskId,
    workerId: 'claude-code:test',
    result: result()
  });
  assert.equal(replay.ok, false);
  assert.ok(replay.reasonCodes.includes('lease-owner-mismatch'));
});
