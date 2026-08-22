import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileDiscoveryHandoff,
  normalizeProfileDiscoveryRecord,
  reconcileProfileDiscovery
} from '../src/profile-discovery-provenance.mjs';

const now = new Date('2026-08-23T00:00:00.000Z');

function publicProfile(overrides = {}) {
  return {
    companyId: 'acct-1',
    name: 'Alex Buyer',
    role: 'Head of Revenue',
    profileUrl: 'https://profiles.example/alex-buyer',
    sourceType: 'public_profile',
    sourceUrl: 'https://profiles.example/alex-buyer',
    observedAt: '2026-08-22T20:00:00.000Z',
    confidence: 0.9,
    ...overrides
  };
}

test('public discovery is always a candidate, never verified identity or outreach authority', () => {
  const record = normalizeProfileDiscoveryRecord(publicProfile(), { now });
  assert.equal(record.identityStatus, 'UNVERIFIED_PERSON_CANDIDATE');
  assert.equal(record.contactAuthority, 'NONE');
  assert.equal(record.outreachEligible, false);
  assert.equal(record.businessEffectAuthority, 'NONE');
  assert.equal(record.externalEffects, 0);
  assert.deepEqual(record.retainedContactFields, []);
});

test('search result stays weaker than a direct public profile', () => {
  const result = reconcileProfileDiscovery([
    publicProfile({
      profileUrl: '',
      sourceType: 'public_search',
      sourceUrl: 'https://search.example/result/1',
      confidence: 0.99
    }),
    publicProfile({ confidence: 0.7 })
  ], { now });
  assert.equal(result.candidates.length, 2);
  const direct = result.candidates.find(item => item.preferred.sourceType === 'public_profile');
  assert.ok(direct);
  assert.equal(direct.identityVerified, false);
});

test('same public profile from two sources becomes corroborated but not verified', () => {
  const result = reconcileProfileDiscovery([
    publicProfile(),
    publicProfile({ sourceType: 'licensed_export', sourceUrl: 'https://licensed.example/record/44', sourceLicense: 'licensed-business-data-v1', confidence: 0.8 })
  ], { now });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'CORROBORATED_CANDIDATE');
  assert.equal(result.candidates[0].identityVerified, false);
  assert.equal(result.summary.verifiedPeople, 0);
  assert.equal(result.summary.contactAuthorized, 0);
});

test('direct contradictory roles remain an explicit conflict', () => {
  const result = reconcileProfileDiscovery([
    publicProfile({ role: 'Head of Revenue' }),
    publicProfile({ role: 'Chief Financial Officer', sourceType: 'public_website', sourceUrl: 'https://company.example/team/alex-buyer' })
  ], { now });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, 'CONFLICT');
  assert.ok(result.candidates[0].conflictReasons.includes('direct-role-conflict'));
  assert.equal(result.candidates[0].outreachEligible, false);
});

test('licensed and provider discovery requires explicit licensing evidence', () => {
  assert.throws(() => normalizeProfileDiscoveryRecord(publicProfile({
    sourceType: 'provider_api',
    sourceUrl: 'https://provider.example/profile/1',
    sourceLicense: ''
  }), { now }), /sourceLicense/);
});

test('rejects non-HTTPS discovery sources', () => {
  assert.throws(() => normalizeProfileDiscoveryRecord(publicProfile({ sourceUrl: 'http://profiles.example/alex' }), { now }), /HTTPS/);
});

test('rejects a discovery record without an account identity', () => {
  assert.throws(() => normalizeProfileDiscoveryRecord(publicProfile({ companyId: '' }), { now }), /companyId/);
});

test('provider cost is recorded as evidence metadata, not spend authority', () => {
  const record = normalizeProfileDiscoveryRecord(publicProfile({
    sourceType: 'provider_api',
    sourceUrl: 'https://provider.example/record/1',
    sourceLicense: 'provider-terms-2026-08',
    providerCostCents: 7
  }), { now });
  assert.equal(record.providerCostCents, 7);
  assert.equal(record.providerCalls, 0);
  assert.equal(record.externalEffects, 0);
  assert.equal(record.businessEffectAuthority, 'NONE');
});

test('handoff cannot silently upgrade discovery evidence into exact identity', () => {
  const handoff = buildProfileDiscoveryHandoff([publicProfile()], { now });
  assert.equal(handoff.handoff.length, 1);
  assert.equal(handoff.handoff[0].exactIdentity, false);
  assert.equal(handoff.handoff[0].contactAuthority, 'NONE');
  assert.equal(handoff.handoff[0].outreachEligible, false);
  assert.match(handoff.handoff[0].nextAction, /evidence reconciliation/);
});

test('public search handoff explicitly marks the candidate inferred', () => {
  const handoff = buildProfileDiscoveryHandoff([publicProfile({
    profileUrl: '',
    sourceType: 'public_search',
    sourceUrl: 'https://search.example/result/22'
  })], { now });
  assert.equal(handoff.handoff[0].inferred, true);
  assert.equal(handoff.handoff[0].exactIdentity, false);
});
