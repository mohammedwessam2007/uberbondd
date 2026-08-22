import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createComputeBudget,
  reserveCompute,
  commitCompute,
  releaseCompute,
  computeBudgetSummary
} from '../src/ai-compute-budget.mjs';
import {
  normalizeModelBenchmark,
  routeModel
} from '../src/agent-model-router.mjs';
import {
  compileAutonomySession,
  compileTaskIntent,
  registerTaskIntent,
  ingestAgentResult,
  runAutonomyLoop,
  buildAutonomyMorningSummary
} from '../src/agent-autonomy-loop.mjs';
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

test('paid compute requires explicit authorization and provider allowlist', () => {
  assert.equal(createComputeBudget({ totalCostCents: 100, totalTokens: 1000 }).ok, false);
  assert.equal(createComputeBudget({ totalCostCents: 100, totalTokens: 1000, allowPaidCompute: true }).ok, false);
  const budget = createComputeBudget({ totalCostCents: 100, totalTokens: 1000, allowPaidCompute: true, allowedProviders: ['openai'] });
  assert.equal(budget.ok, true);
  assert.equal(reserveCompute({ budget, taskId: 't1', provider: 'anthropic', costCeilingCents: 10, tokenCeiling: 100 }).ok, false);
});

test('compute reservations never authorize business-world effects', () => {
  const budget = createComputeBudget({ totalCostCents: 100, totalTokens: 1000, allowPaidCompute: true, allowedProviders: ['openai'] });
  const reserved = reserveCompute({ budget, taskId: 't1', provider: 'openai', model: 'gpt', costCeilingCents: 20, tokenCeiling: 200 });
  assert.equal(reserved.ok, true);
  assert.equal(reserved.budget.businessEffectAuthority, 'NONE');
  const committed = commitCompute({ budget: reserved.budget, taskId: 't1', actualCostCents: 15, actualTokens: 150 });
  assert.equal(committed.ok, true);
  const summary = computeBudgetSummary(committed.budget);
  assert.equal(summary.committedCostCents, 15);
  assert.equal(summary.businessEffectAuthority, 'NONE');
});

test('compute reservation cannot exceed ceiling', () => {
  const budget = createComputeBudget({ totalCostCents: 50, totalTokens: 100, allowPaidCompute: true, allowedProviders: ['openai'] });
  const reserved = reserveCompute({ budget, taskId: 't1', provider: 'openai', costCeilingCents: 40, tokenCeiling: 80 });
  assert.equal(reserved.ok, true);
  assert.equal(reserveCompute({ budget: reserved.budget, taskId: 't2', provider: 'openai', costCeilingCents: 20, tokenCeiling: 10 }).ok, false);
});

test('released compute returns reservation capacity', () => {
  const budget = createComputeBudget({ totalCostCents: 50, totalTokens: 100, allowPaidCompute: true, allowedProviders: ['openai'] });
  const reserved = reserveCompute({ budget, taskId: 't1', provider: 'openai', costCeilingCents: 40, tokenCeiling: 80 });
  const released = releaseCompute({ budget: reserved.budget, taskId: 't1' });
  assert.equal(released.ok, true);
  const summary = computeBudgetSummary(released.budget);
  assert.equal(summary.availableCostCents, 50);
  assert.equal(summary.availableTokens, 100);
});

test('model router exploits evidence-backed best model', () => {
  const candidates = [
    { provider: 'openai', model: 'gpt-a', taskClasses: ['research'] },
    { provider: 'anthropic', model: 'claude-b', taskClasses: ['research'] }
  ];
  const benchmarks = [
    normalizeModelBenchmark({ ...candidates[0], taskClass: 'research', quality: .9, reliability: .9, latencyScore: .7, economicImpact: .8, evidenceConfidence: .9, costEfficiency: .8 }),
    normalizeModelBenchmark({ ...candidates[1], taskClass: 'research', quality: .7, reliability: .8, latencyScore: .8, economicImpact: .6, evidenceConfidence: .9, costEfficiency: .9 })
  ];
  const routed = routeModel({ taskClass: 'research', candidates, benchmarks, explorationRate: 0, random: () => 1 });
  assert.equal(routed.ok, true);
  assert.equal(routed.selected.model, 'gpt-a');
  assert.equal(routed.mode, 'EXPLOIT');
});

test('model router can reserve bounded exploration for unbenchmarked model', () => {
  const candidates = [
    { provider: 'openai', model: 'gpt-a', taskClasses: ['coding'] },
    { provider: 'anthropic', model: 'claude-new', taskClasses: ['coding'] }
  ];
  const benchmarks = [
    normalizeModelBenchmark({ ...candidates[0], taskClass: 'coding', quality: .8, reliability: .9, latencyScore: .7, economicImpact: .7, evidenceConfidence: .9, costEfficiency: .8 })
  ];
  const values = [0, 0];
  const routed = routeModel({ taskClass: 'coding', candidates, benchmarks, explorationRate: .2, random: () => values.shift() ?? 0 });
  assert.equal(routed.ok, true);
  assert.equal(routed.mode, 'EXPLORE');
  assert.equal(routed.selected.model, 'claude-new');
});

test('autonomy session requires two agents and bounded resources', () => {
  assert.equal(compileAutonomySession({ objective: 'x', allowedAgents: ['chatgpt'] }).ok, false);
  assert.equal(compileAutonomySession({ objective: 'x', allowedAgents: ['chatgpt', 'claude-code'], maxTasks: 1000 }).ok, false);
  const session = compileAutonomySession({ objective: 'Build and review the safest useful change', allowedAgents: ['chatgpt', 'claude-code'] });
  assert.equal(session.ok, true);
});

test('autonomy rejects self-directed task', () => {
  const session = compileAutonomySession({ objective: 'x' });
  const intent = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'chatgpt', objective: 'research', acceptanceTests: ['test'] });
  assert.equal(intent.ok, false);
});

test('Claude can request research from GPT automatically', () => {
  const session = compileAutonomySession({ objective: 'Improve product' });
  const initial = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', kind: 'ENGINEERING_REQUIRED', objective: 'Implement improvement', acceptanceTests: ['npm test'] });
  const registered = registerTaskIntent({ session, intent: initial });
  assert.equal(registered.ok, true);
  const ingested = ingestAgentResult({
    session: registered.session,
    taskIntent: initial,
    result: {
      outcome: 'Need current buyer evidence',
      coordination: { action: 'RESEARCH_REQUIRED', objective: 'Research buyer evidence', acceptanceTests: ['source review'], evidenceRefs: ['doc:gap'] },
      businessEffectLedger: ZERO
    }
  });
  assert.equal(ingested.ok, true);
  assert.equal(ingested.nextIntent.targetAgent, 'chatgpt');
  assert.equal(ingested.nextIntent.originAgent, 'claude-code');
});

test('GPT can request engineering from Claude automatically', () => {
  const session = compileAutonomySession({ objective: 'Find and build opportunity' });
  const initial = compileTaskIntent({ session, originAgent: 'uberbond', targetAgent: 'chatgpt', kind: 'RESEARCH_REQUIRED', objective: 'Find best opportunity', acceptanceTests: ['evidence gate'] });
  const registered = registerTaskIntent({ session, intent: initial });
  const ingested = ingestAgentResult({
    session: registered.session,
    taskIntent: initial,
    result: {
      outcome: 'Opportunity supported',
      coordination: { action: 'ENGINEERING_REQUIRED', objective: 'Build bounded prototype', acceptanceTests: ['node --test'] },
      businessEffectLedger: ZERO
    }
  });
  assert.equal(ingested.nextIntent.targetAgent, 'claude-code');
});

test('owner-boundary actions never auto-route', () => {
  const session = compileAutonomySession({ objective: 'Improve product' });
  const initial = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', objective: 'build', acceptanceTests: ['test'] });
  const registered = registerTaskIntent({ session, intent: initial });
  const ingested = ingestAgentResult({
    session: registered.session,
    taskIntent: initial,
    result: { outcome: 'Ready to deploy', coordination: { action: 'OWNER_REVIEW_REQUIRED', summary: 'deployment approval' }, businessEffectLedger: ZERO }
  });
  assert.equal(ingested.status, 'OWNER_BOUNDARY');
  assert.equal(ingested.nextIntent, null);
  assert.equal(ingested.session.founderActionsUsed, 1);
});

test('nonzero business effect result is rejected', () => {
  const session = compileAutonomySession({ objective: 'Improve product' });
  const initial = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', objective: 'build', acceptanceTests: ['test'] });
  const registered = registerTaskIntent({ session, intent: initial });
  const ingested = ingestAgentResult({ session: registered.session, taskIntent: initial, result: { outcome: 'sent stuff', coordination: { action: 'DONE' }, businessEffectLedger: { ...ZERO, messages: 1 } } });
  assert.equal(ingested.ok, false);
});

test('duplicate followup is detected rather than creating infinite ping-pong', () => {
  const session = compileAutonomySession({ objective: 'Improve product' });
  const initial = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', objective: 'build', acceptanceTests: ['test'] });
  const registered = registerTaskIntent({ session, intent: initial });
  const first = ingestAgentResult({ session: registered.session, taskIntent: initial, result: { outcome: 'need research', coordination: { action: 'RESEARCH_REQUIRED', objective: 'same research', evidenceRefs: ['doc:x'], acceptanceTests: ['research-check'] }, businessEffectLedger: ZERO } });
  assert.equal(first.nextIntent.targetAgent, 'chatgpt');
  const registered2 = registerTaskIntent({ session: first.session, intent: first.nextIntent });
  const second = ingestAgentResult({ session: registered2.session, taskIntent: first.nextIntent, result: { outcome: 'need engineering', coordination: { action: 'ENGINEERING_REQUIRED', objective: 'build', evidenceRefs: ['doc:y'], acceptanceTests: ['build-check'] }, businessEffectLedger: ZERO } });
  const registered3 = registerTaskIntent({ session: second.session, intent: second.nextIntent });
  const third = ingestAgentResult({ session: registered3.session, taskIntent: second.nextIntent, result: { outcome: 'need research again', coordination: { action: 'RESEARCH_REQUIRED', objective: 'same research', evidenceRefs: ['doc:x'], acceptanceTests: ['research-check'] }, businessEffectLedger: ZERO } });
  assert.equal(third.status, 'LOOP_DETECTED');
  assert.equal(third.nextIntent, null);
});

test('runner performs bounded GPT to Claude to GPT conversation with injected adapters', async () => {
  const session = compileAutonomySession({ objective: 'Research then build then review', maxRounds: 6, maxTasks: 6 });
  const initial = compileTaskIntent({ session, originAgent: 'uberbond', targetAgent: 'chatgpt', objective: 'Research opportunity', acceptanceTests: ['evidence'] });
  const outputs = {
    chatgpt: [
      { outcome: 'research complete', coordination: { action: 'ENGINEERING_REQUIRED', objective: 'build prototype', acceptanceTests: ['tests'] }, businessEffectLedger: ZERO },
      { outcome: 'review passes', coordination: { action: 'DONE', summary: 'done' }, businessEffectLedger: ZERO }
    ],
    'claude-code': [
      { outcome: 'prototype built', coordination: { action: 'REVIEW_REQUIRED', objective: 'review implementation', acceptanceTests: ['review'] }, businessEffectLedger: ZERO }
    ]
  };
  let issue = 100;
  const adapters = {};
  for (const agent of ['chatgpt', 'claude-code']) {
    adapters[agent] = {
      createTask: async task => ({ ok: true, issueNumber: ++issue, taskId: task.taskId }),
      waitForResult: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: outputs[agent].shift() })
    };
  }
  const compileRelayTask = intent => ({ ok: true, taskId: intent.taskId, ...intent });
  const result = await runAutonomyLoop({ session, initialIntent: initial, adapters, compileRelayTask, maxSteps: 6 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.receipts.length, 3);
  assert.deepEqual(result.receipts.map(r => r.targetAgent), ['chatgpt', 'claude-code', 'chatgpt']);
});


test('invalid evidence reference is rejected before relay', () => {
  const session = compileAutonomySession({ objective: 'Improve product' });
  const intent = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', objective: 'build', acceptanceTests: ['test'], evidenceRefs: ['https://raw-untyped.example'] });
  assert.equal(intent.ok, false);
  assert.ok(intent.reasonCodes.includes('evidence-reference-format-invalid'));
});

test('safe followup without acceptance tests is bounded instead of routed', () => {
  const session = compileAutonomySession({ objective: 'Improve product' });
  const initial = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', objective: 'build', acceptanceTests: ['test'] });
  const registered = registerTaskIntent({ session, intent: initial });
  const result = ingestAgentResult({
    session: registered.session,
    taskIntent: initial,
    result: { outcome: 'need research', coordination: { action: 'RESEARCH_REQUIRED', objective: 'research this' }, businessEffectLedger: ZERO }
  });
  assert.equal(result.status, 'BOUNDED_STOP');
  assert.equal(result.nextIntent, null);
});

test('session token ceiling stops followup expansion', () => {
  const session = compileAutonomySession({ objective: 'bounded', maxTotalTokens: 60_000 });
  const initial = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', objective: 'build', acceptanceTests: ['test'], tokenBudget: 50_000 });
  const registered = registerTaskIntent({ session, intent: initial });
  const result = ingestAgentResult({
    session: registered.session,
    taskIntent: initial,
    result: { outcome: 'need research', coordination: { action: 'RESEARCH_REQUIRED', objective: 'research', acceptanceTests: ['check'], tokenBudget: 20_000 }, businessEffectLedger: ZERO }
  });
  assert.equal(result.status, 'BOUNDED_STOP');
  assert.ok(result.reasonCodes.includes('session-token-budget-exceeded'));
});

test('session round ceiling prevents endless agent debate', () => {
  const session = compileAutonomySession({ objective: 'bounded', maxRounds: 1, maxTasks: 4 });
  const initial = compileTaskIntent({ session, originAgent: 'chatgpt', targetAgent: 'claude-code', objective: 'build', acceptanceTests: ['test'] });
  const registered = registerTaskIntent({ session, intent: initial });
  const result = ingestAgentResult({
    session: registered.session,
    taskIntent: initial,
    result: { outcome: 'need research', coordination: { action: 'RESEARCH_REQUIRED', objective: 'research', acceptanceTests: ['check'] }, businessEffectLedger: ZERO }
  });
  assert.equal(result.status, 'BOUNDED_STOP');
  assert.ok(result.reasonCodes.includes('autonomy-bound-reached'));
});

test('runner supports origin-aware adapter factory for bidirectional relay clients', async () => {
  const session = compileAutonomySession({ objective: 'research and build', maxRounds: 3, maxTasks: 3 });
  const initial = compileTaskIntent({ session, originAgent: 'uberbond', targetAgent: 'chatgpt', objective: 'research', acceptanceTests: ['evidence'] });
  const calls = [];
  const outputs = [
    { outcome: 'research', coordination: { action: 'ENGINEERING_REQUIRED', objective: 'build', acceptanceTests: ['tests'] }, businessEffectLedger: ZERO },
    { outcome: 'done', coordination: { action: 'DONE' }, businessEffectLedger: ZERO }
  ];
  let issue = 200;
  const adapterFactory = async meta => {
    calls.push([meta.originAgent, meta.targetAgent]);
    return {
      createTask: async task => ({ ok: true, issueNumber: ++issue, taskId: task.taskId }),
      waitForResult: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: outputs.shift() })
    };
  };
  const result = await runAutonomyLoop({
    session,
    initialIntent: initial,
    adapterFactory,
    compileRelayTask: intent => ({ ok: true, ...intent }),
    maxSteps: 3
  });
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(calls, [['uberbond', 'chatgpt'], ['chatgpt', 'claude-code']]);
});

test('actual compute cannot exceed reserved cost or token ceiling', () => {
  const budget = createComputeBudget({ totalCostCents: 100, totalTokens: 1000, allowPaidCompute: true, allowedProviders: ['openai'] });
  const reserved = reserveCompute({ budget, taskId: 't1', provider: 'openai', costCeilingCents: 20, tokenCeiling: 200 });
  assert.equal(commitCompute({ budget: reserved.budget, taskId: 't1', actualCostCents: 21, actualTokens: 100 }).ok, false);
  assert.equal(commitCompute({ budget: reserved.budget, taskId: 't1', actualCostCents: 10, actualTokens: 201 }).ok, false);
});

test('low-confidence benchmark cannot inflate model selection score', () => {
  const candidates = [
    { provider: 'openai', model: 'high-claim', taskClasses: ['review'] },
    { provider: 'anthropic', model: 'proven', taskClasses: ['review'] }
  ];
  const benchmarks = [
    normalizeModelBenchmark({ ...candidates[0], taskClass: 'review', quality: 1, reliability: 1, latencyScore: 1, economicImpact: 1, evidenceConfidence: .1, costEfficiency: 1 }),
    normalizeModelBenchmark({ ...candidates[1], taskClass: 'review', quality: .75, reliability: .9, latencyScore: .7, economicImpact: .8, evidenceConfidence: .9, costEfficiency: .8 })
  ];
  const routed = routeModel({ taskClass: 'review', candidates, benchmarks, minimumEvidenceConfidence: .5, explorationRate: 0, random: () => 1 });
  assert.equal(routed.selected.model, 'proven');
});

test('morning summary never infers revenue from agent activity', () => {
  const session = compileAutonomySession({ objective: 'work overnight' });
  const summary = buildAutonomyMorningSummary({ session, receipts: [{ targetAgent: 'chatgpt' }, { targetAgent: 'claude-code' }] });
  assert.equal(summary.claimBoundary.commercialRevenue, 'NOT_INFERRED');
});

function fullyVerifiedCapabilities() {
  const caps = {};
  for (const name of ['durableState','scheduler','agentRelay','agentWorkers','boundedBudgets','staleRecovery','truthReceipts','killSwitch','paymentObservation','deliveryObservation','ownerEscalationQueue']) {
    caps[name] = { status: 'VERIFIED_LIVE', evidenceRefs: [`receipt:${name}`], externallyVerified: true };
  }
  return caps;
}

test('founder absence readiness requires live external proof for Kilimanjaro', () => {
  const caps = fullyVerifiedCapabilities();
  caps.scheduler.externallyVerified = false;
  const notReady = evaluateFounderAbsenceReadiness({ capabilities: caps, targetDays: 7 });
  assert.notEqual(notReady.status, 'KILIMANJARO_READY');
  assert.ok(notReady.externalProofMissing.includes('scheduler'));
});

// This assertion used to read the other way round: eleven booleans set to
// VERIFIED_LIVE certified a seven-day unattended absence. That is the whole of
// issue #83 -- a capability checklist is a statement about architecture, and
// no number of statements about architecture is a statement about time.
test('a capability checklist alone can never certify a seven-day absence', () => {
  const ready = evaluateFounderAbsenceReadiness({ capabilities: fullyVerifiedCapabilities(), targetDays: 7 });
  assert.notEqual(ready.status, 'KILIMANJARO_READY');
  assert.equal(ready.provenTier, 'LOCAL_REHEARSAL');
  assert.equal(ready.observationProof.valid, false);
  assert.ok(ready.observationProof.reasonCodes.includes('observation-start-required'));
});

test('a prospective rung is capped by the tier the receipts actually support', () => {
  const caps = fullyVerifiedCapabilities();
  // Full architecture, zero durable history: the honest answer is that the
  // architecture is there and the duration is not, not "ready for multi-day".
  const unproven = evaluateFounderAbsenceReadiness({ capabilities: caps, targetDays: 7 });
  assert.equal(unproven.status, 'ARCHITECTURE_READY_DURATION_UNPROVEN');
  assert.equal(unproven.nextTier, 'ONE_REAL_TICK');
  // The concrete missing evidence outranks the generic tier label when there
  // is one -- an operator needs "no observation window exists", not "earn the
  // next tier".
  assert.equal(unproven.nextGate, 'observation-start-required');
});
