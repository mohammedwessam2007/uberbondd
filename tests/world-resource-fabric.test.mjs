import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWorldResource,
  projectWorldResourceToCapability,
  admitWorldResource,
  chooseWorldResourceSubstitutes
} from '../src/world-resource-fabric.mjs';

const NOW = '2026-09-09T01:20:00.000Z';
const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const atom = (id='world.observe') => ({ id, verb: id.split('.').at(-1), noun: 'world-state', description: 'Observe a bounded world-state signal with provenance.', inputs: ['query'], outputs: ['observation'], sideEffectClass: 'NONE' });
const base = (overrides={}) => ({
  id: 'resource.alpha', type: 'PUBLIC_DATA', name: 'Public evidence source',
  provenance: { sourceUrl: 'https://example.test/resource', sourceRevision: 'rev-1', sourceHash: H, observedAt: NOW },
  owner: { class: 'ORGANIZATION', ref: 'example-org' },
  capabilityAtoms: [atom()], inputs: ['query'], outputs: ['observation'], permissions: [], privacyClasses: ['PUBLIC'], sideEffects: ['NONE'],
  legalConstraints: [], failureModes: ['source-can-go-stale'], substitutes: ['resource.beta'], license: 'CC-BY-4.0', licenseConfidence: 1,
  revocation: { revoked: false, reasonCodes: [] },
  ...overrides
});
const availability = (hash=H, observedAt=NOW) => ({ ref: 'evidence://availability/1', observedAt, claimClass: 'RESOURCE_AVAILABILITY', subjectHash: hash, verifierId: 'observer-1' });
const security = (hash=H) => ['STATIC','SEMANTIC','SANDBOX'].map(layer => ({ layer, passed: true, artifactRef: `evidence://security/${layer}`, subjectHash: hash, observedAt: NOW }));

test('normalization creates typed immutable world-resource identity without authority', () => {
  const result = normalizeWorldResource(base());
  assert.equal(result.ok, true);
  assert.match(result.resourceDigest, /^[0-9a-f]{64}$/);
  assert.equal(result.resource.provenance.sourceHash, H);
  assert.equal(result.callabilityAuthority, 'NONE');
  assert.equal(result.contactAuthority, 'NONE');
  assert.equal(result.acquisitionAuthority, 'NONE');
});

test('founder-private state is categorically excluded from the world resource fabric', () => {
  const result = normalizeWorldResource(base({ privacyClasses: ['PRIVATE_FOUNDER'] }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('private-founder-state-prohibited-from-world-resource-fabric'));
});

test('unknown side-effect and privacy classes fail closed before admission', () => {
  const badEffect = normalizeWorldResource(base({ sideEffects: ['TELEPATHY'] }));
  assert.equal(badEffect.ok, false);
  assert.ok(badEffect.reasonCodes.includes('recognized-resource-side-effect-required'));
  const badPrivacy = normalizeWorldResource(base({ privacyClasses: ['EVERYTHING'] }));
  assert.equal(badPrivacy.ok, false);
  assert.ok(badPrivacy.reasonCodes.includes('recognized-resource-privacy-class-required'));
});

test('fresh availability evidence can make a resource planning-eligible but never callable', () => {
  const result = admitWorldResource(base(), { availabilityEvidence: availability(), now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'RESOURCE_ELIGIBLE_FOR_PLANNING');
  assert.equal(result.availabilityTruth, 'OBSERVED_AVAILABLE_WITHIN_EVIDENCE_WINDOW');
  assert.equal(result.callabilityAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.match(result.truthBoundary, /NEVER CREATE CALLABILITY/);
});

test('stale future-dated or wrong-resource availability evidence cannot be laundered into availability truth', () => {
  for (const evidence of [
    availability(H, '2026-07-01T00:00:00.000Z'),
    availability(H, '2026-10-01T00:00:00.000Z'),
    availability(H2, NOW)
  ]) {
    const result = admitWorldResource(base(), { availabilityEvidence: evidence, now: NOW });
    assert.equal(result.status, 'REVIEW');
    assert.ok(result.reasonCodes.includes('fresh-resource-availability-evidence-required'));
    assert.equal(result.availabilityTruth, 'NOT_ESTABLISHED');
    assert.equal(result.callabilityAuthority, 'NONE');
  }
});

test('human expert is a sovereign counterparty and is never projected as an executable capability', () => {
  const human = base({ id:'expert.alpha', type:'HUMAN_EXPERT', name:'Independent domain expert', owner:{class:'HUMAN',ref:'person:alpha'}, license:'NOASSERTION', licenseConfidence:1 });
  const projection = projectWorldResourceToCapability(human);
  assert.equal(projection.ok, true);
  assert.equal(projection.status, 'HUMAN_RESOURCE_NOT_EXECUTABLE_CAPABILITY');
  assert.equal(projection.capability, null);
  assert.ok(projection.reasonCodes.includes('humans-are-sovereign-counterparties-not-tools'));
});

test('human availability without explicit independently witnessed consent remains review-only', () => {
  const human = base({ id:'expert.alpha', type:'HUMAN_EXPERT', name:'Independent domain expert', owner:{class:'HUMAN',ref:'person:alpha'}, license:'NOASSERTION', licenseConfidence:1 });
  const result = admitWorldResource(human, { availabilityEvidence: availability(), now: NOW });
  assert.equal(result.status, 'REVIEW');
  assert.ok(result.reasonCodes.includes('fresh-explicit-human-consent-required'));
  assert.ok(result.reasonCodes.includes('independent-consent-evidence-required'));
  assert.equal(result.contactAuthority, 'NONE');
});

test('fresh human consent supports planning only and never creates contact or tasking authority', () => {
  const human = base({ id:'expert.alpha', type:'HUMAN_EXPERT', name:'Independent domain expert', owner:{class:'HUMAN',ref:'person:alpha'}, license:'NOASSERTION', licenseConfidence:1 });
  const consent = { ref:'evidence://consent/1', observedAt:NOW, claimClass:'HUMAN_CONSENT', subjectHash:H, verifierId:'independent-consent-witness' };
  const result = admitWorldResource(human, { availabilityEvidence: availability(), consentEvidence: consent, now: NOW });
  assert.equal(result.status, 'RESOURCE_ELIGIBLE_FOR_PLANNING');
  assert.equal(result.contactAuthority, 'NONE');
  assert.equal(result.callabilityAuthority, 'NONE');
  assert.match(result.humanSovereignty, /SOVEREIGN_COUNTERPARTY/);
});

test('self-witnessed human consent fails the independent evidence gate', () => {
  const human = base({ id:'expert.alpha', type:'HUMAN_EXPERT', name:'Independent domain expert', owner:{class:'HUMAN',ref:'person:alpha'}, license:'NOASSERTION', licenseConfidence:1 });
  const consent = { ref:'evidence://consent/self', observedAt:NOW, claimClass:'HUMAN_CONSENT', subjectHash:H, verifierId:'person:alpha' };
  const result = admitWorldResource(human, { availabilityEvidence: availability(), consentEvidence: consent, now: NOW });
  assert.equal(result.status, 'REVIEW');
  assert.ok(result.reasonCodes.includes('independent-consent-evidence-required'));
});

test('executable API requires Capability Genome security and explicit permission admission', () => {
  const api = base({ id:'api.alpha', type:'API', name:'Read-only evidence API', owner:{class:'ORGANIZATION',ref:'api-owner'}, license:'MIT', licenseConfidence:1, permissions:['network.read'], sideEffects:['READ_ONLY_NETWORK'] });
  const denied = admitWorldResource(api, { availabilityEvidence: availability(), requestedPermissions:['network.read'], authorizedPermissions:[], now:NOW });
  assert.equal(denied.status, 'REVIEW');
  assert.ok(denied.reasonCodes.includes('capability-genome-admission-required'));
  const eligible = admitWorldResource(api, { availabilityEvidence: availability(), capabilitySecurityEvidence:security(), requestedPermissions:['network.read'], authorizedPermissions:['network.read'], now:NOW });
  assert.equal(eligible.status, 'RESOURCE_ELIGIBLE_FOR_PLANNING');
  assert.equal(eligible.capabilityAdmission.decision, 'ELIGIBLE');
  assert.equal(eligible.callabilityAuthority, 'NONE');
});

test('unknown or weak executable license remains review-only even with perfect security evidence', () => {
  for (const api of [
    base({ id:'api.unknown', type:'API', license:'NOASSERTION', licenseConfidence:1 }),
    base({ id:'api.weak', type:'API', license:'MIT', licenseConfidence:0.4 })
  ]) {
    const result = admitWorldResource(api, { availabilityEvidence:availability(), capabilitySecurityEvidence:security(), now:NOW });
    assert.equal(result.status, 'REVIEW');
    assert.ok(result.reasonCodes.includes('executable-resource-license-clearance-required'));
    assert.equal(result.callabilityAuthority, 'NONE');
  }
});

test('revoked resource is denied regardless of fresh availability or previous evidence', () => {
  const revoked = base({ revocation:{revoked:true,reasonCodes:['provider-withdrew-access']} });
  const result = admitWorldResource(revoked, { availabilityEvidence:availability(), now:NOW });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'WORLD_RESOURCE_DENIED');
  assert.ok(result.reasonCodes.includes('resource-revoked'));
});

test('substitution returns only non-revoked atom-compatible resources and grants no authority', () => {
  const a = base({ id:'resource.a', substitutes:['resource.b'] });
  const b = base({ id:'resource.b', provenance:{...base().provenance,sourceHash:H2}, substitutes:['resource.a'] });
  const revoked = base({ id:'resource.dead', provenance:{...base().provenance,sourceHash:'c'.repeat(64)}, revocation:{revoked:true,reasonCodes:['retired']} });
  const result = chooseWorldResourceSubstitutes([a,b,revoked], { requiredAtomIds:['world.observe'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.candidates.map(x=>x.id).sort(), ['resource.a','resource.b']);
  assert.equal(result.callabilityAuthority, 'NONE');
  assert.equal(result.acquisitionAuthority, 'NONE');
});

test('raw credential material cannot be normalized as a credential reference', () => {
  const result = normalizeWorldResource(base({ type:'API', credentialRef:'sk-example-secret-value' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('credential-must-be-reference-only'));
});
