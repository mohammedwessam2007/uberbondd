import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { buildFrontierAdmissionBundle, compileAdmittedFrontierPlan } from '../src/frontier-cognitive-admission.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile(revision) {
  return {
    id: `elite-${revision}`,
    provider: 'openai',
    model: 'same-marketing-name',
    revision,
    transportProvider: 'ai-gateway',
    transportModel: 'openai/same-marketing-name',
    transportSourceRef: 'official://transport',
    transportVerifiedAt: FRESH,
    transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'],
    roles: ['general'],
    allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: {
      FRONTIER_MAX: {
        settingRef: 'ai-gateway:reasoning=xhigh',
        sourceRef: 'official://reasoning',
        verifiedAt: FRESH,
        evidenceClass: 'OFFICIAL_SOURCE'
      }
    },
    pricingVerifiedAt: FRESH,
    pricingSourceRef: 'official://pricing',
    pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000,
    maxOutputTokens: 32000,
    centsPerMillionInputTokens: 100,
    centsPerMillionOutputTokens: 500,
    identityAliases: ['same-marketing-name'],
    enabled: true
  };
}

function callability(p) {
  return {
    profileId: p.id,
    status: 'CALLABLE_NOW',
    observedProvider: p.provider,
    observedModel: p.model,
    observedRevision: p.revision,
    observedTransportProvider: p.transportProvider,
    observedTransportModel: p.transportModel,
    observedAt: FRESH,
    sourceRef: 'runtime://identity-probe',
    evidenceClass: 'OBSERVED_RUNTIME',
    identityVerification: 'OBSERVED'
  };
}

function benchmark(p, quality = 0.99) {
  const out = normalizeModelBenchmark({
    provider: p.provider,
    model: p.model,
    taskClasses: p.taskClasses,
    taskClass: 'general',
    quality,
    reliability: 0.99,
    latencyScore: 0.9,
    economicImpact: 0.9,
    evidenceConfidence: 0.99,
    costEfficiency: 0.7
  }, new Date(FRESH));
  out.observedRevision = p.revision;
  out.evidenceRef = `benchmark://${p.id}`;
  return out;
}

function contextArtifacts() {
  return [{
    id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution',
    tags: ['frontier'], dependencies: [], estimatedTokens: 1000, priority: 100, immutable: true
  }];
}

function task() {
  return {
    missionId: 'revision-binding', taskId: 'revision-binding', objective: 'Prove exact revision binding.',
    taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier: 'FRONTIER_MAX',
    requiredTags: ['frontier'], contextTokenBudget: 10000, minCouncilSize: 2, maxCouncilSize: 2
  };
}

function provenance(calls) {
  const built = buildFrontierCallabilityProbeReceipt({
    observations: calls.map(item => ({ ...item, providerRequestId: `req-${item.profileId}` })),
    sourceRef: 'runtime-probe://revision-binding-fixture',
    observedAt: FRESH
  });
  assert.equal(built.ok, true);
  return { receipt: built.receipt, receiptDigest: built.receiptDigest };
}

function admitted({ profiles, callability: calls, benchmarks }) {
  return buildFrontierAdmissionBundle({
    profiles,
    callability: calls,
    benchmarks,
    contextArtifacts: contextArtifacts(),
    source: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://revision-binding-fixture', observedAt: FRESH },
    callabilityProvenance: provenance(calls)
  });
}

test('FRONTIER_MAX refuses a benchmark whose evidence belongs to another revision of the same provider/model identity', () => {
  const old = profile('rev-old');
  const current = profile('rev-current');
  const admission = admitted({ profiles: [current], callability: [callability(current)], benchmarks: [benchmark(old)] });
  assert.equal(admission.ok, true);
  assert.equal(admission.bundle.benchmarks.length, 0);
  assert.equal(admission.bundle.rejectedBenchmarks.length, 1);

  const out = compileAdmittedFrontierPlan({ task: task(), admissionBundle: admission.bundle, now: NOW });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'CAPACITY_BLOCKED');
  assert.ok(out.reasonCodes.includes('frontier-tier-requires-fresh-quality-evidence'));
});

test('FRONTIER_MAX admits a fresh benchmark only when provider model and exact revision all match', () => {
  const current = profile('rev-current');
  const admission = admitted({ profiles: [current], callability: [callability(current)], benchmarks: [benchmark(current)] });
  assert.equal(admission.ok, true);
  assert.equal(admission.bundle.benchmarks.length, 1);
  const out = compileAdmittedFrontierPlan({ task: task(), admissionBundle: admission.bundle, now: NOW });
  assert.equal(out.ok, true);
  assert.equal(out.plan.selected.revision, 'rev-current');
  assert.match(out.admissionDigest, /^[a-f0-9]{64}$/);
});

test('same provider/model at two revisions cannot enter one admission bundle until the lower router becomes revision-native', () => {
  const old = profile('rev-old');
  const current = profile('rev-current');
  const calls = [callability(old), callability(current)];
  const admission = admitted({ profiles: [old, current], callability: calls, benchmarks: [benchmark(old), benchmark(current)] });
  assert.equal(admission.ok, false);
  assert.equal(admission.status, 'FRONTIER_ADMISSION_PROFILE_INVALID');
  assert.ok(admission.reasonCodes.includes('ambiguous-provider-model-multi-revision-profile-set:openai:same-marketing-name'));
});
