import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun, advanceAutonomyRun } from '../src/agent-autonomy-pump.mjs';

const ZERO_EXTERNAL = {
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
};

function fixture() {
  const session = compileAutonomySession({
    objective: 'Prove worker terminal truth before autonomy completion',
    maxRounds: 4,
    maxTasks: 4
  });
  const initialIntent = compileTaskIntent({
    session,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    objective: 'Return a bounded reviewed result',
    acceptanceTests: ['terminal truth gate']
  });
  return { run: createAutonomyRun({ session, initialIntent }) };
}

function completeResult(overrides = {}) {
  return {
    outcome: 'complete',
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'fixture', status: 'PASS' }],
    truthTable: [{ claim: 'complete', status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EXTERNAL },
    decision: 'DONE',
    coordination: { action: 'DONE', summary: 'complete' },
    ...overrides
  };
}

async function consume(result) {
  const { run } = fixture();
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 82, taskId: task.taskId }),
    readTask: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result })
  });
  const sent = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  assert.equal(sent.transition, 'DISPATCHED');
  return advanceAutonomyRun({ run: sent.run, adapterFactory, compileRelayTask });
}

test('thin DONE cannot mint terminal success', async () => {
  const result = await consume({ coordination: { action: 'DONE' } });
  assert.equal(result.ok, false);
  assert.equal(result.run.status, 'FAILED');
  assert.deepEqual(result.reasonCodes, ['required-result-fields-missing']);
});

test('explicit external-effect ledger is required', async () => {
  const payload = completeResult();
  delete payload.externalEffectLedger;
  const result = await consume(payload);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['required-result-fields-missing']);
});

test('missing tests actually run is rejected', async () => {
  const payload = completeResult();
  delete payload.testsActuallyRun;
  const result = await consume(payload);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['required-result-fields-missing']);
});

test('missing truth table is rejected', async () => {
  const payload = completeResult();
  delete payload.truthTable;
  const result = await consume(payload);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['required-result-fields-missing']);
});

test('unknown external-effect ledger key is rejected', async () => {
  const result = await consume(completeResult({
    externalEffectLedger: { ...ZERO_EXTERNAL, mysteryWrite: 0 }
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['secret-like-result-rejected']);
});

test('non-zero known external effect is rejected', async () => {
  const result = await consume(completeResult({
    externalEffectLedger: { ...ZERO_EXTERNAL, messages: 1 }
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['nonzero-external-effect-ledger-rejected']);
});

test('secret-like worker output is rejected', async () => {
  const result = await consume(completeResult({
    outcome: 'Bearer abcdefghijklmnopqrstuvwxyz'
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['secret-like-result-rejected']);
});

test('a complete canonical zero-effect result may finish normally', async () => {
  const result = await consume(completeResult());
  assert.equal(result.ok, true);
  assert.equal(result.transition, 'TERMINAL');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.run.status, 'COMPLETED');
});
