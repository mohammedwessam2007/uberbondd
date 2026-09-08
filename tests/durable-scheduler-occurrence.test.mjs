import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileScheduledOccurrence } from '../src/durable-scheduler-occurrence.mjs';

function fixture() {
  const settings = {};
  const jobsByDedupe = new Map();
  const store = {
    async getSettings() { return structuredClone(settings); },
    async setSetting(key, value) { settings[key] = structuredClone(value); return value; }
  };
  const queue = {
    store,
    async enqueue(type, payload, options) {
      const key = options.dedupeKey;
      if (jobsByDedupe.has(key)) return jobsByDedupe.get(key);
      const job = { id: `job_${jobsByDedupe.size + 1}`, type, payload: structuredClone(payload), ...structuredClone(options) };
      jobsByDedupe.set(key, job);
      return job;
    }
  };
  return { settings, jobsByDedupe, store, queue };
}

test('initial pulse persists one durable current occurrence and same bucket is idempotent', async () => {
  const fx = fixture();
  const first = await reconcileScheduledOccurrence({ queue: fx.queue, type: 'monitoring.process', intervalMs: 1000, nowMs: 10_250 });
  assert.equal(first.status, 'INITIAL_OCCURRENCE_RECONCILED');
  assert.deepEqual(first.enqueuedBuckets, [10]);
  assert.equal(fx.jobsByDedupe.size, 1);

  const second = await reconcileScheduledOccurrence({ queue: fx.queue, type: 'monitoring.process', intervalMs: 1000, nowMs: 10_900 });
  assert.equal(second.status, 'CURRENT_OCCURRENCE_ALREADY_RECONCILED');
  assert.deepEqual(second.enqueuedBuckets, []);
  assert.equal(fx.jobsByDedupe.size, 1);
});

test('restart catches a pending later occurrence from durable cursor', async () => {
  const fx = fixture();
  await reconcileScheduledOccurrence({ queue: fx.queue, type: 'replies.poll', intervalMs: 1000, nowMs: 5_100 });
  const restartedQueue = { ...fx.queue, store: fx.store };
  const recovered = await reconcileScheduledOccurrence({ queue: restartedQueue, type: 'replies.poll', intervalMs: 1000, nowMs: 6_100 });
  assert.equal(recovered.status, 'MISSED_OCCURRENCE_RECONCILED');
  assert.deepEqual(recovered.enqueuedBuckets, [6]);
  assert.equal(fx.jobsByDedupe.size, 2);
});

test('crash after durable queue write but before cursor advance heals by dedupe on restart', async () => {
  const fx = fixture();
  let failCursorOnce = true;
  const flakyStore = {
    ...fx.store,
    async setSetting(key, value) {
      if (failCursorOnce) {
        failCursorOnce = false;
        throw new Error('simulated-cursor-write-crash');
      }
      return fx.store.setSetting(key, value);
    }
  };
  const flakyQueue = { ...fx.queue, store: flakyStore };

  await assert.rejects(
    reconcileScheduledOccurrence({ queue: flakyQueue, store: flakyStore, type: 'followups.process', intervalMs: 1000, nowMs: 8_100 }),
    /simulated-cursor-write-crash/
  );
  assert.equal(fx.jobsByDedupe.size, 1, 'queue write happened before the simulated crash');

  const healed = await reconcileScheduledOccurrence({ queue: fx.queue, store: fx.store, type: 'followups.process', intervalMs: 1000, nowMs: 8_100 });
  assert.deepEqual(healed.enqueuedBuckets, [8]);
  assert.equal(fx.jobsByDedupe.size, 1, 'same deterministic dedupe key returns the original logical job');
});

test('concurrent wakes still create one logical occurrence', async () => {
  const fx = fixture();
  await Promise.all([
    reconcileScheduledOccurrence({ queue: fx.queue, type: 'outbound.process', intervalMs: 1000, nowMs: 12_100 }),
    reconcileScheduledOccurrence({ queue: fx.queue, type: 'outbound.process', intervalMs: 1000, nowMs: 12_100 })
  ]);
  assert.equal(fx.jobsByDedupe.size, 1);
  assert.ok(fx.jobsByDedupe.has('outbound.process:12'));
});

test('long downtime has bounded catchup rather than an unbounded replay storm', async () => {
  const fx = fixture();
  await reconcileScheduledOccurrence({ queue: fx.queue, type: 'artifacts.cleanup', intervalMs: 1000, nowMs: 1_100 });
  const result = await reconcileScheduledOccurrence({
    queue: fx.queue,
    type: 'artifacts.cleanup',
    intervalMs: 1000,
    nowMs: 10_100,
    maxCatchUpBuckets: 2
  });
  assert.deepEqual(result.enqueuedBuckets, [9, 10]);
  assert.equal(result.skippedHistoricalBuckets, 7);
  assert.equal(fx.jobsByDedupe.size, 3);
});

test('invalid queue/store/time contracts fail closed', async () => {
  const fx = fixture();
  await assert.rejects(reconcileScheduledOccurrence({ type: 'x', intervalMs: 1000 }), /queue-required/);
  await assert.rejects(reconcileScheduledOccurrence({ queue: { enqueue: async () => ({}) }, type: 'x', intervalMs: 1000 }), /store-required/);
  await assert.rejects(reconcileScheduledOccurrence({ queue: fx.queue, type: '', intervalMs: 1000 }), /type-required/);
  await assert.rejects(reconcileScheduledOccurrence({ queue: fx.queue, type: 'x', intervalMs: 0 }), /positive-interval-required/);
  await assert.rejects(reconcileScheduledOccurrence({ queue: fx.queue, type: 'x', intervalMs: 1000, nowMs: Number.NaN }), /valid-clock-required/);
});
