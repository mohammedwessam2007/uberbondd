import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { DurableQueue } from '../src/queue.mjs';

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-night-runtime-race-'));
  const store = new Store(dir);
  await store.init();
  const cfg = {
    version: 'night-runtime-race-test',
    queue: {
      concurrency: 1,
      maxAttempts: 5,
      retryBaseMs: 1000,
      retryMaxMs: 10000,
      lockTimeoutMs: 1000,
      jobHeartbeatMs: 1000,
      workerHeartbeatMs: 1000,
      workerStaleMs: 5000,
      maxRuntimeMs: 5000,
      pollMs: 10
    }
  };
  return { store, queue: new DurableQueue(store, cfg, { error() {} }) };
}

test('stale reconcile quarantine cannot overwrite a heartbeat refreshed after candidate discovery', async () => {
  const { store, queue } = await setup();
  const job = await queue.enqueue('test.heartbeat-race', {}, { recoveryPolicy: 'reconcile', maxAttempts: 5 });
  await store.claimJobs('healthy-worker', 1, 1000);
  const stale = new Date(Date.now() - 10000).toISOString();
  await store.patch('jobs', job.id, { lockedAt: stale, heartbeatAt: stale, lockedBy: 'healthy-worker', status: 'active' });

  const originalRecover = store.recoverStaleJobs.bind(store);
  let injectedRefresh = false;
  store.recoverStaleJobs = async timeoutMs => {
    if (!injectedRefresh) {
      injectedRefresh = true;
      await store.patch('jobs', job.id, {
        heartbeatAt: new Date().toISOString(),
        lockedAt: new Date().toISOString(),
        lockedBy: 'healthy-worker',
        status: 'active'
      });
    }
    return originalRecover(timeoutMs);
  };

  const result = await queue.quarantineUncertainStaleJobs(1000);
  assert.equal(injectedRefresh, true);
  assert.equal(result.quarantined, 0);

  const state = await store.get('jobs', job.id);
  assert.equal(state.status, 'active');
  assert.equal(state.lockedBy, 'healthy-worker');
  assert.equal(state.reconciliationRequired, undefined);
  assert.ok(Date.parse(state.heartbeatAt) > Date.now() - 1000);

  const replacement = await store.claimJobs('replacement-worker', 1, 1000);
  assert.equal(replacement.length, 0);
});
