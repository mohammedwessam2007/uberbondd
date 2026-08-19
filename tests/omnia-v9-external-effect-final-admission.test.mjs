import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchExternalEffect,
  ExternalEffectFinalAdmissionError,
  ExternalEffectKillSwitchEngagedError
} from '../src/omnia-v9/integrations/external-effect-dispatcher.mjs';

function intent() {
  return {
    executionId: 'exec-final-admission', actionIntentDigest: 'a'.repeat(64), authorizationDigest: 'b'.repeat(64),
    tenantId: 'tenant-1', operation: 'email.send', resource: 'email:recipient@example.test', businessKey: 'business-1',
    provider: 'gmail', providerEffectIdentity: '<bound-message@example.test>', approvalId: 'approval-1',
    constitutionDigest: 'c'.repeat(64), policyDigest: 'd'.repeat(64), consequenceClass: 'COMMUNICATE_EXTERNAL',
    effectPayload: { to: 'recipient@example.test', subject: 'Subject', body: 'Body' }
  };
}

function harness() {
  const state = { status: null, dispatchCalls: 0, transitions: [] };
  const store = {
    async prepare(value) { state.status = 'PREPARED'; return { ...value, status: state.status }; },
    async transition({ executionId, toStatus, reason, expectedFromStatus }) {
      assert.equal(executionId, intent().executionId);
      assert.equal(state.status, expectedFromStatus);
      state.transitions.push({ from: state.status, to: toStatus, reason });
      state.status = toStatus;
      return { applied: true, execution: { ...intent(), status: state.status } };
    }
  };
  const evidenceStore = { async append() {} };
  const adapter = {
    providerName: 'gmail',
    async prepare(value) { return { ...value, argumentsDigest: 'e'.repeat(64) }; },
    async dispatch() {
      state.dispatchCalls += 1;
      return { classification: 'ACCEPTED', providerReferenceId: 'provider-1', evidence: null };
    }
  };
  return { state, store, evidenceStore, adapter };
}

function exactAllow({ preparedEffect, effectIntent }) {
  return {
    decision: 'ALLOW', authoritative: true, enforced: true,
    executionId: effectIntent.executionId,
    businessKey: effectIntent.businessKey,
    actionIntentDigest: effectIntent.actionIntentDigest,
    authorizationDigest: effectIntent.authorizationDigest,
    providerEffectIdentity: effectIntent.providerEffectIdentity,
    approvalId: effectIntent.approvalId,
    policyDigest: effectIntent.policyDigest,
    constitutionDigest: effectIntent.constitutionDigest,
    argumentsDigest: preparedEffect.argumentsDigest
  };
}

test('real provider dispatch requires a final authoritative admission function', async () => {
  const h = harness();
  await assert.rejects(
    () => dispatchExternalEffect({ ...h, effectIntent: intent() }),
    error => error instanceof ExternalEffectFinalAdmissionError && error.code === 'FINAL_ADMISSION_REQUIRED'
  );
  assert.equal(h.state.status, 'ABORTED_BEFORE_DISPATCH');
  assert.equal(h.state.dispatchCalls, 0);
});

test('final DENY and stale argument bindings abort before DISPATCHING', async () => {
  for (const finalAdmissionCheck of [
    async () => ({ decision: 'DENY', authoritative: true, reason: 'approval-revoked' }),
    async args => ({ ...exactAllow(args), argumentsDigest: 'f'.repeat(64) })
  ]) {
    const h = harness();
    const result = await dispatchExternalEffect({ ...h, effectIntent: intent(), finalAdmissionCheck });
    assert.equal(result.blocked, true);
    assert.equal(h.state.status, 'ABORTED_BEFORE_DISPATCH');
    assert.equal(h.state.dispatchCalls, 0);
  }
});

test('an unenforced or stale constitutional binding cannot reach the provider', async () => {
  for (const finalAdmissionCheck of [
    async args => ({ ...exactAllow(args), enforced: false }),
    async args => ({ ...exactAllow(args), constitutionDigest: 'f'.repeat(64) })
  ]) {
    const h = harness();
    const result = await dispatchExternalEffect({ ...h, effectIntent: intent(), finalAdmissionCheck });
    assert.equal(result.blocked, true);
    assert.equal(h.state.status, 'ABORTED_BEFORE_DISPATCH');
    assert.equal(h.state.dispatchCalls, 0);
  }
});

test('adapter preparation failure is durably aborted and releases the pre-dispatch key', async () => {
  const h = harness();
  h.adapter.prepare = async () => { throw new Error('unsafe payload'); };
  await assert.rejects(() => dispatchExternalEffect({ ...h, effectIntent: intent(), finalAdmissionCheck: exactAllow }), /unsafe payload/);
  assert.equal(h.state.status, 'ABORTED_BEFORE_DISPATCH');
  assert.equal(h.state.dispatchCalls, 0);
});

test('kill switch is re-read after final admission and still blocks the provider call', async () => {
  const h = harness();
  const env = { OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH: '' };
  await assert.rejects(
    () => dispatchExternalEffect({
      ...h, env, effectIntent: intent(),
      finalAdmissionCheck: async args => { env.OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH = 'engaged'; return exactAllow(args); }
    }),
    ExternalEffectKillSwitchEngagedError
  );
  assert.equal(h.state.status, 'ABORTED_BEFORE_DISPATCH');
  assert.equal(h.state.dispatchCalls, 0);
});

test('only an exact final admission can cross DISPATCHING and call the provider once', async () => {
  const h = harness();
  const result = await dispatchExternalEffect({ ...h, effectIntent: intent(), finalAdmissionCheck: exactAllow });
  assert.equal(result.status, 'PROVIDER_ACCEPTED');
  assert.equal(h.state.dispatchCalls, 1);
  assert.deepEqual(h.state.transitions.map(item => item.to), ['DISPATCHING', 'PROVIDER_ACCEPTED']);
});
