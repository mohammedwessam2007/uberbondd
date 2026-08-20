import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { compileUpgradeProposal } from '../src/self-upgrade.mjs';
import {
  AGENT_EVOLUTION_WAVE_POLICY_VERSION,
  compileAgentEvolutionMission,
  reviewAgentEvolutionResult,
  runBoundedAgentEvolutionWave
} from '../src/agent-evolution-wave.mjs';

const DATE = new Date('2026-08-20T01:30:00Z');
const ZERO = {
  providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
  credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
};

function proposal(overrides = {}) {
  return compileUpgradeProposal({
    problem: 'Close the bounded proposal-to-worker-to-review loop.',
    evidenceRefs: ['test:agent-evolution-wave'],
    expectedEconomicEffect: { expectedOwnerMinutesSaved: 30, confidence: 0.6 },
    buildCost: { engineeringMinutes: 90, computeCents: 0 },
    risk: { level: 'LOW', categories: ['local-only'] },
    affectedCapabilities: ['agent-relay', 'self-upgrade'],
    acceptanceCriteria: ['npm run check passes'],
    rollbackPlan: 'Revert the isolated commit.',
    date: DATE,
    ...overrides
  });
}

function bundle(overrides = {}) {
  return compileAgentEvolutionMission({
    proposal: proposal(),
    requiredTests: ['npm run check'],
    acceptanceGate: ['zero failures'],
    date: DATE,
    ...overrides
  });
}

function result(overrides = {}) {
  return {
    outcome: 'Bounded local implementation completed.',
    changedArtifacts: ['src/example.mjs', 'tests/example.test.mjs'],
    testsActuallyRun: [{ command: 'npm run check', result: 'PASS', total: 1108, passed: 1066, failed: 0, skipped: 42 }],
    truthTable: { implementation: 'PASS_LOCAL', liveExecution: 'NOT_RUN' },
    externalEffectLedger: { ...ZERO },
    decision: 'PROCEED',
    ...overrides
  };
}

function receipt(taskId, overrides = {}) {
  return {
    ok: true,
    status: 'RESULT_RECEIVED',
    resultStatus: 'COMPLETED',
    task: { taskId },
    result: result(),
    externalEffectLedger: { ...ZERO },
    ...overrides
  };
}

test('mission deterministically composes the canonical proposal, engineering packet, and AgentTask', () => {
  const first = bundle();
  const second = bundle();
  assert.equal(first.ok, true);
  assert.equal(first.waveId, second.waveId);
  assert.equal(first.mission.missionId, second.mission.missionId);
  assert.equal(first.task.taskId, second.task.taskId);
  assert.equal(first.task.parentTask, first.proposal.proposalId);
  assert.equal(first.task.originAgent, 'chatgpt');
  assert.equal(first.task.targetAgent, 'claude-code');
  assert.equal(first.task.consequenceClass, 'LOCAL_PREPARATION');
  assert.equal(first.task.authority, 'LOCAL_PREPARATION');
  assert.equal(first.promotion, 'BLOCKED');
});

test('mission carries scope, acceptance tests, zero cost, and mandatory forbidden actions', () => {
  const compiled = bundle({ repositoryScope: ['src/', 'tests/'], budget: { maxTokens: 1000, maxCostCents: 0 } });
  assert.deepEqual(compiled.mission.repositoryScope, ['src/', 'tests/']);
  assert.deepEqual(compiled.task.acceptanceTests, ['npm run check']);
  assert.equal(compiled.task.budget.maxTokens, 1000);
  assert.equal(compiled.task.budget.maxCostCents, 0);
  for (const action of ['deploy', 'push', 'merge', 'send', 'spend', 'change-credentials', 'change-dns', 'mutate-production']) {
    assert.ok(compiled.task.forbiddenActions.includes(action));
  }
});

test('mission rejects missing proposal, protected-only scope, absent tests, and absent gates', () => {
  assert.equal(compileAgentEvolutionMission({ requiredTests: ['x'], acceptanceGate: ['y'], date: DATE }).ok, false);
  assert.equal(bundle({ repositoryScope: ['lite/'] }).ok, false);
  assert.equal(bundle({ requiredTests: [] }).ok, false);
  assert.equal(bundle({ acceptanceGate: [] }).ok, false);
});

test('mission rejects unbounded or nonzero-cost budgets', () => {
  for (const budget of [
    {}, { maxTokens: 0, maxCostCents: 0 }, { maxTokens: 200001, maxCostCents: 0 },
    { maxTokens: 1000, maxCostCents: 1 }, { maxTokens: 1.5, maxCostCents: 0 }
  ]) assert.equal(bundle({ budget }).ok, false);
});

test('a fully matching receipt becomes SHADOW_READY but never promotion authority', () => {
  const compiled = bundle();
  const reviewed = reviewAgentEvolutionResult({ bundle: compiled, relayReceipt: receipt(compiled.task.taskId), date: DATE });
  assert.equal(reviewed.ok, true);
  assert.equal(reviewed.status, 'SHADOW_READY');
  assert.deepEqual(reviewed.reasonCodes, []);
  assert.equal(reviewed.testSummary.reportedTotal, 1108);
  assert.equal(reviewed.testSummary.total, 1066);
  assert.equal(reviewed.testSummary.skipped, 42);
  assert.equal(reviewed.gate.status, 'SHADOW_READY');
  assert.equal(reviewed.promotion.status, 'PROMOTION_BLOCKED');
  assert.equal(reviewed.promotion.authority, 'OWNER_REQUIRED');
  assert.equal(reviewed.dispute, null);
});

test('review binds the task identity before trusting any result', () => {
  const compiled = bundle();
  const reviewed = reviewAgentEvolutionResult({ bundle: compiled, relayReceipt: receipt('different-task'), date: DATE });
  assert.equal(reviewed.ok, false);
  assert.deepEqual(reviewed.reasonCodes, ['relay-task-identity-mismatch']);
});

test('missing required test contradicts worker PROCEED and creates a bounded dispute', () => {
  const compiled = bundle();
  const reviewed = reviewAgentEvolutionResult({
    bundle: compiled,
    relayReceipt: receipt(compiled.task.taskId, { result: result({ testsActuallyRun: [{ command: 'npm audit', result: 'PASS' }] }) }),
    date: DATE
  });
  assert.equal(reviewed.status, 'REPAIR_REQUIRED');
  assert.ok(reviewed.reasonCodes.includes('required-test-missing:npm run check'));
  assert.equal(reviewed.dispute.ok, true);
  assert.equal(reviewed.dispute.maxRounds, 2);
  assert.deepEqual(reviewed.dispute.disagreements.map(item => item.agent), ['claude-code', 'chatgpt-reviewer']);
});

test('failed required test cannot be converted into a pass by worker prose', () => {
  const compiled = bundle();
  const reviewed = reviewAgentEvolutionResult({
    bundle: compiled,
    relayReceipt: receipt(compiled.task.taskId, { result: result({ testsActuallyRun: [{ command: 'npm run check', result: 'FAIL', failed: 1 }] }) }),
    date: DATE
  });
  assert.equal(reviewed.status, 'REPAIR_REQUIRED');
  assert.ok(reviewed.reasonCodes.includes('required-test-not-passing:npm run check'));
  assert.ok(reviewed.reasonCodes.includes('test-receipt-reports-failure'));
});

test('out-of-scope and protected paths are rejected independently', () => {
  const compiled = bundle();
  const outside = reviewAgentEvolutionResult({
    bundle: compiled,
    relayReceipt: receipt(compiled.task.taskId, { result: result({ changedArtifacts: ['worker.mjs'] }) }),
    date: DATE
  });
  assert.ok(outside.reasonCodes.includes('changed-artifact-outside-mission-scope'));
  const protectedResult = reviewAgentEvolutionResult({
    bundle: compiled,
    relayReceipt: receipt(compiled.task.taskId, { result: result({ changedArtifacts: ['lite/api/health.mjs'] }) }),
    date: DATE
  });
  assert.ok(protectedResult.reasonCodes.includes('protected-lite-path-reported'));
});

test('absolute and traversal paths fail closed', () => {
  const compiled = bundle();
  for (const changedArtifacts of [['/etc/passwd'], ['src/../lite/secret.mjs']]) {
    const reviewed = reviewAgentEvolutionResult({
      bundle: compiled,
      relayReceipt: receipt(compiled.task.taskId, { result: result({ changedArtifacts }) }),
      date: DATE
    });
    assert.ok(reviewed.reasonCodes.includes('changed-artifact-path-invalid'));
  }
});

test('nonzero effect and secret-bearing worker results are rejected by the canonical validator', () => {
  const compiled = bundle();
  const nonzero = reviewAgentEvolutionResult({
    bundle: compiled,
    relayReceipt: receipt(compiled.task.taskId, { result: result({ externalEffectLedger: { ...ZERO, deployments: 1 } }) }),
    date: DATE
  });
  assert.equal(nonzero.ok, false);
  assert.ok(nonzero.reasonCodes.includes('worker-nonzero-external-effect-ledger-rejected'));
  const secret = reviewAgentEvolutionResult({
    bundle: compiled,
    relayReceipt: receipt(compiled.task.taskId, { result: result({ apiToken: 'hidden-value' }) }),
    date: DATE
  });
  assert.equal(secret.ok, false);
  assert.ok(secret.reasonCodes.includes('worker-secret-like-result-rejected'));
});

test('FAILED result status and invalid decisions remain repair-required', () => {
  const compiled = bundle();
  const reviewed = reviewAgentEvolutionResult({
    bundle: compiled,
    relayReceipt: receipt(compiled.task.taskId, { resultStatus: 'FAILED', result: result({ decision: 'MAYBE' }) }),
    date: DATE
  });
  assert.equal(reviewed.status, 'REPAIR_REQUIRED');
  assert.ok(reviewed.reasonCodes.includes('worker-result-not-completed'));
  assert.ok(reviewed.reasonCodes.includes('worker-decision-invalid'));
});

test('worker REPAIR is respected without opening an artificial disagreement', () => {
  const compiled = bundle();
  const reviewed = reviewAgentEvolutionResult({
    bundle: compiled,
    relayReceipt: receipt(compiled.task.taskId, { result: result({ decision: 'REPAIR' }) }),
    date: DATE
  });
  assert.equal(reviewed.status, 'REPAIR_REQUIRED');
  assert.ok(reviewed.reasonCodes.includes('worker-requested-repair'));
  assert.equal(reviewed.dispute, null);
});

test('runner rejects a missing relay client before compiling or writing', async () => {
  const run = await runBoundedAgentEvolutionWave({ proposal: proposal(), mission: { requiredTests: ['npm run check'], acceptanceGate: ['zero failures'] }, date: DATE });
  assert.equal(run.ok, false);
  assert.deepEqual(run.reasonCodes, ['configured-relay-client-required']);
});

test('non-READY health blocks enqueue and records one compact receipt', async () => {
  let creates = 0;
  const logs = [];
  const run = await runBoundedAgentEvolutionWave({
    proposal: proposal(), mission: { requiredTests: ['npm run check'], acceptanceGate: ['zero failures'] },
    relayClient: {
      health: async () => ({ ok: false, status: 'NOT_CONFIGURED', reasonCodes: ['relay-not-configured'] }),
      createTask: async () => { creates += 1; }, waitForResult: async () => ({})
    },
    store: { log: async (type, detail) => { logs.push({ type, detail }); return { id: 'audit-1' }; } }, date: DATE
  });
  assert.equal(run.status, 'BLOCKED');
  assert.equal(creates, 0);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].type, 'agent_evolution_wave');
  assert.equal(logs[0].detail.externalEffectLedger.deployments, 0);
});

test('queue failure prevents polling', async () => {
  let polls = 0;
  const run = await runBoundedAgentEvolutionWave({
    proposal: proposal(), mission: { requiredTests: ['npm run check'], acceptanceGate: ['zero failures'] },
    relayClient: {
      health: async () => ({ ok: true, status: 'READY' }),
      createTask: async () => ({ ok: false, reasonCodes: ['queue-failed'] }),
      waitForResult: async () => { polls += 1; }
    }, date: DATE
  });
  assert.equal(run.status, 'BLOCKED');
  assert.equal(polls, 0);
});

test('pending result returns after the injected bounded poll without another enqueue', async () => {
  let creates = 0;
  let waits = 0;
  let observedPoll;
  const run = await runBoundedAgentEvolutionWave({
    proposal: proposal(), mission: { requiredTests: ['npm run check'], acceptanceGate: ['zero failures'] },
    relayClient: {
      health: async () => ({ ok: true, status: 'READY' }),
      createTask: async task => { creates += 1; return { ok: true, issueNumber: 55, taskId: task.taskId }; },
      waitForResult: async input => { waits += 1; observedPoll = input; return { ok: false, status: 'PENDING', polls: 3, reasonCodes: ['result-not-received-within-poll-bound'] }; }
    }, poll: { maxPolls: 3, pollIntervalMs: 25 }, date: DATE
  });
  assert.equal(run.status, 'PENDING');
  assert.equal(creates, 1);
  assert.equal(waits, 1);
  assert.equal(observedPoll.maxPolls, 3);
  assert.equal(run.polls, 3);
});

test('successful runner performs exactly health, one enqueue, one bounded wait, one review, and one audit write', async () => {
  const calls = [];
  const logs = [];
  let queuedTask;
  const relayClient = {
    health: async () => { calls.push('health'); return { ok: true, status: 'READY' }; },
    createTask: async task => { calls.push('create'); queuedTask = task; return { ok: true, issueNumber: 77, taskId: task.taskId }; },
    waitForResult: async input => {
      calls.push('wait');
      return receipt(input.expectedTaskId);
    }
  };
  const run = await runBoundedAgentEvolutionWave({
    proposal: proposal(), mission: { requiredTests: ['npm run check'], acceptanceGate: ['zero failures'] },
    relayClient,
    store: { log: async (type, detail) => { logs.push({ type, detail }); return { id: 'audit-ok' }; } },
    poll: { maxPolls: 2, pollIntervalMs: 25 }, date: DATE
  });
  assert.deepEqual(calls, ['health', 'create', 'wait']);
  assert.equal(run.status, 'SHADOW_READY');
  assert.equal(run.issueNumber, 77);
  assert.equal(queuedTask.consequenceClass, 'LOCAL_PREPARATION');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].detail.status, 'SHADOW_READY');
  assert.equal(logs[0].detail.promotion.status, 'PROMOTION_BLOCKED');
});

test('runner never treats worker completion as economic proof or production promotion', async () => {
  let task;
  const run = await runBoundedAgentEvolutionWave({
    proposal: proposal(), mission: { requiredTests: ['npm run check'], acceptanceGate: ['zero failures'] },
    relayClient: {
      health: async () => ({ ok: true, status: 'READY' }),
      createTask: async value => { task = value; return { ok: true, issueNumber: 1 }; },
      waitForResult: async () => receipt(task.taskId)
    }, date: DATE
  });
  assert.equal(run.review.promotion.economicProof, 'NOT_INFERRED');
  assert.equal(run.review.promotion.authority, 'OWNER_REQUIRED');
  assert.deepEqual(run.externalEffectLedger, ZERO);
});

test('module has no model SDK, credential lookup, filesystem mutation, process execution, scheduler, or deployment boundary', async () => {
  const source = await fs.readFile(new URL('../src/agent-evolution-wave.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /process\.env|child_process|spawn\(|execFile|writeFile|appendFile|openai|anthropic|setInterval|deployTo|vercel/i);
  assert.match(source, /compileEngineeringMissionPacket/);
  assert.match(source, /compileAgentTask/);
  assert.match(source, /compileDisputePacket/);
});

test('policy version and all returned ledgers remain explicit and zero', () => {
  const compiled = bundle();
  assert.equal(compiled.policyVersion, AGENT_EVOLUTION_WAVE_POLICY_VERSION);
  assert.deepEqual(compiled.externalEffectLedger, ZERO);
  assert.deepEqual(compiled.task.externalEffectLedger, ZERO);
  assert.deepEqual(compiled.mission.externalEffectLedger, ZERO);
});
