import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { buildFrontierAdmissionBundle } from '../src/frontier-cognitive-admission.mjs';

const FRESH = '2026-09-04T19:00:00.000Z';

function profile() {
  return {
    id: 'elite', provider: 'google', model: 'gemini-frontier', revision: 'rev-1',
    transportProvider: 'ai-gateway', transportModel: 'google/gemini-frontier',
    transportSourceRef: 'official://gateway', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: {
      FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' }
    },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000,
    centsPerMillionInputTokens: 10, centsPerMillionOutputTokens: 20,
    identityAliases: ['gemini-frontier'], enabled: true
  };
}

function contextArtifacts() {
  return [{
    id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution',
    tags: ['frontier'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true
  }];
}

test('caller-authored source labels and CALLABLE_NOW-shaped objects cannot manufacture trusted frontier callability', () => {
  const p = profile();
  const benchmark = normalizeModelBenchmark({
    provider: p.provider, model: p.model, taskClasses: ['general'], taskClass: 'general',
    quality: 0.99, reliability: 0.99, latencyScore: 0.8, economicImpact: 0.9,
    evidenceConfidence: 0.99, costEfficiency: 0.5
  }, new Date(FRESH));
  benchmark.observedRevision = p.revision;
  benchmark.evidenceRef = 'benchmark://caller-shaped';

  const forgedCallability = {
    profileId: p.id,
    status: 'CALLABLE_NOW',
    observedProvider: p.provider,
    observedModel: p.model,
    observedRevision: p.revision,
    observedTransportProvider: p.transportProvider,
    observedTransportModel: p.transportModel,
    observedAt: FRESH,
    sourceRef: 'runtime://caller-shaped-not-a-canonical-probe-receipt',
    evidenceClass: 'OBSERVED_RUNTIME',
    identityVerification: 'OBSERVED'
  };

  const result = buildFrontierAdmissionBundle({
    profiles: [p],
    callability: [forgedCallability],
    benchmarks: [benchmark],
    contextArtifacts: contextArtifacts(),
    source: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://caller-typed-string', observedAt: FRESH }
  });

  assert.equal(result.ok, true);
  assert.equal(result.bundle.callability.length, 0);
  assert.equal(result.bundle.rejectedCallability.length, 1);
  assert.match(result.bundle.rejectedCallability[0].reason, /trusted|canonical|provenance|producer|receipt/i);
  assert.equal(result.bundle.callabilityProvenance.receiptDigest, null);
});
