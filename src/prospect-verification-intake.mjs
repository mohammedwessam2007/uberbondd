// Deterministic intake for externally fetched prospect evidence.
//
// STATUS: INERT and pure. It decides whether one externally observed agency
// record is a VERIFIED_CANDIDATE, REJECTED, or INCOMPLETE. It sends nothing,
// grants no authority, and never replaces the sender-side legal gate: every
// result reports `legalAuthorityStatus: HOLD_SENDER_SIDE_UNRESOLVED`.
// The recipient-side check reuses the existing recipient-eligibility compiler.

import { compileRecipientEligibility, classifyRecipientAddress } from './uberoutbound-recipient-eligibility.mjs';

export const PROSPECT_INTAKE_VERSION = 'uberbond.prospect-verification-intake.v1';
export const PROSPECT_STATUSES = Object.freeze({ VERIFIED_CANDIDATE: 'VERIFIED_CANDIDATE', REJECTED: 'REJECTED', INCOMPLETE: 'INCOMPLETE' });
export const SALES_ELIGIBLE_ROLES = Object.freeze(['GENERAL_BUSINESS_INQUIRIES', 'SALES_OR_PARTNERSHIPS', 'OWNER_OR_EXECUTIVE']);
export const NON_SALES_ROLES = Object.freeze(['PRIVACY_ONLY', 'LEGAL_ONLY', 'CAREERS_ONLY', 'CUSTOMER_SUPPORT_ONLY', 'ABUSE_OR_SECURITY']);

const text = (value, max = 600) => String(value ?? '').trim().slice(0, max);
const lower = value => text(value, 500).toLowerCase();

function hostOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch { return ''; }
}
const sameSiteFamily = (a, b) => Boolean(a && b) && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));

/**
 * @param record externally observed facts (see artifacts/outreach/prospect-verification-request-20261002.json)
 * @param opts   { now, excludedRecipients: string[] }
 */
export function compileProspectVerification(record = {}, { now = new Date(), excludedRecipients = [] } = {}) {
  const rejected = [];
  const incomplete = [];
  const rej = reason => rejected.push(reason);
  const inc = reason => incomplete.push(reason);

  const company = text(record.company, 160);
  const website = text(record.website, 500);
  const siteHost = hostOf(website);
  if (!company) inc('company-missing');
  if (!siteHost) inc('company-https-website-missing');

  // Ownership and size: independent small/mid agencies only. A larger group
  // changes who the real buyer is and the overlap with existing partners.
  const ownership = text(record.currentOwnership?.status, 40).toUpperCase();
  if (ownership === 'PART_OF_LARGER_GROUP') rej('part-of-larger-group-overlap-and-buyer-mismatch');
  else if (ownership !== 'INDEPENDENT') inc('current-ownership-unverified');
  if (text(record.hqCountry, 4).toUpperCase() !== 'US') inc('us-headquarters-unverified');

  // Recipient: an address published by the agency on its own site, with the
  // address literally present in the retained excerpt.
  const email = lower(record.recipient?.email);
  const address = classifyRecipientAddress(email);
  const role = text(record.recipient?.publishedRole, 40).toUpperCase();
  if (!email) inc('recipient-email-missing');
  else if (!address.valid) rej('recipient-address-invalid');
  else if (address.addressClass === 'PERSONAL_MAILBOX_PROVIDER') rej('personal-mailbox-not-a-business-recipient');
  else if (address.addressClass === 'SYSTEM_ADDRESS') rej('system-address-not-a-recipient');
  if (NON_SALES_ROLES.includes(role)) rej(`address-published-for-${role.toLowerCase().replace(/_/g, '-')}-not-sales`);
  else if (email && !SALES_ELIGIBLE_ROLES.includes(role)) inc('published-purpose-of-address-unverified');

  const sourceUrl = text(record.recipient?.sourceUrl, 1000);
  const excerpt = text(record.recipient?.excerpt, 400);
  if (!hostOf(sourceUrl)) inc('recipient-source-https-url-missing');
  else if (siteHost && !sameSiteFamily(hostOf(sourceUrl), siteHost)) rej('address-not-published-on-the-agencys-own-site');
  if (!excerpt) inc('recipient-verbatim-excerpt-missing');
  else if (email && !excerpt.toLowerCase().includes(email)) rej('excerpt-does-not-contain-the-address');
  const observedMs = Date.parse(record.recipient?.observedAt);
  if (!Number.isFinite(observedMs)) inc('recipient-observation-time-missing');
  else if (observedMs > now.getTime() + 5 * 60_000) rej('recipient-observation-in-future');

  // Notices: both must have been checked and found absent.
  const n = record.notices || {};
  if (n.noSolicitationChecked !== true) inc('no-solicitation-notice-not-checked');
  else if (n.noSolicitationFound === true) rej('no-solicitation-notice-present');
  if (n.noHarvestChecked !== true) inc('no-harvest-notice-not-checked');
  else if (n.noHarvestFound === true) rej('no-harvest-notice-present');

  // Prior contact and suppression dominate.
  const excluded = new Set((Array.isArray(excludedRecipients) ? excludedRecipients : []).map(lower));
  if (email && excluded.has(email)) rej('prior-contact-or-suppression');

  // Offer fit and a real, externally verifiable observation.
  if (record.offerFit?.servesHomeServiceClients !== true || !hostOf(text(record.offerFit?.evidenceUrl, 1000))) inc('home-service-client-evidence-missing');
  const obs = record.clientEvidence?.observation;
  if (!hostOf(text(record.clientEvidence?.clientSiteUrl, 1000))) inc('real-client-site-missing');
  if (!obs || obs.verifiable !== true || !text(obs.text) || !hostOf(text(obs.sourceUrl, 1000)) || !text(obs.excerpt) || !Number.isFinite(Date.parse(obs.observedAt))) inc('externally-verifiable-lead-path-observation-missing');

  let eligibility = null;
  if (!rejected.length && !incomplete.length) {
    eligibility = compileRecipientEligibility({
      recipient: { email, type: 'CORPORATE', jurisdiction: 'US' },
      relationship: 'NONE',
      source: { kind: 'PUBLISHED_BUSINESS_CONTACT', ref: sourceUrl, observedAt: record.recipient.observedAt, collectionMethod: 'MANUAL', noSolicitationNoticePresent: false, noHarvestNoticePresent: false },
      offerRelevance: { relatedToRecipientRole: true, rationale: text(record.offerFit?.rationale || 'Agency publicly serves home-service clients; the offer is a lead-path evidence artifact for those clients.', 500) },
      // Recipient-side evaluation only. Sender-side authority is a separate gate.
      senderJurisdiction: 'US',
      senderCompliance: { truthfulFromAndReplyTo: true, nonDeceptiveSubject: true, advertisementDisclosure: true, unsubscribeMechanism: true, unsubscribeHonoredWithinBusinessDays: 0 },
      postalIdentity: { ok: true, status: 'UBERPOSTAL_IDENTITY_READY', identityDigest: 'recipient-side-evaluation-only' },
      transportColdB2BRule: 'ALLOWED',
      now
    });
    if (eligibility.legal.status !== 'PASSED') rej(`recipient-side-eligibility-${eligibility.legal.status.toLowerCase()}:${eligibility.reasonCodes[0] || eligibility.requirementsUnmet[0] || 'unspecified'}`);
  }

  const status = rejected.length ? PROSPECT_STATUSES.REJECTED : incomplete.length ? PROSPECT_STATUSES.INCOMPLETE : PROSPECT_STATUSES.VERIFIED_CANDIDATE;
  return {
    version: PROSPECT_INTAKE_VERSION,
    company, status,
    rejectionReasons: rejected,
    missingEvidence: status === PROSPECT_STATUSES.REJECTED ? [] : incomplete,
    recipientSideEligibility: eligibility ? { decision: eligibility.decision, basis: eligibility.basis, evidenceId: eligibility.evidenceId } : null,
    senderSideEvaluated: false,
    legalAuthorityStatus: 'HOLD_SENDER_SIDE_UNRESOLVED',
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'A VERIFIED_CANDIDATE is an externally observed, internally consistent record. It is not consent, not authorization, and not a send decision; sender-side legal authority and a founder-signed authorization remain separate gates.'
  };
}
