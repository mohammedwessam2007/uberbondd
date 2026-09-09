#!/usr/bin/env node
import { applyDurableSchedulerWakePulse } from '../src/durable-scheduler-wake-pulse.mjs';

const nowMs = Date.parse('2026-09-09T00:00:00.000Z');
const settings = {};
const jobs = [];
const store = {
  async getSettings() { return structuredClone(settings); },
  async setSetting(key, value) { settings[key] = structuredClone(value); }
};
const queue = {
  store,
  async enqueue(type, payload, options) {
    const prior = jobs.find(row => row.dedupeKey === options.dedupeKey);
    if (prior) return prior;
    const row = { id: `doctor-job-${jobs.length + 1}`, type, payload: structuredClone(payload), dedupeKey: options.dedupeKey };
    jobs.push(row);
    return row;
  }
};

const result = await applyDurableSchedulerWakePulse({
  wake: { wakeId: 'doctor-wake', providerId: 'synthetic-doctor', observedAt: '2026-09-08T23:59:30.000Z' },
  schedule: {
    type: 'doctor.local-preparation',
    intervalMs: 15 * 60 * 1000,
    payload: { synthetic: true },
    options: { maxAttempts: 1 },
    maxCatchUpBuckets: 1
  },
  queue,
  nowMs
});

if (!result.ok || jobs.length !== 1 || result.businessEffectAuthority !== 'NONE') {
  console.error(JSON.stringify({ ok: false, status: 'DURABLE_SCHEDULER_WAKE_PULSE_DOCTOR_FAILED', result, jobs: jobs.length }, null, 2));
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    ok: true,
    status: 'DURABLE_SCHEDULER_WAKE_PULSE_DOCTOR_PASSED',
    jobs: jobs.length,
    canonicalJobTruth: result.canonicalJobTruth,
    networkCalls: 0,
    providerCalls: 0,
    businessEffectAuthority: 'NONE'
  }, null, 2));
}
