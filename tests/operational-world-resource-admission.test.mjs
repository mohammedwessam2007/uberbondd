import test from 'node:test';
import assert from 'node:assert/strict';
import { admitOperationalWorldResource } from '../src/operational-world-resource-admission.mjs';

const D = c => c.repeat(64);
const now = new Date('2026-09-09T01:30:00.000Z');
const base = (overrides = {}) => ({
  resource: { id: 'provider.alpha', type: 'API', subjectDigest: D('a') },
  discoveryEvidence: { artifactRef: 'evidence://discovery/a', subjectDigest: D('a') },
  availabilityEvidence: { artifactRef: 'evidence://availability/a', subjectDigest: D('a'), available: true, observedAt: '2026-09-09T01:00:00.000Z', expiresAt: '2026-09-10T01:00:00.000Z', capacity: 100 },
  capabilityAdmission: { decision: 'ELIGIBLE', admissionRef: 'evidence://capability/a', securityEvidenceDigest: D('b'), subjectDigest: D('a'), revoked: false },
  usageTerms: { resolved: true },
  procurement: { requiredSpendCents: 0, authorizedSpendCents: 0 },
  requested: { capacity: 10, permissions: ['read.public'] },
  authorized: { permissions: ['read.public'] },
  now,
  ...overrides
});

test('discovered API is not operational without current availability evidence', () => {
  const input = base({ availabilityEvidence: null });
  const result = admitOperationalWorldResource(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('fresh-availability-evidence-required'));
});

test('expired and future-dated availability cannot mint operational readiness', () => {
  const expired = base(); expired.availabilityEvidence.expiresAt = '2026-09-09T00:00:00.000Z';
  assert.ok(admitOperationalWorldResource(expired).reasonCodes.includes('availability-evidence-expired'));
  const future = base(); future.availabilityEvidence.observedAt = '2026-09-09T02:00:00.000Z';
  assert.ok(admitOperationalWorldResource(future).reasonCodes.includes('availability-observation-must-not-be-future-dated'));
});

test('publicly discovered human expert is not consent to use the person as a resource', () => {
  const input = base({ resource: { id: 'expert.alpha', type: 'HUMAN_EXPERT', subjectDigest: D('a') }, capabilityAdmission: null });
  const result = admitOperationalWorldResource(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('explicit-human-consent-required'));
});

test('paid resource cannot become operational when procurement authority is insufficient', () => {
  const input = base({ procurement: { requiredSpendCents: 500, authorizedSpendCents: 100, authorityRef: 'authority://100' } });
  const result = admitOperationalWorldResource(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('procurement-authority-insufficient'));
});

test('raw secrets are refused instead of entering admission receipts', () => {
  const input = base(); input.resource.apiKey = 'sk-123456789012345678901234';
  const result = admitOperationalWorldResource(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('raw-secret-material-prohibited'));
});

test('active admitted API can be operationally admissible while still receiving zero execution authority', () => {
  const result = admitOperationalWorldResource(base());
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.decision, 'OPERATIONALLY_ADMISSIBLE');
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.match(result.admissionDigest, /^[a-f0-9]{64}$/);
});

test('revoked or review-only capability resource is not operational', () => {
  const revoked = base(); revoked.capabilityAdmission.revoked = true;
  assert.ok(admitOperationalWorldResource(revoked).reasonCodes.includes('capability-resource-revoked'));
  const review = base(); review.capabilityAdmission.decision = 'REVIEW';
  assert.ok(admitOperationalWorldResource(review).reasonCodes.includes('eligible-capability-admission-required'));
});

test('evidence for another revision cannot be rebound to the requested resource', () => {
  const input = base(); input.availabilityEvidence.subjectDigest = D('c');
  const result = admitOperationalWorldResource(input);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('availability-subject-mismatch'));
});

test('requested capacity and permissions cannot exceed proven envelopes', () => {
  const capacity = base(); capacity.requested.capacity = 101;
  assert.ok(admitOperationalWorldResource(capacity).reasonCodes.includes('requested-capacity-exceeds-observed-capacity'));
  const permission = base(); permission.requested.permissions.push('write.production');
  assert.ok(admitOperationalWorldResource(permission).reasonCodes.includes('resource-permission-not-authorized'));
});

test('unresolved usage terms or jurisdiction keep the resource non-operational', () => {
  const terms = base({ usageTerms: { resolved: false } });
  assert.ok(admitOperationalWorldResource(terms).reasonCodes.includes('usage-terms-or-license-unresolved'));
  const jurisdiction = base({ usageTerms: { resolved: true, jurisdictionRequired: true, jurisdictionSatisfied: false } });
  assert.ok(admitOperationalWorldResource(jurisdiction).reasonCodes.includes('jurisdiction-requirement-unresolved'));
});

test('human consent allows admission but never grants authority', () => {
  const input = base({
    resource: { id: 'expert.alpha', type: 'HUMAN_EXPERT', subjectDigest: D('a') },
    capabilityAdmission: null,
    consentEvidence: { consented: true, artifactRef: 'evidence://consent/a', subjectDigest: D('a') }
  });
  const result = admitOperationalWorldResource(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.executionAuthority, 'NONE');
});

test('admission digest is identity-bound to changing availability, consent and capacity', () => {
  const a = admitOperationalWorldResource(base());
  const changedCapacity = base(); changedCapacity.availabilityEvidence.capacity = 101;
  const b = admitOperationalWorldResource(changedCapacity);
  assert.notEqual(a.admissionDigest, b.admissionDigest);

  const humanA = base({ resource: { id: 'expert.alpha', type: 'HUMAN_EXPERT', subjectDigest: D('a') }, capabilityAdmission: null, consentEvidence: { consented: true, artifactRef: 'evidence://consent/a', subjectDigest: D('a') } });
  const humanB = structuredClone(humanA); humanB.now = now; humanB.consentEvidence.artifactRef = 'evidence://consent/b';
  assert.notEqual(admitOperationalWorldResource(humanA).admissionDigest, admitOperationalWorldResource(humanB).admissionDigest);
});
