import test from 'node:test';
import assert from 'node:assert/strict';
import { executeFrontierMember } from '../src/frontier-reasoning-runtime.mjs';

const member = {
  profileId: 'google-gemini-frontier', provider: 'google', model: 'gemini-frontier', revision: 'rev-2026-09',
  transportProvider: 'ai-gateway', transportModel: 'google/gemini-frontier',
  reasoningTier: 'FRONTIER_MAX', reasoningSettingRef: 'ai-gateway:reasoning=xhigh'
};
const task = { taskId: 'bridge', objective: 'Return bounded result.', consequenceClass: 'LOCAL_PREPARATION' };
const callability = {
  profileId: member.profileId, status: 'CALLABLE_NOW', evidenceClass: 'OBSERVED_RUNTIME', identityVerification: 'OBSERVED',
  observedProvider: member.provider, observedModel: member.model, observedRevision: member.revision,
  observedTransportProvider: member.transportProvider, observedTransportModel: member.transportModel,
  observedAt: '2026-09-04T20:00:00.000Z', sourceRef: 'runtime://probe-1'
};

test('frontier member executes through canonical factory and returns receipt-ready measured evidence', async () => {
  let worker;
  let invocation;
  const factory = candidate => {
    worker = candidate;
    return async args => {
      invocation = args;
      return {
        ok: true, providerRequestId: 'req_1', model: member.transportModel, identityVerification: 'OBSERVED',
        appliedReasoningEffort: 'xhigh', appliedReasoningEvidence: 'REQUEST_BODY_ATTESTED', usage: { costCents: 3 }
      };
    };
  };
  const times = [1000, 1027];
  const out = await executeFrontierMember({ member, task, modelExecutorFactory: factory, callabilityEvidence: callability, maxTokens: 1000, costCeilingCents: 50, clock: () => times.shift() });
  assert.equal(out.ok, true);
  assert.deepEqual(worker, { provider: 'ai-gateway', model: member.transportModel, reasoningEffort: 'xhigh' });
  assert.equal(invocation.model, member.transportModel);
  assert.equal(out.execution.latencyMs, 27);
  assert.equal(out.execution.costCents, 3);
  assert.equal(out.execution.resultRef, 'provider-request://req_1');
});

test('frontier member refuses factory construction failure rather than bypassing canonical runtime', async () => {
  const out = await executeFrontierMember({ member, task, modelExecutorFactory: () => { throw new Error('unsupported'); }, callabilityEvidence: callability, maxTokens: 100, costCeilingCents: 10 });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'FRONTIER_EXECUTION_BLOCKED');
  assert.ok(out.reasonCodes.includes('frontier-executor-construction-failed'));
});

test('frontier member preserves uncertain provider outcome as uncertain instead of retrying invisibly', async () => {
  const factory = () => async () => ({ ok: false, outcome: 'UNCERTAIN', reasonCodes: ['provider-outcome-uncertain'] });
  const out = await executeFrontierMember({ member, task, modelExecutorFactory: factory, callabilityEvidence: callability, maxTokens: 100, costCeilingCents: 10, clock: () => 1000 });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'FRONTIER_EXECUTION_UNCERTAIN');
  assert.ok(out.reasonCodes.includes('provider-outcome-uncertain'));
});
