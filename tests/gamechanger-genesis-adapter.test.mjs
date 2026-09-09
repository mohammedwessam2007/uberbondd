import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintGamechangerObservation } from '../src/gamechanger-mesh.mjs';
import { compileGamechangerIntoGenesis } from '../src/gamechanger-genesis-adapter.mjs';

const observedAt = '2026-09-09T10:00:00.000Z';
const observation = () => ({
  id: 'official-1:item-1',
  sourceId: 'official-1',
  sourceTier: 'PRIMARY_OFFICIAL',
  sourceType: 'PUBLIC_PAGE_SNAPSHOT',
  url: 'https://example.com/release',
  title: 'Provider introduces bounded reusable context',
  summary: 'A documented feature allows stable shared context to be reused while request-specific content remains separate.',
  observedAt,
  publishedAt: observedAt,
  domains: ['AI_MODELS'],
  evidenceRefs: ['https://example.com/release'],
  claims: []
});

function candidate() {
  const fp = fingerprintGamechangerObservation(observation());
  assert.equal(fp.ok, true);
  return {
    fingerprint: fp.fingerprint,
    observation: fp.observation,
    attentionState: 'ATOMIZE',
    score: 72,
    sourceTrust: 100
  };
}

const extraction = c => ({
  sourceFingerprint: c.fingerprint,
  sourceObservationId: c.observation.id,
  evidenceRef: c.observation.evidenceRefs[0],
  mechanismId: 'stable-context-reuse',
  domain: 'model-economics',
  does: 'Reuse stable shared context while varying request-specific suffixes',
  exploits: 'Repeated prompts contain a large invariant prefix',
  preconditions: ['Stable context is identical across requests'],
  effects: ['Reduces repeated context processing when the provider actually caches it'],
  assumptions: ['The provider preserves exact-prefix cache semantics']
});

const peer = () => ({
  mechanismId: 'bounded-context-routing',
  domain: 'model-routing',
  does: 'Route work to a bounded model context envelope',
  exploits: 'Tasks differ in context requirements',
  preconditions: ['A model route is available'],
  effects: ['Limits unnecessary context exposure'],
  assumptions: ['Task context requirements can be estimated'],
  evidenceClass: 'HYPOTHESIS',
  source: { kind: 'INTERNAL_MODEL', ref: 'repo:bounded-context-routing', observedAt }
});

test('routes only an explicitly extracted source-bound causal mechanism into canonical GENESIS', () => {
  const c = candidate();
  const result = compileGamechangerIntoGenesis({ gamechangerCandidate: c, extractedMechanism: extraction(c), peerDonors: [peer()] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'GAMECHANGER_CAUSAL_EXTRACTION_ROUTED_TO_CANONICAL_GENESIS');
  assert.equal(result.donor.evidenceClass, 'SUPPORTED_INFERENCE');
  assert.equal(result.genesisCompilation.ok, true);
  assert.equal(result.promotionAuthority, 'NONE');
  assert.equal(result.executableAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('raw announcement without causal extraction cannot enter GENESIS', () => {
  const result = compileGamechangerIntoGenesis({ gamechangerCandidate: candidate(), peerDonors: [peer()] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('explicit-causal-action-required'));
  assert.ok(result.reasonCodes.includes('explicit-exploited-constraint-required'));
});

test('forged Gamechanger fingerprint is refused', () => {
  const c = candidate(); c.fingerprint = '0'.repeat(64);
  const result = compileGamechangerIntoGenesis({ gamechangerCandidate: c, extractedMechanism: extraction(c), peerDonors: [peer()] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('gamechanger-fingerprint-must-match-observation'));
});

test('extraction cannot detach from its observation or evidence reference', () => {
  const c = candidate(); const e = extraction(c);
  e.sourceObservationId = 'other'; e.evidenceRef = 'https://example.com/other';
  const result = compileGamechangerIntoGenesis({ gamechangerCandidate: c, extractedMechanism: e, peerDonors: [peer()] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('extraction-must-bind-observation-id'));
  assert.ok(result.reasonCodes.includes('extraction-evidence-ref-must-come-from-observation'));
});

test('WATCH or IGNORE signals cannot self-promote into mechanism compilation', () => {
  for (const state of ['WATCH', 'IGNORE']) {
    const c = candidate(); c.attentionState = state;
    const result = compileGamechangerIntoGenesis({ gamechangerCandidate: c, extractedMechanism: extraction(c), peerDonors: [peer()] });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('research-grade-gamechanger-attention-required'));
  }
});

test('causal extraction requires explicit load-bearing assumptions', () => {
  const c = candidate(); const e = extraction(c); e.assumptions = [];
  const result = compileGamechangerIntoGenesis({ gamechangerCandidate: c, extractedMechanism: e, peerDonors: [peer()] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('load-bearing-assumptions-required'));
});

test('adapter cannot pretend one Gamechanger signal satisfies GENESIS cross-donor recombination', () => {
  const c = candidate();
  const result = compileGamechangerIntoGenesis({ gamechangerCandidate: c, extractedMechanism: extraction(c), peerDonors: [] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('one-or-more-bounded-peer-donors-required'));
});

test('caller cannot raise Gamechanger extraction above supported inference', () => {
  const c = candidate(); const e = extraction(c); e.evidenceClass = 'VERIFIED_FACT';
  const result = compileGamechangerIntoGenesis({ gamechangerCandidate: c, extractedMechanism: e, peerDonors: [peer()] });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.donor.evidenceClass, 'SUPPORTED_INFERENCE');
  assert.match(result.truthBoundary, /SUPPORTED_INFERENCE_AT_MOST/);
});
