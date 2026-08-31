import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';
import { startScheduler } from '../src/scheduler.mjs';
import { recordCommercialMemory } from '../src/commercial-memory.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-scheduling-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('prometheus.capability_gap.recompute writes a real snapshot receipt and returns real counts', async () => {
  const store = await tempStore();
  const handlers = createJobHandlers({ store, cfg: {}, pipeline: {}, revenue: {}, discoveryRunner: {} });
  const result = await handlers['prometheus.capability_gap.recompute']();
  assert.ok(result.total > 0);
  const receipts = await store.list('auditLog', { filters: { type: 'capability_graph_snapshot' } });
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].detail.total, result.total);
});

test('prometheus.capability_genome.plan persists a zero-effect bounded plan without importing a corpus', async () => {
  const store = await tempStore();
  const handlers = createJobHandlers({ store, cfg: {}, pipeline: {}, revenue: {}, discoveryRunner: {} });
  const result = await handlers['prometheus.capability_genome.plan']({ sourceIds: ['official-mcp-registry'], budget: { maxRecordsPerSource: 25 } });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'DISCOVERY_PLAN_COMPILED_NOT_EXECUTED');
  assert.equal(result.plans[0].maxRecords, 25);
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  const receipts = await store.list('auditLog', { filters: { type: 'capability_genome_discovery_plan' } });
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].detail.planDigest, result.planDigest);
});

test('prometheus.capability_genome.acquire is a zero-effect local decision seam', async () => {
  const store = await tempStore();
  const handlers = createJobHandlers({ store, cfg: {}, pipeline: {}, revenue: {}, discoveryRunner: {} });
  const result = await handlers['prometheus.capability_genome.acquire']({ mission: 'missing task', requiredAtomIds: ['missing.atom'], capabilities: [] });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'WORLD_SEARCH_REQUIRED');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
  const receipts = await store.list('auditLog', { filters: { type: 'capability_genome_acquisition_decision' } });
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0].detail.missingAtomIds, ['missing.atom']);
});

test('prometheus.commercial_memory.contradiction_scan finds nothing and writes no receipt when memory is empty', async () => {
  const store = await tempStore();
  const handlers = createJobHandlers({ store, cfg: {}, pipeline: {}, revenue: {}, discoveryRunner: {} });
  const result = await handlers['prometheus.commercial_memory.contradiction_scan']();
  assert.equal(result.contradictions, 0);
  const receipts = await store.list('auditLog', { filters: { type: 'commercial_memory_contradictions_found' } });
  assert.equal(receipts.length, 0);
});

test('prometheus.commercial_memory.contradiction_scan finds and reports a real contradiction, never auto-resolves it', async () => {
  const store = await tempStore();
  await recordCommercialMemory(store, { hypothesis: 'H-sched', outcomeType: 'CLEARED_PAYMENT', date: monday });
  await recordCommercialMemory(store, { hypothesis: 'H-sched', outcomeType: 'REFUND_OR_DISPUTE', date: monday });
  const handlers = createJobHandlers({ store, cfg: {}, pipeline: {}, revenue: {}, discoveryRunner: {} });
  const result = await handlers['prometheus.commercial_memory.contradiction_scan']();
  assert.equal(result.contradictions, 1);
  const receipts = await store.list('auditLog', { filters: { type: 'commercial_memory_contradictions_found' } });
  assert.equal(receipts.length, 1);
  assert.deepEqual(receipts[0].detail.hypotheses, ['H-sched']);
});

test('neither Prometheus job is registered when prometheus.schedulingEnabled is false, even with autopilot on', () => {
  const enqueued = [];
  const fakeQueue = { enqueue: async (type, payload, options) => { enqueued.push(type); return { type, payload, options }; } };
  const stop = startScheduler(fakeQueue, { autopilot: true, maxBatch: 10, replyPollMinutes: 10, prometheus: { schedulingEnabled: false } }, { error: () => {} });
  stop();
  assert.ok(!enqueued.includes('prometheus.capability_gap.recompute'));
  assert.ok(!enqueued.includes('prometheus.capability_genome.plan'));
  assert.ok(!enqueued.includes('prometheus.commercial_memory.contradiction_scan'));
});

test('neither Prometheus job is registered when autopilot is off, even with prometheus.schedulingEnabled true', () => {
  const enqueued = [];
  const fakeQueue = { enqueue: async (type) => { enqueued.push(type); } };
  const stop = startScheduler(fakeQueue, { autopilot: false, prometheus: { schedulingEnabled: true } }, { error: () => {} });
  stop();
  assert.equal(enqueued.length, 0);
});

test('both Prometheus jobs ARE registered when autopilot AND prometheus.schedulingEnabled are both true -- the mechanism is real, not permanently off', async () => {
  const enqueued = [];
  const fakeQueue = { enqueue: async (type) => { enqueued.push(type); } };
  const stop = startScheduler(fakeQueue, { autopilot: true, maxBatch: 10, replyPollMinutes: 10, prometheus: { schedulingEnabled: true } }, { error: () => {} });
  await new Promise(resolve => setTimeout(resolve, 20)); // let the scheduler's initial (microtask-deferred) enqueue calls settle
  stop();
  assert.ok(enqueued.includes('prometheus.capability_gap.recompute'));
  assert.ok(enqueued.includes('prometheus.capability_genome.plan'));
  assert.ok(enqueued.includes('prometheus.commercial_memory.contradiction_scan'));
});

test('the two new job types never appear anywhere near an external-action worker -- neither handler imports Gmail/network code', async () => {
  const source = await fs.readFile(new URL('../src/job-handlers.mjs', import.meta.url), 'utf8');
  const prometheusSection = source.slice(source.indexOf("'prometheus.capability_gap.recompute'"));
  assert.doesNotMatch(prometheusSection, /gmail\.mjs|sendEmail|fetch\(|http\.request|https\.request/);
});
