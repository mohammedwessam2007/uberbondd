// Deterministic intake for externally fetched prospect evidence.
//
// STATUS: INERT and pure. It decides whether one externally observed agency
// record is a VERIFIED_CANDIDATE, REJECTED, or INCOMPLETE. It sends nothing,
// grants no authority, and never replaces the sender-side legal gate: every
// result reports `legalAuthorityStatus: HOLD_SENDER_SIDE_UNRESOLVED`.
// The recipient-side check reuses the existing recipient-eligibility compiler.

import { compileRecipientEligibility, classifyRecipientAddress } from './uberoutbound-recipient-eligibility.mjs';
import { UBERREPLY_OFFER_PORTFOLIO } from './uberreply-four-offer-genome.mjs';
import { httpsHostOf, sameDomainFamily } from './host-family.mjs';
import { contactHistoryReceiptUsable, verifyContactHistorySignature, domainOfEmail, CONTACT_HISTORY_RUNTIME_PROVENANCE, RESULT_STATUS as CONTACT_HISTORY_STATUS } from './prospect-contact-history.mjs';

export const PROSPECT_INTAKE_VERSION = 'uberbond.prospect-verification-intake.v1';
export const PROSPECT_STATUSES = Object.freeze({ VERIFIED_CANDIDATE: 'VERIFIED_CANDIDATE', REJECTED: 'REJECTED', INCOMPLETE: 'INCOMPLETE' });
export const SALES_ELIGIBLE_ROLES = Object.freeze(['GENERAL_BUSINESS_INQUIRIES', 'GENERAL_BUSINESS_AND_PARTNERSHIP_CONTACT', 'SALES_OR_PARTNERSHIPS', 'OWNER_OR_EXECUTIVE']);
export const NON_SALES_ROLES = Object.freeze(['PRIVACY_ONLY', 'LEGAL_ONLY', 'CAREERS_ONLY', 'CUSTOMER_SUPPORT_ONLY', 'ABUSE_OR_SECURITY']);
// Only these evidence classes can support VERIFIED_CANDIDATE. A search-engine
// summary never can: it does not retain the page text the address came from.
export const ACCEPTED_EVIDENCE_CLASSES = Object.freeze(['PAGE_FETCH_VERIFIED', 'EXTERNAL_LANE_REPORT_WITH_EXCERPT']);
// A published stance against unsolicited or unconsented marketing is a negative
// recipient signal. It is a reputational and fit rejection even where the law
// would allow the message (REJECT_NEGATIVE_RECIPIENT_SIGNAL).
export const NEGATIVE_RECIPIENT_SIGNAL_KINDS = Object.freeze(['PUBLISHED_ANTI_UNSOLICITED_STANCE', 'CONSENT_REQUIRED_STANCE', 'NO_VENDOR_SOLICITATION']);
// Same-day evidence law (docs/receipts/POWERHOUSE_PROOF_RECHECK_2026-10-09.md,
// docs/handoffs/OUTREACH_PREPAYMENT_CURRENT_2026-10-09.md step 2): the public
// page whose wording a first touch quotes (the lead-path observation) must have
// been observed within one day of evaluation. A parseable timestamp
// alone is not freshness. Callers may only tighten this window, never widen it.
export const EVIDENCE_OBSERVATION_MAX_AGE_MS = 24 * 60 * 60_000;
const FUTURE_SKEW_MS = 5 * 60_000;
function effectiveEvidenceMaxAgeMs(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, EVIDENCE_OBSERVATION_MAX_AGE_MS) : EVIDENCE_OBSERVATION_MAX_AGE_MS;
}
// The existing flagship offer quartet, resolved from the canonical production
// genome (UBERREPLY_OFFER_PORTFOLIO) so there is exactly one offer-id
// namespace. October-2026 public names, former public names and the labels used
// by earlier intake artifacts are accepted as aliases and always normalise to
// the canonical id. A new offer is never invented here.
export const OFFER_IDS = Object.freeze(UBERREPLY_OFFER_PORTFOLIO.map(offer => offer.offerId));
const LEGACY_INTAKE_OFFER_LABELS = Object.freeze({
  AGENCY_REVENUE_LEAK_PROOF_PACK: 'LEAD_TO_BOOKING_LEAK_AUDIT',
  AI_AGENT_PRODUCTION_RELEASE_GATE: 'AI_AGENT_RELEASE_GATE',
  REVENUE_PROOF_AND_RENEWAL_PACK: 'CLIENT_ROI_PROOF_SPRINT',
  GCC_BOOKING_PARITY_SPRINT: 'BILINGUAL_BOOKING_LEAK_AUDIT'
});
const OFFER_ALIAS_INDEX = new Map([
  ...OFFER_IDS.map(id => [id, id]),
  ...Object.entries(LEGACY_INTAKE_OFFER_LABELS),
  ...UBERREPLY_OFFER_PORTFOLIO.flatMap(offer => [offer.publicName, ...offer.formerPublicNames].map(name => [String(name).toUpperCase(), offer.offerId]))
]);
export function resolveOfferId(value) {
  return OFFER_ALIAS_INDEX.get(String(value ?? '').trim().toUpperCase()) || null;
}

const text = (value, max = 600) => String(value ?? '').trim().slice(0, max);
const lower = value => text(value, 500).toLowerCase();

const hostOf = httpsHostOf;
const sameSiteFamily = sameDomainFamily;

/**
 * @param record externally observed facts (see artifacts/outreach/prospect-verification-request-20261002.json)
 * @param opts   { now, excludedRecipients: string[],
 *                 contactHistoryTrust: { inProcess: true } | { secret },
 *                 receiptMaxAgeMs, evidenceMaxAgeMs (may only tighten EVIDENCE_OBSERVATION_MAX_AGE_MS) }
 *
 * Contact history comes from `record.contactHistoryReceipt`, a typed receipt
 * compiled by src/prospect-contact-history.mjs from the production ledgers
 * (RUNTIME_RECEIPT provenance). A receipt that crossed a boundary must be
 * HMAC-verified (`contactHistoryTrust.secret`); a receipt computed in-process
 * is declared with `{ inProcess: true }`. The legacy hand-set `contactHistory`
 * flags are still read, but only as a MANUAL_ATTESTATION that can never make a
 * candidate runtime-ready (see `contactHistoryProvenance` in the result).
 */
export function compileProspectVerification(record = {}, { now = new Date(), excludedRecipients = [], contactHistoryTrust = null, receiptMaxAgeMs, jurisdictionPolicy = null, evidenceMaxAgeMs } = {}) {
  // `jurisdictionPolicy` is supplied only by the global preflight. By default the
  // intake keeps its US-only recipient-side check. With { anyHeadquarters,
  // deferRecipientSide } the global green-lane router becomes the single owner
  // of the recipient-side legal decision for every jurisdiction.
  const globalJurisdiction = jurisdictionPolicy?.anyHeadquarters === true;
  const deferRecipientSide = jurisdictionPolicy?.deferRecipientSide === true;
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
  if (ownership === 'PART_OF_LARGER_GROUP') {
    // Being part of a group is not by itself a rejection: decide whether the
    // entity still operates as a prospect and whether the parent overlaps the offer.
    const pa = record.currentOwnership?.parentAssessment;
    if (!pa || typeof pa !== 'object') inc('parent-company-assessment-missing');
    else {
      const overlap = text(pa.parentOverlapWithOffer, 12).toUpperCase();
      if (pa.operatesUnderOwnBrand !== true) rej('entity-no-longer-operates-as-its-own-prospect');
      else if (overlap === 'HIGH') rej('parent-overlap-makes-offer-redundant');
      else if (overlap !== 'LOW') inc('parent-overlap-with-offer-unassessed');
      else if (!text(pa.rationale, 400) || !text(pa.evidenceRef, 500)) inc('parent-assessment-rationale-and-evidence-required');
    }
  } else if (ownership !== 'INDEPENDENT') inc('current-ownership-unverified');
  if (globalJurisdiction) {
    if (!/^[A-Z]{2}$/.test(text(record.hqCountry, 4).toUpperCase().replace(/^UK$/, 'GB'))) inc('headquarters-country-unverified');
  } else if (text(record.hqCountry, 4).toUpperCase() !== 'US') inc('us-headquarters-unverified');

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

  // The page that published the address must be named exactly. A site-level or
  // "somewhere on the site" source cannot back a route envelope later.
  if (email && record.recipient?.sourcePageExact !== true) inc('recipient-exact-source-page-not-identified');
  const sourceUrl = text(record.recipient?.sourceUrl, 1000);
  const excerpt = text(record.recipient?.excerpt, 400);
  if (!hostOf(sourceUrl)) inc('recipient-source-https-url-missing');
  else if (siteHost && !sameSiteFamily(hostOf(sourceUrl), siteHost)) rej('address-not-published-on-the-agencys-own-site');
  if (!excerpt) inc('recipient-verbatim-excerpt-missing');
  else if (email && !excerpt.toLowerCase().includes(email)) rej('excerpt-does-not-contain-the-address');
  const nowMs = new Date(now).getTime();
  // An unparseable evaluation clock makes every age comparison below false
  // (NaN), which would read a stale observation as fresh. Fail closed instead.
  const clockValid = Number.isFinite(nowMs);
  if (!clockValid) rej('evaluation-clock-invalid');
  const maxEvidenceAgeMs = effectiveEvidenceMaxAgeMs(evidenceMaxAgeMs);
  const observedMs = Date.parse(record.recipient?.observedAt);
  if (!Number.isFinite(observedMs)) inc('recipient-observation-time-missing');
  else if (observedMs > nowMs + FUTURE_SKEW_MS) rej('recipient-observation-in-future');
  // Recipient-address age is owned by src/contact-source-verifier.mjs
  // (CONTACT_SOURCE_MAX_AGE_DAYS) through the green-lane router; it is not re-decided here.

  // Negative recipient signals reject outright; they are evidence, not noise.
  const signals = Array.isArray(record.negativeRecipientSignals) ? record.negativeRecipientSignals : [];
  for (const sig of signals) {
    const kind = text(sig?.kind, 60).toUpperCase();
    rej(`negative-recipient-signal:${NEGATIVE_RECIPIENT_SIGNAL_KINDS.includes(kind) ? kind.toLowerCase() : 'unrecognized'}`);
  }

  // Evidence class: a search-engine summary cannot verify a candidate.
  const evidenceClass = text(record.evidenceClass, 60).toUpperCase();
  if (!ACCEPTED_EVIDENCE_CLASSES.includes(evidenceClass)) inc(evidenceClass === 'SEARCH_SUMMARY_ONLY' ? 'evidence-class-search-summary-only' : 'evidence-class-unverified');

  // Offer routing: exactly one existing offer, with a stated reason.
  const offerId = resolveOfferId(text(record.offerRoute?.offerId, 120)) || '';
  if (!offerId || text(record.offerRoute?.rationale, 400).length < 20) inc('offer-route-from-existing-quartet-required');

  // Notices: both must have been checked and found absent.
  const n = record.notices || {};
  if (n.noSolicitationChecked !== true) inc('no-solicitation-notice-not-checked');
  else if (n.noSolicitationFound === true) rej('no-solicitation-notice-present');
  if (n.noHarvestChecked !== true) inc('no-harvest-notice-not-checked');
  else if (n.noHarvestFound === true) rej('no-harvest-notice-present');

  // Prior contact and suppression dominate. Searching the repository and an
  // external lane's copy of main is not a substitute for UberBond's own runtime
  // suppression, prior-contact, bounce, complaint and unsubscribe ledgers.
  let contactHistoryProvenance = 'NONE';
  let contactHistoryReceiptDigest = null;
  const receipt = record.contactHistoryReceipt;
  if (receipt && typeof receipt === 'object') {
    const usable = contactHistoryReceiptUsable(receipt, { email, domain: domainOfEmail(email), now, maxAgeMs: receiptMaxAgeMs });
    const trusted = contactHistoryTrust?.inProcess === true
      || (contactHistoryTrust?.secret ? verifyContactHistorySignature(receipt, contactHistoryTrust.secret) : false);
    if (!email) { /* recipient-email-missing already recorded */ }
    else if (!usable.usable) inc(`contact-history-receipt-unusable:${usable.reasons[0]}`);
    else if (!trusted) inc('contact-history-receipt-authenticity-unverified');
    else if (receipt.status === CONTACT_HISTORY_STATUS.HIT) {
      contactHistoryProvenance = CONTACT_HISTORY_RUNTIME_PROVENANCE;
      contactHistoryReceiptDigest = receipt.receiptDigest;
      rej('prior-contact-or-suppression-runtime-ledger-hit');
      for (const code of receipt.reasonCodes || []) rej(code);
    } else if (receipt.status === CONTACT_HISTORY_STATUS.CLEAN && receipt.overallContactHistoryHit === false) {
      contactHistoryProvenance = CONTACT_HISTORY_RUNTIME_PROVENANCE;
      contactHistoryReceiptDigest = receipt.receiptDigest;
    } else inc(`contact-history-${String(receipt.status || 'unknown').toLowerCase().replace(/_/g, '-')}`);
  } else {
    const h = record.contactHistory || {};
    if (h.hit === true) rej('prior-contact-or-suppression-runtime-ledger-hit');
    else if (h.repoAndHistorySearched !== true || h.runtimeSuppressionSearched !== true || h.runtimeProspectAndOutboundSearched !== true) inc('runtime-suppression-and-prior-contact-ledgers-not-checked');
    else contactHistoryProvenance = 'MANUAL_ATTESTATION';
  }
  const excluded = new Set((Array.isArray(excludedRecipients) ? excludedRecipients : []).map(lower));
  if (email && excluded.has(email)) rej('prior-contact-or-suppression');

  // Offer fit and a real, externally verifiable observation.
  // The AI flagship serves SaaS/internal agent teams as well as agencies.
  // Do not require that an evidenced production-agent buyer serve HVAC clients.
  // Legacy agency fit remains unchanged; the alternative needs own-site proof.
  const aiFit = offerId === 'AI_AGENT_RELEASE_GATE'
    && record.offerFit?.buildsProductionAgents === true
    && sameSiteFamily(hostOf(text(record.offerFit?.evidenceUrl, 1000)), siteHost);
  if (!aiFit && (record.offerFit?.servesHomeServiceClients !== true || !hostOf(text(record.offerFit?.evidenceUrl, 1000)))) inc('home-service-client-evidence-missing');
  const obs = record.clientEvidence?.observation;
  if (!hostOf(text(record.clientEvidence?.clientSiteUrl, 1000))) inc('real-client-site-missing');
  const obsObservedMs = Date.parse(obs?.observedAt);
  if (!obs || obs.verifiable !== true || !text(obs.text) || !hostOf(text(obs.sourceUrl, 1000)) || !text(obs.excerpt) || !Number.isFinite(obsObservedMs)) inc('externally-verifiable-lead-path-observation-missing');
  else if (obsObservedMs > nowMs + FUTURE_SKEW_MS) rej('lead-path-observation-in-future');
  // The quoted claim is the message hook. A page that changed since it was
  // observed can turn a true first touch into a false one, so an old
  // observation is a re-fetch obligation, never a reusable fact.
  else if (nowMs - obsObservedMs > maxEvidenceAgeMs) inc('lead-path-observation-stale-recheck-required');
  const observationAgeMs = clockValid && Number.isFinite(obsObservedMs) ? Math.max(0, nowMs - obsObservedMs) : null;
  const evidenceFreshness = {
    scope: 'LEAD_PATH_CLAIM_OBSERVATION',
    maxAgeMs: maxEvidenceAgeMs,
    leadPathObservationAgeMs: observationAgeMs,
    freshness: observationAgeMs === null ? 0 : Math.max(0, Math.min(1, 1 - observationAgeMs / maxEvidenceAgeMs)),
    recheckRequired: observationAgeMs === null || observationAgeMs > maxEvidenceAgeMs
  };
  const ownAgentEvidence = aiFit
    && text(record.clientEvidence?.clientName, 160) === company
    && sameSiteFamily(hostOf(text(record.clientEvidence?.clientSiteUrl, 1000)), siteHost)
    && sameSiteFamily(hostOf(text(obs?.sourceUrl, 1000)), siteHost);

  let eligibility = null;
  if (!rejected.length && !incomplete.length && !deferRecipientSide) {
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
    observationSubjectType: ownAgentEvidence ? 'PROSPECT_SYSTEM' : 'CLIENT',
    offerId: offerId || null,
    offerPublicName: offerId ? UBERREPLY_OFFER_PORTFOLIO.find(offer => offer.offerId === offerId).publicName : null,
    evidenceClass: ACCEPTED_EVIDENCE_CLASSES.includes(evidenceClass) ? evidenceClass : (evidenceClass || null),
    contactHistoryProvenance, contactHistoryReceiptDigest,
    evidenceFreshness,
    rejectionReasons: [...new Set(rejected)],
    missingEvidence: status === PROSPECT_STATUSES.REJECTED ? [] : incomplete,
    recipientSideEligibility: eligibility ? { decision: eligibility.decision, basis: eligibility.basis, evidenceId: eligibility.evidenceId } : null,
    recipientSideDeferredTo: deferRecipientSide ? 'GLOBAL_GREEN_LANE_ROUTER' : null,
    senderSideEvaluated: false,
    legalAuthorityStatus: 'HOLD_SENDER_SIDE_UNRESOLVED',
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'A VERIFIED_CANDIDATE is an externally observed, internally consistent record. It is not consent, not authorization, and not a send decision; sender-side legal authority and a founder-signed authorization remain separate gates.'
  };
}
