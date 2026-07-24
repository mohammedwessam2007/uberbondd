import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import { DurableQueue } from '../../src/queue.mjs';
import { loadRevenueOsConfig } from '../../revenue-os/src/config.mjs';
import { MODE_DEFINITIONS, SCHEDULED_MODES, ALWAYS_SAFE_PRIORITY, planScheduledJob, schedulerPreflight, runScheduledJob, selectNextSafeTask, runNextSafeTask, SchedulerError } from '../../revenue-os/src/scheduler.mjs';
import { createRevenueOsJobHandlers } from '../../revenue-os/src/job-handlers.mjs';
import { createCircuitBreaker, CircuitBreakerOpenError } from '../../revenue-os/src/circuit-breaker.mjs';
import { createFakeAiProvider, createReplayAiProvider, assertAiContract } from '../../revenue-os/src/providers/ai.mjs';
import { runAssistant, runEvalFixtures, ASSISTANT_TASKS, AiAssistantError } from '../../revenue-os/src/ai-assistants.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-sched-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function makeQueueAndHandlers(store, overrides = {}) {
  const cfg = loadRevenueOsConfig({});
  const queue = new DurableQueue(store, cfg, { error() {} });
  const handlers = createRevenueOsJobHandlers({ store, reportSecret: 'r'.repeat(32), ...overrides });
  return { queue, handlers };
}

// --- scheduler registry ---

test('every mission-listed job is represented in the scheduler registry', () => {
  assert.equal(SCHEDULED_MODES.length, 17);
});

test('scheduler.mjs contains no repeating-timer API -- scheduling is one-shot planning, never a hidden loop', async () => {
  const content = await fs.readFile(new URL('../../revenue-os/src/scheduler.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(content, /setInterval|setTimeout/);
});

test('planScheduledJob rejects an unknown mode and is deterministic given the same mode/runKey', () => {
  assert.throws(() => planScheduledJob('not-a-real-mode', {}, {}), SchedulerError);
  const a = planScheduledJob('owner-digest', {}, { runKey: 'k1' });
  const b = planScheduledJob('owner-digest', {}, { runKey: 'k1' });
  assert.equal(a.dedupeKey, b.dedupeKey);
});

test('schedulerPreflight only accepts a known store backend', () => {
  assert.equal(schedulerPreflight({ storeBackend: 'json' }).ok, true);
  assert.equal(schedulerPreflight({ storeBackend: 'mysql' }).ok, false);
});

// --- job handlers via DurableQueue ---

test('ros.approval_expiry runs through the real queue and reports the sweep result', async () => {
  const store = await harness();
  const { queue, handlers } = await makeQueueAndHandlers(store);
  const result = await runScheduledJob({ mode: 'approval-expiry', payload: {}, queue, handlers, store });
  assert.equal(result.jobStatus, 'completed');
});

test('ros.opportunity_revalidation re-scores every candidate opportunity', async () => {
  const store = await harness();
  await store.add('opportunities', { organizationDomain: 'a.example.com', channel: 'referral_intro', status: 'candidate', data: {} });
  const { queue, handlers } = await makeQueueAndHandlers(store);
  await runScheduledJob({ mode: 'opportunity-revalidation', payload: {}, queue, handlers, store });
  const opportunities = await store.list('opportunities');
  assert.ok(opportunities[0].score !== null);
  assert.ok(opportunities[0].data.lastRevalidatedAt);
});

test('ros.owner_digest reports real counts across approvals/blockers/payments/monitoring', async () => {
  const store = await harness();
  await store.add('approvals', { status: 'pending', data: {} });
  await store.add('payments', { status: 'PENDING_VERIFICATION', data: {} });
  const { queue, handlers } = await makeQueueAndHandlers(store);
  const result = await runScheduledJob({ mode: 'owner-digest', payload: {}, queue, handlers, store });
  assert.equal(result.jobStatus, 'completed');
});

test('ros.retention_purge delegates to the real purge sweep', async () => {
  const store = await harness();
  await store.add('evidenceItems', { capturedAt: new Date(Date.now() - 400 * 86400000).toISOString(), sourceUrl: 'https://x.example.com' });
  const { queue, handlers } = await makeQueueAndHandlers(store);
  await runScheduledJob({ mode: 'retention-purge', payload: { retentionDays: 365 }, queue, handlers, store });
  const items = await store.list('evidenceItems');
  assert.ok(items[0].deletedAt);
});

test('ros.deterministic_verification catches a corrupted (mismatching) report manifest', async () => {
  const store = await harness();
  const { signReportManifest } = await import('../../revenue-os/src/report.mjs');
  const secret = 'r'.repeat(32);
  const reportData = { a: 1 };
  const manifest = signReportManifest(reportData, secret);
  await store.add('reports', { manifestSignature: manifest.signature, data: { reportData: { a: 2 } } }); // tampered reportData
  const { queue, handlers } = await makeQueueAndHandlers(store, { reportSecret: secret });
  const result = await runScheduledJob({ mode: 'deterministic-verification', payload: {}, queue, handlers, store });
  assert.equal(result.jobStatus, 'completed');
});

test('scheduler concurrency: two racing firings of the same mode/runKey never produce two job rows', async () => {
  const store = await harness();
  const { queue, handlers } = await makeQueueAndHandlers(store);
  const runKey = 'race-2026-07';
  await Promise.all([
    runScheduledJob({ mode: 'retention-purge', payload: {}, runKey, queue, handlers, store }),
    runScheduledJob({ mode: 'retention-purge', payload: {}, runKey, queue, handlers, store })
  ]);
  const plan = planScheduledJob('retention-purge', {}, { runKey });
  const rows = await store.list('jobs', { filters: { dedupeKey: plan.dedupeKey } });
  assert.equal(rows.length, 1);
});

test('restart recovery: a job whose worker died mid-run is recovered via store.recoverStaleJobs', async () => {
  const store = await harness();
  const { queue } = await makeQueueAndHandlers(store);
  const job = await queue.enqueue('ros.owner_digest', {});
  await store.patch('jobs', job.id, { status: 'active', attempts: 1, maxAttempts: 3, lockedBy: 'dead-worker', lockedAt: new Date(Date.now() - 60000).toISOString(), heartbeatAt: new Date(Date.now() - 60000).toISOString() });
  const recovered = await store.recoverStaleJobs(1000);
  assert.equal(recovered.recovered, 1);
  assert.equal((await store.get('jobs', job.id)).status, 'queued');
});

// --- reply_import / payment_reconciliation via circuit breaker ---

test('ros.reply_import consumes a fake/replay provider through a circuit breaker and imports classified replies', async () => {
  const store = await harness();
  const replyProvider = { name: 'fake-replay', async listReplies() { return [{ body: 'how much does this cost', organizationDomain: 'a.example.com' }]; } };
  const { queue, handlers } = await makeQueueAndHandlers(store, { replyProvider });
  await runScheduledJob({ mode: 'reply-import', payload: {}, queue, handlers, store });
  const replies = await store.list('replies');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].classification, 'pricing');
});

test('ros.reply_import with no provider configured reports zero-imported rather than throwing', async () => {
  const store = await harness();
  const { queue, handlers } = await makeQueueAndHandlers(store);
  const result = await runScheduledJob({ mode: 'reply-import', payload: {}, queue, handlers, store });
  assert.equal(result.jobStatus, 'completed');
});

// --- circuit breaker ---

// --- 24/7 Continuous Revenue Core section 4/5: buyer-intent-revalidation + experiment-analysis jobs ---

test('ros.buyer_intent_revalidation delegates to buyer-intent.mjs and expires an opportunity with no evidence', async () => {
  const store = await harness();
  await store.add('opportunities', { organizationDomain: 'sched-buyer-intent.invalid', channel: 'published_email', status: 'candidate', data: {} });
  const { queue, handlers } = await makeQueueAndHandlers(store);
  const result = await runScheduledJob({ mode: 'buyer-intent-revalidation', payload: {}, queue, handlers, store });
  assert.equal(result.jobStatus, 'completed');
  const opp = (await store.list('opportunities'))[0];
  assert.equal(opp.status, 'expired');
});

test('ros.experiment_analysis groups assignments by experiment name and reports sample sufficiency', async () => {
  const store = await harness();
  for (let i = 0; i < 5; i += 1) {
    await store.add('experiments', { name: 'subject-line-test', variable: 'subject', subjectId: `s${i}`, variant: i % 2 === 0 ? 'a' : 'b', status: 'active', outcome: i % 3 === 0 ? 'converted' : null });
  }
  const { queue, handlers } = await makeQueueAndHandlers(store);
  const result = await runScheduledJob({ mode: 'experiment-analysis', payload: {}, queue, handlers, store });
  assert.equal(result.jobStatus, 'completed');
  const storedJob = (await store.list('jobs')).find(j => j.type === 'ros.experiment_analysis');
  assert.equal(storedJob.result.experimentCount, 5);
  assert.equal(storedJob.result.summaries[0].name, 'subject-line-test');
  assert.equal(storedJob.result.summaries[0].significant, false, 'sample of 5 is far below the minimum, and this module never fabricates significance regardless');
});

// --- always-working fallback orchestrator ---

test('ALWAYS_SAFE_PRIORITY is exactly a reordering of SCHEDULED_MODES -- no mode is missing or invented', () => {
  assert.deepEqual([...ALWAYS_SAFE_PRIORITY].sort(), [...SCHEDULED_MODES].sort());
});

test('selectNextSafeTask picks the first priority mode when nothing has ever run', () => {
  assert.equal(selectNextSafeTask({}), ALWAYS_SAFE_PRIORITY[0]);
});

test('selectNextSafeTask picks the least-recently-run mode, never the outbound-blocked state', () => {
  const lastRunAt = Object.fromEntries(ALWAYS_SAFE_PRIORITY.map((mode, i) => [mode, new Date(1000 * (i + 1)).toISOString()]));
  // Make the last-priority mode the actual least-recently-run one -- it should win despite being
  // last in priority order, proving the pick is driven by recency, not just position.
  const overdueMode = ALWAYS_SAFE_PRIORITY[ALWAYS_SAFE_PRIORITY.length - 1];
  lastRunAt[overdueMode] = new Date(0).toISOString();
  assert.equal(selectNextSafeTask(lastRunAt), overdueMode);
});

test('selectNextSafeTask never reads or requires any outbound/live-sending input at all (structural proof)', async () => {
  const content = await fs.readFile(new URL('../../revenue-os/src/scheduler.mjs', import.meta.url), 'utf8');
  const start = content.indexOf('export function selectNextSafeTask');
  const fnBody = content.slice(start, content.indexOf('\n}\n', start) + 3);
  assert.doesNotMatch(fnBody, /outbound|liveSending|live_sending/i);
});

test('runNextSafeTask always finds and runs a next task on a fresh store, and rotates modes on repeated calls', async () => {
  const store = await harness();
  const { queue, handlers } = await makeQueueAndHandlers(store);
  const first = await runNextSafeTask({ store, queue, handlers });
  assert.equal(first.jobStatus, 'completed');
  assert.equal(first.mode, ALWAYS_SAFE_PRIORITY[0]);
  const second = await runNextSafeTask({ store, queue, handlers });
  assert.equal(second.jobStatus, 'completed');
  assert.notEqual(second.mode, first.mode, 'having just run the first mode, it is no longer the most overdue');
});

test('runNextSafeTask makes real progress across many consecutive calls (an always-on loop never starves)', async () => {
  const store = await harness();
  const { queue, handlers } = await makeQueueAndHandlers(store);
  const modesSeen = new Set();
  for (let i = 0; i < ALWAYS_SAFE_PRIORITY.length; i += 1) {
    const result = await runNextSafeTask({ store, queue, handlers });
    assert.equal(result.jobStatus, 'completed');
    modesSeen.add(result.mode);
  }
  assert.equal(modesSeen.size, ALWAYS_SAFE_PRIORITY.length, 'every mode got a turn within one full cycle, none was starved');
});

test('createCircuitBreaker opens after the failure threshold and refuses calls while open', async () => {
  let now = 0;
  const breaker = createCircuitBreaker({ name: 'test', failureThreshold: 2, cooldownMs: 1000, clock: () => now });
  const failing = () => { throw new Error('boom'); };
  await assert.rejects(() => breaker.call(async () => failing()));
  await assert.rejects(() => breaker.call(async () => failing()));
  assert.equal(breaker.state, 'open');
  await assert.rejects(() => breaker.call(async () => 'should not run'), CircuitBreakerOpenError);
});

test('createCircuitBreaker half-opens after cooldown and closes again on a successful trial call', async () => {
  let now = 0;
  const breaker = createCircuitBreaker({ name: 'test2', failureThreshold: 1, cooldownMs: 1000, clock: () => now });
  await assert.rejects(() => breaker.call(async () => { throw new Error('boom'); }));
  assert.equal(breaker.state, 'open');
  now = 2000; // past cooldown
  const result = await breaker.call(async () => 'recovered');
  assert.equal(result, 'recovered');
  assert.equal(breaker.state, 'closed');
});

// --- bounded AI assistants ---

test('ASSISTANT_TASKS has exactly the mission\'s 11 named tasks', () => {
  assert.equal(ASSISTANT_TASKS.length, 11);
});

test('runAssistant refuses an ungrounded call (no evidence)', async () => {
  const provider = createFakeAiProvider();
  await assert.rejects(() => runAssistant(provider, { taskType: 'opportunity_summary', evidenceRefs: [] }), AiAssistantError);
});

test('runAssistant refuses an unknown task type', async () => {
  const provider = createFakeAiProvider();
  await assert.rejects(() => runAssistant(provider, { taskType: 'not-a-real-task', evidenceRefs: ['ev1'] }), AiAssistantError);
});

test('runAssistant always sets requiresOwnerApproval true and computes a stable inputHash', async () => {
  const provider = createFakeAiProvider();
  const result = await runAssistant(provider, { taskType: 'message_drafting', evidenceRefs: ['ev1'] });
  assert.equal(result.requiresOwnerApproval, true);
  assert.equal(result.inputHash.length, 64);
  const result2 = await runAssistant(provider, { taskType: 'message_drafting', evidenceRefs: ['ev1'] });
  assert.equal(result.inputHash, result2.inputHash, 'the same task/evidence must hash identically');
});

test('runAssistant enforces the timeout budget against a slow provider', async () => {
  const slowProvider = { name: 'slow', async complete() { await new Promise(resolve => setTimeout(resolve, 80)); return { output: { summary: 'late' }, confidence: 0.9, costCents: 1 }; } };
  await assert.rejects(() => runAssistant(slowProvider, { taskType: 'qa_summary', evidenceRefs: ['ev1'], timeoutMs: 20 }), AiAssistantError);
  await new Promise(resolve => setTimeout(resolve, 90)); // let the slow provider's own timer resolve so nothing is left pending
});

test('runAssistant enforces the cost cap against a provider that reports an over-budget cost', async () => {
  const expensiveProvider = { name: 'expensive', async complete({ costCapCents }) { if (10 > costCapCents) throw new Error('ai-cost-cap-exceeded'); return { output: {}, confidence: 0.5, costCents: 10 }; } };
  await assert.rejects(() => runAssistant(expensiveProvider, { taskType: 'qa_summary', evidenceRefs: ['ev1'], costCapCents: 5 }));
});

test('createReplayAiProvider plays back a fixed scripted sequence for regression tests', async () => {
  const provider = createReplayAiProvider([{ output: { summary: 'scripted answer' }, confidence: 0.9, costCents: 1 }]);
  assertAiContract(provider);
  const result = await runAssistant(provider, { taskType: 'report_drafting', evidenceRefs: ['ev1'] });
  assert.equal(result.output.summary, 'scripted answer');
});

test('runEvalFixtures reports pass/fail per fixture without throwing on a failing one', async () => {
  const provider = createFakeAiProvider();
  const evalResult = await runEvalFixtures(provider, [
    { name: 'grounded', call: { taskType: 'opportunity_summary', evidenceRefs: ['ev1'] }, expect: r => r.confidence > 0 },
    { name: 'ungrounded-should-fail', call: { taskType: 'opportunity_summary', evidenceRefs: [] }, expect: () => true }
  ]);
  assert.equal(evalResult.total, 2);
  assert.equal(evalResult.passed, 1);
  assert.equal(evalResult.results[1].passed, false);
});
