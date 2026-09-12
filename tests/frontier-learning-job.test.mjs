import test from 'node:test';
import assert from 'node:assert/strict';
import { runFrontierLearningJob } from '../src/frontier-learning-job-handler.mjs';
import { startScheduler } from '../src/scheduler.mjs';

function publicReceipt() {
  return {
    networkReadAuthority: 'PUBLIC_RESEARCH_ONLY',
    businessEffectAuthority: 'NONE',
    intelligencePackets: [{
      promotionAuthority: 'NONE',
      normalizedSignal: {
        source: 'https://example.test',
        summary: 'Adaptive verification router announced',
        claimedChange: 'Confidence-gated routing selects a verification lane',
        domains: ['reasoning'],
        confidence: 80,
        evidenceRefs: ['https://example.test/evidence']
      }
    }]
  };
}

test('missing Gamechanger input is a clean no-op', async () => {
  let wrote = false;
  const result = await runFrontierLearningJob({
    readJsonImpl: async () => null,
    writeJsonImpl: async () => { wrote = true; }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'FRONTIER_LEARNING_NO_INPUT');
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(wrote, false);
});

test('receipt outside public-research boundary is refused and not persisted', async () => {
  let wrote = false;
  const result = await runFrontierLearningJob({
    readJsonImpl: async () => ({ ...publicReceipt(), networkReadAuthority: 'UNKNOWN' }),
    writeJsonImpl: async () => { wrote = true; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FRONTIER_LEARNING_INPUT_REFUSED');
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(wrote, false);
});

test('valid Gamechanger receipt becomes a persisted zero-authority learning receipt', async () => {
  let written = null;
  const result = await runFrontierLearningJob({
    root: '/tmp/uberbond-frontier-test',
    readJsonImpl: async () => publicReceipt(),
    writeJsonImpl: async (file, value) => { written = { file, value }; },
    now: () => '2026-09-13T00:00:00.000Z'
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'FRONTIER_LEARNING_RECEIPT_WRITTEN');
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(result.receipt.truthLaw, 'DISCOVERY_FINGERPRINTS_ARE_NOT_CAPABILITY_ATOMS');
  assert.ok(result.receipt.discoveryFingerprintCount >= 1);
  assert.equal(result.receipt.cycle.executionAuthority, 'NONE');
  assert.ok(written?.file.endsWith('artifacts/frontier-learning-latest.json'));
  assert.equal(written?.value?.businessEffectAuthority, 'NONE');
});

test('autopilot scheduler durably enqueues frontier learning every five minutes', async () => {
  const settings = {};
  const enqueued = [];
  const store = {
    async getSettings() { return { ...settings }; },
    async setSetting(key, value) { settings[key] = value; }
  };
  const queue = {
    store,
    async enqueue(type, payload, options) {
      const job = { id: `job-${enqueued.length + 1}`, type, payload, options };
      enqueued.push(job);
      return job;
    }
  };
  const errors = [];
  const stop = startScheduler(queue, {
    autopilot: true,
    maxBatch: 1,
    replyPollMinutes: 1,
    discovery: { enabled: false },
    prometheus: { schedulingEnabled: false },
    domainMailbox: { schedulingEnabled: false }
  }, { error: (...args) => errors.push(args) });
  await new Promise(resolve => setImmediate(resolve));
  stop();
  assert.deepEqual(errors, []);
  const jobs = enqueued.filter(job => job.type === 'frontier.learning.process');
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].payload, { maxInvestigations: 8 });
  assert.equal(jobs[0].options.maxAttempts, 3);
  assert.match(jobs[0].options.dedupeKey, /^frontier\.learning\.process:/);
  assert.equal(jobs[0].options.singletonKey, 'singleton:frontier.learning.process');
});
