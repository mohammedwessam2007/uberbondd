import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDurableSchedulerWakePulse } from '../src/durable-scheduler-wake-pulse.mjs';

function harness() {
  const settings = {};
  const jobs = [];
  const store = {
    async getSettings() { return structuredClone(settings); },
    async setSetting(key, value) { settings[key] = structuredClone(value); }
  };
  const queue = {
    store,
    async enqueue(type, payload, options) {
      const existing = jobs.find(job => job.options.dedupeKey === options.dedupeKey);
      if (existing) return existing;
      const job = { id: `job-${jobs.length + 1}`, type, payload: structuredClone(payload), options: structuredClone(options) };
      jobs.push(job);
      return job;
    }
  };
  return { queue, jobs, settings };
}

const nowMs = Date.parse('2026-09-09T11:00:00.000Z');
const wake = (overrides = {}) => ({
  wakeId: 'wake-1',
  providerId: 'replaceable-provider-a',
  observedAt: '2026-09-09T10:59:30.000Z',
  ...overrides
});
const schedule = (overrides = {}) => ({
  type: 'research.batch',
  intervalMs: 15 * 60 * 1000,
  payload: { limit: 10, reason: 'scheduled' },
  options: { maxAttempts: 3 },
  maxCatchUpBuckets: 2,
  ...overrides
});

test('external pulse can only trigger reconciliation of local canonical schedule', async () => {
  const h = harness();
  const result = await applyDurableSchedulerWakePulse({ wake: wake(), schedule: schedule(), queue: h.queue, nowMs });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(h.jobs.length, 1);
  assert.equal(h.jobs[0].type, 'research.batch');
  assert.deepEqual(h.jobs[0].payload, { limit: 10, reason: 'scheduled' });
  assert.equal(result.wakeAuthority, 'PULSE_ONLY');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('duplicate wake cannot create a second logical occurrence', async () => {
  const h = harness();
  const first = await applyDurableSchedulerWakePulse({ wake: wake(), schedule: schedule(), queue: h.queue, nowMs });
  const second = await applyDurableSchedulerWakePulse({ wake: wake({ wakeId: 'wake-duplicate' }), schedule: schedule(), queue: h.queue, nowMs: nowMs + 1000 });
  assert.equal(first.ok, true); assert.equal(second.ok, true);
  assert.equal(h.jobs.length, 1);
  assert.equal(second.schedulerResult.status, 'CURRENT_OCCURRENCE_ALREADY_RECONCILED');
});

test('provider cannot inject job type payload interval occurrence or retry semantics', async () => {
  for (const [field, value] of [
    ['type', 'outbound.process'], ['payload', { target: 'victim' }], ['intervalMs', 1],
    ['occurrenceKey', 'fake'], ['dedupeKey', 'fake'], ['maxAttempts', 99], ['maxCatchUpBuckets', 64]
  ]) {
    const h = harness();
    const result = await applyDurableSchedulerWakePulse({ wake: wake({ [field]: value }), schedule: schedule(), queue: h.queue, nowMs });
    assert.equal(result.ok, false, field);
    assert.ok(result.reasonCodes.includes('wake-must-not-carry-scheduler-semantics'), field);
    assert.equal(h.jobs.length, 0, field);
  }
});

test('stale and future wakes fail before queue reconciliation', async () => {
  const stale = harness();
  const staleResult = await applyDurableSchedulerWakePulse({ wake: wake({ observedAt: '2026-09-09T09:00:00.000Z' }), schedule: schedule(), queue: stale.queue, nowMs });
  assert.equal(staleResult.ok, false); assert.ok(staleResult.reasonCodes.includes('stale-wake-refused')); assert.equal(stale.jobs.length, 0);
  const future = harness();
  const futureResult = await applyDurableSchedulerWakePulse({ wake: wake({ observedAt: '2026-09-09T11:10:00.000Z' }), schedule: schedule(), queue: future.queue, nowMs });
  assert.equal(futureResult.ok, false); assert.ok(futureResult.reasonCodes.includes('future-wake-refused')); assert.equal(future.jobs.length, 0);
});

test('catch-up policy is local and remains bounded by canonical scheduler', async () => {
  const h = harness();
  await applyDurableSchedulerWakePulse({ wake: wake(), schedule: schedule(), queue: h.queue, nowMs: nowMs - 60 * 60 * 1000 });
  const result = await applyDurableSchedulerWakePulse({ wake: wake({ wakeId: 'wake-later', observedAt: '2026-09-09T10:59:50.000Z' }), schedule: schedule({ maxCatchUpBuckets: 2 }), queue: h.queue, nowMs });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.schedulerResult.enqueuedBuckets.length <= 2);
  assert.ok(result.schedulerResult.skippedHistoricalBuckets >= 0);
});

test('malformed local schedule fails closed without treating provider as configuration', async () => {
  const h = harness();
  const result = await applyDurableSchedulerWakePulse({ wake: wake(), schedule: schedule({ intervalMs: 0 }), queue: h.queue, nowMs });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('local-positive-interval-required'));
  assert.equal(h.jobs.length, 0);
});
