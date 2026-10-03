import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContactSourceBinding, CONTACT_SOURCE_STATUS as S, CONTACT_SOURCE_MAX_AGE_DAYS, NO_SOLICITATION_RESULTS as N } from '../src/contact-source-verifier.mjs';

const now = new Date('2026-10-03T12:00:00.000Z');
const good = () => ({
  contact: { route: 'EMAIL', address: 'info@acme-widgets.co.uk' },
  source: { url: 'https://www.acme-widgets.co.uk/contact/', observedAt: '2026-10-03T10:00:00Z', pageContext: 'CONTACT_PAGE', publicationType: 'OWN_SITE_PAGE', excerpt: 'General enquiries: info@acme-widgets.co.uk' },
  notices: { noSolicitationChecked: true, noSolicitationFound: false, noHarvestChecked: true, noHarvestFound: false },
  siteHost: 'acme-widgets.co.uk', now
});
const run = patch => { const base = good(); return compileContactSourceBinding({ ...base, ...patch, source: { ...base.source, ...(patch.source || {}) }, notices: { ...base.notices, ...(patch.notices || {}) }, contact: { ...base.contact, ...(patch.contact || {}) } }); };

test('a fully evidenced contact binds every field the brief names and mints a binding digest', () => {
  const r = run({});
  assert.equal(r.status, S.BOUND);
  const b = r.binding;
  for (const f of ['contactRoute', 'contactAddress', 'officialSourceUrl', 'captureTimestamp', 'pageContext', 'publicationType', 'invitationExists', 'noSolicitationResult', 'contactWasGuessed', 'obtainedFromForbiddenOrPrivateSource']) assert.ok(f in b, f);
  assert.equal(b.noSolicitationResult, N.ABSENT_VERIFIED);
  assert.equal(b.contactWasGuessed, false);
  assert.match(r.bindingDigest, /^[a-f0-9]{64}$/);
  assert.equal(r.sendAuthority, false);
});

test('hard rejects: guessed address, private source, credentialed session, ambiguous ownership, no-solicitation, no-harvest', () => {
  assert.deepEqual(run({ source: { guessed: true } }).hardRejects, ['guessed-address']);
  assert.ok(run({ source: { forbiddenSource: true } }).hardRejects.includes('private-or-forbidden-source'));
  assert.ok(run({ source: { publicationType: 'PRIVATE' } }).hardRejects.includes('private-or-forbidden-source'));
  assert.ok(run({ source: { credentialedSession: true } }).hardRejects.includes('credentialed-or-private-session-extraction'));
  assert.ok(run({ source: { ownershipAmbiguous: true } }).hardRejects.includes('ambiguous-ownership'));
  assert.ok(run({ notices: { noSolicitationFound: true } }).hardRejects.includes('explicit-no-solicitation-signal'));
  assert.ok(run({ notices: { noHarvestFound: true } }).hardRejects.includes('no-harvest-notice-present'));
  assert.ok(run({ invitation: { negativeSignal: true, invited: false } }).hardRejects.includes('explicit-no-solicitation-signal'));
  for (const r of [run({ source: { guessed: true } }), run({ notices: { noSolicitationFound: true } })]) { assert.equal(r.status, S.REJECTED); assert.equal(r.bindingDigest, null); assert.deepEqual(r.missing, []); }
});

test('missing facts are INCOMPLETE and named exactly, never assumed', () => {
  assert.ok(run({ source: { url: '' } }).missing.includes('official-source-url-exact-https'));
  assert.ok(run({ source: { url: 'http://www.acme-widgets.co.uk/' } }).missing.includes('official-source-url-exact-https'));
  assert.ok(run({ source: { observedAt: '' } }).missing.includes('capture-timestamp'));
  assert.ok(run({ source: { pageContext: '' } }).missing.includes('page-context'));
  assert.ok(run({ source: { publicationType: '' } }).missing.includes('publication-type'));
  assert.ok(run({ source: { publicationType: 'SOCIAL' } }).missing.includes('official-publication-source'));
  assert.ok(run({ source: { excerpt: 'no address printed' } }).missing.includes('address-present-in-retained-excerpt'));
  assert.ok(run({ notices: { noSolicitationChecked: false } }).missing.includes('no-solicitation-notice-check'));
  assert.ok(run({ notices: { noHarvestChecked: false } }).missing.includes('no-harvest-notice-check'));
  assert.equal(run({ notices: { noSolicitationChecked: false } }).binding.noSolicitationResult, N.NOT_CHECKED);
  assert.equal(run({ source: { url: '' } }).status, S.INCOMPLETE);
});

test('evidence age is bounded by the cold-route evidence ceiling, and a future capture time is refused', () => {
  assert.equal(CONTACT_SOURCE_MAX_AGE_DAYS, 7);
  assert.ok(run({ source: { observedAt: '2026-09-20T00:00:00Z' } }).missing.includes('contact-source-evidence-stale'));
  assert.ok(run({ source: { observedAt: '2026-10-09T00:00:00Z' } }).missing.includes('capture-timestamp-in-future'));
});

test('a contact published off the company\'s own site is a hard reject', () => {
  assert.ok(run({ source: { url: 'https://random-directory.example/acme' } }).hardRejects.includes('contact-published-off-the-companys-own-site'));
});

test('form and portal contacts bind a form URL instead of an address', () => {
  const r = run({ contact: { route: 'FORM', address: '', formUrl: 'https://www.acme-widgets.co.uk/vendor-form' } });
  assert.equal(r.status, S.BOUND);
  assert.equal(r.binding.contactFormUrl, 'https://www.acme-widgets.co.uk/vendor-form');
  assert.equal(r.binding.contactAddress, null);
  assert.ok(run({ contact: { route: 'FORM', address: '', formUrl: '' } }).missing.includes('contact-form-or-portal-url-exact-https'));
});

test('an invitation is recorded in the binding but never replaces the other required evidence', () => {
  const r = run({ invitation: { invited: true, evidenceDigest: 'd'.repeat(64) }, source: { url: '' } });
  assert.equal(r.binding.invitationExists, true);
  assert.equal(r.status, S.INCOMPLETE);
});
