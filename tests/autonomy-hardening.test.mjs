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
