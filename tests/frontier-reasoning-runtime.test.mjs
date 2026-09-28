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
    latencyMs: 42,
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

test('native Anthropic max effort compiles only through the exact provider/model bridge', () => {
  const direct = {
    ...member,
    profileId: 'anthropic-opus-55',
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    transportProvider: 'anthropic',
    transportModel: 'claude-opus-5-5',
    reasoningSettingRef: 'anthropic:effort=max'
  };
  const out = compileFrontierExecutorWorker(direct);
  assert.equal(out.ok, true);
  assert.deepEqual(out.worker, { provider: 'anthropic', model: 'claude-opus-5-5', reasoningEffort: 'max' });

  const mismatch = compileFrontierExecutorWorker({ ...direct, transportModel: 'claude-sonnet-5-5' });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.reasonCodes.includes('direct-transport-model-mismatch'));
});

test('native OpenAI max reasoning may request Flex without changing cognitive model identity', () => {
  const direct = {
    ...member,
    profileId: 'openai-astra',
    provider: 'openai',
    model: 'gpt-6-astra',
    transportProvider: 'openai',
    transportModel: 'gpt-6-astra',
    reasoningSettingRef: 'openai:reasoning=max;service_tier=flex'
  };
  const out = compileFrontierExecutorWorker(direct);
  assert.equal(out.ok, true);
  assert.deepEqual(out.worker, { provider: 'openai', model: 'gpt-6-astra', reasoningEffort: 'max', serviceTier: 'flex' });
  assert.equal(out.appliedSettingExpectation.serviceTier, 'flex');
});

test('unrecognized direct reasoning settings fail closed instead of silently downgrading', () => {
  const anthropic = compileFrontierExecutorWorker({
    ...member,
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    transportProvider: 'anthropic',
    transportModel: 'claude-opus-5-5',
    reasoningSettingRef: 'anthropic:thinking=max'
  });
  assert.equal(anthropic.ok, false);
  assert.ok(anthropic.reasonCodes.includes('anthropic-direct-effort-setting-unrecognized'));

  const openai = compileFrontierExecutorWorker({
    ...member,
    provider: 'openai',
    model: 'gpt-6-astra',
    transportProvider: 'openai',
    transportModel: 'gpt-6-astra',
    reasoningSettingRef: 'openai:reasoning=secret-max'
  });
  assert.equal(openai.ok, false);
  assert.ok(openai.reasonCodes.includes('openai-direct-reasoning-setting-unrecognized'));
});

test('frontier attestation refuses a requested OpenAI Flex lane unless provider response attests Flex', () => {
  const direct = {
    ...member,
    profileId: 'openai-astra',
    provider: 'openai',
    model: 'gpt-6-astra',
    transportProvider: 'openai',
    transportModel: 'gpt-6-astra',
    reasoningSettingRef: 'openai:reasoning=max;service_tier=flex'
  };
  const binding = compileFrontierExecutorWorker(direct);
  const evidence = {
    profileId: direct.profileId,
    status: 'CALLABLE_NOW',
    evidenceClass: 'OBSERVED_RUNTIME',
    identityVerification: 'OBSERVED',
    observedProvider: direct.provider,
    observedModel: direct.model,
    observedRevision: direct.revision,
    observedTransportProvider: direct.transportProvider,
    observedTransportModel: direct.transportModel,
    observedAt: '2026-09-29T00:00:00.000Z',
    sourceRef: 'runtime://direct-openai'
  };
  const base = {
    ok: true,
    providerRequestId: 'req-flex',
    model: 'gpt-6-astra',
    identityVerification: 'OBSERVED',
    appliedReasoningEffort: 'max',
    appliedReasoningEvidence: 'REQUEST_BODY_ATTESTED',
    appliedServiceTier: 'default',
    serviceTierEvidence: 'PROVIDER_RESPONSE_ATTESTED',
    latencyMs: 42,
    usage: { costCents: 2 }
  };
  const refused = attestFrontierExecution({ member: direct, workerBinding: binding, executorResult: base, callabilityEvidence: evidence });
  assert.equal(refused.ok, false);
  assert.ok(refused.reasonCodes.includes('planned-service-tier-not-attested-by-provider'));

  const accepted = attestFrontierExecution({
    member: direct,
    workerBinding: binding,
    executorResult: { ...base, appliedServiceTier: 'flex' },
    callabilityEvidence: evidence
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.execution.appliedServiceTier, 'flex');
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
