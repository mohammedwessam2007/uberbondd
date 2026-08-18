import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  compileTaskBlueprint,
  compileTrigger,
  evaluateTaskPolicy,
  computeTaskPriority,
  compileDependencyEdge,
  generateTaskInstances,
  evaluateTaskResult,
  createTaskReceipt,
  createLearningEvent,
  logTaskUniverseReceipt,
  TASK_UNIVERSE_POLICY_VERSION
} from '../src/task-universe.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const referenceDate = new Date('2026-08-18T12:00:00.000Z');

function blueprint(overrides = {}) {
  return compileTaskBlueprint({
    id: 'evidence.review', version: '2.0.0', purpose: 'Review a supplied evidence packet locally',
    inputs: ['evidenceRef'], outputs: ['reviewRef'],
    evaluator: { requiredOutputs: ['reviewRef'] },
    retryStrategy: { maxAttempts: 4, backoffMs: 1000, maxBackoffMs: 5000 },
    ownerBurden: { minutes: 2, reason: 'only if a contradiction needs review' },
    costCeiling: { amountCents: 10, currency: 'USD' },
    policy: { consequenceClass: 'LOCAL_PREPARATION' },
    date: referenceDate, ...overrides
  });
}

function trigger(overrides = {}) {
  return compileTrigger({
    triggerId: 'signal-trigger-1', type: 'EVENT', observedAt: referenceDate.toISOString(),
    sourceRef: 'signal:sig-1', eventRef: 'event-1', date: referenceDate, ...overrides
  });
}

test('blueprint compilation keeps unknown economics explicit and caps retries', () => {
  const result = compileTaskBlueprint({ id: 'task.one', purpose: 'Do one local thing', retryStrategy: { maxAttempts: 999 }, date: referenceDate });
  assert.equal(result.ok, true);
  assert.equal(result.costCeiling.status, 'UNKNOWN');
  assert.equal(result.ownerBurden.minutes, null);
  assert.equal(result.retryStrategy.maxAttempts, 20);
  assert.equal(result.policy.consequenceClass, 'LOCAL_PREPARATION');
});

test('malformed blueprints and external-effect policies fail closed', () => {
  assert.equal(compileTaskBlueprint({ purpose: 'missing id', date: referenceDate }).ok, false);
  assert.equal(compileTaskBlueprint({ id: 'x', date: referenceDate }).ok, false);
  const external = blueprint({ policy: { consequenceClass: 'LOCAL_PREPARATION', externalEffects: ['send'] } });
  assert.equal(external.ok, true);
  const decision = evaluateTaskPolicy({ blueprint: external, trigger: trigger(), entity: { id: 'e1' }, date: referenceDate });
  assert.equal(decision.decision, 'DENY');
  assert.ok(decision.reasonCodes.includes('external-effects-disabled'));
});

test('trigger validation rejects unknown types and invalid timestamps', () => {
  assert.equal(compileTrigger({ triggerId: 'x', type: 'MAGIC', date: referenceDate }).ok, false);
  const invalid = compileTrigger({ triggerId: 'x', type: 'EVENT', observedAt: 'not-a-date', date: referenceDate });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.reasonCodes.includes('invalid-trigger-time'));
});

test('priority formula is explainable and unknown inputs never become a guessed rank', () => {
  const unknown = computeTaskPriority({ expectedGrossProfit: 100, probability: 0.5 });
  assert.equal(unknown.score, null);
  assert.equal(unknown.status, 'UNKNOWN');
  assert.ok(unknown.missing.includes('ownerBurden'));
  const measured = computeTaskPriority({ expectedGrossProfit: 1000, probability: 0.5, urgency: 2, strategicMultiplier: 1.5, cost: 20, riskPenalty: 10, ownerBurden: 5 });
  assert.equal(measured.score, 1465);
  assert.equal(measured.status, 'EXPLAINABLE');
});

test('local policy allows preparation, owner-required policy becomes review, and synthetic triggers stay blocked', () => {
  const local = evaluateTaskPolicy({ blueprint: blueprint(), trigger: trigger(), entity: { id: 'e1' }, date: referenceDate });
  assert.equal(local.decision, 'ALLOW_LOCAL_PREPARATION');
  const owner = evaluateTaskPolicy({ blueprint: blueprint({ policy: { consequenceClass: 'LOCAL_PREPARATION', requiresOwner: true } }), trigger: trigger(), entity: { id: 'e1' }, date: referenceDate });
  assert.equal(owner.decision, 'REVIEW_REQUIRED');
  const synthetic = evaluateTaskPolicy({ blueprint: blueprint(), trigger: trigger({ synthetic: true }), entity: { id: 'e1' }, date: referenceDate });
  assert.equal(synthetic.decision, 'REVIEW_REQUIRED');
  assert.ok(synthetic.reasonCodes.includes('synthetic-trigger-not-eligible'));
});

test('just-in-time generation is deterministic, bounded, and idempotent-keyed', () => {
  const input = { blueprint: blueprint(), trigger: trigger(), entities: [{ id: 'opp-1', entityType: 'OPPORTUNITY', evidenceRefs: ['ev-1'] }, { id: 'opp-2' }], evidenceRefs: ['ev-common'], maxInstances: 1, date: referenceDate };
  const a = generateTaskInstances(input);
  const b = generateTaskInstances(input);
  assert.deepEqual(a, b);
  assert.equal(a.instances.length, 1);
  assert.equal(a.requestedCount, 2);
  assert.equal(a.boundedCount, 1);
  assert.equal(a.instances[0].state, 'READY');
  assert.equal(a.instances[0].evaluator.requiredOutputs[0], 'reviewRef');
  assert.match(a.instances[0].idempotencyKey, /^task:evidence\.review:2\.0\.0:opp-1:/);
  assert.equal(a.externalEffectLedger.messages, 0);
});

test('ineligible entities are represented as review or blocked tasks, not silently dropped', () => {
  const result = generateTaskInstances({ blueprint: blueprint(), trigger: trigger(), entities: [{ id: 'blocked-1', policyEligible: false }], date: referenceDate });
  assert.equal(result.instances.length, 1);
  assert.equal(result.instances[0].state, 'REVIEW_REQUIRED');
  assert.ok(result.instances[0].policyDecision.reasonCodes.includes('entity-policy-ineligible'));
});

test('dependency edges are typed, deterministic, and reject self edges', () => {
  const edge = compileDependencyEdge({ fromTaskId: 'task-a', toTaskId: 'task-b', type: 'PREREQUISITE', reason: 'Evidence first', date: referenceDate });
  assert.equal(edge.ok, true);
  assert.match(edge.edgeId, /^edge_/);
  assert.equal(compileDependencyEdge({ fromTaskId: 'task-a', toTaskId: 'task-a', type: 'PREREQUISITE' }).ok, false);
  assert.equal(compileDependencyEdge({ fromTaskId: 'task-a', toTaskId: 'task-b', type: 'MAGIC' }).ok, false);
});

test('task evaluation requires the declared outputs and never advances a blocked task', () => {
  const task = generateTaskInstances({ blueprint: blueprint(), trigger: trigger(), entities: [{ id: 'opp-1' }], date: referenceDate }).instances[0];
  const missing = evaluateTaskResult({ taskInstance: task, result: { success: true }, date: referenceDate });
  assert.equal(missing.state, 'FAILED');
  assert.ok(missing.reasonCodes.includes('required-output-missing'));
  const success = evaluateTaskResult({ taskInstance: task, result: { success: true, reviewRef: 'review:1', outputRefs: ['review:1'] }, date: referenceDate });
  assert.equal(success.state, 'SUCCEEDED');
  const killed = evaluateTaskResult({ taskInstance: task, result: { success: true, kill: true }, date: referenceDate });
  assert.equal(killed.state, 'QUARANTINED');
  const blockedTask = { ...task, state: 'BLOCKED' };
  const blocked = evaluateTaskResult({ taskInstance: blockedTask, result: { success: true, reviewRef: 'x' }, date: referenceDate });
  assert.equal(blocked.ok, false);
});

test('receipts and learning events store references/digests, never raw payloads', () => {
  const receipt = createTaskReceipt({ eventType: 'TASK_TESTED', taskIds: ['task-1'], inputs: { secret: 'do-not-store' }, outputs: { outputRef: 'out-1' }, date: referenceDate });
  assert.equal(receipt.policyVersion, TASK_UNIVERSE_POLICY_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(receipt, 'secret'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(receipt, 'inputs'), false);
  const learning = createLearningEvent({ taskId: 'task-1', outcome: 'FAILED', errorClass: 'SCHEMA', repair: 'add fixture', benchmarkDelta: -0.2, date: referenceDate });
  assert.equal(learning.ok, true);
  assert.equal(learning.benchmarkDelta, -0.2);
});

test('queue handlers generate/evaluate local task contracts and reuse auditLog', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-task' }; } }, cfg: {}
  });
  const generated = await handlers['prometheus.task.generate']({ blueprint: { id: 'task.handler', purpose: 'prepare locally' }, trigger: { triggerId: 'tr-1', type: 'EVENT' }, entities: [{ id: 'e-1' }], date: referenceDate });
  assert.equal(generated.status, 'GENERATED');
  assert.equal(calls[0].type, 'task_generation');
  const evaluated = await handlers['prometheus.task.evaluate']({ taskInstance: generated.instances[0], result: { success: true }, date: referenceDate });
  assert.equal(evaluated.state, 'SUCCEEDED');
  assert.equal(calls[1].type, 'task_evaluation');
});

test('receipt logger is a no-op without a store and uses the existing writer when present', async () => {
  assert.equal(await logTaskUniverseReceipt(null, 'x', { ok: true }), null);
  const calls = [];
  const receipt = await logTaskUniverseReceipt({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'a' }; } }, 'task_generation', { ok: true });
  assert.deepEqual(receipt, { id: 'a' });
  assert.equal(calls[0].type, 'task_generation');
});

test('task-universe module has no provider, process, or filesystem boundary of its own', async () => {
  const source = await fs.readFile(new URL('../src/task-universe.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(|spawn\(|exec\(/);
});
