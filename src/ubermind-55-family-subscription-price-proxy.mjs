/**
 * UberMind W36, 2026-10-10.
 * Official 5.5 family uncached API tariff equivalents, NOT Pro quota weighting.
 * Source 2026-10-10: https://claude.com/pricing
 * Exact same aggregate tokens are hypothetically partitioned across models.
 * Evidence of equal output quality is NEVER inferred from arithmetic.
 */
export const UBERMIND_55_TARIFF_SCHEMA='uberbond.ubermind-55-price-proxy.v1';
export const UBERMIND_55_OFFICIAL_TARIFF_USD_PER_MTOK=Object.freeze({
 opus: Object.freeze({input:4,output:20}),
 sonnet:Object.freeze({input:2,output:10}),
 haikuShort:Object.freeze({input:.1,output:.5}),
 haikuLong:Object.freeze({input:.5,output:2.5})
});
const valid=(n,lo,hi)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
const nine=n=>Number(n.toFixed(9));
const reject=reason=>({ok:false,status:'API_PROXY_INPUT_REJECTED',reason,
 actualClaudeProFiveHourUsagePercent:null,qualityEquivalenceProven:false,
 providerCalls:0,externalEffectAuthority:'NONE',newPaidApiSpendingAuthorizedUsd:0});
/**
 * Each share represents a share of identical token geometry (both total inputs
 * and outputs); it is NOT a guaranteed assignment of quality-equivalent work.
 * HaikuShort requires each individual Haiku prompt <= 100k tokens.
 * Read/write cache rates, batch fees, Sonnet/Opus task retries, coordination,
 * and any context growth must be modeled separately if real.
 */
export function calculateUberMind55PriceProxy({
 inputTokens=1000000,outputTokens=200000,
 opusShare=.2,sonnetShare=.5,haikuShare=.3,
 haikuPromptTier='under100k',certifiedReuseShare=0,
 additionalVerificationApiEquivalentUsd=0
}={}){
 if(!Number.isSafeInteger(inputTokens)||inputTokens<1||inputTokens>1e10||
    !Number.isSafeInteger(outputTokens)||outputTokens<1||outputTokens>1e10||
    ![opusShare,sonnetShare,haikuShare,certifiedReuseShare].every(x=>valid(x,0,1))||
    Math.abs(opusShare+sonnetShare+haikuShare-1)>1e-9||
    !['under100k','over100k'].includes(haikuPromptTier)||
    !valid(additionalVerificationApiEquivalentUsd,0,100000))
  return reject('valid-positive-token-geometry-normalized-shares-and-cache-free-tariff-required');
 const tariffs=UBERMIND_55_OFFICIAL_TARIFF_USD_PER_MTOK;
 const millionIn=inputTokens/1000000,millionOut=outputTokens/1000000;
 const rate=v=>v.input*millionIn+v.output*millionOut;
 const baseline=rate(tariffs.opus);
 const tiers={
  opus:rate(tariffs.opus),sonnet:rate(tariffs.sonnet),
  haiku:rate(haikuPromptTier==='under100k'?tariffs.haikuShort:tariffs.haikuLong)
 };
 const assigned=opusShare*tiers.opus+sonnetShare*tiers.sonnet+haikuShare*tiers.haiku;
 const postReuse=assigned*(1-certifiedReuseShare);
 const candidate=postReuse+additionalVerificationApiEquivalentUsd;
 return {
  ok:true,status:'OFFICIAL_API_TARIFF_HYPOTHETICAL_SCENARIO',
  totalInputTokens:inputTokens,totalOutputTokens:outputTokens,
  modelFractions:{opus:opusShare,sonnet:sonnetShare,haiku:haikuShare},
  haikuPromptTier,certifiedReuseShareAssumed:certifiedReuseShare,
  baselineAllOpusApiEquivalentUsd:nine(baseline),
  candidateApiEquivalentUsd:nine(candidate),
  hypotheticalApiEquivalentPriceCutPercent:nine((1-candidate/baseline)*100),
  perModelUncachedApiEquivalentUsd:{
   opus:nine(opusShare*tiers.opus*(1-certifiedReuseShare)),
   sonnet:nine(sonnetShare*tiers.sonnet*(1-certifiedReuseShare)),
   haiku:nine(haikuShare*tiers.haiku*(1-certifiedReuseShare))
  },
  additionalVerificationApiEquivalentUsd,
  fixedProSubscriptionMonthlyUsd:20,
  proSubscriptionCashPriceCutPercent:0,
  actualClaudeProFiveHourUsagePercent:null,
  actualClaudeProWeeklyUsagePercent:null,
  qualityEquivalenceProven:false,
  routingFeasibilityVerified:false,
  sameTaskAcceptedDeliverableObserved:false,
  providerCalls:0,newPaidApiSpendingAuthorizedUsd:0,
  externalEffectAuthority:'NONE',
  warning:'API price list is a research proxy only; Anthropic Pro 5-hour/weekly metering cannot be calculated from tariffs. Mixed-model outputs may fail frontier-quality equivalence. Haiku <100k tier applies to individual prompt length. Quota counts full coordinator/subagent work, tool reruns, context, and effort; cache/batch discounts and reuse are not automatically plan allowances.'
 };
}
/**
 * Minimum possible output-price floor for a fixed fraction of work that MUST
 * remain Opus-quality; all other work is assumed provably suitable for Haiku.
 * This is a conditional price floor, NOT a verified Max-Quality plan route.
 */
export function model55PriceFloorWithOpusRequired({
 essentialOpusShare=.2,haikuPromptTier='under100k',
 inputTokens=1000000,outputTokens=200000
}={}){
 if(!valid(essentialOpusShare,0,1))return reject('opus-quality-required-fraction-in-range');
 return calculateUberMind55PriceProxy({
  inputTokens,outputTokens,opusShare:essentialOpusShare,
  sonnetShare:0,haikuShare:1-essentialOpusShare,haikuPromptTier
 });
}
