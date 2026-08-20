import './autonomy-architecture.test.mjs';
import './autonomy-hardening.test.mjs';
import './autonomy-durable-pump.test.mjs';
import './autonomy-job.test.mjs';
import './agent-worker-runtime.test.mjs';
import './agent-worker-persistence.test.mjs';
import './agent-compute-store.test.mjs';
import './provider-worker.test.mjs';
import './provider-execution.test.mjs';
import './openai-agent-executor.test.mjs';
import './anthropic-agent-executor.test.mjs';
import './agent-mesh-control-plane.test.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  compileAgentTask,
  compileDisputePacket,
  resolveDisputeRound,
  logAgentRelayReceipt,
  AGENT_RELAY_POLICY_VERSION
} from '../src/agent-relay.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const date = new Date('2026-08-18T12:00:00.000Z');

function task(overrides = {}) {
  return compileAgentTask({
    objective: 'Review a bounded local patch against the economic thesis',
    originAgent: 'GPT', targetAgent: 'CLAUDE_CODE',
    contextRefs: ['mission:local-wave-1'], evidenceRefs: ['test:408-pass'],
    constraints: ['preserve lite/'], requiredOutputs: ['reviewPacket'],
    acceptanceTests: ['npm run check'], budget: { maxTokens: 10000, maxCostCents: 0 },
    consequenceClass: 'LOCAL_PREPARATION', date, ...overrides
  });
}

test('agent task requires bounded outputs/tests and canonical evidence refs', () => {
  const missing = compileAgentTask({ objective: 'x', originAgent: 'GPT', targetAgent: 'CLAUDE', date });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('required-outputs-needed'));
  assert.ok(missing.reasonCodes.includes('acceptance-tests-needed'));
  const invalid = task({ evidenceRefs: ['https://private.example/raw'] });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.reasonCodes.includes('evidence-reference-format-invalid'));
});

test('agent task is deterministic, bounded, and never claims a worker ran', () => {
  const a = task();
  const b = task();
  assert.deepEqual(a, b);
  assert.equal(a.status, 'READY_FOR_REVIEW');
  assert.equal(a.execution.status, 'NOT_RUN');
  assert.ok(a.forbiddenActions.includes('deploy'));
  assert.equal(a.budget.maxTokens, 10000);
});

test('owner-required consequence class cannot become local authority', () => {
  const result = task({ consequenceClass: 'OWNER_AUTHORIZED_EXTERNAL' });
  assert.equal(result.ok, true);
  assert.equal(result.authority, 'OWNER_REQUIRED');
  assert.equal(result.execution.externalAction, false);
});

test('dispute packets are evidence-linked and round-bounded', () => {
  const result = compileDisputePacket({
    task: task(), maxRounds: 99, evidenceRefs: ['audit:disagreement-1'],
    disagreements: [
      { agent: 'GPT', position: 'Keep the patch local', reasonCodes: ['risk'], evidenceRefs: ['test:408-pass'] },
      { agent: 'CLAUDE_CODE', position: 'Needs one more fixture', reasonCodes: ['coverage'], evidenceRefs: ['test:fixture-gap'] }
    ], date
  });
  assert.equal(result.ok, true);
  assert.equal(result.maxRounds, 3);
  assert.equal(result.status, 'OPEN_REVIEW');
});

test('missing or malformed disagreements fail closed', () => {
  assert.equal(compileDisputePacket({ task: task(), disagreements: [], date }).ok, false);
  assert.equal(compileDisputePacket({ task: task(), disagreements: [{ agent: 'GPT' }], date }).ok, false);
});

test('dispute resolution requires evidence and never executes the decision', () => {
  const packet = compileDisputePacket({ task: task(), disagreements: [{ agent: 'GPT', position: 'local' }], date });
  const missing = resolveDisputeRound({ packet, outcome: 'ACCEPT_ORIGIN', rationale: 'looks good', date });
  assert.equal(missing.status, 'ESCALATE_OWNER');
  assert.ok(missing.reasonCodes.includes('arbitration-evidence-required'));
  const resolved = resolveDisputeRound({ packet, outcome: 'ACCEPT_ORIGIN', rationale: 'test receipt supports local patch', evidenceRefs: ['test:408-pass'], date });
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(resolved.execution.status, 'NOT_RUN');
  assert.equal(resolved.authority, 'REVIEW_RECORDED_NOT_EXECUTED');
});

test('defer or exhausted rounds escalate instead of looping forever', () => {
  const packet = compileDisputePacket({ task: task(), disagreements: [{ agent: 'GPT', position: 'local' }], maxRounds: 1, date });
  const result = resolveDisputeRound({ packet, outcome: 'DEFER', rationale: 'insufficient evidence', evidenceRefs: ['audit:one'], date });
  assert.equal(result.status, 'ESCALATE_OWNER');
  assert.equal(result.round, 1);
  const exhausted = resolveDisputeRound({ packet: { ...packet, round: 1 }, outcome: 'ACCEPT_ORIGIN', rationale: 'late', evidenceRefs: ['test:late'], date });
  assert.ok(exhausted.reasonCodes.includes('dispute-round-limit-reached'));
});

test('handlers create relay and dispute receipts without a connected worker', async () => {
  const calls = [];
  const handlers = createJobHandlers({ store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; } }, cfg: {} });
  const created = await handlers['prometheus.agent.task']({
    objective: 'Review locally', originAgent: 'GPT', targetAgent: 'CLAUDE_CODE',
    evidenceRefs: ['test:408-pass'], requiredOutputs: ['review'], acceptanceTests: ['npm run check'], date
  });
  assert.equal(created.ok, true);
  const dispute = await handlers['prometheus.agent.dispute']({ task: created, disagreements: [{ agent: 'GPT', position: 'review' }], date });
  assert.equal(dispute.ok, true);
  const resolution = await handlers['prometheus.agent.dispute.resolve']({ packet: dispute, outcome: 'ACCEPT_ORIGIN', rationale: 'test evidence', evidenceRefs: ['test:408-pass'], date });
  assert.equal(resolution.status, 'RESOLVED');
  assert.deepEqual(calls.map(call => call.type), ['agent_task', 'agent_dispute', 'agent_dispute_resolution']);
});

test('relay receipts exclude raw objective/context and module has no I/O boundary', async () => {
  const calls = [];
  const result = task();
  await logAgentRelayReceipt({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'r' }; } }, 'agent_task', result);
  assert.equal(calls[0].detail.objective, undefined);
  assert.equal(calls[0].detail.contextRefs, undefined);
  const source = await fs.readFile(new URL('../src/agent-relay.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(|spawn\(|exec\(|process\.env/);
  assert.equal(calls[0].detail.policyVersion, AGENT_RELAY_POLICY_VERSION);
});
