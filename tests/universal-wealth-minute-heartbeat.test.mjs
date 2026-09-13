import test from 'node:test';
import assert from 'node:assert/strict';
import { startScheduler } from '../src/scheduler.mjs';

test('Universal Wealth has exactly one resident one-second scheduler heartbeat', async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const intervals = [];
  const settings = {};
  const jobs = [];
  const errors = [];

  globalThis.setInterval = (_fn, intervalMs) => {
    intervals.push(intervalMs);
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};

  try {
    const store = {
      async getSettings() { return structuredClone(settings); },
      async setSetting(key, value) { settings[key] = structuredClone(value); }
    };
    const queue = {
      store,
      async enqueue(type, payload, options) {
        jobs.push({ type, payload, options });
        return { id: `job-${jobs.length}` };
      }
    };

    const stop = startScheduler(queue, {
      autopilot: true,
      maxBatch: 1,
      replyPollMinutes: 17,
      discovery: { enabled: false },
      prometheus: { schedulingEnabled: false },
      domainMailbox: { schedulingEnabled: false }
    }, { error: (...args) => errors.push(args) });

    await new Promise(resolve => setImmediate(resolve));
    stop();

    const wealthJobs = jobs.filter(job => job.type === 'universal.wealth.pulse');
    assert.equal(wealthJobs.length, 1);
    assert.equal(wealthJobs[0].payload.maxCapitalAtRisk, 0);
    assert.equal(wealthJobs[0].options.singletonKey, 'singleton:universal.wealth.pulse');
    assert.equal(intervals.filter(ms => ms === 1_000).length, 1);
    assert.equal(errors.length, 0);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
