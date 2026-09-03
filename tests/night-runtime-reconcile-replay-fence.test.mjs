import test from 'node:test';
import assert from 'node:assert/strict';
import { DurableQueue } from '../src/queue.mjs';

function cfg() {
  return {
    version: 'test',
    queue: {
      maxAttempts: 5,
      lockTimeoutMs: 1000,
      retryBaseMs: 10,
      retryMaxMs: 100,
      jobHeartbeatMs: 1000,
      maxRuntimeMs: 5000,
      concurrency: 1,
      pollMs: 10,
      workerHeartbeatMs: 1000,
      workerStaleMs: 5000
    }
  };
}

test('reconcile job is fenced before handler on any second execution attempt', async () => {
  const records = new Map();
  const audit = [];
  const store = {
    async failJobIfOwned(id, workerId, error) {
      const job = records.get(id);
      if (!job || job.status !== 'active' || job.lockedBy !== workerId) return null;
      Object.assign(job, {
        status: 'dead-letter',
        lastError: error.message,
        deadLetteredAt: new Date().toISOString(),
        lockedBy: null,
        lockedAt: null,
        heartbeatAt: null
      });
      return structuredClone(job);
    },
    async patch(collection, id, patch) {
      assert.equal(collection, 'jobs');
      const job = records.get(id);
      Object.assign(job, structuredClone(patch));
      return structuredClone(job);
    },
    async log(type, detail) {
      audit.push({ type, detail: structuredClone(detail) });
    }
  };

  const queue = new DurableQueue(store, cfg(), { error() {} });
  const job = {
    id: 'job_reconcile_second_claim',
    type: 'money-adjacent-non-idempotent',
    queue: 'money-adjacent-non-idempotent',
    status: 'active',
    attempts: 2,
    maxAttempts: 5,
    recoveryPolicy: 'reconcile',
    lockedBy: queue.workerId,
    lockedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    payload: { externalEffectPossible: true }
  };
  records.set(job.id, structuredClone(job));

  let handlerCalls = 0;
  await queue.runJob(structuredClone(job), {
    [job.type]: async () => {
      handlerCalls += 1;
      return { shouldNeverHappen: true };
    }
  });

  assert.equal(handlerCalls, 0, 'second reconcile attempt must never reach the handler');
  const persisted = records.get(job.id);
  assert.equal(persisted.status, 'dead-letter');
  assert.equal(persisted.reconciliationRequired, true);
  assert.equal(persisted.uncertainExecution, true);
  assert.equal(persisted.uncertainReasonCode, 'JOB_RECONCILE_REPLAY_BLOCKED');
  assert.equal(persisted.reconciliationReceipt, null);
  assert.ok(audit.some(entry => entry.type === 'queue_job_reconcile_replay_blocked'));
});
