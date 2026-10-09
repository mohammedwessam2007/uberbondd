/**
 * UberMind Pro-$20 Economics: read-only tariff and subscription separation.
 *
 * PLAN ACCOUNTING TRUTH:
 *  - Claude Pro pays a fixed plan price and has usage/availability ceilings;
 *    equivalent API token values are not an extra subscriber charge.
 *  - The Claude Pro subscription does NOT pay for OpenRouter/Jev or Claude API.
 *  - Every projected JEV charge below is arithmetic, not an invoice, proof
 *    that calls were made, or authorization to dispatch calls.
 *  - Never model a published 5-hour/weekly usage window as a token quota:
 *    the actual Pro balance is private, dynamic and account-dependent.
 */
export const UBERMIND_PRO20_ECONOMICS_VERSION='uberbond.ubermind.pro20-economics.v1';
export const PUBLIC_TARIFF_AS_OF='2026-10-09';
export const TARIFF_PER_MILLION_INPUT_OUTPUT_USD=Object.freeze({
  opus55:Object.freeze({input:4,output:20}),
  sonnet55:Object.freeze({input:2,output:10}),
  haiku55Short:Object.freeze({input:.10,output:.50}),
  jev113:Object.freeze({input:.042,output:0})
});
const allowed=(n,max=100000000)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max;
const centsafe=n=>Number(n.toFixed(9));
const refused=reason=>({
  ok:false,status:'PRO20_COST_SCENARIO_REFUSED',reason,
  actualProviderInvoiceObserved:false,
  actualCurrentClaudeUsageObserved:false,
  externalEffectAuthority:'NONE',providerCallsPerformed:0
});
function tokenCost(i,o,price){
 return (i*price.input+o*price.output)/1000000;
}
/**
 * A zero-side-effect live-editable calculation. Caller-supplied forecast usage
 * is never mislabeled current provider usage. It can value alternative API
 * compositions, but never translates that value into Pro cash "savings".
 */
export function calculateUberMindPro20Scenario({
 monthlyProUsd=20,
 jevDecisions=1000,
 averageJevInputTokens=500,
 jevDispatchAuthorized=false,
 additionalClaudeApiUsd=0,
 otherExternalActualOrBudgetedUsd=0,
 opusInputTokens=250000,
 opusOutputTokens=50000,
 sonnetInputTokens=550000,
 sonnetOutputTokens=110000,
 haikuInputTokens=250000,
 haikuOutputTokens=50000,
 referenceOpusInputTokens=1000000,
 referenceOpusOutputTokens=200000
}={}){
 const limited={
  monthlyProUsd:[monthlyProUsd,1000],jevDecisions:[jevDecisions,1000000],
  averageJevInputTokens:[averageJevInputTokens,32000],
  additionalClaudeApiUsd:[additionalClaudeApiUsd,10000],
  otherExternalActualOrBudgetedUsd:[otherExternalActualOrBudgetedUsd,10000],
  opusInputTokens:[opusInputTokens,100000000],
  opusOutputTokens:[opusOutputTokens,100000000],
  sonnetInputTokens:[sonnetInputTokens,100000000],
  sonnetOutputTokens:[sonnetOutputTokens,100000000],
  haikuInputTokens:[haikuInputTokens,100000000],
  haikuOutputTokens:[haikuOutputTokens,100000000],
  referenceOpusInputTokens:[referenceOpusInputTokens,100000000],
  referenceOpusOutputTokens:[referenceOpusOutputTokens,100000000]
 };
 if(Object.entries(limited).some(([, [value,max]])=>!allowed(value,max)))
  return refused('finite-nonnegative-bounded-financial-inputs-required');
 if(typeof jevDispatchAuthorized!=='boolean')return refused('boolean-jev-authorization-mode-required');
 const tariffs=TARIFF_PER_MILLION_INPUT_OUTPUT_USD;
 const jevInputTokens=jevDecisions*averageJevInputTokens;
 if(!Number.isSafeInteger(jevInputTokens))return refused('safe-jev-token-product-required');
 const projectedJevPriceUsd=centsafe(tokenCost(jevInputTokens,0,tariffs.jev113));
 const extraJevDueIfScenarioExecutedUsd=jevDispatchAuthorized?projectedJevPriceUsd:0;
 const proOnlyScenarioUsd=centsafe(monthlyProUsd+additionalClaudeApiUsd+otherExternalActualOrBudgetedUsd);
 const projectedMonthlyCashOutlayUsd=centsafe(proOnlyScenarioUsd+extraJevDueIfScenarioExecutedUsd);
 const opusApiEquivalent=centsafe(tokenCost(opusInputTokens,opusOutputTokens,tariffs.opus55));
 const sonnetApiEquivalent=centsafe(tokenCost(sonnetInputTokens,sonnetOutputTokens,tariffs.sonnet55));
 const haikuApiEquivalent=centsafe(tokenCost(haikuInputTokens,haikuOutputTokens,tariffs.haiku55Short));
 const referenceApiEquivalent=centsafe(tokenCost(referenceOpusInputTokens,referenceOpusOutputTokens,tariffs.opus55));
 const proposedApiEquivalent=centsafe(opusApiEquivalent+sonnetApiEquivalent+haikuApiEquivalent+projectedJevPriceUsd);
 const hypotheticalApiSavingsUsd=centsafe(referenceApiEquivalent-proposedApiEquivalent);
 return {
  ok:true,status:'PRO20_READ_ONLY_TARIFF_SCENARIO',
  pricingDate:PUBLIC_TARIFF_AS_OF,
  pricingSourceClasses:['ANTHROPIC_OFFICIAL_PUBLIC_API_PRICING','OPENROUTER_OFFICIAL_JEV_MODEL_TARIFF'],
  subscriptionUsd:monthlyProUsd,
  subscriptionIncludesClaudeCode:true,
  subscriptionIncludesClaudeApi:false,
  realTimeClaudeUsageQuota:null,
  realTimeClaudeUsageQuotaReason:'private-account-usage-not-accessible-to-this-calculator',
  haikuTariffApplicability:'ONLY_PROMPTS_UP_TO_100000_TOKENS',
  jevMode:jevDispatchAuthorized?'CONDITIONAL_EXTERNAL_PROVIDER_SCENARIO':'PAID_JEV_DISPATCH_DISABLED',
  projectedJevInputTokens:jevInputTokens,
  projectedJevPriceUsd,
  extraJevDueIfScenarioExecutedUsd,
  projectedMonthlyCashOutlayUsd,
  proOnlyScenarioUsd,
  actualProviderInvoiceObserved:false,
  actualMonthlyPaidApiUsd:null,
  actualEndToEndQualityMatchedSavedUsd:null,
  apiEquivalentUsd:Object.freeze({
   opusLeadAndReview:opusApiEquivalent,sonnetBuilders:sonnetApiEquivalent,
   haikuScouts:haikuApiEquivalent,jevAtListedTariff:projectedJevPriceUsd,
   proposedTeamTotal:proposedApiEquivalent,referenceOpusOnly:referenceApiEquivalent,
   hypotheticalDifference:hypotheticalApiSavingsUsd,
   hypotheticalReductionPercent:referenceApiEquivalent>0
     ?centsafe(100*hypotheticalApiSavingsUsd/referenceApiEquivalent):null
  }),
  economicTruth:'The subscription outlay is fixed subject to account usage limits; API token valuation is NOT user cash saved. Optional Jev forecasts depend on billing eligibility and authenticated actual usage. No purchase, provider call, plan-limit increase or frontier-quality claim is made.',
  externalEffectAuthority:'NONE',providerCallsPerformed:0
 };
}
