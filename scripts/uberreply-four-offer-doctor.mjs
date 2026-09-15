import {
  UBERREPLY_FOUR_OFFER_GENOME_VERSION,
  UBERREPLY_OFFER_PORTFOLIO,
  UBERREPLY_DAILY_PORTFOLIO_TARGET,
  compileUberReplyPortfolioAllocation,
  compileUberReplyPortfolioDecision,
  compareUberReplyFitness,
  compileUberReplyOfferLifecycle
} from '../src/uberreply-four-offer-genome.mjs';

const checks = [];
const add = (id, ok, detail = null) => checks.push({ id, ok: Boolean(ok), detail });

add('version', UBERREPLY_FOUR_OFFER_GENOME_VERSION === 'uberbond.uberreply-four-offer-genome.v1', UBERREPLY_FOUR_OFFER_GENOME_VERSION);
add('four-distinct-offers', UBERREPLY_OFFER_PORTFOLIO.length === 4 && new Set(UBERREPLY_OFFER_PORTFOLIO.map(row => row.offerId)).size === 4, UBERREPLY_OFFER_PORTFOLIO.map(row => row.offerId));
add('exact-100k-target', UBERREPLY_OFFER_PORTFOLIO.reduce((sum, row) => sum + row.dailyTarget, 0) === UBERREPLY_DAILY_PORTFOLIO_TARGET, UBERREPLY_DAILY_PORTFOLIO_TARGET);

const allocation = compileUberReplyPortfolioAllocation({
  eligibleByOffer: Object.fromEntries(UBERREPLY_OFFER_PORTFOLIO.map(row => [row.offerId, 25_000]))
});
add('four-lanes-fully-allocatable', allocation.allocatedTotal === 100_000 && allocation.shortfall === 0, allocation);
add('no-silent-cross-lane-spillover', allocation.automaticCrossLaneReallocationAuthorized === false && allocation.lanes.every(row => row.spilloverToOtherLaneAuthorized === false), allocation.lanes);

const homeDecision = compileUberReplyPortfolioDecision({
  prospect: {
    industry: 'HOME_SERVICES', seniority: 'Founder', tags: ['agency', 'HVAC', 'ServiceTitan', 'booking'],
    fitEvidenceConfidence: 1, problemEvidenceScore: 0.9, sourceCount: 4, sourceFreshness: 1,
    trigger: { type: 'OBSERVED_PROBLEM' }
  },
  research: { accountValueScore: 0.8, signalStrength: 0.9, artifactFeasibility: 1, evidenceDensity: 0.9, estimatedResearchMinutes: 5 }
});
add('portfolio-selects-home-services-lane', homeDecision.selection?.offer?.offerId === 'LEAD_TO_BOOKING_LEAK_AUDIT', homeDecision.selection?.offer?.offerId);
add('uberreply-genotype-created', /^ubog_[a-f0-9]{64}$/.test(homeDecision.policy?.genotype?.genotypeId || ''), homeDecision.policy?.genotype?.genotypeId);
add('first-touch-asset-cta', homeDecision.policy?.messageCandidate?.ctaType === 'SEND_ASSET', homeDecision.policy?.messageCandidate?.ctaType);
add('zero-effect-authority', homeDecision.externalEffectAuthority === 'NONE' && homeDecision.businessEffectAuthority === 'NONE', null);

const moneyWins = compareUberReplyFitness(
  { providerConfirmedSends: 1000, qualifiedPositiveReplies: 200, paidSprints: 0, acceptedDeliveries: 0, clearedContributionCents: 0 },
  { providerConfirmedSends: 1000, qualifiedPositiveReplies: 30, paidSprints: 3, acceptedDeliveries: 3, clearedContributionCents: 150000 }
);
add('money-beats-reply-vanity', moneyWins.winner === 'B', moneyWins);

const rethink = compileUberReplyOfferLifecycle({
  offerId: 'LEAD_TO_BOOKING_LEAK_AUDIT',
  outcome: { providerConfirmedSends: 300, qualifiedConversations: 5, paidSprints: 0 }
});
add('five-conversations-zero-paid-rethinks', rethink.state === 'RETHINK_OFFER', rethink);

const failed = checks.filter(row => !row.ok);
const report = {
  doctor: 'uberreply-four-offer-doctor',
  version: UBERREPLY_FOUR_OFFER_GENOME_VERSION,
  state: failed.length ? 'FAILED' : 'PASSED',
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
  externalEffectAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  truthBoundary: 'PASSED proves source-level portfolio, selection, diversification and economic-learning invariants only. It does not prove external demand, reply rate, paid conversion, live sender capacity, deliverability or revenue.'
};
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
