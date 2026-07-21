import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-autonomy-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('CON-01/F-04: a second cycle cannot become active while one is already active, even with a different run key', async () => {
  const store = await tempStore();
  const first = await store.createAutonomyCycleRun('run-a', 'worker-1', 60000);
  assert.equal(first.ok, true);
  assert.equal(first.run.status, 'active');
  assert.equal(first.run.version, 0);
  const second = await store.createAutonomyCycleRun('run-b', 'worker-2', 60000);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'cycle-already-active');
});

test('reusing a run key is idempotent-safe: rejected as a duplicate, not a second active cycle', async () => {
  const store = await tempStore();
  const first = await store.createAutonomyCycleRun('same-key', 'worker-1', 60000);
  assert.equal(first.ok, true);
  await store.patchAutonomyCycleRun(first.run.id, 0, { status: 'completed', finalizedAt: new Date().toISOString() });
  const second = await store.createAutonomyCycleRun('same-key', 'worker-2', 60000);
  assert.equal(second.ok, false);
  assert.match(second.reason, /^duplicate-run-key-/);
});

test('completing the active cycle frees the slot for a genuinely new one', async () => {
  const store = await tempStore();
  const first = await store.createAutonomyCycleRun('run-a', 'worker-1', 60000);
  await store.patchAutonomyCycleRun(first.run.id, 0, { status: 'completed', finalizedAt: new Date().toISOString() });
  const second = await store.createAutonomyCycleRun('run-b', 'worker-2', 60000);
  assert.equal(second.ok, true);
});

test('CAS: patching with a stale version is rejected and does not change stored state', async () => {
  const store = await tempStore();
  const created = await store.createAutonomyCycleRun('run-a', 'worker-1', 60000);
  const applied = await store.patchAutonomyCycleRun(created.run.id, 0, { stagesPatch: { discover: 'done' } });
  assert.equal(applied.ok, true);
  assert.equal(applied.run.version, 1);
  // Simulates a second process that read the run at version 0 and is now trying to write, after
  // the first process already advanced it to version 1.
  const stale = await store.patchAutonomyCycleRun(created.run.id, 0, { stagesPatch: { discover: 'overwritten' } });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'version-conflict');
  const current = await store.get('autonomyCycleRuns', created.run.id);
  assert.equal(current.version, 1);
  assert.deepEqual(current.stages, { discover: 'done' });
});

test('F-07: a finalized run can never be patched again, even with the correct version', async () => {
  const store = await tempStore();
  const created = await store.createAutonomyCycleRun('run-a', 'worker-1', 60000);
  const finalized = await store.patchAutonomyCycleRun(created.run.id, 0, { status: 'completed', finalizedAt: new Date().toISOString() });
  assert.equal(finalized.ok, true);
  const attempt = await store.patchAutonomyCycleRun(created.run.id, finalized.run.version, { stagesPatch: { discover: 'tampered' } });
  assert.equal(attempt.ok, false);
  assert.equal(attempt.reason, 'already-finalized');
});

test('CRS: a stale lease can be reclaimed by a new owner, and a fresh lease cannot', async () => {
  const store = await tempStore();
  // Create with the minimum-clamped TTL so the lease is already stale after a short real wait —
  // never fake this via a generic patch, which is exactly the CAS/lease invariant this collection
  // is protected against (see PROTECTED_COLLECTION tests below).
  const created = await store.createAutonomyCycleRun('run-a', 'worker-1', 1);
  const tooSoon = await store.reclaimStaleAutonomyCycleRun('worker-2', 60000);
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.reason, 'no-stale-lease');
  await new Promise(resolve => setTimeout(resolve, 1100));
  const reclaimed = await store.reclaimStaleAutonomyCycleRun('worker-2', 60000);
  assert.equal(reclaimed.ok, true);
  assert.equal(reclaimed.run.leaseOwner, 'worker-2');
  assert.equal(reclaimed.run.id, created.run.id);
  assert.equal(reclaimed.run.version, 1);
});

test('P0-06: generic add/upsert/patch reject autonomyCycleRuns on the JSON backend', async () => {
  const store = await tempStore();
  await assert.rejects(store.add('autonomyCycleRuns', { id: 'x', runKey: 'k', status: 'active', leaseOwner: 'w', leaseExpiresAt: new Date().toISOString() }), { code: 'PROTECTED_COLLECTION' });
  await assert.rejects(store.upsert('autonomyCycleRuns', { id: 'x', runKey: 'k', status: 'active', leaseOwner: 'w', leaseExpiresAt: new Date().toISOString() }), { code: 'PROTECTED_COLLECTION' });
  const created = await store.createAutonomyCycleRun('run-a', 'worker-1', 60000);
  await assert.rejects(store.patch('autonomyCycleRuns', created.run.id, { leaseExpiresAt: new Date(0).toISOString() }), { code: 'PROTECTED_COLLECTION' });
  // The bypass attempt must not have mutated anything.
  const unchanged = await store.get('autonomyCycleRuns', created.run.id);
  assert.equal(unchanged.leaseExpiresAt, created.run.leaseExpiresAt);
});

test('P0-06: dedicated create/patch/reclaim methods still work after the generic-write guard is in place', async () => {
  const store = await tempStore();
  const created = await store.createAutonomyCycleRun('run-a', 'worker-1', 60000);
  assert.equal(created.ok, true);
  const patched = await store.patchAutonomyCycleRun(created.run.id, 0, { stagesPatch: { discover: 'done' } });
  assert.equal(patched.ok, true);
});

test('missing run key is rejected up front', async () => {
  const store = await tempStore();
  const result = await store.createAutonomyCycleRun('', 'worker-1', 60000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-run-key');
});

test('patching a run that does not exist is reported, not thrown', async () => {
  const store = await tempStore();
  const result = await store.patchAutonomyCycleRun('nope', 0, { status: 'completed' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-found');
});
