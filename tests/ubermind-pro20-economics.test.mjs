import test from 'node:test';
import assert from 'node:assert/strict';
import {
 calculateUberMindPro20Scenario,
 TARIFF_PER_MILLION_INPUT_OUTPUT_USD,
 PUBLIC_TARIFF_AS_OF
} from '../src/ubermind-pro20-economics.mjs';

test('Pro-only, no paid Jev: cash outlay stays exactly $20 regardless of API-equivalent work',()=>{
 const r=calculateUberMindPro20Scenario({jevDispatchAuthorized:false});
 assert.equal(r.ok,true);
 assert.equal(r.projectedMonthlyCashOutlayUsd,20);
 assert.equal(r.extraJevDueIfScenarioExecutedUsd,0);
 assert.equal(r.projectedJevPriceUsd,.021);
 assert.equal(r.actualMonthlyPaidApiUsd,null);
 assert.equal(r.realTimeClaudeUsageQuota,null);
 assert.equal(r.actualEndToEndQualityMatchedSavedUsd,null);
 assert.equal(r.providerCallsPerformed,0);
 assert.equal(r.externalEffectAuthority,'NONE');
 assert.equal(r.subscriptionIncludesClaudeApi,false);
});

test('published tariff: conditional 1000 Jev calls at 500 input tokens each cost $0.021, not included in Pro',()=>{
 const r=calculateUberMindPro20Scenario({jevDispatchAuthorized:true});
 assert.equal(r.ok,true);
 assert.equal(r.projectedJevInputTokens,500000);
 assert.equal(r.projectedJevPriceUsd,.021);
 assert.equal(r.projectedMonthlyCashOutlayUsd,20.021);
 assert.equal(r.jevMode,'CONDITIONAL_EXTERNAL_PROVIDER_SCENARIO');
 assert.equal(r.providerCallsPerformed,0);
 assert.equal(r.actualProviderInvoiceObserved,false);
 assert.equal(TARIFF_PER_MILLION_INPUT_OUTPUT_USD.jev113.input,.042);
});

test('same historical illustration is only an API-equivalent opportunity cost, never Pro cash savings',()=>{
 const r=calculateUberMindPro20Scenario({
  jevDecisions:1,averageJevInputTokens:20000,jevDispatchAuthorized:false
 });
 assert.equal(r.apiEquivalentUsd.opusLeadAndReview,2);
 assert.equal(r.apiEquivalentUsd.sonnetBuilders,2.2);
 assert.equal(r.apiEquivalentUsd.haikuScouts,.05);
 assert.equal(r.apiEquivalentUsd.jevAtListedTariff,.00084);
 assert.equal(r.apiEquivalentUsd.proposedTeamTotal,4.25084);
 assert.equal(r.apiEquivalentUsd.referenceOpusOnly,8);
 assert.equal(r.apiEquivalentUsd.hypotheticalDifference,3.74916);
 assert.equal(r.apiEquivalentUsd.hypotheticalReductionPercent,46.8645);
 assert.equal(r.projectedMonthlyCashOutlayUsd,20);
 assert.equal(r.actualEndToEndQualityMatchedSavedUsd,null);
});

test('no free hidden API, and account variable spend is honestly additive',()=>{
 const r=calculateUberMindPro20Scenario({
  jevDecisions:25000,averageJevInputTokens:1000,jevDispatchAuthorized:true,
  additionalClaudeApiUsd:3.5,otherExternalActualOrBudgetedUsd:1
 });
 assert.equal(r.projectedJevPriceUsd,1.05);
 assert.equal(r.projectedMonthlyCashOutlayUsd,25.55);
 assert.equal(r.proOnlyScenarioUsd,24.5);
 assert.equal(r.pricingDate,PUBLIC_TARIFF_AS_OF);
});

test('invalid NaN, negative amount, excessive geometry and non-boolean external mode fail closed',()=>{
 for(const q of [
  {jevDecisions:NaN},{jevDecisions:-1},
  {averageJevInputTokens:32001},{jevDecisions:1e9},
  {jevDispatchAuthorized:'true'},{additionalClaudeApiUsd:Infinity},
  {monthlyProUsd:-20},{haikuOutputTokens:-10}
 ]){
  const r=calculateUberMindPro20Scenario(q);
  assert.equal(r.ok,false);
  assert.equal(r.providerCallsPerformed,0);
  assert.equal(r.actualProviderInvoiceObserved,false);
 }
});

test('zero tokens have zero API-equivalent prices, no phantom savings',()=>{
 const r=calculateUberMindPro20Scenario({
  jevDecisions:0,opusInputTokens:0,opusOutputTokens:0,
  sonnetInputTokens:0,sonnetOutputTokens:0,
  haikuInputTokens:0,haikuOutputTokens:0,
  referenceOpusInputTokens:0,referenceOpusOutputTokens:0
 });
 assert.equal(r.apiEquivalentUsd.proposedTeamTotal,0);
 assert.equal(r.apiEquivalentUsd.referenceOpusOnly,0);
 assert.equal(r.apiEquivalentUsd.hypotheticalReductionPercent,null);
 assert.equal(r.projectedMonthlyCashOutlayUsd,20);
});
