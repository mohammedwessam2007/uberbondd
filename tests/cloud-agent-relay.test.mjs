import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_RELAY_JOB_TYPE,
  claimCloudRelayTask,
  createCloudRelayTask,
  heartbeatCloudRelayTask,
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
    async findOne(_key, filters = {}) {
      const job = jobs.find(item => Object.entries(filters).every(([key, value]) => item[key] === value));
      return job ? structuredClone(job) : null;
    },
    async claimJobsByType(type, targetAgent, workerId) {
      const job = jobs.find(item => item.type === type && item.status === 'queued' && item.payload.targetAgent === targetAgent);
      if (!job) return [];
      Object.assign(job, { status: 'active', lockedBy: workerId, lockedAt: '2026-08-19T10:00:00.000Z', heartbeatAt: '2026-08-19T10:00:00.000Z', attempts: 1 });
      return [structuredClone(job)];
    },
    async heartbeatJob(id, workerId) {
      const job = jobs.find(item => item.id === id && item.status === 'active' && item.lockedBy === workerId);
      if (!job) return null;
      job.heartbeatAt = '2026-08-19T10:01:00.000Z';
      return structuredClone(job);
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
      const duplicate = jobs.find(item => options.dedupeKey && item.dedupeKey === options.dedupeKey);
      if (duplicate) return structuredClone(duplicate);
      const job = {
        id: `job-${next++}`,
        type,
        queue: options.queue,
        status: 'queued',
        payload: structuredClone(payload),
        attempts: 0,
        maxAttempts: options.maxAttempts,
        dedupeKey: options.dedupeKey || null,
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

test('cloud relay rejects a conflicting immutable packet that reuses a task id', async () => {
  const f = fixture();
  await createCloudRelayTask({ ...f, date: new Date('2026-08-19T10:00:00.000Z'), input: input() });
  const conflict = await createCloudRelayTask({
    ...f,
    date: new Date('2026-08-19T10:00:00.000Z'),
    input: input({ objective: 'A different task must not replace the existing packet' })
  });
  assert.equal(conflict.ok, false);
  assert.ok(conflict.reasonCodes.includes('task-id-conflict'));
  assert.equal(f.jobs.length, 1);
  assert.equal(f.jobs[0].payload.objective, input().objective);
});

test('cloud relay replays the same immutable task idempotently without creating a second job', async () => {
  const f = fixture();
  const first = await createCloudRelayTask({ ...f, date: new Date('2026-08-19T10:00:00.000Z'), input: input() });
  const replay = await createCloudRelayTask({ ...f, date: new Date('2026-08-19T10:05:00.000Z'), input: input() });
  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.relay.jobId, first.relay.jobId);
  assert.equal(f.jobs.length, 1);
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

test('cloud relay heartbeat extends only the exact lease owner', async () => {
  const f = fixture();
  await createCloudRelayTask({ ...f, input: input() });
  const claim = await claimCloudRelayTask({ store: f.store, targetAgent: 'claude-code', workerId: 'claude-code:test' });
  const wrong = await heartbeatCloudRelayTask({ store: f.store, taskId: claim.taskId, workerId: 'claude-code:other' });
  assert.equal(wrong.ok, false);
  assert.ok(wrong.reasonCodes.includes('lease-owner-mismatch'));
  const accepted = await heartbeatCloudRelayTask({ store: f.store, taskId: claim.taskId, workerId: 'claude-code:test' });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.status, 'HEARTBEAT_ACCEPTED');
  assert.equal(accepted.workerId, 'claude-code:test');
});

test('cloud relay lease operations use the task dedupe identity beyond the bounded listing window', async () => {
  const f = fixture();
  await createCloudRelayTask({ ...f, input: input() });
  const claim = await claimCloudRelayTask({ store: f.store, targetAgent: 'claude-code', workerId: 'claude-code:test' });
  for (let index = 0; index < 600; index += 1) {
    f.jobs.unshift({
      id: `noise-${index}`,
      type: AGENT_RELAY_JOB_TYPE,
      status: 'completed',
      dedupeKey: `agent-relay:noise-${index}`,
      payload: { taskId: `noise-${index}`, targetAgent: 'claude-code' }
    });
  }
  const heartbeat = await heartbeatCloudRelayTask({ store: f.store, taskId: claim.taskId, workerId: 'claude-code:test' });
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.taskId, claim.taskId);
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
