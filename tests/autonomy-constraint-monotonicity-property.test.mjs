// Issue #81 asks for one thing: a parent's constraint set is a subset of every
// descendant's constraint set, in every reachable chain. A single hand-picked
// example does not prove that, so this file drives deep randomised chains and
// checks containment at every link -- and separately pins the boundary case
// where the constraint budget is full, which is where truncation used to eat
// two of the parent's restrictions without telling anybody.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAutonomySession,
  compileTaskIntent,
  inheritTaskConstraints,
  ingestAgentResult,
  registerTaskIntent
} from '../src/agent-autonomy-loop.mjs';

const MAX_CONSTRAINTS = 64;
const MANDATORY = ['local-preparation-only', 'no-business-external-effects'];

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function rootIntent(session, constraints) {
  return compileTaskIntent({
    session,
    targetAgent: 'chatgpt',
    objective: 'root objective',
    acceptanceTests: ['root-acceptance'],
    evidenceRefs: ['evidence:root'],
    constraints
  });
}

test('every compiled intent carries the two mandatory constraints', () => {
  const session = compileAutonomySession({ objective: 'mandatory constraints' });
  const intent = rootIntent(session, []);
  assert.equal(intent.ok, true);
  for (const constraint of MANDATORY) assert.ok(intent.constraints.includes(constraint));
});

test('a child never loses a parent constraint, across randomised deep chains', () => {
  const random = seededRandom(20260822);
  for (let trial = 0; trial < 60; trial += 1) {
    const session = compileAutonomySession({ objective: `chain-${trial}` });
    const rootCount = Math.floor(random() * 12);
    let parent = rootIntent(session, Array.from({ length: rootCount }, (_, i) => `root-${trial}-${i}`));
    assert.equal(parent.ok, true, `root intent must compile for trial ${trial}`);

    const depth = 3 + Math.floor(random() * 8);
    for (let level = 0; level < depth; level += 1) {
      const requestedCount = Math.floor(random() * 4);
      const requested = Array.from({ length: requestedCount }, (_, i) => `lvl-${trial}-${level}-${i}`);
      const inherited = inheritTaskConstraints({ parentIntent: parent, requestedConstraints: requested });
      if (!inherited.ok) break;

      const child = compileTaskIntent({
        session,
        originAgent: parent.targetAgent,
        targetAgent: parent.targetAgent === 'chatgpt' ? 'claude-code' : 'chatgpt',
        objective: `child-${trial}-${level}`,
        parentTaskId: parent.taskId,
        acceptanceTests: ['child-acceptance'],
        evidenceRefs: ['evidence:child'],
        constraints: inherited.constraints
      });
      // Compilation may legitimately refuse (budget, session limits). What it
      // must never do is succeed while quietly dropping an inherited rule.
      if (!child.ok) break;

      for (const constraint of parent.constraints) {
        assert.ok(
          child.constraints.includes(constraint),
          `trial ${trial} level ${level}: child dropped parent constraint ${constraint}`
        );
      }
      for (const constraint of requested) assert.ok(child.constraints.includes(constraint));
      parent = child;
    }
  }
});

test('a parent holding the full constraint budget still passes every rule down', () => {
  const session = compileAutonomySession({ objective: 'saturated inheritance' });
  const requested = Array.from({ length: MAX_CONSTRAINTS - MANDATORY.length }, (_, i) => `c${String(i).padStart(3, '0')}`);
  const parent = rootIntent(session, requested);
  assert.equal(parent.ok, true);
  assert.equal(parent.constraints.length, MAX_CONSTRAINTS);

  const inherited = inheritTaskConstraints({ parentIntent: parent, requestedConstraints: [] });
  assert.equal(inherited.ok, true);

  const child = compileTaskIntent({
    session,
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    objective: 'saturated child',
    parentTaskId: parent.taskId,
    acceptanceTests: ['child-acceptance'],
    evidenceRefs: ['evidence:child'],
    constraints: inherited.constraints
  });
  assert.equal(child.ok, true);
  assert.equal(child.constraints.length, MAX_CONSTRAINTS);
  for (const constraint of parent.constraints) assert.ok(child.constraints.includes(constraint));
});

test('constraint overflow fails the compile instead of trimming the list', () => {
  const session = compileAutonomySession({ objective: 'constraint overflow' });
  const tooMany = Array.from({ length: MAX_CONSTRAINTS - 1 }, (_, i) => `c${i}`);
  const intent = rootIntent(session, tooMany);
  assert.equal(intent.ok, false);
  assert.ok(intent.reasonCodes.includes('task-constraint-budget-exceeded'));

  const wayTooMany = Array.from({ length: 500 }, (_, i) => `c${i}`);
  const overflowed = rootIntent(session, wayTooMany);
  assert.equal(overflowed.ok, false);
  assert.ok(overflowed.reasonCodes.includes('task-constraint-budget-exceeded'));
});

test('a saturated parent blocks the run rather than dropping a rule for a new one', () => {
  const session = compileAutonomySession({ objective: 'saturated followup' });
  const requested = Array.from({ length: MAX_CONSTRAINTS - MANDATORY.length }, (_, i) => `c${String(i).padStart(3, '0')}`);
  const parent = rootIntent(session, requested);
  assert.equal(parent.constraints.length, MAX_CONSTRAINTS);

  const inherited = inheritTaskConstraints({ parentIntent: parent, requestedConstraints: ['one-more-rule'] });
  assert.equal(inherited.ok, false);

  const registered = registerTaskIntent({ session, intent: parent });
  assert.equal(registered.ok, true);
  const ingested = ingestAgentResult({
    session: registered.session,
    taskIntent: parent,
    result: {
      taskId: parent.taskId,
      outcome: 'needs engineering',
      coordination: {
        action: 'ENGINEERING_REQUIRED',
        targetAgent: 'claude-code',
        objective: 'follow-up work',
        evidenceRefs: ['evidence:child'],
        acceptanceTests: ['child-acceptance'],
        requiredOutputs: ['outcome'],
        constraints: ['one-more-rule'],
        tokenBudget: 50_000
      },
      evidenceRefs: ['evidence:child'],
      externalEffects: {
        messages: 0,
        purchases: 0,
        deployments: 0,
        credentialChanges: 0,
        dnsChanges: 0,
        productionMutations: 0,
        businessSpendCents: 0
      }
    }
  });
  assert.equal(ingested.nextIntent, null);
  assert.ok(ingested.reasonCodes.includes('parent-constraint-inheritance-failed'));
  assert.equal(ingested.status, 'BLOCKED');
});
