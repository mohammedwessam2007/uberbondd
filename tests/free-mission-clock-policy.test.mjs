import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_INTERVAL_MS,
  MAX_ACTIVE_WINDOW_MS,
  MAX_TICKS_PER_WINDOW,
  compileFreeMissionClock
} from '../src/free-mission-clock-policy.mjs';

test('one-second eight-hour mission fits the bounded free mission clock',()=>{
  const x=compileFreeMissionClock({intervalMs:1000,durationMs:8*60*60*1000});
  assert.equal(x.ok,true);
  assert.equal(x.intervalMs,1000);
  assert.equal(x.durationMs,MAX_ACTIVE_WINDOW_MS);
  assert.equal(x.maximumTicks,28800);
  assert.equal(x.maximumTicks,MAX_TICKS_PER_WINDOW);
  assert.equal(x.externalEffectAuthority,'NONE');
});

test('sub-second cadence is refused',()=>{
  const x=compileFreeMissionClock({intervalMs:999,durationMs:60_000});
  assert.equal(x.ok,false);
  assert.ok(x.reasons.includes('interval-below-free-runtime-floor'));
  assert.equal(x.intervalMs,MIN_INTERVAL_MS);
});

test('mission windows longer than eight hours are refused',()=>{
  const x=compileFreeMissionClock({intervalMs:1000,durationMs:MAX_ACTIVE_WINDOW_MS+1});
  assert.equal(x.ok,false);
  assert.ok(x.reasons.includes('duration-outside-bounded-window'));
  assert.equal(x.durationMs,MAX_ACTIVE_WINDOW_MS);
});

test('invalid numeric inputs fail closed',()=>{
  const x=compileFreeMissionClock({intervalMs:'nope',durationMs:null});
  assert.equal(x.ok,false);
  assert.ok(x.reasons.includes('interval-below-free-runtime-floor'));
});
