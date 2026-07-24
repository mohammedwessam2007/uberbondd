// Opportunity graph and ranking (workstream 4). A pure, deterministic, inspectable weighted-sum
// scorer over the mission's own named factors -- every component score is returned in the
// breakdown, never collapsed into an opaque single number. "Optional AI ranking may only be
// secondary" (the mission's own words): this module is the primary, and any AI-assisted step
// (ai-assistants.mjs's `opportunity_summary`/`next_best_action` tasks, commit 10) only annotates
// what this function already decided -- it never overrides a score or a qualification decision.
import { clamp } from './utils.mjs';

// Each factor is normalized to 0-1 by the caller (or by a small helper below) before weighting.
// Weights sum to 100 so the final score is directly readable as "out of 100."
export const SCORE_WEIGHTS = Object.freeze({
  liveBuyingIntent: 14,
  recency: 8,
  channelQuality: 8,
  portfolioEvidence: 7,
  buyerRoleClarity: 7,
  managedSiteLeverage: 6,
  serviceFit: 10,
  budgetLikelihood: 9,
  proofReadiness: 6,
  fulfillmentSimplicity: 6, // inverted complexity
  paymentReadiness: 8,
  lowOwnerMinutes: 4, // inverted owner-minutes cost
  lowConflictRisk: 4, // inverted conflict/complaint risk
  evidenceCompleteness: 2,
  confidence: 1
});

const CHANNEL_QUALITY = Object.freeze({
  published_contact_form: 0.9, published_email: 0.85, linkedin_public_profile: 0.7,
  public_directory_listing: 0.55, referral_intro: 1.0
});

/** Recency decays linearly from 1.0 (today) to 0 at 90 days -- matches the importer's own
 * stale-evidence cutoff, so a score of 0 here lines up with "this would already be quarantined
 * on re-import," not an arbitrary second number. */
export function recencyScore(capturedAt, nowMs = Date.now()) {
  const ageDays = (nowMs - Date.parse(capturedAt)) / 86400000;
  return clamp(1 - ageDays / 90, 0, 1);
}

export function channelQualityScore(channel) { return CHANNEL_QUALITY[channel] ?? 0; }

/**
 * `input` fields (all 0-1 unless noted): liveBuyingIntent, channel (string), capturedAt (ISO),
 * portfolioEvidenceCount (int), buyerRoleClarity, managedSiteLeverage, serviceFitScores
 * ({diagnostic,implementation,monitoring,whiteLabel} each 0-1 -- max is used), budgetLikelihood,
 * proofReadiness, fulfillmentComplexity (0-1, higher = harder), paymentReadiness, ownerMinutes
 * (estimated minutes, higher = worse), conflictComplaintRisk (0-1, higher = worse),
 * evidenceCompleteness, confidence.
 */
export function scoreOpportunity(input = {}) {
  const components = {
    liveBuyingIntent: clamp(input.liveBuyingIntent ?? 0, 0, 1),
    recency: recencyScore(input.capturedAt, input.nowMs),
    channelQuality: channelQualityScore(input.channel),
    portfolioEvidence: clamp((input.portfolioEvidenceCount ?? 0) / 5, 0, 1),
    buyerRoleClarity: clamp(input.buyerRoleClarity ?? 0, 0, 1),
    managedSiteLeverage: clamp(input.managedSiteLeverage ?? 0, 0, 1),
    serviceFit: clamp(Math.max(0, ...Object.values(input.serviceFitScores || { none: 0 })), 0, 1),
    budgetLikelihood: clamp(input.budgetLikelihood ?? 0, 0, 1),
    proofReadiness: clamp(input.proofReadiness ?? 0, 0, 1),
    fulfillmentSimplicity: 1 - clamp(input.fulfillmentComplexity ?? 0.5, 0, 1),
    paymentReadiness: clamp(input.paymentReadiness ?? 0, 0, 1),
    lowOwnerMinutes: 1 - clamp((input.ownerMinutes ?? 30) / 120, 0, 1),
    lowConflictRisk: 1 - clamp(input.conflictComplaintRisk ?? 0, 0, 1),
    evidenceCompleteness: clamp(input.evidenceCompleteness ?? 0, 0, 1),
    confidence: clamp(input.confidence ?? 0, 0, 1)
  };
  const breakdown = Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Math.round(value * SCORE_WEIGHTS[key] * 100) / 100]));
  const score = Math.round(Object.values(breakdown).reduce((sum, v) => sum + v, 0) * 100) / 100;
  return { score, breakdown, components };
}

const MIN_QUALIFYING_SCORE = 35;
const MIN_EVIDENCE_COMPLETENESS = 0.3;

/** Qualification is a separate, named-reason decision from the raw score -- a high score with an
 * unsupported channel or zero evidence completeness must still be rejected with a specific reason,
 * not silently ranked highly. */
export function qualify(opportunity, scoreResult, { minScore = MIN_QUALIFYING_SCORE } = {}) {
  if (!Object.prototype.hasOwnProperty.call(CHANNEL_QUALITY, opportunity.channel)) return { qualified: false, reason: 'unsupported-channel' };
  if ((opportunity.data?.evidenceCompleteness ?? 0) < MIN_EVIDENCE_COMPLETENESS) return { qualified: false, reason: 'insufficient-evidence-completeness' };
  if (scoreResult.score < minScore) return { qualified: false, reason: 'score-below-threshold' };
  return { qualified: true, reason: '' };
}

/**
 * Ranks a batch of {opportunity, input} pairs, attaches the qualification decision and score
 * breakdown to each, and slices the standard tiers plus a replacement queue (the next 10 below the
 * top-100 cutoff, ready to promote if a top-100 opportunity is later disqualified/converted).
 */
export function rankOpportunities(pairs = []) {
  const ranked = pairs.map(({ opportunity, input }) => {
    const scoreResult = scoreOpportunity(input);
    const decision = qualify(opportunity, scoreResult);
    return { opportunity, score: scoreResult.score, breakdown: scoreResult.breakdown, qualified: decision.qualified, rejectionReason: decision.reason };
  }).sort((a, b) => b.score - a.score);

  const qualified = ranked.filter(item => item.qualified);
  return {
    ranked,
    tiers: { top100: qualified.slice(0, 100), top50: qualified.slice(0, 50), top25: qualified.slice(0, 25), top10: qualified.slice(0, 10), top5: qualified.slice(0, 5) },
    replacementQueue: qualified.slice(100, 110),
    rejected: ranked.filter(item => !item.qualified)
  };
}

const OFFER_RULES = Object.freeze([
  { key: 'AGENCY_MONITORING', when: item => item.opportunity?.data?.managedSiteLeverage >= 0.7 || item.breakdown.managedSiteLeverage >= (SCORE_WEIGHTS.managedSiteLeverage * 0.7), angle: 'You already trust us with related work -- add always-on monitoring.', proofAsset: 'sample_monitoring_report' },
  { key: 'AGENCY_IMPLEMENTATION_PACKAGE', when: item => item.breakdown.serviceFit >= (SCORE_WEIGHTS.serviceFit * 0.6) && item.breakdown.paymentReadiness >= (SCORE_WEIGHTS.paymentReadiness * 0.5), angle: 'Fast, scoped, reversible fixes -- no open-ended engagement.', proofAsset: 'sample_repair_before_after' },
  { key: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', when: () => true, angle: 'A same-day, evidence-backed lead-path diagnostic across your top 3 client sites.', proofAsset: 'sample_diagnostic_report' }
]);

/** Picks the first matching offer rule (checked in priority order) -- always returns a
 * recommendation, since the diagnostic is the catch-all default for every qualified opportunity. */
export function recommendOffer(rankedItem) {
  const rule = OFFER_RULES.find(r => r.when(rankedItem));
  return { offerKey: rule.key, messageAngle: rule.angle, proofAsset: rule.proofAsset };
}
