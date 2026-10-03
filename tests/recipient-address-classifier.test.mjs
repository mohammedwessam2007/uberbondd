import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRecipientInbox, INBOX_CLASSES as C, publicationIsOfficial } from '../src/recipient-address-classifier.mjs';

const company = { legalName: 'Acme Widgets Ltd', siteHost: 'acme-widgets.co.uk' };
const source = (email, over = {}) => ({ url: 'https://www.acme-widgets.co.uk/contact/', observedAt: '2026-10-03T10:00:00Z', publicationType: 'OWN_SITE_PAGE', pageContext: 'CONTACT_PAGE', excerpt: `General enquiries: ${email}`, ...over });
const classify = (email, over = {}, extra = {}) => classifyRecipientInbox({ email, company, source: source(email, over), ...extra });

test('every role prefix the founder named classifies as a generic corporate inbox when published by the company on its own domain', () => {
  for (const local of ['hello', 'info', 'sales', 'business', 'commercial', 'partnerships', 'enquiries', 'operations', 'contact', 'vendors', 'procurement', 'suppliers']) {
    const r = classify(`${local}@acme-widgets.co.uk`);
    assert.equal(r.addressClass, C.GENERIC_CORPORATE_ROLE_INBOX, local);
    assert.equal(r.privacyClass, 'COMPANY_LEVEL');
    assert.equal(r.eligibleAsContact, true);
  }
});

test('classification is never from the prefix alone: the same prefix on a domain the company does not own is AMBIGUOUS', () => {
  const r = classify('info@someone-elses-domain.com');
  assert.equal(r.addressClass, C.AMBIGUOUS);
  assert.ok(r.reasons.includes('email-domain-is-not-the-companys-published-domain'));
  assert.equal(r.eligibleAsContact, false);
});

test('a named individual hidden behind an info-like local part is a NAMED_BUSINESS_PERSON (supplied evidence)', () => {
  const r = classify('info@acme-widgets.co.uk', {}, { namedPersonEvidence: { present: true } });
  assert.equal(r.addressClass, C.NAMED_BUSINESS_PERSON);
  assert.equal(r.privacyClass, 'PERSONAL_DATA');
});

test('...and is also caught from the retained excerpt when the evidence lane did not flag it', () => {
  for (const excerpt of ['Contact Jane Smith at info@acme-widgets.co.uk', 'Email Dr. Omar Aziz: info@acme-widgets.co.uk', 'Jane Smith, Director - info@acme-widgets.co.uk']) {
    assert.equal(classify('info@acme-widgets.co.uk', { excerpt }).addressClass, C.NAMED_BUSINESS_PERSON, excerpt);
  }
});

test('ordinary capitalised words are not people: "Contact Us" and "Email Sales" stay company-level', () => {
  for (const excerpt of ['Contact Us at info@acme-widgets.co.uk', 'Email Sales on info@acme-widgets.co.uk', 'Enquiries Team: info@acme-widgets.co.uk']) {
    assert.equal(classify('info@acme-widgets.co.uk', { excerpt }).addressClass, C.GENERIC_CORPORATE_ROLE_INBOX, excerpt);
  }
});

test('personal-name local parts on the company domain are named people; opaque ones are AMBIGUOUS', () => {
  assert.equal(classify('jane.smith@acme-widgets.co.uk').addressClass, C.NAMED_BUSINESS_PERSON);
  assert.equal(classify('jane@acme-widgets.co.uk').addressClass, C.NAMED_BUSINESS_PERSON);
  assert.equal(classify('x9@acme-widgets.co.uk').addressClass, C.AMBIGUOUS);
});

test('personal/consumer mailbox providers and system addresses are typed and never eligible', () => {
  assert.equal(classify('someone@gmail.com').addressClass, C.PERSONAL_OR_CONSUMER_ADDRESS);
  assert.equal(classify('someone@outlook.com').addressClass, C.PERSONAL_OR_CONSUMER_ADDRESS);
  assert.equal(classify('noreply@acme-widgets.co.uk').addressClass, C.SYSTEM_ADDRESS);
  assert.equal(classify('postmaster@acme-widgets.co.uk').eligibleAsContact, false);
});

test('a guessed address is never promoted to an eligible contact', () => {
  assert.equal(classify('info@acme-widgets.co.uk', { guessed: true }).addressClass, C.GUESS_OR_UNVERIFIED);
  assert.equal(classify('info@acme-widgets.co.uk', { kind: 'GUESSED_PATTERN' }).addressClass, C.GUESS_OR_UNVERIFIED);
  const r = classify('info@acme-widgets.co.uk', { guessed: true });
  assert.equal(r.eligibleAsContact, false);
});

test('private / forbidden sources and missing provenance fail as GUESS_OR_UNVERIFIED', () => {
  assert.equal(classify('info@acme-widgets.co.uk', { publicationType: 'PRIVATE' }).addressClass, C.GUESS_OR_UNVERIFIED);
  assert.equal(classify('info@acme-widgets.co.uk', { forbiddenSource: true }).addressClass, C.GUESS_OR_UNVERIFIED);
  assert.equal(classify('info@acme-widgets.co.uk', { url: '' }).addressClass, C.GUESS_OR_UNVERIFIED);
  assert.equal(classify('info@acme-widgets.co.uk', { observedAt: '' }).addressClass, C.GUESS_OR_UNVERIFIED);
  assert.equal(classify('info@acme-widgets.co.uk', { excerpt: 'we never print the address here' }).addressClass, C.GUESS_OR_UNVERIFIED);
  assert.equal(classify('not-an-address').addressClass, C.GUESS_OR_UNVERIFIED);
});

test('an address from a directory or social profile is AMBIGUOUS: only official publication counts', () => {
  for (const publicationType of ['DIRECTORY', 'SOCIAL', 'UNKNOWN', '']) assert.equal(classify('info@acme-widgets.co.uk', { publicationType }).addressClass, C.AMBIGUOUS, publicationType);
  assert.equal(publicationIsOfficial('OWN_SITE_PAGE'), true);
  assert.equal(publicationIsOfficial('OFFICIAL_REGISTER'), true);
  assert.equal(publicationIsOfficial('SOCIAL'), false);
});

test('results carry no authority and no raw external effect', () => {
  const r = classify('info@acme-widgets.co.uk');
  assert.equal(r.sendAuthority, false);
  assert.equal(r.externalEffectAuthority, 'NONE');
  assert.ok(r.signals.publicationOfficial && r.signals.domainMatchesCompany && r.signals.addressInRetainedExcerpt);
});
