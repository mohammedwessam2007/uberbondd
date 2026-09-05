import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFrontierAdmissionBundle } from '../src/frontier-cognitive-admission.mjs';

const FRESH = '2026-09-04T19:00:00.000Z';

function contextArtifacts() {
  return [{ id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['frontier'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true }];
}

test('frontier admission fails closed at the canonical router model identity boundary', () => {
  const longModel = 'm'.repeat(121);
  const p = {
    id: 'too-long-model', provider: 'openai', model: longModel, revision: 'rev-1',
    transportProvider: 'ai-gateway', transportModel: `openai/${longModel}`,
    transportSourceRef: 'official://transport', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: { FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' } },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000, centsPerMillionInputTokens: 100, centsPerMillionOutputTokens: 500,
    identityAliases: [longModel], enabled: true
  };
  const out = buildFrontierAdmissionBundle({
    profiles: [p],
    callability: [],
    benchmarks: [],
    contextArtifacts: contextArtifacts(),
    source: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://router-boundary', observedAt: FRESH }
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'FRONTIER_ADMISSION_PROFILE_INVALID');
  assert.ok(out.reasonCodes.includes('model-identity-exceeds-canonical-router-boundary-or-is-missing:too-long-model'));
});
