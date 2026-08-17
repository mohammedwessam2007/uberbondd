import test from 'node:test';
import assert from 'node:assert/strict';
import { routeUpgradeDecision, compileUpgradeProposal, UPGRADE_DECISIONS } from '../src/upgrade-proposal.mjs';
import { scoreOpportunity, incrementalBuildDistance } from '../src/opportunity-registry.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

test('a low composite score always REJECTs, regardless of how cheap the build looks', () => {
  const decision = routeUpgradeDecision({ buildDistance: 0, confidence: 1, compositeScore: 10 });
  assert.equal(decision, 'REJECT');
});

test('a commodity never routes to BUILD, no matter how low the build distance is', () => {
  const decision = routeUpgradeDecision({ buildDistance: 0, confidence: 1, compositeScore: 90, isCommodity: true });
  assert.notEqual(decision, 'BUILD');
  assert.ok(['BUY', 'PARTNER'].includes(decision));
});

test('low confidence defers even when the build looks cheap and the score looks good -- the BUILD-bias guard', () => {
  const decision = routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.1, compositeScore: 90, isCommodity: false });
  assert.equal(decision, 'DEFER');
});

test('a genuinely cheap, evidenced, non-commodity opportunity can route to BUILD -- the router is not rigged to always defer', () => {
  const decision = routeUpgradeDecision({ buildDistance: 0.1, confidence: 0.8, compositeScore: 80, isCommodity: false });
  assert.equal(decision, 'BUILD');
});

test('a moderate build distance routes to ADAPT, not BUILD', () => {
  const decision = routeUpgradeDecision({ buildDistance: 0.5, confidence: 0.8, compositeScore: 80, isCommodity: false });
  assert.equal(decision, 'ADAPT');
});

test('a high build distance defers even with strong evidence', () => {
  const decision = routeUpgradeDecision({ buildDistance: 0.9, confidence: 0.9, compositeScore: 90, isCommodity: false });
  assert.equal(decision, 'DEFER');
});

test('missing/malformed numeric inputs fall back to the most conservative interpretation, never crash', () => {
  const decision = routeUpgradeDecision({});
  assert.equal(decision, 'REJECT');
});

test('every returned decision is one of the declared UPGRADE_DECISIONS', () => {
  const cases = [
    { buildDistance: 0, confidence: 1, compositeScore: 10 },
    { buildDistance: 0, confidence: 1, compositeScore: 90, isCommodity: true },
    { buildDistance: 0.1, confidence: 0.1, compositeScore: 90 },
    { buildDistance: 0.1, confidence: 0.8, compositeScore: 80 },
    { buildDistance: 0.5, confidence: 0.8, compositeScore: 80 },
    { buildDistance: 0.9, confidence: 0.9, compositeScore: 90 }
  ];
  for (const input of cases) assert.ok(UPGRADE_DECISIONS.includes(routeUpgradeDecision(input)));
});

test('compileUpgradeProposal rejects malformed input cleanly', () => {
  const result = compileUpgradeProposal({ opportunityScore: null, buildDistanceResult: {}, date: monday });
  assert.equal(result.ok, false);
});

test('compileUpgradeProposal composes directly with real scoreOpportunity and incrementalBuildDistance outputs', () => {
  const opportunityScore = scoreOpportunity({
    candidate: {
      id: 'opp-1', name: 'Test', timeToCashDays: { value: 1, claimType: 'VERIFIED_FACT' },
      automationPotential: { value: 90, claimType: 'VERIFIED_FACT' }, founderBurden: { value: 5, claimType: 'VERIFIED_FACT' }
    },
    date: monday
  });
  const buildDistanceResult = incrementalBuildDistance(['deterministic-audit'], ['deterministic-audit', 'payment-truth']);
  const result = compileUpgradeProposal({ opportunityScore, buildDistanceResult, date: monday });
  assert.equal(result.ok, true);
  assert.ok(UPGRADE_DECISIONS.includes(result.decision));
  assert.equal(result.buildDistance, 0);
});

test('a non-BUILD/ADAPT decision carries an honest "no test plan" note rather than a fabricated one', () => {
  const opportunityScore = scoreOpportunity({ candidate: { id: 'opp-1', name: 'Weak' }, date: monday });
  const buildDistanceResult = incrementalBuildDistance(['nonexistent-cap'], []);
  const result = compileUpgradeProposal({ opportunityScore, buildDistanceResult, date: monday });
  assert.equal(result.decision, 'REJECT');
  assert.match(result.testPlan, /does not authorize new code/);
});
