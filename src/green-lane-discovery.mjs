// GREEN-LANE DISCOVERY: the lead generator consumes Green-Lane policy while it
// ranks prospects, rather than bolting a legality check on after selection.
//
// For one corpus prospect and one offer it asks the Global Green-Lane Router
// whether a lawful route exists from the evidence the corpus actually holds, and
// returns:
//   route class, route evidence digests, company/legal-form evidence,
//   contact-source evidence, offer, expected route friction, exact blockers,
//   and a prospect value that includes route fitness.
//
// It never fabricates green supply: a prospect whose evidence does not support
// a route is reported with its exact blockers and a routeFactor of 0, so it
// cannot outrank a slightly lower-value prospect with a clean route, and
// GREEN_LANE_ONLY returns an empty list when supply is insufficient.
//
// It is offline: no registry lookup, no fetch, no address guessing. Legal-form
// evidence for a UK candidate therefore shows as missing until the preflight
// resolves the registry for that one candidate. Read-only; grants no authority.

import { routeGlobalGreenLane, GREEN_ROUTE_CLASSES } from './global-green-lane-router.mjs';
import { ROUTE_CLASS_PRIORS, DEFAULT_ECONOMICS, scoreProspectRouteValue } from './global-route-tournament.mjs';
import { normalizeCountry } from './send-safety.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GREEN_LANE_DISCOVERY_VERSION = 'uberbond.green-lane-discovery.v1';
export const GREEN_LANE_ONLY = 'GREEN_LANE_ONLY';

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const clamp01 = value => Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0));
const MAX_PRICE_HYPOTHESIS_USD = 4500;
const OFFER_FAMILY = Object.freeze({ LEAD_TO_BOOKING_LEAK_AUDIT: 'AGENCY_REVENUE', CLIENT_ROI_PROOF_SPRINT: 'AGENCY_REVENUE', BILINGUAL_BOOKING_LEAK_AUDIT: 'AGENCY_REVENUE', AI_AGENT_RELEASE_GATE: 'AI' });

/**
 * @param {object} input
 * @param {object} input.prospect  corpus prospect; evidence-lane facts live in prospect.greenLaneEvidence
 * @param {object} [input.offer]   { offerId, standardPriceUsd }
 * @param {object} [input.fit]     { semanticFit, evidenceConfidence }
 */
export function evaluateGreenLaneCandidate({ prospect = {}, offer = {}, fit = {}, policyRegistry = null, history = null, suppression = {}, economics = {}, now = new Date() } = {}) {
  const ev = prospect.greenLaneEvidence && typeof prospect.greenLaneEvidence === 'object' ? prospect.greenLaneEvidence : {};
  const country = normalizeCountry(prospect.country || prospect.countryCode || prospect.hqCountry || '');
  const email = clean(prospect.contact?.email, 320).toLowerCase();
  const decision = routeGlobalGreenLane({
    now,
    objective: { kind: 'FIRST_TOUCH_COLD_B2B', offerId: offer.offerId || null, offerFamily: OFFER_FAMILY[offer.offerId] || null },
    candidate: { ref: prospect.id, company: prospect.company, legalName: ev.legalEntity?.legalName || '', companyNumber: ev.legalEntity?.companyNumber || '', formText: ev.legalEntity?.formText || '', website: prospect.website },
    contact: {
      email,
      source: ev.contactSource || { url: prospect.contact?.sourceUrl || '', observedAt: prospect.contact?.observedAt || '', pageContext: '', publicationType: '', excerpt: '' },
      namedPersonEvidence: ev.namedPersonEvidence || {}
    },
    recipient: { jurisdictionClaims: country ? [{ jurisdiction: country, source: 'CORPUS_COUNTRY' }] : [], type: ev.recipientType },
    registry: { result: null },
    notices: ev.notices || {},
    offerRelevance: ev.offerRelevance || { relatedToRecipientRole: null, rationale: '' },
    invitationEvidence: ev.invitationEvidence || [],
    history,
    suppression,
    provider: { id: 'smtp-relay', vendor: 'winnr' },
    sender: {},
    policyRegistry,
    economics
  });
  const priors = ROUTE_CLASS_PRIORS[decision.routeClass];
  const green = decision.green === true && GREEN_ROUTE_CLASSES.has(decision.routeClass);
  const friction = green && priors ? priors.friction : 1;
  const e = { ...DEFAULT_ECONOMICS, ...(economics || {}) };
  const expectedReply = priors ? Math.min(0.95, e.baseReplyRate * priors.replyMultiplier) : 0;
  const buyerValue = clamp01((Number(offer.standardPriceUsd) || 0) / MAX_PRICE_HYPOTHESIS_USD);
  const contactBound = decision.contactSource.bound === true;
  const factors = {
    commercialFit: clamp01(fit.semanticFit), problemEvidence: clamp01(fit.evidenceConfidence), buyerValue,
    contactConfidence: contactBound ? 1 : decision.inbox.eligibleAsContact ? 0.4 : 0.1,
    jurisdictionConfidence: decision.jurisdiction.status === 'RESOLVED' ? (decision.jurisdiction.registryBacked ? 1 : 0.7) : 0,
    sourceProvenance: contactBound ? 1 : Math.max(0, 0.5 - 0.1 * decision.contactSource.missing.length),
    invitationStrength: decision.invitation.invitationStrength,
    expectedReply: clamp01(expectedReply / 0.1),
    expectedClearedProfit: clamp01(expectedReply * e.paidConversionGivenReply * buyerValue * 10),
    routeFriction: friction,
    founderMinutes: Number(decision.selected?.founderMinutes ?? 0)
  };
  const prospectValue = scoreProspectRouteValue(factors, { ...decision, selectedFitness: decision.selected?.fitnessScore?.fitness ?? null });
  return {
    decision,
    summary: {
      prospectId: prospect.id || null, company: clean(prospect.company, 180) || null, offerId: offer.offerId || null,
      routeClass: decision.routeClass, routeState: decision.state, green, provisionalRouteClass: decision.provisionalRouteClass,
      routeEvidence: { routeDigest: decision.routeDigest, policyEvidenceDigest: decision.policyEvidence.evidenceDigest, policyRefreshRequired: decision.policyRefreshRequired.map(r => r.ruleId), jurisdiction: decision.jurisdiction.jurisdiction, jurisdictionStatus: decision.jurisdiction.status, selectedChannel: decision.selected?.channel || null },
      companyLegalFormEvidence: { status: decision.legalForm.status, recipientType: decision.legalForm.recipientType, evidenceDigest: decision.legalForm.evidenceDigest, entity: decision.legalForm.entity },
      contactSourceEvidence: { status: decision.contactSource.status, bindingDigest: decision.contactSource.bindingDigest, publicationType: decision.contactSource.binding.publicationType, officialSourceUrl: decision.contactSource.binding.officialSourceUrl, invitationExists: decision.contactSource.binding.invitationExists, inboxClass: decision.inbox.addressClass },
      expectedRouteFriction: friction,
      exactBlockers: decision.blockers,
      prospectValue
    }
  };
}

/** Rank evaluated rows by route-aware prospect value; GREEN_LANE_ONLY keeps only green rows. */
export function rankGreenLane(rows = [], { mode = 'DEFAULT', limit = 3 } = {}) {
  const sorted = [...rows].sort((a, b) => b.summary.prospectValue.value - a.summary.prospectValue.value || String(a.summary.prospectId).localeCompare(String(b.summary.prospectId)));
  const green = sorted.filter(r => r.summary.green);
  const notGreen = sorted.filter(r => !r.summary.green);
  const ranked = (mode === GREEN_LANE_ONLY ? green : sorted).slice(0, limit);
  return {
    version: GREEN_LANE_DISCOVERY_VERSION,
    mode,
    supplyStatus: green.length ? 'GREEN_SUPPLY_AVAILABLE' : 'INSUFFICIENT_GREEN_SUPPLY',
    greenCount: green.length,
    notGreenCount: notGreen.length,
    ranked: ranked.map((r, index) => ({ rank: index + 1, ...r.summary })),
    notGreen: mode === GREEN_LANE_ONLY ? notGreen.slice(0, 25).map(r => ({ prospectId: r.summary.prospectId, company: r.summary.company, routeClass: r.summary.routeClass, routeState: r.summary.routeState, provisionalRouteClass: r.summary.provisionalRouteClass, exactBlockers: r.summary.exactBlockers })) : undefined,
    fabricatedGreenProspects: 0,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}
