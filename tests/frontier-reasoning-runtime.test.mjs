import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFrontierExecutorWorker, attestFrontierExecution } from '../src/frontier-reasoning-runtime.mjs';

const member = {
  profileId: 'google-gemini-frontier',
  provider: 'google',
  model: 'gemini-frontier',
  revision: 'rev-2026-09',
  transportProvider: 'ai-gateway',
  transportModel: 'google/gemini-frontier',
  reasoningTier: 'FRONTIER_MAX',
  reasoningSettingRef: 'ai-gateway:reasoning=xhigh'
};

function callability(overrides = {}) {
  return {
    profileId: member.profileId,
    status: 'CALLABLE_NOW',
    evidenceClass: 'OBSERVED_RUNTIME',
    identityVerification: 'OBSERVED',
    observedProvider: member.provider,
    observedModel: member.model,
    observedRevision: member.revision,
    observedTransportProvider: member.transportProvider,
    observedTransportModel: member.transportModel,
    observedAt: '2026-09-04T20:00:00.000Z',
    sourceRef: 'runtime://probe-1',
    ...overrides
  };
}

function executorResult(overrides = {}) {
  return {
    ok: true,
    providerRequestId: 'req_1',
    model: member.transportModel,
    identityVerification: 'OBSERVED',
    appliedReasoningEffort: 'xhigh',
    appliedReasoningEvidence: 'REQUEST_BODY_ATTESTED',
    usage: { costCents: 2 },
    ...overrides
  };
}

test('frontier runtime translates an evidenced AI Gateway setting into the canonical factory worker contract', () => {
  const out = compileFrontierExecutorWorker(member);
  assert.equal(out.ok, true);
  assert.deepEqual(out.worker, { provider: 'ai-gateway', model: 'google/gemini-frontier', reasoningEffort: 'xhigh' });
});

test('unknown max-setting spellings fail closed instead of silently downgrading', () => {
  const out = compileFrontierExecutorWorker({ ...member, reasoningSettingRef: 'ai-gateway:reasoning=secret-ultra-max' });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('ai-gateway-reasoning-setting-unrecognized'));
});

test('gateway creator cannot disguise a different cognitive provider', () => {
  const out = compileFrontierExecutorWorker({ ...member, provider: 'anthropic' });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('cognitive-provider-and-gateway-model-creator-mismatch'));
});

test('unproven direct transport reasoning bridge is blocked', () => {
  const out = compileFrontierExecutorWorker({ ...member, provider: 'anthropic', model: 'claude-frontier', transportProvider: 'anthropic', transportModel: 'claude-frontier', reasoningSettingRef: 'anthropic:thinking=max' });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(code => code.startsWith('frontier-reasoning-transport-not-yet-proven:anthropic')));
});

test('execution attestation requires transport model, request reasoning and independent observed revision evidence to all agree', () => {
  const binding = compileFrontierExecutorWorker(member);
  const out = attestFrontierExecution({ member, workerBinding: binding, executorResult: executorResult(), callabilityEvidence: callability() });
  assert.equal(out.ok, true);
  assert.equal(out.execution.observedRevision, member.revision);
  assert.equal(out.execution.appliedReasoningSettingRef, member.reasoningSettingRef);
  assert.equal(out.execution.costCents, 2);
});

test('execution attestation rejects reasoning drift and revision drift', () => {
  const binding = compileFrontierExecutorWorker(member);
  const reasoningDrift = attestFrontierExecution({ member, workerBinding: binding, executorResult: executorResult({ appliedReasoningEffort: 'high' }), callabilityEvidence: callability() });
  assert.equal(reasoningDrift.ok, false);
  assert.ok(reasoningDrift.reasonCodes.includes('planned-reasoning-setting-not-attested-by-executor'));

  const revisionDrift = attestFrontierExecution({ member, workerBinding: binding, executorResult: executorResult(), callabilityEvidence: callability({ observedRevision: 'different-revision' }) });
  assert.equal(revisionDrift.ok, false);
  assert.ok(revisionDrift.reasonCodes.includes('callability-revision-mismatch'));
});
