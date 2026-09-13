import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_INTERVAL_MS,
  MAX_ACTIVE_WINDOW_MS,
  MAX_TICKS_PER_WINDOW,
  compileFreeMissionClock
} from '../src/policy.js';

test('one-second eight-hour mission is accepted and bounded', () => {
  const result = compileFreeMissionClock({ intervalMs: 1000, durationMs: 8 * 60 * 60 * 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.intervalMs, 1000);
  assert.equal(result.durationMs, MAX_ACTIVE_WINDOW_MS);
  assert.equal(result.maximumTicks, 28800);
  assert.equal(result.maximumTicks, MAX_TICKS_PER_WINDOW);
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('sub-second cadence is refused', () => {
  const result = compileFreeMissionClock({ intervalMs: 999, durationMs: 60_000 });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('interval-below-free-runtime-floor'));
  assert.equal(result.intervalMs, MIN_INTERVAL_MS);
});

test('longer than eight hours is refused', () => {
  const result = compileFreeMissionClock({ intervalMs: 1000, durationMs: MAX_ACTIVE_WINDOW_MS + 1 });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('duration-outside-bounded-window'));
});

test('null and malformed numeric inputs fail closed', () => {
  const a = compileFreeMissionClock({ intervalMs: null, durationMs: 60_000 });
  const b = compileFreeMissionClock({ intervalMs: 'nope', durationMs: '' });
  assert.equal(a.ok, false);
  assert.equal(b.ok, false);
});
