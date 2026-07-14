import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { DurableQueue } from '../src/queue.mjs';

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-queue-'));
  const store = new Store(dir);
  await store.init();
  const cfg = { version: 'test', queue: { concurrency: 2, maxAttempts: 3, retryBaseMs: 1000, retryMaxMs: 10000, lockTimeoutMs: 1000, jobHeartbeatMs: 1000, workerHeartbeatMs: 1000, workerStaleMs: 5000, maxRuntimeMs: 5000, pollMs: 10 } };
  return { store, queue: new DurableQueue(store, cfg, { error() {} }) };
}

test('durable queue deduplicates, claims, and completes jobs', async () => {
  const { store, queue } = await setup();
  const first = await queue.enqueue('test.work', { value: 7 }, { dedupeKey: 'same' });
  const duplicate = await queue.enqueue('test.work', { value: 9 }, { dedupeKey: 'same' });
  assert.equal(first.id, duplicate.id);
  let handled = 0;
  const result = await queue.runOnce({ 'test.work': async payload => { handled += 1; return { doubled: payload.value * 2 }; } });
  assert.equal(result.claimed, 1);
  assert.equal(handled, 1);
  const completed = await store.get('jobs', first.id);
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.result, { doubled: 14 });
});

test('durable queue retries failures then dead-letters at the attempt ceiling', async () => {
  const { store, queue } = await setup();
  const job = await queue.enqueue('test.fail', {}, { maxAttempts: 2 });
  await queue.runOnce({ 'test.fail': async () => { throw new Error('boom'); } });
  let state = await store.get('jobs', job.id);
  assert.equal(state.status, 'retry');
  await store.patch('jobs', job.id, { runAt: new Date(Date.now() - 1000).toISOString() });
  await queue.runOnce({ 'test.fail': async () => { throw new Error('boom again'); } });
  state = await store.get('jobs', job.id);
  assert.equal(state.status, 'dead-letter');
  assert.match(state.lastError, /boom again/);
  const requeued = await queue.requeueDeadLetter(job.id);
  assert.equal(requeued.status, 'queued');
  assert.equal(requeued.attempts, 0);
});

test('stale active jobs are recovered and pause state persists', async () => {
  const { store, queue } = await setup();
  const job = await queue.enqueue('test.stale');
  await store.patch('jobs', job.id, {
    status: 'active', attempts: 1, maxAttempts: 3, lockedBy: 'dead-worker',
    lockedAt: new Date(Date.now() - 10000).toISOString(), heartbeatAt: new Date(Date.now() - 10000).toISOString()
  });
  const recovered = await store.recoverStaleJobs(1000);
  assert.equal(recovered.recovered, 1);
  assert.equal((await store.get('jobs', job.id)).status, 'queued');
  await queue.setPaused(true, 'test');
  assert.equal((await queue.pausedState()).paused, true);
  assert.equal((await queue.runOnce({ 'test.stale': async () => ({}) })).paused, true);
  await queue.setPaused(false, 'test');
  assert.equal((await queue.pausedState()).paused, false);
});

test('resuming from persisted object pause state actually allows work', async () => {
  const { store, queue } = await setup();
  const job = await queue.enqueue('test.resume', { value: 1 });
  await queue.setPaused(true, 'test');
  assert.equal((await queue.runOnce({ 'test.resume': async () => ({ ok: true }) })).paused, true);
  await queue.setPaused(false, 'test');
  const result = await queue.runOnce({ 'test.resume': async () => ({ ok: true }) });
  assert.equal(result.paused, false);
  assert.equal(result.claimed, 1);
  assert.equal((await store.get('jobs', job.id)).status, 'completed');
});

test('singleton jobs prevent concurrent duplicate side-effect work but allow a later run', async () => {
  const { store, queue } = await setup();
  const first = await queue.enqueue('test.singleton', {}, { singletonKey: 'only-one' });
  const duplicate = await queue.enqueue('test.singleton', {}, { singletonKey: 'only-one' });
  assert.equal(duplicate.id, first.id);
  await queue.runOnce({ 'test.singleton': async () => ({ ok: true }) });
  const later = await queue.enqueue('test.singleton', {}, { singletonKey: 'only-one' });
  assert.notEqual(later.id, first.id);
  assert.equal((await store.get('jobs', first.id)).status, 'completed');
});

test('non-retryable errors dead-letter immediately even when the job allows retries', async () => {
  const { store, queue } = await setup();
  const job = await queue.enqueue('test.permanent', {}, { maxAttempts: 5 });
  await queue.runOnce({
    'test.permanent': async () => {
      const error = new Error('permanent validation failure');
      error.retryable = false;
      throw error;
    }
  });
  const state = await store.get('jobs', job.id);
  assert.equal(state.status, 'dead-letter');
  assert.equal(state.attempts, 1);
  assert.match(state.lastError, /permanent validation failure/);
});
