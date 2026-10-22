import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = 'artifacts/commercialization/';
const load = name => JSON.parse(readFileSync(root+name,'utf8'));
const money = load('unit-economics-2026-10.json');
const quality = load('quality-eval-2026-10.json');
const near = (left,right) => Math.abs(left-right) < 0.00011;

test('creator charges ONLY compute usage attributable to Apify paid-plan runs',()=>{
  assert.equal(money.documentedPricingAssumptions.platformRevenueShareOnEligiblePaidEvents, .8);
  assert.match(money.documentedPricingAssumptions.freeTierPolicy,/Excluded from both/i);
  assert.ok(money.documentedPricingAssumptions.providerDocs.some(url=>url.includes('pricing-and-costs')));
  for (const [name, scenario] of Object.entries(money.storePayPerEvent)) {
    assert.ok(scenario.eligiblePaidPlanFraction >= 0 && scenario.eligiblePaidPlanFraction <= 1,name);
    const paidUsage = scenario.computeBaseUsd * scenario.retryCostMultiplier * scenario.eligiblePaidPlanFraction;
    assert.ok(near(scenario.eligiblePaidPlatformComputeUsd,paidUsage),name);
    const expected = .8*scenario.eligiblePaidEventRevenueUsd-scenario.eligiblePaidPlatformComputeUsd-scenario.variableSupportUsdPer40Sites;
    assert.ok(near(scenario.contributionUsd,expected),`${name}: profit must charge paid-plan usage, not free-tier compute`);
  }
  assert.equal(money.storePayPerEvent.pessimistic.eligiblePaidPlatformComputeUsd,0);
  assert.equal(money.storePayPerEvent.median.contributionUsd,-1.2126);
  assert.equal(money.measured.actualCashRevenueUsd,0);
  assert.equal(money.measured.clearedContributionProfitUsd,0);
  assert.match(money.pricingDecision,/NO_PRICE_SELECTED/);
});

test('independent source-hash match is a distinct narrower evidentiary class',()=>{
  assert.equal(quality.assertableCandidates,7);
  assert.equal(quality.independentlyParserCorroborated,4);
  const parser = quality.evaluations.filter(e=>e.automatedIndependentStatus==='PARSER_CORROBORATED_NOT_HUMAN_VERIFIED');
  const sourceMatched = parser.filter(e=>e.sourceShaMatches===true);
  assert.equal(sourceMatched.length,3);
  assert.equal(quality.independentlyParserCorroboratedOriginalSource,sourceMatched.length);
  assert.equal(money.measured.independentQuality.matchedOriginalSource,sourceMatched.length);
  assert.equal(quality.independentlyHumanVerified,0);
  assert.equal(money.measured.independentQuality.humanVerified,0);
  assert.notEqual(quality.precision,'100%');
  assert.match(quality.temporalCaveat,/changed-source/i);
});
