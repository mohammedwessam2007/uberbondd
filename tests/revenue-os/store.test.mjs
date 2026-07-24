import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, ConflictError } from '../../revenue-os/src/store.mjs';
import { DurableQueue } from '../../src/queue.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-store-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('store add/get/list/patch round-trip and reject a duplicate id', async () => {
  const store = await harness();
  const row = await store.add('organizations', { id: 'org1', name: 'x' });
  assert.equal(row.id, 'org1');
  assert.deepEqual(await store.get('organizations', 'org1'), row);
  await assert.rejects(() => store.add('organizations', { id: 'org1', name: 'y' }), ConflictError);
  const patched = await store.patch('organizations', 'org1', { name: 'z' });
  assert.equal(patched.name, 'z');
  assert.equal(await store.patch('organizations', 'missing', { name: 'q' }), null);
});

test('store persists to disk and reloads', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-store-persist-'));
  const store1 = new Store(dir);
  await store1.init();
  await store1.add('organizations', { id: 'org1', name: 'x' });
  const store2 = new Store(dir);
  await store2.init();
  assert.equal((await store2.get('organizations', 'org1')).name, 'x');
});

test('DurableQueue (reused unmodified from ../../src/queue.mjs) works against this store, including singletonKey dedup', async () => {
  const store = await harness();
  const queue = new DurableQueue(store, { queue: { concurrency: 1, maxAttempts: 3, retryBaseMs: 1000, retryMaxMs: 10000, lockTimeoutMs: 5000, jobHeartbeatMs: 5000, workerHeartbeatMs: 5000, workerStaleMs: 30000, maxRuntimeMs: 30000, pollMs: 10 } }, { error() {} });
  const first = await queue.enqueue('ros.test', { x: 1 }, { singletonKey: 'only-one' });
  const duplicate = await queue.enqueue('ros.test', { x: 2 }, { singletonKey: 'only-one' });
  assert.equal(first.id, duplicate.id);
  const result = await queue.runOnce({ 'ros.test': async () => ({ ok: true }) });
  assert.equal(result.claimed, 1);
});

test('a job whose worker died mid-run is recoverable via recoverStaleJobs', async () => {
  const store = await harness();
  const queue = new DurableQueue(store, { queue: { concurrency: 1, maxAttempts: 3, retryBaseMs: 1000, retryMaxMs: 10000, lockTimeoutMs: 1000, jobHeartbeatMs: 1000, workerHeartbeatMs: 1000, workerStaleMs: 5000, maxRuntimeMs: 5000, pollMs: 10 } }, { error() {} });
  const job = await queue.enqueue('ros.test_restart', { value: 1 });
  await store.patch('jobs', job.id, { status: 'active', attempts: 1, maxAttempts: 3, lockedBy: 'dead-worker', lockedAt: new Date(Date.now() - 60000).toISOString(), heartbeatAt: new Date(Date.now() - 60000).toISOString() });
  const recovered = await store.recoverStaleJobs(1000);
  assert.equal(recovered.recovered, 1);
  assert.equal((await store.get('jobs', job.id)).status, 'queued');
});
