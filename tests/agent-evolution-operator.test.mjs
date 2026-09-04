import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAgentEvolutionOperatorBundle,
  describeAgentEvolutionOperator,
  executeAgentEvolutionOperator
} from '../scripts/agent-evolution-operator.mjs';

const DATE = new Date('2026-09-04T16:15:00Z');
const ZERO = {
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
};

function successfulResult() {
  return {
    outcome: 'Verified the bounded self-improvement operator surface.',
    changedArtifacts: ['scripts/agent-evolution-operator.mjs', 'tests/agent-evolution-operator.test.mjs'],
    testsActuallyRun: [{ command: 'npm run check:syntax', result: 'PASS', tests: 848, passed: 848, failed: 0, skipped: 0 }],
    truthTable: { operator: 'PASS_LOCAL', productionPromotion: 'NOT_AUTHORIZED' },
    externalEffectLedger: { ...ZERO },
    decision: 'PROCEED'
  };
}

function successfulRelay() {
  let task;
  const calls = [];
  return {
    calls,
    health: async () => { calls.push('health'); return { ok: true, status: 'READY' }; },
    createTask: async value => {
      calls.push('create');
      task = value;
      return { ok: true, issueNumber: 901, taskId: value.taskId };
    },
    waitForResult: async input => {
      calls.push('wait');
      return {
        ok: true,
        status: 'RESULT_RECEIVED',
        resultStatus: 'COMPLETED',
        task: { taskId: input.expectedTaskId || task.taskId },
        result: successfulResult(),
        externalEffectLedger: { ...ZERO }
      };
    }
  };
}

test('operator bundle composes the existing bounded wave and never grants promotion', () => {
  const bundle = compileAgentEvolutionOperatorBundle({ date: DATE });
  assert.equal(bundle.ok, true);
  assert.equal(bundle.status, 'READY_FOR_RELAY');
  assert.equal(bundle.authority, 'LOCAL_PREPARATION');
  assert.equal(bundle.promotion, 'BLOCKED');
  assert.deepEqual(bundle.mission.requiredTests, ['npm run check:syntax']);
  assert.equal(bundle.task.budget.maxCostCents, 0);
  for (const action of ['deploy', 'push', 'merge', 'send', 'spend', 'change-credentials', 'change-dns', 'mutate-production']) {
    assert.ok(bundle.task.forbiddenActions.includes(action));
  }
});

test('doctor fails visibly on missing relay configuration without reading or exposing secret values', () => {
  const doctor = describeAgentEvolutionOperator({ env: {}, date: DATE });
  assert.equal(doctor.ok, true);
  assert.equal(doctor.status, 'BLOCKED_EXTERNAL_RELAY_CONFIG');
  assert.equal(doctor.relay.endpointPresent, false);
  assert.equal(doctor.relay.credentialPresent, false);
  assert.ok(doctor.reasonCodes.includes('relay-endpoint-absent'));
  assert.ok(doctor.reasonCodes.includes('relay-credential-absent'));
  assert.equal(JSON.stringify(doctor).includes('super-secret'), false);
  assert.equal(doctor.businessEffectAuthority, 'NONE');
  assert.deepEqual(doctor.externalEffectLedger, ZERO);
});

test('doctor reports only presence booleans for configured relay and sandbox attestation', () => {
  const doctor = describeAgentEvolutionOperator({
    env: {
      UBERBOND_RELAY_ENDPOINT: 'https://relay.example.test/api/agent-relay',
      UBERBOND_RELAY_TOKEN: 'super-secret-token-value',
      CLAUDE_CODE_SANDBOX_ISOLATION_FILE: '/safe/attestation.json'
    },
    date: DATE
  });
  assert.equal(doctor.status, 'READY_FOR_BOUNDED_RELAY');
  assert.equal(doctor.relay.endpointPresent, true);
  assert.equal(doctor.relay.credentialPresent, true);
  assert.equal(doctor.sandbox.isolationAttestationPresent, true);
  const serialized = JSON.stringify(doctor);
  assert.equal(serialized.includes('super-secret-token-value'), false);
  assert.equal(serialized.includes('/safe/attestation.json'), false);
});

test('execute refuses an unconfigured relay before any network call', async () => {
  let fetchCalls = 0;
  const result = await executeAgentEvolutionOperator({
    env: {},
    fetchImpl: async () => { fetchCalls += 1; throw new Error('must not run'); },
    date: DATE
  });
  assert.equal(result.status, 'BLOCKED_EXTERNAL_RELAY_CONFIG');
  assert.equal(fetchCalls, 0);
  assert.deepEqual(result.externalEffectLedger, ZERO);
});

test('execute performs exactly one health, enqueue and bounded wait with an injected relay', async () => {
  const relay = successfulRelay();
  const result = await executeAgentEvolutionOperator({ relayClient: relay, env: {}, date: DATE });
  assert.deepEqual(relay.calls, ['health', 'create', 'wait']);
  assert.equal(result.status, 'SHADOW_READY');
  assert.equal(result.completionBoundary, 'BOUNDED_REVIEW_COMPLETE__PROMOTION_STILL_BLOCKED');
  assert.equal(result.review.promotion.status, 'PROMOTION_BLOCKED');
  assert.equal(result.review.promotion.authority, 'OWNER_REQUIRED');
  assert.deepEqual(result.externalEffectLedger, ZERO);
});

test('non-ready relay cannot enqueue a task', async () => {
  let creates = 0;
  const result = await executeAgentEvolutionOperator({
    relayClient: {
      health: async () => ({ ok: false, status: 'NOT_CONFIGURED', reasonCodes: ['relay-not-configured'] }),
      createTask: async () => { creates += 1; },
      waitForResult: async () => ({})
    },
    env: {},
    date: DATE
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(creates, 0);
  assert.ok(result.reasonCodes.includes('relay-not-ready'));
  assert.deepEqual(result.externalEffectLedger, ZERO);
});
