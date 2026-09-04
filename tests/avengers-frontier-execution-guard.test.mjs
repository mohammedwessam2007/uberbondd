import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { executeAdmittedFrontierAvenger } from '../src/avengers-execution-guard.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile({ id = 'google-frontier', provider = 'google', model = 'gemini-frontier', revision = 'rev-1', quality = 0.98 } = {}) {
  return {
    id, provider, model, revision,
    transportProvider: 'ai-gateway', transportModel: `${provider}/${model}`,
    transportSourceRef: 'official://gateway', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: {
      FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://gateway-reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' }
    },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000, centsPerMillionInputTokens: 100, centsPerMillionOutputTokens: 500,
    identityAliases: [model], enabled: true,
    _quality: quality
  };
}
function callability(p) {
  return {
    profileId: p.id, status: 'CALLABLE_NOW', evidenceClass: 'OBSERVED_RUNTIME', identityVerification: 'OBSERVED',
    observedProvider: p.provider, observedModel: p.model, observedRevision: p.revision,
    observedTransportProvider: p.transportProvider, observedTransportModel: p.transportModel,
    observedAt: FRESH, sourceRef: `runtime://probe-${p.id}`
  };
}
function benchmark(p) {
  const out = normalizeModelBenchmark({
    provider: p.provider, model: p.model, taskClasses: p.taskClasses, taskClass: 'general',
    quality: p._quality, reliability: 0.97, latencyScore: 0.8, economicImpact: 0.9, evidenceConfidence: 0.99, costEfficiency: 0.7
  }, new Date(FRESH));
  out.observedRevision = p.revision;
  out.evidenceRef = `benchmark://${p.id}`;
  return out;
}
const contextArtifacts = [
  { id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['core'], dependencies: [], estimatedTokens: 300, priority: 100, immutable: true },
  { id: 'frontier-evidence', kind: 'EVIDENCE', contentRef: 'repo://frontier-evidence', tags: ['frontier'], dependencies: ['constitution'], estimatedTokens: 500, priority: 90 }
];
const env = {
  AI_GATEWAY_API_KEY: 'test-key-long-enough',
  AI_GATEWAY_AGENT_ENABLED: 'true',
  AI_GATEWAY_INPUT_USD_PER_MILLION: '1',
  AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
  AI_GATEWAY_PRICING_SOURCE: 'official://pricing',
  AI_GATEWAY_PRICING_VERIFIED_AT: FRESH
};
function task(reasoningTier = 'FRONTIER_MAX') {
  return {
    missionId: 'avengers-frontier-guard', taskId: 'avengers-frontier-guard', objective: 'Solve one bounded frontier task.',
    taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier,
    requiredTags: ['frontier'], contextTokenBudget: 5000, minCouncilSize: 2, maxCouncilSize: 2
  };
}

test('existing Avengers execution guard reaches admitted FRONTIER_MAX through canonical factory with one identity-bound provider call', async () => {
  const p = profile();
  let requestBody = null;
  const fetchImpl = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: 'req_guard_1',
          model: p.transportModel,
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ outcome: 'bounded-result' }) } }]
        });
      }
    };
  };
  const times = [1000, 1042];
  const out = await executeAdmittedFrontierAvenger({
    task: task(), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts,
    admissionSource: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://guard-e2e', observedAt: FRESH },
    env, fetchImpl, maxTokens: 100, costCeilingCents: 100, date: NOW, clock: () => times.shift()
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'FRONTIER_AVENGER_EXECUTION_COMPLETE');
  assert.equal(out.providerCalls, 1);
  assert.deepEqual(requestBody.reasoning, { effort: 'xhigh' });
  assert.equal(requestBody.model, p.transportModel);
  assert.equal(out.execution.observedRevision, p.revision);
  assert.equal(out.execution.latencyMs, 42);
  assert.equal(out.receipt.executions[0].appliedReasoningSettingRef, 'ai-gateway:reasoning=xhigh');
  assert.match(out.admissionDigest, /^[a-f0-9]{64}$/);
});

test('COUNCIL_MAX cannot be silently flattened into one provider call before the verified council runner exists', async () => {
  const profiles = [
    profile({ id: 'google', provider: 'google', model: 'gemini-frontier', quality: 0.99 }),
    profile({ id: 'openai', provider: 'openai', model: 'gpt-frontier', quality: 0.98 }),
    profile({ id: 'anthropic', provider: 'anthropic', model: 'claude-frontier', quality: 0.97 })
  ];
  let calls = 0;
  const out = await executeAdmittedFrontierAvenger({
    task: task('COUNCIL_MAX'), profiles, callability: profiles.map(callability), benchmarks: profiles.map(benchmark), contextArtifacts,
    admissionSource: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://council-block', observedAt: FRESH },
    env, fetchImpl: async () => { calls += 1; throw new Error('must not call'); }, date: NOW
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('frontier-council-execution-requires-verified-council-runner'));
  assert.equal(calls, 0);
});
