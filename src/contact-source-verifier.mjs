// CONTACT-SOURCE VERIFICATION.
//
// Every green contact is bound to the exact public evidence it came from:
//
//   contact route (address / form), official source URL, capture time, page
//   context, publication type, whether an invitation exists, the no-solicitation
//   result, whether the contact was guessed, and whether it was obtained from a
//   forbidden or private source.
//
// Hard rejects (the contact can never be used on any route):
//   guessed address, private source, credentialed/private-session extraction,
//   ambiguous ownership, explicit no-solicitation signal, published no-harvest
//   notice.
// Missing facts are INCOMPLETE (named exactly), never assumed.
//
// It shares the host/site-family rule with the prospect intake
// (src/host-family.mjs) and takes its evidence-age ceiling from the cold-route
// owner (src/outreach-cold-route-policy.mjs) instead of restating either. Pure; no authority.

import { sha256 as canonicalSha256 } from './omnia-v9/canonical.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { COLD_ROUTE_MAX_EVIDENCE_AGE_DAYS } from './outreach-cold-route-policy.mjs';
import { PUBLICATION_TYPES, publicationIsOfficial } from './recipient-address-classifier.mjs';
import { httpsHostOf as httpsHost, sameDomainFamily } from './host-family.mjs';

export const CONTACT_SOURCE_VERIFIER_VERSION = 'uberbond.contact-source-verifier.v1';
export const CONTACT_SOURCE_STATUS = Object.freeze({ BOUND: 'BOUND', REJECTED: 'REJECTED', INCOMPLETE: 'INCOMPLETE' });
export const CONTACT_SOURCE_MAX_AGE_DAYS = COLD_ROUTE_MAX_EVIDENCE_AGE_DAYS;
export const NO_SOLICITATION_RESULTS = Object.freeze({ ABSENT_VERIFIED: 'ABSENT_VERIFIED', PRESENT: 'PRESENT', NOT_CHECKED: 'NOT_CHECKED' });

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

/**
 * @param {object} input
 * @param {{route:string,address?:string,formUrl?:string}} input.contact
 * @param {object} input.source     { url, observedAt, pageContext, publicationType, excerpt, guessed, forbiddenSource, credentialedSession, ownershipAmbiguous }
 * @param {object} [input.notices]  { noSolicitationChecked, noSolicitationFound, noHarvestChecked, noHarvestFound }
 * @param {object} [input.invitation] result of classifyInvitedContact (optional)
 * @param {string} [input.siteHost]
 */
export function compileContactSourceBinding({ contact = {}, source = {}, notices = {}, invitation = null, siteHost = '', now = new Date() } = {}) {
  const hardRejects = [];
  const missing = [];
  const route = clean(contact.route, 30).toUpperCase() || 'EMAIL';
  const address = clean(contact.address, 320).toLowerCase();
  const url = clean(source.url, 1000);
  const host = httpsHost(url);
  const observedMs = Date.parse(source.observedAt);
  const nowMs = new Date(now).getTime();
  const publicationType = clean(source.publicationType, 40).toUpperCase();

  if (source.guessed === true || clean(source.kind, 40).toUpperCase() === 'GUESSED_PATTERN') hardRejects.push('guessed-address');
  if (source.forbiddenSource === true || publicationType === 'PRIVATE') hardRejects.push('private-or-forbidden-source');
  if (source.credentialedSession === true) hardRejects.push('credentialed-or-private-session-extraction');
  if (source.ownershipAmbiguous === true) hardRejects.push('ambiguous-ownership');
  if (notices.noSolicitationChecked === true && notices.noSolicitationFound === true) hardRejects.push('explicit-no-solicitation-signal');
  if (notices.noHarvestChecked === true && notices.noHarvestFound === true) hardRejects.push('no-harvest-notice-present');
  if (invitation?.negativeSignal === true) hardRejects.push('explicit-no-solicitation-signal');

  if (!host) missing.push('official-source-url-exact-https');
  if (!Number.isFinite(observedMs)) missing.push('capture-timestamp');
  else if (observedMs > nowMs + 5 * 60_000) missing.push('capture-timestamp-in-future');
  else if (nowMs - observedMs > CONTACT_SOURCE_MAX_AGE_DAYS * 86_400_000) missing.push('contact-source-evidence-stale');
  if (!clean(source.pageContext, 80)) missing.push('page-context');
  if (!PUBLICATION_TYPES.includes(publicationType)) missing.push('publication-type');
  else if (!publicationIsOfficial(publicationType) && publicationType !== 'PRIVATE') missing.push('official-publication-source');
  if (route === 'EMAIL') {
    if (!address) missing.push('contact-address');
    else if (!clean(source.excerpt, 4000).toLowerCase().includes(address)) missing.push('address-present-in-retained-excerpt');
  } else if (!httpsHost(contact.formUrl)) missing.push('contact-form-or-portal-url-exact-https');
  if (siteHost && host && !sameDomainFamily(host, siteHost)) hardRejects.push('contact-published-off-the-companys-own-site');
  if (notices.noSolicitationChecked !== true) missing.push('no-solicitation-notice-check');
  if (notices.noHarvestChecked !== true) missing.push('no-harvest-notice-check');

  const noSolicitationResult = notices.noSolicitationChecked === true
    ? (notices.noSolicitationFound === true || invitation?.negativeSignal === true ? NO_SOLICITATION_RESULTS.PRESENT : NO_SOLICITATION_RESULTS.ABSENT_VERIFIED)
    : NO_SOLICITATION_RESULTS.NOT_CHECKED;
  const binding = {
    contactRoute: route,
    contactAddress: route === 'EMAIL' ? address || null : null,
    contactFormUrl: route === 'EMAIL' ? null : clean(contact.formUrl, 1000) || null,
    officialSourceUrl: host ? url : null,
    captureTimestamp: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : null,
    pageContext: clean(source.pageContext, 80) || null,
    publicationType: publicationType || null,
    invitationExists: invitation?.invited === true,
    invitationEvidenceDigest: invitation?.evidenceDigest || null,
    noSolicitationResult,
    contactWasGuessed: source.guessed === true,
    obtainedFromForbiddenOrPrivateSource: source.forbiddenSource === true || publicationType === 'PRIVATE' || source.credentialedSession === true,
    excerptDigest: clean(source.excerpt, 4000) ? canonicalSha256(clean(source.excerpt, 4000)) : null
  };
  const uniqueRejects = [...new Set(hardRejects)];
  const uniqueMissing = [...new Set(missing)];
  const status = uniqueRejects.length ? CONTACT_SOURCE_STATUS.REJECTED : uniqueMissing.length ? CONTACT_SOURCE_STATUS.INCOMPLETE : CONTACT_SOURCE_STATUS.BOUND;
  return {
    version: CONTACT_SOURCE_VERIFIER_VERSION,
    status,
    bound: status === CONTACT_SOURCE_STATUS.BOUND,
    hardRejects: uniqueRejects,
    missing: status === CONTACT_SOURCE_STATUS.REJECTED ? [] : uniqueMissing,
    binding,
    bindingDigest: status === CONTACT_SOURCE_STATUS.BOUND ? canonicalSha256({ version: CONTACT_SOURCE_VERIFIER_VERSION, binding }) : null,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}
