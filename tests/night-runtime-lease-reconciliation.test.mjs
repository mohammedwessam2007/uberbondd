import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { DurableQueue, QUEUE_RECONCILIATION_RECEIPT_VERSION } from '../src/queue.mjs';

async function setup(overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-night-runtime-'));
  const store = new Store(dir);
  await store.init();
  const cfg = {
    version: 'night-runtime-test',
    queue: {
      concurrency: 1,
      maxAttempts: 3,
      retryBaseMs: 1000,
      retryMaxMs: 10000,
      lockTimeoutMs: 3000,
      jobHeartbeatMs: 1000,
      workerHeartbeatMs: 1000,
      workerStaleMs: 5000,
      maxRuntimeMs: 5000,
      pollMs: 10,
      ...overrides
    }
  };
  return { store, queue: new DurableQueue(store, cfg, { error() {} }) };
}

function reconciliationReceipt(state, evidenceRef = 'audit:hostile-test-fixture') {
  return {
    schemaVersion: QUEUE_RECONCILIATION_RECEIPT_VERSION,
    jobId: state.id,
    deadLetteredAt: state.deadLetteredAt,
    attempts: state.attempts,
    uncertainReasonCode: state.uncertainReasonCode || 'RECOVERY_POLICY_RECONCILE',
    outcome: 'VERIFIED_NO_EXTERNAL_EFFECT',
    sourceClass: 'DETERMINISTIC_NO_EFFECT_RECEIPT',
    evidenceRef,
    observedAt: new Date().toISOString(),
    reconciledBy: 'hostile-test'
  };
}

test('heartbeat ownership loss aborts a still-running cooperative handler before stale completion', async () => {
  const { store, queue } = await setup();
  const job = await queue.enqueue('test.lease-loss-abort', {});
  let handlerStarted;
  const started = new Promise(resolve => { handlerStarted = resolve; });
  let observedAbortReason = null;

  const running = queue.runOnce({
    'test.lease-loss-abort': async (_payload, _job, context) => {
      handlerStarted();
      await new Promise(resolve => {
        context.signal.addEventListener('abort', () => {
          observedAbortReason = context.signal.reason;
          resolve();
        }, { once: true });
      });
      throw observedAbortReason;
    }
  });

  await started;
  await store.patch('jobs', job.id, {
    status: 'active',
    lockedBy: 'replacement-worker',
    lockedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString()
  });
  await running;

  assert.equal(observedAbortReason?.code, 'JOB_LEASE_LOST');
  const state = await store.get('jobs', job.id);
  assert.equal(state.status, 'active');
  assert.equal(state.lockedBy, 'replacement-worker');
  const events = await store.list('auditLog');
  assert.equal(events.some(event => event.type === 'queue_job_lease_lost_during_execution' && event.detail?.jobId === job.id), true);
  assert.equal(events.some(event => event.type === 'queue_job_lease_lost_before_failure' && event.detail?.jobId === job.id), true);
});

test('uncertain timeout dead letter cannot be manually replayed without a reconciliation receipt', async () => {
  const { store, queue } = await setup({ maxRuntimeMs: 1000 });
  const job = await queue.enqueue('test.uncertain-requeue', {}, { maxAttempts: 5 });

  await queue.runOnce({
    'test.uncertain-requeue': async (_payload, _job, context) => {
      await new Promise(resolve => context.signal.addEventListener('abort', resolve, { once: true }));
      throw context.signal.reason;
    }
  });

  let state = await store.get('jobs', job.id);
  assert.equal(state.status, 'dead-letter');
  assert.equal(state.uncertainExecution, true);
  assert.equal(state.uncertainReasonCode, 'JOB_RUNTIME_TIMEOUT_UNCERTAIN');
  assert.equal(state.reconciliationRequired, true);

  await assert.rejects(
    () => queue.requeueDeadLetter(job.id),
    error => error?.code === 'JOB_RECONCILIATION_REQUIRED'
  );
  assert.equal((await store.get('jobs', job.id)).status, 'dead-letter');

  const receipt = reconciliationReceipt(state);
  const requeued = await queue.requeueDeadLetter(job.id, { reconciliationReceipt: receipt });
  assert.equal(requeued.status, 'queued');
  assert.equal(requeued.attempts, 0);
  state = await store.get('jobs', job.id);
  assert.equal(state.reconciliationRequired, false);
  assert.equal(state.reconciliationReceipt.jobId, job.id);
  assert.equal(state.reconciliationReceipt.outcome, 'VERIFIED_NO_EXTERNAL_EFFECT');
  assert.ok(state.reconciledAt);
  const events = await store.list('auditLog');
  assert.equal(events.some(event => event.type === 'queue_job_uncertain_execution_reconciled' && event.detail?.jobId === job.id), true);
});

test('stale non-idempotent job is quarantined instead of being automatically replayed after a crash', async () => {
  const { store, queue } = await setup({ lockTimeoutMs: 1000 });
  const job = await queue.enqueue('test.external-effect', { action: 'charge-or-send' }, {
    maxAttempts: 5,
    recoveryPolicy: 'reconcile'
  });
  const [claimed] = await store.claimJobs('crashed-worker', 1, 1000);
  assert.equal(claimed.id, job.id);
  const stale = new Date(Date.now() - 10000).toISOString();
  await store.patch('jobs', job.id, {
    status: 'active', lockedBy: 'crashed-worker', lockedAt: stale, heartbeatAt: stale
  });

  const result = await queue.quarantineUncertainStaleJobs(1000);
  assert.equal(result.quarantined, 1);
  const state = await store.get('jobs', job.id);
  assert.equal(state.status, 'dead-letter');
  assert.equal(state.uncertainExecution, true);
  assert.equal(state.uncertainReasonCode, 'JOB_STALE_NON_IDEMPOTENT_UNCERTAIN');
  assert.equal(state.reconciliationRequired, true);
  assert.equal(state.lockedBy, null);

  const recovery = await store.recoverStaleJobs(1000);
  assert.equal(recovery.recovered, 0);
  const replacementClaim = await store.claimJobs('replacement-worker', 1, 1000);
  assert.equal(replacementClaim.length, 0);
  await assert.rejects(
    () => queue.requeueDeadLetter(job.id),
    error => error?.code === 'JOB_RECONCILIATION_REQUIRED'
  );
  const events = await store.list('auditLog');
  assert.equal(events.some(event => event.type === 'queue_job_stale_execution_quarantined' && event.detail?.jobId === job.id), true);
});

test('explicit replay-safe stale job still recovers automatically', async () => {
  const { store, queue } = await setup({ lockTimeoutMs: 1000 });
  const job = await queue.enqueue('test.replay-safe', {}, {
    maxAttempts: 5,
    recoveryPolicy: 'replay-safe'
  });
  await store.claimJobs('crashed-worker', 1, 1000);
  const stale = new Date(Date.now() - 10000).toISOString();
  await store.patch('jobs', job.id, {
    status: 'active', lockedBy: 'crashed-worker', lockedAt: stale, heartbeatAt: stale
  });

  const quarantine = await queue.quarantineUncertainStaleJobs(1000);
  assert.equal(quarantine.quarantined, 0);
  const recovery = await store.recoverStaleJobs(1000);
  assert.equal(recovery.recovered, 1);
  const state = await store.get('jobs', job.id);
  assert.equal(state.status, 'queued');
  assert.equal(state.recoveryPolicy, 'replay-safe');
});
