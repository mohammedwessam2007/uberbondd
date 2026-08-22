import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProspectEvidenceBundle,
  evaluateContactRoute,
  normalizeContactVerification,
  normalizeEnrichmentObservation,
  normalizePersonCandidate,
  reconcileFieldObservations
} from '../src/prospect-evidence-reconciliation.mjs';

const NOW = new Date('2026-08-22T18:00:00.000Z');

function verification(state = 'VALID', overrides = {}) {
  return normalizeContactVerification({
    route: 'buyer@example.com', state, provider: 'verifier-a',
    checkedAt: '2026-08-22T17:00:00Z', expiresAt: '2026-09-22T17:00:00Z',
    evidenceClass: 'LICENSED_PROVIDER', ...overrides
  }, { now: NOW });
}

function observation(value, overrides = {}) {
  return normalizeEnrichmentObservation({
    prospectId: 'pros_1', field: 'role', value,
    sourceType: 'public_website', evidenceClass: 'DIRECT_PUBLIC',
    sourceUrl: 'https://example.com/team', observedAt: '2026-08-22T12:00:00Z',
    confidence: 0.9, ...overrides
  }, { now: NOW });
}

test('public person candidate stays evidence only with zero business authority', () => {
  const person = normalizePersonCandidate({ companyId: 'company_1', name: 'Ada Example', role: 'COO', sourceType: 'public_profile', sourceUrl: 'https://example.com/ada' }, { now: NOW });
  assert.equal(person.companyId, 'company_1');
  assert.equal(person.businessEffectAuthority, 'NONE');
  assert.equal(person.externalEffects, 0);
  assert.equal(person.inferred, false);
});

test('model-inferred person is explicitly marked inferred', () => {
  const person = normalizePersonCandidate({ companyId: 'company_1', name: 'Possible Buyer', sourceType: 'model_inference', evidenceClass: 'MODEL_INFERENCE' }, { now: NOW });
  assert.equal(person.inferred, true);
  assert.equal(person.evidenceClass, 'MODEL_INFERENCE');
});

test('invalid profile URL is not retained as trusted source URL', () => {
  const person = normalizePersonCandidate({ companyId: 'company_1', name: 'Ada', sourceType: 'public_profile', publicProfileUrl: 'http://example.com/ada' }, { now: NOW });
  assert.equal(person.publicProfileUrl, '');
  assert.equal(person.sourceUrl, '');
});

test('direct contradictory enrichment observations remain an explicit conflict', () => {
  const result = reconcileFieldObservations([
    observation('COO'),
    observation('CFO', { sourceType: 'first_party', evidenceClass: 'DIRECT_FIRST_PARTY', sourceUrl: 'https://example.com/account' })
  ], { now: NOW });
  assert.equal(result.status, 'CONFLICT');
  assert.equal(result.preferred, null);
  assert.equal(result.conflicts.length, 2);
});

test('newer weaker model inference cannot override direct public evidence', () => {
  const direct = observation('COO', { observedAt: '2026-08-20T12:00:00Z' });
  const inferred = observation('CEO', { sourceType: 'model_inference', evidenceClass: 'MODEL_INFERENCE', sourceUrl: '', observedAt: '2026-08-22T17:30:00Z', confidence: 0.99, inferred: true });
  const result = reconcileFieldObservations([direct, inferred], { now: NOW });
  assert.equal(result.status, 'DIRECT_EVIDENCE');
  assert.equal(result.preferred.value, 'COO');
});

test('all expired enrichment evidence becomes STALE_ONLY', () => {
  const result = reconcileFieldObservations([
    observation('COO', { expiresAt: '2026-08-21T00:00:00Z' })
  ], { now: NOW });
  assert.equal(result.status, 'STALE_ONLY');
  assert.equal(result.preferred, null);
});

test('suppression dominates a later VALID verification', () => {
  const result = evaluateContactRoute({
    route: 'buyer@example.com', verifications: [verification('VALID')],
    suppressions: [{ value: 'buyer@example.com', reason: 'unsubscribe' }], now: NOW
  });
  assert.equal(result.status, 'BLOCKED_SUPPRESSED');
  assert.equal(result.usableForHandoff, false);
  assert.ok(result.reasonCodes.includes('suppression-dominates-verification'));
});

test('domain suppression dominates valid address verification', () => {
  const result = evaluateContactRoute({
    route: 'buyer@example.com', verifications: [verification('VALID')],
    suppressions: [{ value: 'example.com' }], now: NOW
  });
  assert.equal(result.status, 'BLOCKED_SUPPRESSED');
});

test('stale VALID verification requires re-verification', () => {
  const stale = verification('VALID', { expiresAt: '2026-08-21T00:00:00Z' });
  const result = evaluateContactRoute({ route: 'buyer@example.com', verifications: [stale], now: NOW });
  assert.equal(result.status, 'REVERIFY_REQUIRED');
  assert.equal(result.usableForHandoff, false);
});

test('catch-all and risky routes never become verified handoff routes', () => {
  for (const state of ['CATCH_ALL', 'RISKY', 'UNKNOWN']) {
    const result = evaluateContactRoute({ route: 'buyer@example.com', verifications: [verification(state)], now: NOW });
    assert.equal(result.status, 'NEEDS_REVIEW');
    assert.equal(result.usableForHandoff, false);
  }
});

test('temporary verifier failure defers rather than becoming invalid or valid', () => {
  const result = evaluateContactRoute({ route: 'buyer@example.com', verifications: [verification('TEMPORARY_FAILURE')], now: NOW });
  assert.equal(result.status, 'DEFER_TEMPORARY_FAILURE');
  assert.equal(result.usableForHandoff, false);
});

test('VALID route is evidence-ready but still carries no send authority', () => {
  const result = evaluateContactRoute({ route: 'buyer@example.com', verifications: [verification('VALID')], now: NOW });
  assert.equal(result.status, 'VERIFIED_ROUTE');
  assert.equal(result.usableForHandoff, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffects, 0);
});

test('no verifier evidence stays needs-verification', () => {
  const result = evaluateContactRoute({ route: 'buyer@example.com', verifications: [], now: NOW });
  assert.equal(result.status, 'NEEDS_VERIFICATION');
  assert.equal(result.usableForHandoff, false);
});

test('unsupported verification states fail closed', () => {
  assert.throws(() => normalizeContactVerification({ route: 'buyer@example.com', state: 'TOTALLY_FINE' }, { now: NOW }), /Unsupported contact verification state/);
});

test('bundle exposes conflicts and cannot authorize business effects', () => {
  const bundle = buildProspectEvidenceBundle({
    prospectId: 'pros_1',
    personCandidates: [{ companyId: 'company_1', name: 'Ada', sourceType: 'public_website', sourceUrl: 'https://example.com/team' }],
    enrichmentObservations: [observation('COO'), observation('CFO', { sourceType: 'first_party', evidenceClass: 'DIRECT_FIRST_PARTY' })],
    contactRoutes: [{ route: 'buyer@example.com', verifications: [verification('VALID')] }],
    suppressions: [], now: NOW
  });
  assert.deepEqual(bundle.summary.conflicts, ['role']);
  assert.equal(bundle.summary.verifiedRoutes, 1);
  assert.equal(bundle.businessEffectAuthority, 'NONE');
  assert.equal(bundle.externalEffects, 0);
  assert.match(bundle.note, /cannot authorize outreach/i);
});

test('provider cost is recorded but does not imply a provider call occurred here', () => {
  const item = normalizeEnrichmentObservation({
    prospectId: 'pros_1', field: 'employee_count', value: 42,
    sourceType: 'licensed_provider', provider: 'provider-x', providerCostCents: 3,
    evidenceClass: 'LICENSED_PROVIDER', observedAt: NOW
  }, { now: NOW });
  assert.equal(item.providerCostCents, 3);
  assert.equal(item.externalEffects, 0);
  assert.equal(item.businessEffectAuthority, 'NONE');
});
