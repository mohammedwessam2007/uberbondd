import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runSovereignContinuousAuthoringPulse,
  sovereignLocalAttemptId
} from '../scripts/sovereign-continuous-authoring-pulse.mjs';

const HEAD = 'a'.repeat(40);

async function withTemp(t) {
  const root = await mkdtemp(join(tmpdir(), 'uberbond-continuous-authoring-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

const closed = () => ({
  ok: true,
  status: 'FINITE_ENGINEERING_ALREADY_CLOSED',
  baseRevision: HEAD,
  taskRequired: false,
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE'
});

test('unfinished finite work retains absolute priority over Sandwich genesis', async t => {
  const control = await withTemp(t);
  const primary = {
    ok: true,
    status: 'TASK_READY_FOR_ISOLATED_WORKER',
    baseRevision: HEAD,
    taskRequired: true,
    targetRequirementId: 'REQ_1'
  };
  const result = await runSovereignContinuousAuthoringPulse({
    env: { UBERBOND_CONTROL_DIR: control },
    runPrimaryPulse: async () => primary
  });
  assert.equal(result, primary);
});

test('finite closure compiles one bounded descendant task without requiring cloud runtime', async t => {
  const control = await withTemp(t);
  const result = await runSovereignContinuousAuthoringPulse({
    env: {
      UBERBOND_CONTROL_DIR: control,
      UBERBOND_ISOLATED_WORKER_ENABLED: 'false'
    },
    runPrimaryPulse: async () => closed(),
    date: new Date('2026-09-11T00:00:00Z')
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SANDWICH_DESCENDANT_TASK_READY_NO_LOCAL_WORKER');
  assert.equal(result.taskRequired, true);
  const task = JSON.parse(await readFile(join(control, 'autonomy', 'next-task.json'), 'utf8'));
  assert.match(task.taskId, /^uberbond_sandwich_descendant_/);
  assert.equal(task.consequenceClass, 'LOCAL_PREPARATION');
  assert.ok(task.constraints.includes('requirement-genesis-only-do-not-implement-same-cycle'));
  assert.ok(task.forbiddenActions.includes('merge'));
  assert.ok(task.forbiddenActions.includes('deploy'));
});

test('enabled local worker receives one digest-bound descendant attempt', async t => {
  const control = await withTemp(t);
  const workerRoot = join(control, 'worker-inbox');
  await mkdir(workerRoot, { recursive: true });
  const env = {
    UBERBOND_CONTROL_DIR: control,
    UBERBOND_ISOLATED_WORKER_ENABLED: 'true',
    UBERBOND_WORKER_INBOX_ROOT: workerRoot,
    UBERBOND_WORKER_TASK_PATH: join(workerRoot, 'task.json')
  };
  const result = await runSovereignContinuousAuthoringPulse({
    env,
    runPrimaryPulse: async () => closed(),
    date: new Date('2026-09-11T00:00:00Z')
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SANDWICH_DESCENDANT_TASK_DISPATCHED_TO_ISOLATED_WORKER');
  assert.equal(result.newWorkerDispatch, true);
  const task = JSON.parse(await readFile(join(workerRoot, 'task.json'), 'utf8'));
  const receipt = JSON.parse(await readFile(join(control, 'autonomy', 'continuation-receipt.json'), 'utf8'));
  assert.equal(receipt.observedTaskId, task.taskId);
  assert.equal(receipt.observedBaseRevision, HEAD);
  assert.equal(receipt.observedAttemptId, sovereignLocalAttemptId(HEAD, task));
  assert.equal(receipt.continuation.decision, 'DO_NOT_CREATE_DUPLICATE_TASK');
});

test('same descendant already in the worker inbox is resumed rather than redispatched', async t => {
  const control = await withTemp(t);
  const workerRoot = join(control, 'worker-inbox');
  await mkdir(workerRoot, { recursive: true });
  const env = {
    UBERBOND_CONTROL_DIR: control,
    UBERBOND_ISOLATED_WORKER_ENABLED: 'true',
    UBERBOND_WORKER_INBOX_ROOT: workerRoot,
    UBERBOND_WORKER_TASK_PATH: join(workerRoot, 'task.json')
  };
  const first = await runSovereignContinuousAuthoringPulse({ env, runPrimaryPulse: async () => closed() });
  assert.equal(first.newWorkerDispatch, true);
  const second = await runSovereignContinuousAuthoringPulse({ env, runPrimaryPulse: async () => closed() });
  assert.equal(second.ok, true);
  assert.equal(second.status, 'SANDWICH_DESCENDANT_EXISTING_ATTEMPT_RESUMED');
  assert.equal(second.newWorkerDispatch, false);
  assert.equal(second.attemptId, first.attemptId);
});

test('a different worker-inbox attempt blocks descendant overwrite', async t => {
  const control = await withTemp(t);
  const workerRoot = join(control, 'worker-inbox');
  await mkdir(workerRoot, { recursive: true });
  await writeFile(join(workerRoot, 'task.json'), JSON.stringify({ taskId: 'different_attempt' }));
  const result = await runSovereignContinuousAuthoringPulse({
    env: {
      UBERBOND_CONTROL_DIR: control,
      UBERBOND_ISOLATED_WORKER_ENABLED: 'true',
      UBERBOND_WORKER_INBOX_ROOT: workerRoot,
      UBERBOND_WORKER_TASK_PATH: join(workerRoot, 'task.json')
    },
    runPrimaryPulse: async () => closed()
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SOVEREIGN_CONTINUOUS_AUTHORING_WORKER_HANDOFF_REFUSED');
  assert.match(result.reasonCodes.join(' '), /worker-inbox-bound-to-different-attempt/);
});
