// GENERIC CORPORATE INBOX CLASSIFIER.
//
// Types a recipient address by COMBINING evidence, never from the local-part
// prefix alone:
//
//   mailbox local part + official publication source + company-domain match
//   + page context + named-person evidence + company identity
//
// Typed results:
//   GENERIC_CORPORATE_ROLE_INBOX   company-level mailbox published by the company
//   NAMED_BUSINESS_PERSON          an identifiable individual at a business
//   PERSONAL_OR_CONSUMER_ADDRESS   free-mail / consumer mailbox provider
//   SYSTEM_ADDRESS                 noreply/postmaster/abuse/...
//   AMBIGUOUS                      evidence does not settle the type
//   GUESS_OR_UNVERIFIED            guessed, unpublished, or provenance missing
//
// An `info@` prefix can still be a named individual (a page that says "email
// Jane at info@..."), and a role-looking prefix on a domain the company does
// not own is not the company's inbox. A guessed address is never promoted to an
// eligible contact. It builds on the canonical classifyRecipientAddress so
// there is one owner of the prefix vocabulary.
//
// Pure and read-only; grants no authority.

import { classifyRecipientAddress } from './uberoutbound-recipient-eligibility.mjs';
import { sameDomainFamily } from './host-family.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const RECIPIENT_ADDRESS_CLASSIFIER_VERSION = 'uberbond.recipient-address-classifier.v1';

export const INBOX_CLASSES = Object.freeze({
  GENERIC_CORPORATE_ROLE_INBOX: 'GENERIC_CORPORATE_ROLE_INBOX',
  NAMED_BUSINESS_PERSON: 'NAMED_BUSINESS_PERSON',
  PERSONAL_OR_CONSUMER_ADDRESS: 'PERSONAL_OR_CONSUMER_ADDRESS',
  SYSTEM_ADDRESS: 'SYSTEM_ADDRESS',
  AMBIGUOUS: 'AMBIGUOUS',
  GUESS_OR_UNVERIFIED: 'GUESS_OR_UNVERIFIED'
});

export const OFFICIAL_PUBLICATION_TYPES = Object.freeze(['OWN_SITE_PAGE', 'OFFICIAL_REGISTER']);
export const PUBLICATION_TYPES = Object.freeze(['OWN_SITE_PAGE', 'OFFICIAL_REGISTER', 'DIRECTORY', 'SOCIAL', 'PRIVATE', 'UNKNOWN']);

const clean = (value, max = 600) => String(value ?? '').trim().slice(0, max);
const lower = value => clean(value, 1000).toLowerCase();

// A person named next to the address in the retained excerpt. Keywords match in
// any case; the NAME stays case-sensitive so ordinary lowercase words never look
// like a person.
const anyCase = word => word.split('').map(ch => (/[a-z]/i.test(ch) ? `[${ch.toUpperCase()}${ch.toLowerCase()}]` : ch === ' ' ? '\\s+' : ch === '.' ? '\\.' : ch === '-' ? '-' : ch)).join('');
// Ordinary capitalised words that are not a person ("Contact Us", "Email Sales").
const NOT_A_NAME = 'Us|Our|Sales|Support|Team|The|Info|Customer|Service|Services|General|Business|Enquiries|Enquiry|Inquiries|Inquiry|Office|Reception|Admin|Marketing|Partnerships|Partnership|Please|Any|All|Anyone|Commercial|Procurement|Vendors|Suppliers|Operations|Hello';
const NAME = String.raw`(?!(?:${NOT_A_NAME})\b)[A-Z][a-z]{1,20}(?:[-' ][A-Z][a-z]{1,20}){0,2}`;
const VERBS = ['contact', 'email', 'e-mail', 'ask for', 'speak to', 'speak with', 'attn.', 'attention', 'reach', 'message', 'write to', 'call'].map(anyCase).join('|');
const TITLES = ['Mr', 'Ms', 'Mrs', 'Miss', 'Dr', 'Prof'].join('|');
const ROLES = ['Founder', 'Co-?founder', 'CEO', 'Director', 'Managing Director', 'Owner', 'Principal', 'Partner', 'Head of', 'VP', 'Vice President', 'Manager', 'Consultant'].join('|');
const NAMED_NEAR_ADDRESS = new RegExp(String.raw`\b(?:${VERBS})\s+(?:(?:${TITLES})\.?\s+)?${NAME}\b|\b${NAME},?\s+(?:${ROLES})\b`);

export function publicationIsOfficial(publicationType) {
  return OFFICIAL_PUBLICATION_TYPES.includes(clean(publicationType, 40).toUpperCase());
}

/** The excerpt window around the first occurrence of the address (case-insensitive). */
function windowAround(excerpt, email) {
  const text = clean(excerpt, 4000);
  const at = text.toLowerCase().indexOf(email);
  if (at < 0) return null;
  return text.slice(Math.max(0, at - 140), Math.min(text.length, at + email.length + 140));
}

export function classifyRecipientInbox({
  email = '',
  company = {},
  source = {},
  namedPersonEvidence = {}
} = {}) {
  const address = clean(email, 320).toLowerCase();
  const base = classifyRecipientAddress(address);
  const reasons = [];
  const signals = {
    localPartClass: base.addressClass,
    publicationOfficial: publicationIsOfficial(source.publicationType),
    domainMatchesCompany: null,
    addressInRetainedExcerpt: null,
    namedPersonEvidence: false,
    pageContext: clean(source.pageContext, 60) || null,
    guessed: source.guessed === true || clean(source.kind, 40).toUpperCase() === 'GUESSED_PATTERN',
    privateOrForbiddenSource: false
  };
  const done = (addressClass, extra = {}) => ({
    version: RECIPIENT_ADDRESS_CLASSIFIER_VERSION,
    address: address || null,
    domain: base.domain || null,
    addressClass,
    // company-level facts + a corporate role inbox carry less personal-data weight
    privacyClass: addressClass === INBOX_CLASSES.GENERIC_CORPORATE_ROLE_INBOX ? 'COMPANY_LEVEL'
      : (addressClass === INBOX_CLASSES.NAMED_BUSINESS_PERSON || addressClass === INBOX_CLASSES.PERSONAL_OR_CONSUMER_ADDRESS) ? 'PERSONAL_DATA' : 'UNKNOWN',
    eligibleAsContact: addressClass === INBOX_CLASSES.GENERIC_CORPORATE_ROLE_INBOX || addressClass === INBOX_CLASSES.NAMED_BUSINESS_PERSON,
    signals: { ...signals, ...(extra.signals || {}) },
    reasons: [...new Set(reasons)],
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  });

  if (!base.valid) { reasons.push('address-invalid'); return done(INBOX_CLASSES.GUESS_OR_UNVERIFIED); }
  if (base.addressClass === 'SYSTEM_ADDRESS') { reasons.push('system-address-not-a-marketing-recipient'); return done(INBOX_CLASSES.SYSTEM_ADDRESS); }
  if (base.addressClass === 'PERSONAL_MAILBOX_PROVIDER') { reasons.push('personal-mailbox-provider-domain'); return done(INBOX_CLASSES.PERSONAL_OR_CONSUMER_ADDRESS); }

  // Provenance first: a guessed or private-source address is never promoted.
  const pubType = clean(source.publicationType, 40).toUpperCase();
  signals.privateOrForbiddenSource = source.forbiddenSource === true || pubType === 'PRIVATE';
  if (signals.guessed) { reasons.push('address-was-guessed-or-pattern-derived'); return done(INBOX_CLASSES.GUESS_OR_UNVERIFIED); }
  if (signals.privateOrForbiddenSource) { reasons.push('address-came-from-a-private-or-forbidden-source'); return done(INBOX_CLASSES.GUESS_OR_UNVERIFIED); }
  const url = clean(source.url, 1000);
  const windowText = windowAround(source.excerpt, address);
  signals.addressInRetainedExcerpt = windowText !== null;
  if (!/^https:\/\//i.test(url) || !clean(source.observedAt, 64) || windowText === null) {
    if (!/^https:\/\//i.test(url)) reasons.push('publication-source-url-missing');
    if (!clean(source.observedAt, 64)) reasons.push('publication-capture-time-missing');
    if (windowText === null) reasons.push('address-not-present-in-retained-excerpt');
    return done(INBOX_CLASSES.GUESS_OR_UNVERIFIED);
  }
  if (!publicationIsOfficial(pubType)) { reasons.push(`publication-source-not-official:${(pubType || 'UNKNOWN').toLowerCase()}`); return done(INBOX_CLASSES.AMBIGUOUS); }

  // The mailbox must live on the company's own domain.
  signals.domainMatchesCompany = sameDomainFamily(base.domain, clean(company.siteHost, 255));
  if (!signals.domainMatchesCompany) { reasons.push('email-domain-is-not-the-companys-published-domain'); return done(INBOX_CLASSES.AMBIGUOUS); }

  // A person named beside the address overrides any role-looking prefix.
  const suppliedNamed = namedPersonEvidence?.present === true;
  const heuristicNamed = NAMED_NEAR_ADDRESS.test(windowText);
  signals.namedPersonEvidence = suppliedNamed || heuristicNamed;
  if (suppliedNamed) { reasons.push('named-person-evidence-supplied-for-this-mailbox'); return done(INBOX_CLASSES.NAMED_BUSINESS_PERSON); }
  if (heuristicNamed) { reasons.push('excerpt-names-a-person-beside-the-address'); return done(INBOX_CLASSES.NAMED_BUSINESS_PERSON); }

  if (base.addressClass === 'ROLE_BUSINESS_ADDRESS') {
    reasons.push('role-prefix-on-company-domain-published-by-the-company');
    return done(INBOX_CLASSES.GENERIC_CORPORATE_ROLE_INBOX);
  }
  const local = address.split('@')[0].split('+')[0];
  if (/^[a-z]+([._-][a-z]+)+$/.test(local) || /^[a-z]{3,14}$/.test(local)) {
    reasons.push('local-part-looks-like-a-personal-name');
    return done(INBOX_CLASSES.NAMED_BUSINESS_PERSON);
  }
  reasons.push('local-part-neither-a-role-nor-a-recognisable-name');
  return done(INBOX_CLASSES.AMBIGUOUS);
}
