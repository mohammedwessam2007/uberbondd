import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAutonomySession,
  compileTaskIntent,
  registerTaskIntent,
  ingestAgentResult,
  inheritTaskConstraints
} from '../src/agent-autonomy-loop.mjs';

const ZERO = {
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  businessSpendCents: 0
};

function setup(constraints) {
  const session = compileAutonomySession({ objective: 'preserve inherited authority constraints', maxRounds: 4, maxTasks: 4 });
  const parent = compileTaskIntent({
    session,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    objective: 'inspect safely',
    acceptanceTests: ['node --test'],
    constraints
  });
  const registered = registerTaskIntent({ session, intent: parent });
  return { session: registered.session, parent };
}

test('automatic follow-up preserves every mission-specific parent constraint when child requests none', () => {
  const parentConstraints = ['protected-path:lite/', 'repo-scope:src/payments.mjs', 'network:none'];
  const { session, parent } = setup(parentConstraints);
  const ingested = ingestAgentResult({
    session,
    taskIntent: parent,
    result: {
      outcome: 'repair needed',
      businessEffectLedger: ZERO,
      coordination: {
        action: 'REPAIR_REQUIRED',
        objective: 'repair it',
        acceptanceTests: ['node --test'],
        constraints: []
      }
    }
  });
  assert.equal(ingested.ok, true);
  assert.equal(ingested.status, 'FOLLOWUP_READY');
  for (const constraint of parent.constraints) assert.ok(ingested.nextIntent.constraints.includes(constraint), constraint);
});

test('child constraints can add restrictions but cannot delete inherited restrictions', () => {
  const { session, parent } = setup(['protected-path:lite/', 'network:none']);
  const ingested = ingestAgentResult({
    session,
    taskIntent: parent,
    result: {
      businessEffectLedger: ZERO,
      coordination: {
        action: 'ENGINEERING_REQUIRED',
        objective: 'implement bounded repair',
        acceptanceTests: ['node --test'],
        constraints: ['network:read-only', 'new-restriction:no-deploy']
      }
    }
  });
  assert.equal(ingested.ok, true);
  assert.ok(ingested.nextIntent.constraints.includes('network:none'));
  assert.ok(ingested.nextIntent.constraints.includes('network:read-only'));
  assert.ok(ingested.nextIntent.constraints.includes('new-restriction:no-deploy'));
  assert.ok(ingested.nextIntent.constraints.includes('protected-path:lite/'));
});

test('inheritance helper is monotonic and deduplicates without mutating parent', () => {
  const parent = { constraints: ['a', 'b', 'local-preparation-only'] };
  const before = structuredClone(parent);
  const inherited = inheritTaskConstraints({ parentIntent: parent, requestedConstraints: ['b', 'c'] });
  assert.equal(inherited.ok, true);
  assert.deepEqual(inherited.constraints, ['a', 'b', 'local-preparation-only', 'c']);
  assert.deepEqual(parent, before);
});

test('registered session history persists the immutable constraint snapshot for restart audits', () => {
  const { session, parent } = setup(['protected-path:lite/', 'network:none']);
  const created = session.history.find(item => item.event === 'TASK_CREATED' && item.taskId === parent.taskId);
  assert.deepEqual(created.constraints, parent.constraints);
  assert.equal(created.consequenceClass, 'LOCAL_PREPARATION');
});
