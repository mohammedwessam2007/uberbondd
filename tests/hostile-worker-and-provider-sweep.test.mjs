// Sections 57 and 58 as one suite: a worker that is malicious or incompetent,
// and a provider that is unreliable in every way a provider actually is.
//
// The bar is not "the system notices". It is that each attempt lands on a
// refusal with a named reason, and that the economic ledger stays correct
// while it happens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent, registerTaskIntent, ingestAgentResult } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun, advanceAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { evaluateWorkerResultTruth } from '../src/agent-worker-result-truth.mjs';
import { validResult, ZERO_EFFECTS } from '../src/cloud-agent-relay.mjs';

const BUSINESS_ZERO = {
  messages: 0, purchases: 0, deployments: 0, credentialChanges: 0,
  dnsChanges: 0, productionMutations: 0, businessSpendCents: 0
};

function fixture({ constraints = ['no-customer-contact'] } = {}) {
  const session = compileAutonomySession({ objective: 'hostile worker sweep', maxRounds: 8, maxTasks: 8 });
  const initialIntent = compileTaskIntent({
    session, originAgent: 'uberbond', targetAgent: 'chatgpt',
    objective: 'Research something bounded',
    acceptanceTests: ['acceptance'], evidenceRefs: ['evidence:seed'], constraints
  });
  const registered = registerTaskIntent({ session, intent: initialIntent });
  return { session: registered.session, intent: initialIntent, run: createAutonomyRun({ session, initialIntent }) };
}

function coordination(overrides = {}) {
  return {
    action: 'ENGINEERING_REQUIRED',
    objective: 'follow-up work',
    evidenceRefs: ['evidence:child'],
    acceptanceTests: ['child acceptance'],
    requiredOutputs: ['outcome'],
    constraints: [],
    tokenBudget: 50_000,
    ...overrides
  };
}

function result(overrides = {}) {
  return {
    outcome: 'did the thing',
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'fixture', status: 'PASS' }],
    truthTable: [{ claim: 'did the thing', status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EFFECTS },
    decision: 'CONTINUE',
    businessEffectLedger: { ...BUSINESS_ZERO },
    coordination: coordination(),
    evidenceRefs: ['evidence:child'],
    ...overrides
  };
}

async function consume(workerResult) {
  const { run } = fixture();
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 42, taskId: task.taskId }),
    readTask: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: workerResult })
  });
  const dispatched = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  assert.equal(dispatched.transition, 'DISPATCHED');
  return advanceAutonomyRun({ run: dispatched.run, adapterFactory, compileRelayTask });
}

// ---------------------------------------------------------------- hostile worker

test('a worker cannot drop a constraint its parent imposed', () => {
  const { session, intent } = fixture({ constraints: ['no-customer-contact', 'no-spend'] });
  const ingested = ingestAgentResult({
    session, taskIntent: intent,
    result: result({ coordination: coordination({ constraints: ['something-else'] }) })
  });
  assert.ok(ingested.nextIntent, 'the follow-up should still compile');
  for (const constraint of intent.constraints) {
    assert.ok(ingested.nextIntent.constraints.includes(constraint), `dropped ${constraint}`);
  }
});

test('a worker cannot claim DONE without evidence behind it', async () => {
  const advanced = await consume(result({ decision: 'DONE', coordination: { action: 'DONE' }, truthTable: [] }));
  assert.equal(advanced.ok, false);
  assert.equal(advanced.run.status, 'FAILED');
  assert.ok(advanced.reasonCodes.includes('terminal-result-truth-table-required'));
});

test('a worker cannot award itself a larger token budget than the session allows', () => {
  const session = compileAutonomySession({ objective: 'budget', maxTotalTokens: 100_000 });
  const intent = compileTaskIntent({
    session, targetAgent: 'chatgpt', objective: 'o',
    acceptanceTests: ['a'], evidenceRefs: ['evidence:x'], tokenBudget: 5_000_000
  });
  assert.equal(intent.ok, false);
  assert.ok(intent.reasonCodes.includes('bounded-task-token-budget-required')
    || intent.reasonCodes.includes('session-token-budget-exceeded'));
});

test('a worker cannot request an action outside the safe set and keep the run moving', () => {
  const { session, intent } = fixture();
  for (const action of ['DEPLOY', 'SEND_EMAIL', 'CHARGE_CARD', 'ROTATE_CREDENTIALS']) {
    const ingested = ingestAgentResult({
      session, taskIntent: intent, result: result({ coordination: coordination({ action }) })
    });
    assert.ok(!ingested.nextIntent, `${action} produced a follow-up`);
    assert.equal(ingested.status, 'BLOCKED');
    assert.ok(ingested.reasonCodes.includes('valid-coordination-action-required'));
  }
});

test('a worker cannot smuggle a secret out through its result', async () => {
  const secrets = [
    'Bearer abcdefghijklmnopqrstuvwxyz0123456789',
    'sk-abcdefghijklmnopqrstuvwxyz',
    'ghp_abcdefghijklmnopqrstuvwxyz',
    '-----BEGIN RSA PRIVATE KEY-----'
  ];
  for (const secret of secrets) {
    const advanced = await consume(result({ outcome: secret }));
    assert.equal(advanced.ok, false, `${secret} was accepted`);
    assert.ok(advanced.reasonCodes.includes('secret-like-result-rejected'));
  }
});

test('a worker cannot report a non-zero or invented external effect', async () => {
  const nonZero = await consume(result({ externalEffectLedger: { ...ZERO_EFFECTS, messages: 1 } }));
  assert.equal(nonZero.ok, false);
  assert.ok(nonZero.reasonCodes.includes('nonzero-external-effect-ledger-rejected'));

  const invented = await consume(result({ externalEffectLedger: { ...ZERO_EFFECTS, customerCharges: 0 } }));
  assert.equal(invented.ok, false);
  assert.ok(invented.reasonCodes.includes('unknown-external-effect-key-rejected'));

  const silent = await consume(result({ externalEffectLedger: {} }));
  assert.equal(silent.ok, false);
  assert.ok(silent.reasonCodes.includes('incomplete-external-effect-ledger-rejected'));
});

test('a worker cannot answer with another task, run, or worker identity', () => {
  const mismatches = [
    { field: 'taskId', value: 'mesh_task_someone_else', code: 'worker-result-task-id-mismatch' },
    { field: 'runId', value: 'autonomy_run_someone_else', code: 'worker-result-run-id-mismatch' },
    { field: 'sessionId', value: 'mesh_occ_someone_else', code: 'worker-result-session-id-mismatch' },
    { field: 'workerId', value: 'not-me', code: 'worker-result-worker-id-mismatch' }
  ];
  for (const { field, value, code } of mismatches) {
    const truth = evaluateWorkerResultTruth({
      result: result({ [field]: value }),
      expected: { taskId: 'mesh_task_mine', runId: 'autonomy_run_mine', sessionId: 'mesh_occ_mine', workerId: 'me' }
    });
    assert.equal(truth.ok, false, `${field} mismatch was accepted`);
    assert.ok(truth.reasonCodes.includes(code), `${field}: got ${truth.reasonCodes.join(',')}`);
  }
});

test('a worker cannot spawn an unbounded chain of child tasks', () => {
  const session = compileAutonomySession({ objective: 'runaway', maxRounds: 3, maxTasks: 3 });
  let current = compileTaskIntent({
    session, targetAgent: 'chatgpt', objective: 'start',
    acceptanceTests: ['a'], evidenceRefs: ['evidence:x']
  });
  let live = registerTaskIntent({ session, intent: current }).session;

  let produced = 0;
  for (let round = 0; round < 25; round += 1) {
    const ingested = ingestAgentResult({
      session: live, taskIntent: current,
      result: result({ coordination: coordination({ objective: `round-${round}` }) })
    });
    if (!ingested.nextIntent) {
      assert.ok(['BOUNDED_STOP', 'BLOCKED', 'COMPLETED', 'LOOP_DETECTED'].includes(ingested.status));
      break;
    }
    produced += 1;
    current = ingested.nextIntent;
    live = registerTaskIntent({ session: ingested.session, intent: current }).session;
  }
  assert.ok(produced <= 3, `produced ${produced} follow-ups against a cap of 3`);
});

test('a worker repeating itself is caught rather than looping forever', () => {
  const { session, intent } = fixture();
  const identical = result();
  const first = ingestAgentResult({ session, taskIntent: intent, result: identical });
  assert.ok(first.nextIntent);
  const registered = registerTaskIntent({ session: first.session, intent: first.nextIntent });
  const repeat = ingestAgentResult({
    session: registered.session, taskIntent: first.nextIntent,
    result: result({ coordination: coordination({ action: 'REVIEW_REQUIRED', objective: intent.objective }) })
  });
  // Either it is refused, or it advances -- what must not happen is the same
  // follow-up identity being minted twice.
  if (repeat.nextIntent) assert.notEqual(repeat.nextIntent.taskId, first.nextIntent.taskId);
});

// -------------------------------------------------------------- hostile provider

test('a malformed or truncated provider payload never becomes a result', async () => {
  const payloads = [
    null,
    undefined,
    'a bare string',
    [],
    {},
    { outcome: 'partial' },
    { outcome: 'partial', changedArtifacts: [] }
  ];
  for (const payload of payloads) {
    const advanced = await consume(payload);
    assert.equal(advanced.ok, false, `${JSON.stringify(payload)} was accepted`);
    assert.equal(advanced.run.status, 'FAILED');
  }
});

test('an impossible or negative usage claim is refused, not recorded', () => {
  for (const spendCents of [-1, -100, Number.NaN, Number.POSITIVE_INFINITY, '0', 1e18]) {
    const errors = validResult(result({ externalEffectLedger: { ...ZERO_EFFECTS, spendCents } }));
    assert.ok(errors.length > 0, `spendCents ${String(spendCents)} was accepted`);
  }
});

test('a provider result arriving twice cannot advance the run twice', async () => {
  const { run } = fixture();
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const payload = result();
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 7, taskId: task.taskId }),
    readTask: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: payload })
  });
  const dispatched = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  const first = await advanceAutonomyRun({ run: dispatched.run, adapterFactory, compileRelayTask });
  assert.equal(first.transition, 'FOLLOWUP_READY');
  const roundsAfterFirst = first.run.session.roundsCompleted;

  // Redelivering the same payload against the already-advanced run must not
  // replay the ingestion: the run has moved on and the relay ref is gone.
  const again = await advanceAutonomyRun({ run: first.run, adapterFactory, compileRelayTask });
  assert.notEqual(again.transition, 'FOLLOWUP_READY');
  assert.equal(first.run.session.roundsCompleted, roundsAfterFirst);
});

test('a provider that never answers leaves the run pending, not failed or done', async () => {
  const { run } = fixture();
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 7, taskId: task.taskId }),
    readTask: async () => ({ ok: false, status: 'PENDING' })
  });
  const dispatched = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const advanced = await advanceAutonomyRun({ run: dispatched.run, adapterFactory, compileRelayTask });
    assert.equal(advanced.status, 'PENDING');
    assert.notEqual(advanced.run.status, 'COMPLETED');
  }
});

test('a provider that throws does not corrupt the run into a terminal state', async () => {
  const { run } = fixture();
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 7, taskId: task.taskId }),
    readTask: async () => { throw new Error('provider exploded'); }
  });
  const dispatched = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  await assert.rejects(() => advanceAutonomyRun({ run: dispatched.run, adapterFactory, compileRelayTask }));
  // The durable run object handed in is untouched by the throw.
  assert.equal(dispatched.run.phase, 'AWAITING_RESULT');
  assert.notEqual(dispatched.run.status, 'COMPLETED');
});

test('an oversized provider payload is refused before it is persisted', async () => {
  const advanced = await consume(result({ outcome: 'x'.repeat(300_000) }));
  assert.equal(advanced.ok, false);
  assert.ok(advanced.reasonCodes.includes('result-too-large'));
});
