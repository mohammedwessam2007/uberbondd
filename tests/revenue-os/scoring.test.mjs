import test from 'node:test';
import assert from 'node:assert/strict';
import { SCORE_WEIGHTS, scoreOpportunity, qualify, rankOpportunities, recommendOffer, recencyScore, channelQualityScore } from '../../revenue-os/src/scoring.mjs';

function strongInput(overrides = {}) {
  return {
    liveBuyingIntent: 1, channel: 'referral_intro', capturedAt: new Date().toISOString(),
    portfolioEvidenceCount: 5, buyerRoleClarity: 1, managedSiteLeverage: 1,
    serviceFitScores: { diagnostic: 1 }, budgetLikelihood: 1, proofReadiness: 1,
    fulfillmentComplexity: 0, paymentReadiness: 1, ownerMinutes: 5, conflictComplaintRisk: 0,
    evidenceCompleteness: 1, confidence: 1, ...overrides
  };
}

test('the score weights sum to exactly 100', () => {
  const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(total, 100);
});

test('recencyScore decays linearly to 0 at 90 days, matching the importer\'s own stale-evidence cutoff', () => {
  const now = Date.now();
  assert.equal(recencyScore(new Date(now).toISOString(), now), 1);
  assert.equal(recencyScore(new Date(now - 90 * 86400000).toISOString(), now), 0);
  assert.ok(recencyScore(new Date(now - 45 * 86400000).toISOString(), now) < 1 && recencyScore(new Date(now - 45 * 86400000).toISOString(), now) > 0);
});

test('channelQualityScore ranks referral highest and an unknown channel at 0', () => {
  assert.equal(channelQualityScore('referral_intro'), 1);
  assert.equal(channelQualityScore('carrier_pigeon'), 0);
});

test('scoreOpportunity returns an inspectable breakdown whose components sum to the total score', () => {
  const result = scoreOpportunity(strongInput());
  const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100) / 100, result.score);
  assert.ok(result.score > 95);
});

test('a maximally weak input scores near zero, not merely "lower"', () => {
  const result = scoreOpportunity({ channel: 'unknown', capturedAt: new Date(Date.now() - 200 * 86400000).toISOString() });
  assert.ok(result.score < 20);
});

test('qualify rejects an unsupported channel and insufficient evidence completeness with specific reasons even at a high score', () => {
  const scoreResult = scoreOpportunity(strongInput());
  assert.equal(qualify({ channel: 'carrier_pigeon', data: { evidenceCompleteness: 1 } }, scoreResult).reason, 'unsupported-channel');
  assert.equal(qualify({ channel: 'referral_intro', data: { evidenceCompleteness: 0 } }, scoreResult).reason, 'insufficient-evidence-completeness');
});

test('qualify rejects a below-threshold score even on a supported channel with full evidence', () => {
  const scoreResult = scoreOpportunity({ channel: 'referral_intro', capturedAt: new Date(Date.now() - 200 * 86400000).toISOString() });
  assert.equal(qualify({ channel: 'referral_intro', data: { evidenceCompleteness: 1 } }, scoreResult).reason, 'score-below-threshold');
});

test('rankOpportunities sorts descending, slices the mission-named tiers, and produces a replacement queue', () => {
  const pairs = Array.from({ length: 120 }, (_, i) => ({
    opportunity: { id: `opp${i}`, channel: 'referral_intro', data: { evidenceCompleteness: 1 } },
    input: strongInput({ liveBuyingIntent: (120 - i) / 120 })
  }));
  const result = rankOpportunities(pairs);
  assert.equal(result.tiers.top100.length, 100);
  assert.equal(result.tiers.top50.length, 50);
  assert.equal(result.tiers.top25.length, 25);
  assert.equal(result.tiers.top10.length, 10);
  assert.equal(result.tiers.top5.length, 5);
  assert.equal(result.replacementQueue.length, 10);
  for (let i = 0; i < result.tiers.top100.length - 1; i++) assert.ok(result.tiers.top100[i].score >= result.tiers.top100[i + 1].score);
});

test('rankOpportunities separates rejected items with their reason, never silently drops them', () => {
  const pairs = [
    { opportunity: { id: 'good', channel: 'referral_intro', data: { evidenceCompleteness: 1 } }, input: strongInput() },
    { opportunity: { id: 'bad', channel: 'carrier_pigeon', data: { evidenceCompleteness: 1 } }, input: strongInput({ channel: 'carrier_pigeon' }) }
  ];
  const result = rankOpportunities(pairs);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].rejectionReason, 'unsupported-channel');
  assert.equal(result.ranked.length, 2, 'rejected items still appear in the full ranked list, not dropped');
});

test('recommendOffer always returns a recommendation and defaults to the diagnostic when no stronger signal matches', () => {
  const scoreResult = scoreOpportunity({ channel: 'published_email', capturedAt: new Date().toISOString() });
  const item = { opportunity: { data: {} }, breakdown: scoreResult.breakdown };
  const recommendation = recommendOffer(item);
  assert.equal(recommendation.offerKey, 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC');
  assert.ok(recommendation.messageAngle.length > 0);
  assert.ok(recommendation.proofAsset.length > 0);
});
