import {
  UBERMIND_55_OFFICIAL_TARIFF_USD_PER_MTOK,
  calculateUberMind55PriceProxy
} from './ubermind-55-family-subscription-price-proxy.mjs';

export const UBERMIND_W37_MESH_SCHEMA='uberbond.ubermind-55-all-in-agent-mesh-cost.v1';
const valid=(n,lo,hi)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
const integer=(n,lo,hi)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
const rnd=n=>Number(n.toFixed(9));
const ref=UBERMIND_55_OFFICIAL_TARIFF_USD_PER_MTOK;
const refuse=reason=>({ok:false,status:'W37_ALL_IN_MESH_PROXY_REFUSED',reason,
  actualClaudeProFiveHourUsagePercent:null,frontierQualityParityProven:false,
  paidApiCallsPerformed:0,extraPaidSpendingAuthorizedUsd:0,
  externalEffectAuthority:'NONE'});
const rate=model=>model==='opus'?ref.opus:model==='sonnet'?ref.sonnet:null;
/**
 * A baseline input/output geometry is partitioned proportionally across
 * models AFTER source-certified reuse. Auxiliary agent calls (and retries)
 * are added separately. All values are caller-supplied research assumptions;
 * real Pro account meter cannot be inferred from official API rates.
 *
 * Source/task acceptance and frontier-quality parity are not certified here.
 * For each Haiku call inputTokensPerCall must include FULL prompt incl. system
 * and conversation prefix; long prompts are charged at the long tier.
 */
export function calculateUberMind55AllInMesh({
 inputTokens=1000000,outputTokens=200000,
 certifiedReuseShare=0.4,
 opusShare=0.2,sonnetShare=0.5,haikuShare=0.3,
 auxiliaryCalls=[],
 fixedExtraApiEquivalentUsd=0
}={}){
 if(!valid(certifiedReuseShare,0,1)||
    !valid(fixedExtraApiEquivalentUsd,0,100000))
   return refuse('invalid-reuse-share-or-fixed-overhead');
 if(!Array.isArray(auxiliaryCalls)||auxiliaryCalls.length>32)
   return refuse('bounded-agent-role-list-required');
 const primary=calculateUberMind55PriceProxy({
  inputTokens,outputTokens,opusShare,sonnetShare,haikuShare,
  certifiedReuseShare,additionalVerificationApiEquivalentUsd:0
 });
 if(!primary.ok)return refuse('invalid-primary-model-shares-or-token-geometry');
 let overhead=fixedExtraApiEquivalentUsd;
 let totalAuxCalls=0;
 const breakdown=[];
 for(const row of auxiliaryCalls){
  if(!row||!['opus','sonnet','haiku'].includes(row.model)||
      typeof row.role!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(row.role)||
      !integer(row.calls,0,100)||
      !integer(row.inputTokensPerCall,1,10000000)||
      !integer(row.outputTokensPerCall,1,10000000))
   return refuse('invalid-agent-model-role-call-count-or-full-token-geometry');
  totalAuxCalls+=row.calls;
  if(totalAuxCalls>512)return refuse('too-many-agent-calls');
  const tariff=rate(row.model)||(row.inputTokensPerCall>100000?ref.haikuLong:ref.haikuShort);
  const costPerCall=tariff.input*row.inputTokensPerCall/1e6+
    tariff.output*row.outputTokensPerCall/1e6;
  const cost=costPerCall*row.calls;
  overhead+=cost;
  breakdown.push({
   role:row.role,model:row.model,calls:row.calls,
   includedFullPromptTokensPerCall:row.inputTokensPerCall,
   outputTokensPerCall:row.outputTokensPerCall,
   haikuLongTier:row.model==='haiku'&&row.inputTokensPerCall>100000,
   apiEquivalentUsd:rnd(cost)
  });
 }
 const main=primary.candidateApiEquivalentUsd;
 const total=main+overhead;
 const baseline=primary.baselineAllOpusApiEquivalentUsd;
 return {
  ok:true,status:'CONDITIONAL_API_EQUIVALENT_ALL_IN_MESH_SCENARIO',
  sourceCertifiedReuseShareAssumed:certifiedReuseShare,
  totalMainInputTokensBaseline:inputTokens,totalMainOutputTokensBaseline:outputTokens,
  residualModelWorkShares:{opus:opusShare,sonnet:sonnetShare,haiku:haikuShare},
  baselineAllOpusApiEquivalentUsd:rnd(baseline),
  residualMainModelApiEquivalentUsd:rnd(main),
  auxiliaryAgentAndExtraVerificationApiEquivalentUsd:rnd(overhead),
  auxiliaryCallCount:totalAuxCalls,auxiliaryCallsBreakdown:breakdown,
  combinedApiEquivalentUsd:rnd(total),
  combinedApiEquivalentPriceCutPercent:rnd((1-total/baseline)*100),
  combinedCostPerAcceptedTaskVerified:false,
  frontierQualityParityProven:false,
  actualClaudeProFiveHourUsagePercent:null,actualClaudeProWeeklyUsagePercent:null,
  proMonthlySubscriptionUsd:20,subscriptionCashPriceCutPercent:0,
  paidApiCallsPerformed:0,extraPaidSpendingAuthorizedUsd:0,
  externalEffectAuthority:'NONE',
  warning:'This is a fully counted, uncached hypothetical API equivalent, not subscription usage or a guaranteed identical-quality task result. Actual model usage, hidden/repeated context, supervisor calls, tool loops, retries, quality and /usage must be independently measured; add every extra turn as an auxiliary call or increase primary token counts.'
 };
}
export function requiredReuseForMeshCut({
 desiredApiEquivalentCutPercent=90,
 inputTokens=1000000,outputTokens=200000,
 opusShare=.2,sonnetShare=.5,haikuShare=.3,
 auxiliaryCalls=[],fixedExtraApiEquivalentUsd=0
}={}){
 if(!valid(desiredApiEquivalentCutPercent,0,100))
  return refuse('cut-target-outside-zero-to-one-hundred');
 const noReuse=calculateUberMind55AllInMesh({
  inputTokens,outputTokens,certifiedReuseShare:0,
  opusShare,sonnetShare,haikuShare,auxiliaryCalls,fixedExtraApiEquivalentUsd
 });
 if(!noReuse.ok)return noReuse;
 const priceHeadroom=noReuse.baselineAllOpusApiEquivalentUsd*(1-desiredApiEquivalentCutPercent/100)
      -noReuse.auxiliaryAgentAndExtraVerificationApiEquivalentUsd;
 const residualUnreused=noReuse.residualMainModelApiEquivalentUsd;
 const reachable=priceHeadroom>=-1e-10;
 const required=reachable?Math.max(0,1-priceHeadroom/residualUnreused):null;
 return {
  ok:true,status:'THEORETICAL_REUSE_BREAK_EVEN_ONLY',
  desiredApiEquivalentCutPercent,requiredCertifiedReuseShare:
    required!==null&&required<=1?rnd(required):null,
  targetReachableWithDeclaredFixedAgentOverhead:reachable&&required<=1,
  allInNoReuseApiEquivalentUsd:noReuse.combinedApiEquivalentUsd,
  fixedAuxiliaryOverheadApiEquivalentUsd:noReuse.auxiliaryAgentAndExtraVerificationApiEquivalentUsd,
  completeReuseAllInFloorApiEquivalentUsd:noReuse.auxiliaryAgentAndExtraVerificationApiEquivalentUsd,
  actualSubscriptionMeterImpact:null,frontierQualityParityProven:false,
  providerCallsPerformed:0,extraPaidSpendingAuthorizedUsd:0,externalEffectAuthority:'NONE'
 };
}
