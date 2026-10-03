// GLOBAL ROUTE TOURNAMENT + FITNESS.
//
// For one prospect, candidate contact routes are enumerated elsewhere (the
// router); this module scores and ranks ONLY the permitted ones:
//
//   fitness = EV * (1 - complianceRisk) * (1 - providerRisk) * (1 - reputationRisk)
//             - founderMinutes * founderMinuteValue
//             - monetaryCost
//             - frictionCost
//             - uncertaintyPenalty
//
//   EV = expectedReply * expectedPaidConversion * expectedDealContribution
//
// Hard rules:
//   * A route that is not permitted is NEVER ranked (it is listed with its
//     blockers), however high its nominal value.
//   * Raw send volume has no term: it cannot dominate route fitness.
//   * Unknown cost is UNKNOWN, not zero. An unknown monetary cost applies a
//     pessimistic penalty and marks the route `costKnown:false`, so a route with
//     a known $0 cost beats an otherwise identical route whose cost is unknown.
//   * Company-level facts + a corporate role inbox outrank named-individual
//     enrichment when both can reach the same objective (lower privacy,
//     misclassification and review burden), without removing the ability to
//     contact named business people where a route legitimately supports it.
//   * Every probability here is a labelled PRIOR (ESTIMATED_PRIOR_NOT_MEASURED);
//     real outcomes replace them through the route economics ledger.
//
// Pure; no authority; no external effect.

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ROUTE_TOURNAMENT_VERSION = 'uberbond.global-route-tournament.v1';
export const FITNESS_PRIOR_LABEL = 'ESTIMATED_PRIOR_NOT_MEASURED';

// Relative reply multipliers and risk priors per route class. They are priors,
// versioned here in one place, and carry no claim of measured performance.
export const ROUTE_CLASS_PRIORS = Object.freeze({
  PERMISSIONED_GREEN: { replyMultiplier: 3.0, complianceRisk: 0.01, providerRisk: 0.02, reputationRisk: 0.01, friction: 0.02 },
  INVITED_GREEN: { replyMultiplier: 2.5, complianceRisk: 0.02, providerRisk: 0.03, reputationRisk: 0.02, friction: 0.03 },
  CORPORATE_GREEN: { replyMultiplier: 1.0, complianceRisk: 0.04, providerRisk: 0.05, reputationRisk: 0.04, friction: 0.05 },
  US_CANSPAM_GREEN: { replyMultiplier: 1.0, complianceRisk: 0.05, providerRisk: 0.05, reputationRisk: 0.04, friction: 0.05 },
  CONSPICUOUS_PUBLICATION_GREEN: { replyMultiplier: 0.9, complianceRisk: 0.07, providerRisk: 0.05, reputationRisk: 0.05, friction: 0.07 }
});

export const DEFAULT_ECONOMICS = Object.freeze({
  baseReplyRate: 0.03,            // prior, not measured
  paidConversionGivenReply: 0.1,  // prior, not measured
  dealContributionCents: null,    // unknown unless supplied -> relative units
  founderMinuteValueCents: 100,
  unknownCostPenaltyShare: 0.15   // of EV, applied when monetary cost is unknown
});

const num = (value, fallback = null) => (Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback);
const round = (value, places = 4) => Number(Number(value).toFixed(places));

/**
 * Score one route entry. `route` carries { routeClass, permitted, costCents,
 * founderMinutes, contactPrivacyClass, priorSends?, uncertainty? }.
 * Unknown/absent costCents is UNKNOWN (null), never 0.
 */
export function scoreRouteFitness(route = {}, economics = {}) {
  const e = { ...DEFAULT_ECONOMICS, ...(economics || {}) };
  const priors = ROUTE_CLASS_PRIORS[route.routeClass];
  if (route.permitted !== true || !priors) {
    return { fitness: null, ranked: false, reason: route.permitted === true ? 'route-class-has-no-fitness-prior' : 'route-not-permitted', priorLabel: FITNESS_PRIOR_LABEL };
  }
  const deal = num(e.dealContributionCents);
  const unitEv = deal === null; // relative units when no deal value is supplied
  const dealValue = unitEv ? 1 : deal;
  const reply = Math.min(0.95, num(e.baseReplyRate, 0.03) * priors.replyMultiplier);
  const paid = Math.min(1, num(e.paidConversionGivenReply, 0.1));
  const ev = reply * paid * dealValue;

  // company-level role inbox: no extra privacy burden; a named individual adds
  // data-protection and review friction.
  const personal = route.contactPrivacyClass === 'PERSONAL_DATA';
  const complianceRisk = Math.min(0.9, priors.complianceRisk + (personal ? 0.03 : 0));
  const providerRisk = priors.providerRisk;
  const reputationRisk = Math.min(0.9, priors.reputationRisk + (personal ? 0.02 : 0));
  const survival = (1 - complianceRisk) * (1 - providerRisk) * (1 - reputationRisk);

  const founderMinutes = Math.max(0, num(route.founderMinutes, 0));
  const minuteCost = unitEv ? founderMinutes * (num(e.founderMinuteValueCents, 100) / 10_000) : founderMinutes * num(e.founderMinuteValueCents, 100);
  const costKnown = Number.isFinite(Number(route.costCents)) && Number(route.costCents) >= 0 && route.costCents !== null && route.costCents !== '';
  const monetaryCost = costKnown ? (unitEv ? Number(route.costCents) / 10_000 : Number(route.costCents)) : 0;
  const unknownCostPenalty = costKnown ? 0 : ev * num(e.unknownCostPenaltyShare, 0.15);
  const frictionCost = ev * priors.friction;
  const uncertainty = Math.min(1, Math.max(0, num(route.uncertainty, 0)));
  const uncertaintyPenalty = ev * uncertainty;

  const fitness = ev * survival - minuteCost - monetaryCost - unknownCostPenalty - frictionCost - uncertaintyPenalty;
  return {
    fitness: round(fitness, 6),
    ranked: true,
    unit: unitEv ? 'RELATIVE_UNITS' : 'CONTRIBUTION_CENTS',
    costKnown,
    breakdown: {
      expectedReply: round(reply), expectedPaidConversion: round(paid), expectedEconomicValue: round(ev, 6),
      complianceRisk: round(complianceRisk), providerRisk: round(providerRisk), reputationRisk: round(reputationRisk), survival: round(survival),
      founderMinuteCost: round(minuteCost, 6), monetaryCost: round(monetaryCost, 6), unknownCostPenalty: round(unknownCostPenalty, 6),
      frictionCost: round(frictionCost, 6), uncertaintyPenalty: round(uncertaintyPenalty, 6)
    },
    sendVolumeTermPresent: false,
    priorLabel: FITNESS_PRIOR_LABEL
  };
}

const rankOrder = (a, b) => b.fitnessScore.fitness - a.fitnessScore.fitness
  || Number(b.executable) - Number(a.executable)
  || Number(b.createsConsent === true) - Number(a.createsConsent === true)
  || String(a.channel).localeCompare(String(b.channel));

/**
 * Rank the permitted routes. Non-permitted routes are returned unranked with
 * their blockers; they can never be selected. Among permitted routes an
 * executable route outranks one that still lacks an execution adapter only
 * when fitness ties; fitness itself is never overridden by channel name.
 */
export function rankRoutes(routes = [], economics = {}) {
  const scored = (Array.isArray(routes) ? routes : []).map(route => ({ ...route, fitnessScore: scoreRouteFitness(route, economics) }));
  const ranked = scored.filter(r => r.fitnessScore.ranked).sort(rankOrder);
  const unranked = scored.filter(r => !r.fitnessScore.ranked);
  const executable = ranked.filter(r => r.executable === true);
  return {
    version: ROUTE_TOURNAMENT_VERSION,
    ranked: ranked.map((r, index) => ({ ...r, rank: index + 1 })),
    unranked,
    // The best permitted route; flagged when it cannot yet be executed.
    selected: ranked.length ? { ...ranked[0], rank: 1 } : null,
    selectedExecutable: executable.length ? { ...executable[0] } : null,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}

const PROSPECT_VALUE_WEIGHTS = Object.freeze({ commercialFit: 0.2, problemEvidence: 0.18, buyerValue: 0.12, contactConfidence: 0.1, jurisdictionConfidence: 0.06, sourceProvenance: 0.08, invitationStrength: 0.06, expectedReply: 0.1, expectedClearedProfit: 0.1 });

/**
 * Prospect value including route fitness. Every factor is 0..1. A prospect with
 * no permitted route has routeFactor 0, so a slightly lower-value prospect with
 * a clean route outranks a nominally superior one with an unresolved route.
 * Founder minutes and route friction subtract; send volume is not a factor.
 */
export function scoreProspectRouteValue(factors = {}, routeDecision = null) {
  const clamp = value => Math.min(1, Math.max(0, num(value, 0)));
  let base = 0;
  for (const [key, weight] of Object.entries(PROSPECT_VALUE_WEIGHTS)) base += weight * clamp(factors[key]);
  const green = routeDecision?.green === true;
  const routeFitness = routeDecision?.selected?.fitnessScore?.fitness ?? routeDecision?.selectedFitness ?? null;
  const routeFactor = green ? 1 : routeDecision?.routeClass === 'CONDITIONAL' ? 0.15 : 0;
  const friction = clamp(factors.routeFriction);
  const minutes = Math.max(0, num(factors.founderMinutes, 0));
  const minutePenalty = Math.min(0.3, minutes / 600);
  const value = Math.max(0, base * routeFactor * (1 - 0.3 * friction) - minutePenalty * routeFactor);
  return {
    value: round(value),
    baseValue: round(base),
    routeFactor,
    routeClass: routeDecision?.routeClass || null,
    routeFitness,
    components: Object.fromEntries(Object.keys(PROSPECT_VALUE_WEIGHTS).map(k => [k, round(clamp(factors[k]))])),
    founderMinutePenalty: round(minutePenalty),
    sendVolumeTermPresent: false,
    priorLabel: FITNESS_PRIOR_LABEL
  };
}
