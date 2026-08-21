import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAutonomySession,
  compileTaskIntent,
  registerTaskIntent,
  ingestAgentResult,
  runAutonomyLoop
} from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun, advanceAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { createComputeBudget, reserveCompute, validateComputeBudget } from '../src/ai-compute-budget.mjs';
import { normalizeModelBenchmark, routeModel } from '../src/agent-model-router.mjs';
import { evaluateFounderAbsenceReadiness } from '../src/founder-absence-readiness.mjs';

const ZERO = {
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  businessSpendCents: 0
};

test('nonzero canonical external-effect ledger is rejected even without business ledger', () => {
  const session = compileAutonomySession({ objective: 'Improve product' });
  const initial = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', objective: 'build', acceptanceTests: ['test'] });
  const registered = registerTaskIntent({ session, intent: initial });
  const result = ingestAgentResult({
    session: registered.session,
    taskIntent: initial,
    result: {
      outcome: 'claimed local completion',
      coordination: { action: 'DONE' },
      businessEffectLedger: ZERO,
      externalEffectLedger: { messages: 1 }
    }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('nonzero-external-effect-rejected'));
});

test('resumable pump keeps transient dispatch failure retryable without duplicate poisoning', async () => {
  const session = compileAutonomySession({ objective: 'retry safely', maxRounds: 3, maxTasks: 3 });
  const initialIntent = compileTaskIntent({ session, originAgent: 'uberbond', targetAgent: 'chatgpt', objective: 'research', acceptanceTests: ['evidence'] });
  const run = createAutonomyRun({ session, initialIntent });
  let attempts = 0;
  const adapterFactory = async () => ({
    createTask: async task => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 'PENDING', reasonCodes: ['temporary-network-failure'] };
      return { ok: true, issueNumber: 91, taskId: task.taskId };
    },
    readTask: async () => ({ ok: false, status: 'PENDING' })
  });
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const first = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  assert.equal(first.transition, 'DISPATCH_PENDING');
  assert.equal(first.run.session.tasksCreated, 0);
  const second = await advanceAutonomyRun({ run: first.run, adapterFactory, compileRelayTask });
  assert.equal(second.transition, 'DISPATCHED');
  assert.equal(second.run.session.tasksCreated, 1);
  assert.equal(attempts, 2);
});

test('one-shot runner leaves session retryable when relay queue is temporarily unavailable', async () => {
  const session = compileAutonomySession({ objective: 'retry safely', maxRounds: 3, maxTasks: 3 });
  const initial = compileTaskIntent({ session, originAgent: 'uberbond', targetAgent: 'chatgpt', objective: 'research', acceptanceTests: ['evidence'] });
  const adapterFactory = async () => ({
    createTask: async () => ({ ok: false, status: 'PENDING', reasonCodes: ['temporary-relay-unavailable'] }),
    waitForResult: async () => ({ ok: false, status: 'PENDING' })
  });
  const result = await runAutonomyLoop({
    session,
    initialIntent: initial,
    adapterFactory,
    compileRelayTask: intent => ({ ok: true, ...intent }),
    maxSteps: 2
  });
  assert.equal(result.status, 'PENDING');
  assert.equal(result.session.tasksCreated, 0);
  assert.equal(result.session.currentTaskId, null);
});

test('tampered compute counters are rejected before granting extra capacity', () => {
  const budget = createComputeBudget({ totalCostCents: 100, totalTokens: 1000, allowPaidCompute: true, allowedProviders: ['openai'] });
  const tampered = { ...budget, committedCostCents: -999999 };
  assert.equal(validateComputeBudget(tampered).ok, false);
  const result = reserveCompute({ budget: tampered, taskId: 'overflow', provider: 'openai', costCeilingCents: 100, tokenCeiling: 10 });
  assert.equal(result.ok, false);
});

test('identical compute policies receive distinct budget identities', () => {
  const a = createComputeBudget({ totalCostCents: 100, totalTokens: 1000, allowPaidCompute: true, allowedProviders: ['openai'], date: new Date('2026-08-20T00:00:00Z') });
  const b = createComputeBudget({ totalCostCents: 100, totalTokens: 1000, allowPaidCompute: true, allowedProviders: ['openai'], date: new Date('2026-08-20T00:00:00Z') });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.notEqual(a.budgetId, b.budgetId);
});

test('forged ok=true model benchmark cannot bypass normalization', () => {
  const candidates = [
    { provider: 'openai', model: 'proven', taskClasses: ['research'] },
    { provider: 'anthropic', model: 'forged', taskClasses: ['research'] }
  ];
  const good = normalizeModelBenchmark({ ...candidates[0], taskClass: 'research', quality: .8, reliability: .9, latencyScore: .8, economicImpact: .8, evidenceConfidence: .9, costEfficiency: .8 }, new Date('2026-08-20T00:00:00Z'));
  const forged = {
    ok: true,
    taskClass: 'research',
    observedAt: '2026-08-20T01:00:00Z',
    candidate: { provider: 'anthropic', model: 'forged', candidateId: 'model_not-real' },
    quality: Infinity,
    reliability: 1,
    latencyScore: 1,
    economicImpact: 1,
    evidenceConfidence: 1,
    costEfficiency: 1
  };
  const routed = routeModel({ taskClass: 'research', candidates, benchmarks: [good, forged], explorationRate: 0, random: () => 1 });
  assert.equal(routed.ok, true);
  assert.equal(routed.selected.model, 'proven');
});

test('invalid random source fails closed instead of selecting undefined model', () => {
  const candidates = [
    { provider: 'openai', model: 'a', taskClasses: ['coding'] },
    { provider: 'anthropic', model: 'b', taskClasses: ['coding'] }
  ];
  const result = routeModel({ taskClass: 'coding', candidates, benchmarks: [], explorationRate: .2, random: () => Number.NaN });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('random-source-must-return-unit-interval'));
});

test('Kilimanjaro readiness requires every required capability VERIFIED_LIVE with typed evidence', () => {
  const names = ['durableState','scheduler','agentRelay','agentWorkers','boundedBudgets','staleRecovery','truthReceipts','killSwitch','paymentObservation','deliveryObservation','ownerEscalationQueue'];
  const capabilities = Object.fromEntries(names.map(name => [name, { status: 'VERIFIED_LIVE', evidenceRefs: [`receipt:${name}`], externallyVerified: true }]));
  capabilities.boundedBudgets.status = 'TEST_VERIFIED';
  const notLive = evaluateFounderAbsenceReadiness({ capabilities, targetDays: 7 });
  assert.notEqual(notLive.status, 'KILIMANJARO_READY');
  capabilities.boundedBudgets.status = 'VERIFIED_LIVE';
  capabilities.truthReceipts.evidenceRefs = ['untyped-proof'];
  const untyped = evaluateFounderAbsenceReadiness({ capabilities, targetDays: 7 });
  assert.notEqual(untyped.status, 'KILIMANJARO_READY');
});
