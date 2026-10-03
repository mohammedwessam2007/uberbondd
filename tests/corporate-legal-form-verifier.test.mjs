import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCorporateLegalForm, compileLegalFormClaims, LEGAL_FORM_STATUS as S, REGISTRY_EVIDENCE_MAX_AGE_DAYS } from '../src/corporate-legal-form-verifier.mjs';
import { registryFound, registryStatus, DAY } from './fixtures/outreach/global-green-lane.fixture.mjs';

const now = new Date('2026-10-03T12:00:00.000Z');
const claims = (over = {}) => ({ legalName: 'Acme Widgets Ltd', companyNumber: '12345678', formText: 'Acme Widgets Ltd, company number 12345678', siteHost: 'acme-widgets.co.uk', emailDomain: 'acme-widgets.co.uk', ...over });
const verify = (over = {}, registryResult = registryFound(now), jurisdiction = 'GB') => verifyCorporateLegalForm({ jurisdiction, claims: claims(over), registryResult, now });

test('a verified active Ltd whose number, name and domain reconcile is the only CORPORATE_VERIFIED outcome', () => {
  const r = verify();
  assert.equal(r.status, S.CORPORATE_VERIFIED);
  assert.equal(r.recipientType, 'CORPORATE');
  assert.equal(r.verified, true);
  assert.deepEqual(r.reconciliation, { nameMatch: true, numberMatch: true, domainMatch: true });
  assert.deepEqual(r.requiredRuleIds, ['legal-form:GB:corporate-subscriber-classes', 'registry:GB:companies-house-terms']);
  assert.equal(r.claimsNeverVerify, true);
  assert.equal(r.sendAuthority, false);
  assert.match(r.evidenceDigest, /^[a-f0-9]{64}$/);
});

test('plc and llp are corporate; the verdict is by registry type, not by the string on the website', () => {
  for (const type of ['plc', 'llp', 'private-limited-guarant-nsc']) assert.equal(verify({}, registryFound(now, { type })).status, S.CORPORATE_VERIFIED, type);
});

test('fake Ltd string in website copy: the registry has no such company, so nothing verifies', () => {
  const r = verify({ legalName: 'Acme Widgets Ltd', companyNumber: '' }, registryStatus('NOT_FOUND'));
  assert.equal(r.status, S.UNVERIFIED);
  assert.equal(r.verified, false);
  assert.ok(r.reasons.includes('claimed-corporate-form-not-found-in-registry'));
});

test('wrong Companies House match: a different number or a different registered name is IDENTITY_MISMATCH', () => {
  assert.equal(verify({}, registryFound(now, { companyNumber: '87654321' })).status, S.IDENTITY_MISMATCH);
  assert.equal(verify({ companyNumber: '' }, registryFound(now, { name: 'Other Corp Ltd', companyNumber: '87654321' })).status, S.IDENTITY_MISMATCH);
});

test('a site that publishes neither a legal name nor a number cannot be bound to any registry entity', () => {
  const r = verify({ legalName: '', companyNumber: '' });
  assert.equal(r.status, S.UNVERIFIED);
  assert.ok(r.reasons.includes('site-publishes-neither-a-legal-name-nor-a-company-number'));
});

test('dissolved, liquidated or otherwise inactive entities are never verified', () => {
  for (const status of ['dissolved', 'liquidation', 'administration', 'converted-closed']) assert.equal(verify({}, registryFound(now, { status })).status, S.INACTIVE_ENTITY, status);
  assert.equal(verify({}, registryFound(now, { hasBeenLiquidated: true })).status, S.INACTIVE_ENTITY);
});

test('same-name company collision and registry trouble are fail-closed statuses', () => {
  assert.equal(verify({ companyNumber: '' }, registryStatus('AMBIGUOUS', { reasons: ['multiple-entities-share-the-normalized-name'] })).status, S.AMBIGUOUS);
  for (const status of ['UNAVAILABLE', 'RATE_LIMITED', 'CREDENTIAL_MISSING', 'INVALID_RESPONSE', 'INVALID_REQUEST']) assert.equal(verify({}, registryStatus(status)).status, S.REGISTRY_UNAVAILABLE, status);
  assert.equal(verify({}, null).status, S.NO_REGISTRY_FOR_JURISDICTION);
  assert.equal(verify({}, registryStatus('NO_ADAPTER')).status, S.NO_REGISTRY_FOR_JURISDICTION);
});

test('company/domain mismatch: the contact domain must reconcile to the published site', () => {
  const r = verify({ emailDomain: 'unrelated-domain.com' });
  assert.equal(r.status, S.IDENTITY_MISMATCH);
  assert.equal(r.reconciliation.domainMatch, false);
});

test('sole traders and ordinary partnerships are NOT corporate: explicit self-description with no register entry', () => {
  for (const formText of ['sole trader', 'Sole Proprietor', 'self-employed consultant', 'trading as Acme', 'ordinary partnership']) {
    const r = verify({ legalName: 'J Smith Consulting', companyNumber: '', formText }, registryStatus('NOT_FOUND'));
    assert.equal(r.status, S.NOT_CORPORATE, formText);
    assert.equal(r.recipientType, 'SOLE_TRADER_OR_PARTNERSHIP');
    assert.equal(r.verified, false);
  }
  const contradiction = verify({ formText: 'sole trader' }, registryFound(now));
  assert.equal(contradiction.status, S.AMBIGUOUS, 'a site calling itself a sole trader while a company matches is a contradiction, not a pass');
});

test('limited partnerships, charities, royal-charter bodies, overseas entities and unmapped forms need a human', () => {
  for (const type of ['limited-partnership', 'scottish-partnership', 'charitable-incorporated-organisation', 'royal-charter', 'oversea-company', 'brand-new-form']) {
    const r = verify({}, registryFound(now, { type }));
    assert.equal(r.status, S.AMBIGUOUS, type);
    assert.equal(r.verified, false);
  }
});

test('registry evidence must be recent, dated, hashed and not from the future', () => {
  assert.equal(verify({}, registryFound(now, { ageMs: (REGISTRY_EVIDENCE_MAX_AGE_DAYS + 1) * DAY })).status, S.UNVERIFIED);
  assert.equal(verify({}, registryFound(now, { ageMs: -3600_000 * 24 })).status, S.UNVERIFIED);
  const noDigest = registryFound(now); noDigest.evidence.responseDigest = '';
  assert.equal(verify({}, noDigest).status, S.UNVERIFIED);
  const noTime = registryFound(now); noTime.evidence.retrievedAt = 'not a date';
  assert.equal(verify({}, noTime).status, S.UNVERIFIED);
});

test('legal form is only demanded where the encoded rule turns on it (GB); other jurisdictions and unresolved ones are reported honestly', () => {
  assert.equal(verify({}, registryFound(now), 'US').status, S.NOT_REQUIRED_FOR_JURISDICTION);
  assert.equal(verify({}, registryFound(now), '').status, S.UNVERIFIED);
  assert.equal(verify({}, registryFound(now), 'UK').jurisdiction, 'GB');
});

test('claims are classified but never promoted: compileLegalFormClaims flags both directions', () => {
  assert.equal(compileLegalFormClaims({ legalName: 'Acme Ltd' }).claimsCorporate, true);
  assert.equal(compileLegalFormClaims({ formText: 'trading as Acme' }).claimsNonCorporate, true);
  assert.equal(compileLegalFormClaims({ legalName: 'Unlimited Ideas' }).claimsCorporate, false);
});
