import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_RELAY_JOB_TYPE,
  claimCloudRelayTask,
  createCloudRelayTask,
  submitCloudRelayResult
} from '../src/cloud-agent-relay.mjs';

function fixture() {
  const jobs = [];
  const logs = [];
  let next = 1;
  const store = {
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
      Object.assign(job, {
        status: 'active',
        lockedBy: workerId,
        lockedAt: '2026-08-21T01:00:00.000Z',
        heartbeatAt: '2026-08-21T01:00:00.000Z',
        attempts: 1
      });
      return [structuredClone(job)];
    },
    async completeJobIfOwned(id, workerId, result) {
      const job = jobs.find(item => item.id === id && item.status === 'active' && item.lockedBy === workerId);
      if (!job) return null;
      Object.assign(job, { status: 'completed', result: structuredClone(result), lockedBy: null });
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
        dedupeKey: options.dedupeKey,
        createdAt: '2026-08-21T01:00:00.000Z'
      };
      jobs.push(job);
      return structuredClone(job);
    }
  };
  return { store, queue, jobs, logs };
}

function taskInput() {
  return {
    taskId: 'task-terminal-replay-1',
    objective: 'Prove terminal relay result replay is safe.',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    requiredOutputs: ['result'],
    acceptanceTests: ['relay replay regression passes'],
    evidenceRefs: ['test:terminal-replay'],
    consequenceClass: 'LOCAL_PREPARATION'
  };
}

function canonicalResult(overrides = {}) {
  return {
    outcome: 'Bounded work completed.',
    changedArtifacts: ['src/example.mjs'],
    testsActuallyRun: [{ command: 'node --test', status: 'PASS' }],
    truthTable: [{ claim: 'bounded work', status: 'VERIFIED', evidenceRefs: ['test:terminal-replay'] }],
    externalEffectLedger: {
      providerCalls: 0,
      messages: 0,
      purchases: 0,
      deployments: 0,
      credentialChanges: 0,
      dnsChanges: 0,
      productionMutations: 0,
      spendCents: 0
    },
    decision: 'PROCEED',
    ...overrides
  };
}

async function completedFixture() {
  const f = fixture();
  await createCloudRelayTask({ queue: f.queue, store: f.store, input: taskInput(), date: new Date('2026-08-21T01:00:00Z') });
  const claim = await claimCloudRelayTask({
    store: f.store,
    targetAgent: 'claude-code',
    workerId: 'claude-code:worker-1'
  });
  const result = canonicalResult();
  const receipt = {
    executionId: 'exec-terminal-replay-1',
    taskId: claim.taskId,
    status: 'MODEL_RESULT_READY'
  };
  const first = await submitCloudRelayResult({
    store: f.store,
    taskId: claim.taskId,
    workerId: claim.workerId,
    status: 'COMPLETED',
    result,
    receipt,
    date: new Date('2026-08-21T01:01:00Z')
  });
  assert.equal(first.ok, true);
  assert.equal(first.status, 'RECEIVED');
  return { ...f, claim, result, receipt };
}

test('exact completed result replay is idempotently acknowledged after lease has been cleared', async () => {
  const f = await completedFixture();
  const logCount = f.logs.length;
  const replay = await submitCloudRelayResult({
    store: f.store,
    taskId: f.claim.taskId,
    workerId: f.claim.workerId,
    status: 'COMPLETED',
    result: structuredClone(f.result),
    receipt: structuredClone(f.receipt),
    date: new Date('2026-08-21T01:05:00Z')
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.status, 'ALREADY_RECEIVED');
  assert.equal(replay.jobStatus, 'completed');
  assert.equal(f.jobs[0].status, 'completed');
  assert.equal(f.logs.length, logCount, 'idempotent replay must not create a second terminal receipt log');
});

test('completed job rejects a conflicting result instead of rewriting terminal history', async () => {
  const f = await completedFixture();
  const replay = await submitCloudRelayResult({
    store: f.store,
    taskId: f.claim.taskId,
    workerId: f.claim.workerId,
    status: 'COMPLETED',
    result: canonicalResult({ outcome: 'Conflicting replacement result.' }),
    receipt: f.receipt
  });
  assert.equal(replay.ok, false);
  assert.ok(replay.reasonCodes.includes('terminal-result-conflict'));
  assert.equal(f.jobs[0].result.outcome, 'Bounded work completed.');
});

test('completed job rejects a different worker or receipt even when result body matches', async () => {
  const f = await completedFixture();
  const wrongWorker = await submitCloudRelayResult({
    store: f.store,
    taskId: f.claim.taskId,
    workerId: 'claude-code:worker-2',
    status: 'COMPLETED',
    result: f.result,
    receipt: f.receipt
  });
  assert.equal(wrongWorker.ok, false);
  assert.ok(wrongWorker.reasonCodes.includes('terminal-result-conflict'));

  const wrongReceipt = await submitCloudRelayResult({
    store: f.store,
    taskId: f.claim.taskId,
    workerId: f.claim.workerId,
    status: 'COMPLETED',
    result: f.result,
    receipt: { ...f.receipt, executionId: 'exec-conflicting' }
  });
  assert.equal(wrongReceipt.ok, false);
  assert.ok(wrongReceipt.reasonCodes.includes('terminal-result-conflict'));
});

test('a failed terminal job is not reinterpreted as a successful idempotent completion', async () => {
  const f = fixture();
  await createCloudRelayTask({ queue: f.queue, store: f.store, input: taskInput() });
  const claim = await claimCloudRelayTask({
    store: f.store,
    targetAgent: 'claude-code',
    workerId: 'claude-code:worker-1'
  });
  const failed = await submitCloudRelayResult({
    store: f.store,
    taskId: claim.taskId,
    workerId: claim.workerId,
    status: 'FAILED',
    result: canonicalResult()
  });
  assert.equal(failed.ok, true);
  assert.equal(f.jobs[0].status, 'dead-letter');

  const replay = await submitCloudRelayResult({
    store: f.store,
    taskId: claim.taskId,
    workerId: claim.workerId,
    status: 'COMPLETED',
    result: canonicalResult()
  });
  assert.equal(replay.ok, false);
  assert.ok(replay.reasonCodes.includes('lease-owner-mismatch'));
  assert.equal(f.jobs[0].status, 'dead-letter');
});
