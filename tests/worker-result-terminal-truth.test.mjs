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
  assert.ok(result.reasonCodes.includes('required-result-fields-missing'));
  // Claiming DONE also puts the result on the hook for evidence, so the
  // refusal names the missing proof as well as the missing envelope fields.
  assert.ok(result.reasonCodes.includes('terminal-result-truth-table-required'));
  assert.ok(result.reasonCodes.includes('terminal-result-outcome-required'));
});

test('explicit external-effect ledger is required', async () => {
  const payload = completeResult();
  delete payload.externalEffectLedger;
  const result = await consume(payload);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('required-result-fields-missing'));
});

test('missing tests actually run is rejected', async () => {
  const payload = completeResult();
  delete payload.testsActuallyRun;
  const result = await consume(payload);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('required-result-fields-missing'));
  assert.ok(result.reasonCodes.includes('terminal-result-tests-required'));
});

test('missing truth table is rejected', async () => {
  const payload = completeResult();
  delete payload.truthTable;
  const result = await consume(payload);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('required-result-fields-missing'));
  assert.ok(result.reasonCodes.includes('terminal-result-truth-table-required'));
});

test('unknown external-effect ledger key is rejected', async () => {
  const result = await consume(completeResult({
    externalEffectLedger: { ...ZERO_EXTERNAL, mysteryWrite: 0 }
  }));
  assert.equal(result.ok, false);
  // An invented counter is a ledger problem, not a credential problem. It used
  // to surface as `secret-like-result-rejected`, which sent operators looking
  // for a leaked key that was never there.
  assert.deepEqual(result.reasonCodes, ['unknown-external-effect-key-rejected']);
});

test('an incomplete zero-effect ledger cannot pass as proof of no effects', async () => {
  const result = await consume(completeResult({ externalEffectLedger: { providerCalls: 0 } }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['incomplete-external-effect-ledger-rejected']);
});

test('a ledger of stringy or non-finite zeros is rejected', async () => {
  const stringy = await consume(completeResult({ externalEffectLedger: { ...ZERO_EXTERNAL, messages: '0' } }));
  assert.equal(stringy.ok, false);
  assert.deepEqual(stringy.reasonCodes, ['nonzero-external-effect-ledger-rejected']);
  const notFinite = await consume(completeResult({ externalEffectLedger: { ...ZERO_EXTERNAL, spendCents: Number.NaN } }));
  assert.equal(notFinite.ok, false);
  assert.deepEqual(notFinite.reasonCodes, ['nonzero-external-effect-ledger-rejected']);
});

test('DONE with an empty truth table cannot end the run', async () => {
  const result = await consume(completeResult({ truthTable: [] }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['terminal-result-truth-table-required']);
});

test('DONE with unsupported truth-table rows cannot end the run', async () => {
  const result = await consume(completeResult({ truthTable: [{ claim: 'shipped' }] }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['terminal-result-truth-table-rows-unsupported']);
});

test('DONE with an empty outcome cannot end the run', async () => {
  const result = await consume(completeResult({ outcome: '   ' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('terminal-result-outcome-required'));
});

test('changed artifacts with no tests run cannot end the run', async () => {
  const result = await consume(completeResult({
    changedArtifacts: [{ path: 'src/thing.mjs' }],
    testsActuallyRun: []
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['terminal-result-changed-artifacts-without-tests']);
});

test('a result answering a different task id is refused', async () => {
  const result = await consume(completeResult({ taskId: 'mesh_task_someone_elses' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('worker-result-task-id-mismatch'));
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
