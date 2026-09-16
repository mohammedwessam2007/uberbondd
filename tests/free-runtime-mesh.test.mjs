import test from 'node:test';
import assert from 'node:assert/strict';
import { FREE_RUNTIME_LIMITS, compileFreeRuntimeWake, compileFreeBurstDispatch } from '../src/free-runtime-mesh.mjs';

test('active work uses one-second heartbeat while free budget remains', () => {
  const x = compileFreeRuntimeWake({pendingJobs:3,workerRequestsUsedToday:1000,nowMs:10_000,lastWakeMs:9_000});
  assert.equal(x.mode,'ACTIVE_ONE_SECOND');
  assert.equal(x.cadenceMs,1000);
  assert.equal(x.shouldDispatchBurst,true);
  assert.equal(x.externalEffectAuthority,'NONE');
});

test('idle runtime hibernates behind a bounded recovery alarm instead of wasting free requests', () => {
  const x = compileFreeRuntimeWake({pendingJobs:0,inflight:false,urgent:false,workerRequestsUsedToday:1000});
  assert.equal(x.mode,'HIBERNATE_WITH_RECOVERY_ALARM');
  assert.equal(x.cadenceMs,FREE_RUNTIME_LIMITS.idleRecoveryMs);
  assert.equal(x.shouldDispatchBurst,false);
});

test('free tier safety reserve fails closed before request exhaustion', () => {
  const x = compileFreeRuntimeWake({pendingJobs:9,workerRequestsUsedToday:90000,workerRequestLimit:100000,workerSafetyReserve:12000});
  assert.equal(x.mode,'FREE_BUDGET_PROTECTED');
  assert.equal(x.shouldDispatchBurst,false);
  assert.equal(x.cadenceMs,FREE_RUNTIME_LIMITS.idleRecoveryMs);
});

test('inflight work prevents duplicate GitHub burst dispatches', () => {
  const x = compileFreeBurstDispatch({pendingJobs:4,inflight:true});
  assert.equal(x.ok,false);
  assert.equal(x.status,'BURST_ALREADY_INFLIGHT');
});

test('bounded dispatch preserves zero external-effect authority', () => {
  const x = compileFreeBurstDispatch({pendingJobs:250,inflight:false,reason:'wealth-refresh'});
  assert.equal(x.ok,true);
  assert.equal(x.dispatch.workflow,'free-runtime-burst.yml');
  assert.equal(x.dispatch.inputs.requestedJobs,100);
  assert.equal(x.externalEffectAuthority,'NONE');
});

test('logical catchup is bounded after a long sleep', () => {
  const x = compileFreeRuntimeWake({pendingJobs:1,nowMs:120000,lastWakeMs:0});
  assert.equal(x.logicalTicksElapsed,FREE_RUNTIME_LIMITS.maxLogicalCatchupTicks);
});
