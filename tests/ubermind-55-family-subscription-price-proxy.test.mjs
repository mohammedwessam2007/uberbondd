import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateUberMind55PriceProxy as price,
 model55PriceFloorWithOpusRequired as floor} from '../src/ubermind-55-family-subscription-price-proxy.mjs';
test('W36 official API tariffs: all Opus reference geometry costs 8 USD',()=>{
 const x=price({opusShare:1,sonnetShare:0,haikuShare:0});
 assert.equal(x.ok,true);assert.equal(x.baselineAllOpusApiEquivalentUsd,8);
 assert.equal(x.candidateApiEquivalentUsd,8);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,0);
});
test('W36 all Sonnet is 50 percent lower API tariff, not quota',()=>{
 const x=price({opusShare:0,sonnetShare:1,haikuShare:0});
 assert.equal(x.candidateApiEquivalentUsd,4);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,50);
 assert.equal(x.actualClaudeProFiveHourUsagePercent,null);
});
test('W36 all Haiku short is 97.5 percent lower API price with quality unknown',()=>{
 const x=price({opusShare:0,sonnetShare:0,haikuShare:1});
 assert.equal(x.candidateApiEquivalentUsd,.2);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,97.5);
 assert.equal(x.qualityEquivalenceProven,false);
 assert.equal(x.routingFeasibilityVerified,false);
});
test('W36 all Haiku long is 87.5 percent lower API price',()=>{
 const x=price({opusShare:0,sonnetShare:0,haikuShare:1,
  haikuPromptTier:'over100k'});
 assert.equal(x.candidateApiEquivalentUsd,1);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,87.5);
});
test('W36 quality-defensive mix 40 Opus 40 Sonnet 20 Haiku yields 39.5 percent price cut',()=>{
 const x=price({opusShare:.4,sonnetShare:.4,haikuShare:.2});
 assert.equal(x.candidateApiEquivalentUsd,4.84);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,39.5);
});
test('W36 balanced mix 20 Opus 50 Sonnet 30 Haiku yields 54.25 percent cut',()=>{
 const x=price();
 assert.equal(x.candidateApiEquivalentUsd,3.66);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,54.25);
});
test('W36 aggressive mix 10 Opus 30 Sonnet 60 Haiku yields 73.5 percent cut',()=>{
 const x=price({opusShare:.1,sonnetShare:.3,haikuShare:.6});
 assert.equal(x.candidateApiEquivalentUsd,2.12);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,73.5);
});
test('W36 conditional half native reuse halves tariff, still no proved quality',()=>{
 const x=price({certifiedReuseShare:.5});
 assert.equal(x.candidateApiEquivalentUsd,1.83);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,77.125);
 assert.equal(x.sameTaskAcceptedDeliverableObserved,false);
});
test('W36 0.4 dollar Opus verifier overhead lowers modeled savings',()=>{
 const x=price({certifiedReuseShare:.5,additionalVerificationApiEquivalentUsd:.4});
 assert.equal(x.candidateApiEquivalentUsd,2.23);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,72.125);
});
test('W36 20 percent mandatory Opus cannot masquerade as all Haiku',()=>{
 const x=floor({essentialOpusShare:.2});
 assert.equal(x.modelFractions.opus,.2);
 assert.equal(x.modelFractions.haiku,.8);
 assert.equal(x.candidateApiEquivalentUsd,1.76);
 assert.equal(x.hypotheticalApiEquivalentPriceCutPercent,78);
 assert.equal(x.qualityEquivalenceProven,false);
});
test('W36 disallow unsupported prompt tier or unnormalized model fractions',()=>{
 assert.equal(price({haikuPromptTier:'free'}).ok,false);
 assert.equal(price({opusShare:.2,sonnetShare:.4,haikuShare:.2}).ok,false);
 assert.equal(price({opusShare:1.1,sonnetShare:-.1,haikuShare:0}).ok,false);
 assert.equal(price({certifiedReuseShare:1.1}).ok,false);
});
test('W36 disallow malformed token counts or unverifiable verification budget',()=>{
 assert.equal(price({inputTokens:0}).ok,false);
 assert.equal(price({outputTokens:Infinity}).ok,false);
 assert.equal(price({inputTokens:1.5}).ok,false);
 assert.equal(price({additionalVerificationApiEquivalentUsd:-1}).ok,false);
});
test('W36 minimum cash costs and no provider calls throughout',()=>{
 for(const x of [price(),floor(),price({certifiedReuseShare:1})]){
  assert.equal(x.fixedProSubscriptionMonthlyUsd,20);
  assert.equal(x.proSubscriptionCashPriceCutPercent,0);
  assert.equal(x.newPaidApiSpendingAuthorizedUsd,0);
  assert.equal(x.actualClaudeProWeeklyUsagePercent,null);
  assert.equal(x.providerCalls,0);
  assert.equal(x.externalEffectAuthority,'NONE');
 }
});
