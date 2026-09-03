import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DurableQueue, QUEUE_RECONCILIATION_RECEIPT_VERSION } from '../src/queue.mjs';
import { JsonStore } from '../src/store.mjs';

const cfg = {
  version: 'night-runtime-test',
  queue: {
    maxAttempts: 5,
    lockTimeoutMs: 1000,
    retryBaseMs: 10,
    retryMaxMs: 100,
    concurrency: 1,
    jobHeartbeatMs: 1000,
    workerHeartbeatMs: 1000,
    workerStaleMs: 5000,
    pollMs: 10,
    maxRuntimeMs: 5000
  }
};

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-night-runtime-'));
  const store = new JsonStore(dir);
  await store.init();
  const queue = new DurableQueue(store, cfg, { error() {}, info() {}, warn() {} });
  return {
    store,
    queue,
    async close() { await store.close(); await fs.rm(dir, { recursive: true, force: true }); }
  };
}

async function makeClaimStale(store, jobId, workerId = 'dead-worker') {
  const claimed = await store.claimJobs(workerId, 1, 1000);
  assert.equal(claimed[0]?.id, jobId);
  const staleAt = new Date(Date.now() - 10_000).toISOString();
  await store.patch('jobs', jobId, { lockedAt: staleAt, heartbeatAt: staleAt, startedAt: staleAt });
}

function reconciliationReceipt(state) {
  return {
    schemaVersion: QUEUE_RECONCILIATION_RECEIPT_VERSION,
    jobId: state.id,
    deadLetteredAt: state.deadLetteredAt,
    attempts: state.attempts,
    uncertainReasonCode: state.uncertainReasonCode || 'RECOVERY_POLICY_RECONCILE',
    outcome: 'VERIFIED_NO_EXTERNAL_EFFECT',
    sourceClass: 'DETERMINISTIC_NO_EFFECT_RECEIPT',
    evidenceRef: 'audit:hostile-test-safe-to-retry',
    observedAt: new Date().toISOString(),
    reconciledBy: 'hostile-test'
  };
}

test('reconcile jobs persist one-attempt crash fuse and stale Store recovery dead-letters instead of replaying', async () => {
  const fx = await fixture();
  try {
    const job = await fx.queue.enqueue('external.side.effect', { value: 1 }, { recoveryPolicy: 'reconcile', maxAttempts: 9 });
    assert.equal(job.maxAttempts, 1);
    await makeClaimStale(fx.store, job.id);

    const recovery = await fx.store.recoverStaleJobs(1000);
    assert.equal(recovery.recovered, 0);
    assert.equal(recovery.deadLettered, 1);

    const persisted = await fx.store.get('jobs', job.id);
    assert.equal(persisted.status, 'dead-letter');
    assert.equal(persisted.recoveryPolicy, 'reconcile');
  } finally {
    await fx.close();
  }
});

test('reconcile dead letter cannot be replayed without a job-bound no-effect reconciliation receipt', async () => {
  const fx = await fixture();
  try {
    const job = await fx.queue.enqueue('external.side.effect', {}, { recoveryPolicy: 'reconcile', maxAttempts: 4 });
    await makeClaimStale(fx.store, job.id);
    await fx.store.recoverStaleJobs(1000);

    await assert.rejects(
      fx.queue.requeueDeadLetter(job.id),
      error => error?.code === 'JOB_RECONCILIATION_REQUIRED'
    );

    const deadLetter = await fx.store.get('jobs', job.id);
    const requeued = await fx.queue.requeueDeadLetter(job.id, {
      reconciliationReceipt: reconciliationReceipt(deadLetter)
    });
    assert.equal(requeued.status, 'queued');
    assert.equal(requeued.attempts, 0);

    const persisted = await fx.store.get('jobs', job.id);
    assert.equal(persisted.reconciliationRequired, false);
    assert.equal(persisted.reconciliationReceipt.outcome, 'VERIFIED_NO_EXTERNAL_EFFECT');
    assert.equal(persisted.reconciliationReceipt.jobId, job.id);
  } finally {
    await fx.close();
  }
});

test('replay-safe jobs preserve configured retry budget and remain auto-recoverable', async () => {
  const fx = await fixture();
  try {
    const job = await fx.queue.enqueue('pure.compute', {}, { recoveryPolicy: 'replay-safe', maxAttempts: 3 });
    assert.equal(job.maxAttempts, 3);
    await makeClaimStale(fx.store, job.id);

    const recovery = await fx.store.recoverStaleJobs(1000);
    assert.equal(recovery.recovered, 1);
    assert.equal(recovery.deadLettered, 0);
    assert.equal((await fx.store.get('jobs', job.id)).status, 'queued');
  } finally {
    await fx.close();
  }
});
