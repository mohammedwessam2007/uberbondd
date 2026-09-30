const EQUIV=new Set(['E0','E1','E2','E3','E4']);
const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
const digest=x=>typeof x==='string'&&/^sha256:[0-9a-f]{64}$/.test(x);

function mulMicrousd(tokens,usdPerMillion,mult=1){
  if(!safeInt(tokens)||!Number.isFinite(usdPerMillion)||usdPerMillion<0||!Number.isFinite(mult)||mult<0) throw new Error('valid-token-price-contract-required');
  return Math.ceil(tokens*usdPerMillion*mult);
}
export function directFrontierUnitCostMicrousd(ref){
  if(!ref||!ref.model||!ref.priceEvidenceRef||!ref.counterfactualOptimizationEvidenceRef) throw new Error('direct-reference-evidence-required');
  const m=(ref.batchMultiplier??1)*(ref.providerPriceMultiplier??1)*(1+(ref.platformFeeRate??0));
  if(!(m>=0)) throw new Error('valid-reference-multiplier-required');
  const fresh=mulMicrousd(ref.freshInputTokens??0,ref.inputUsdPerMillion,m);
  const cached=mulMicrousd(ref.cachedInputTokens??0,ref.cacheReadUsdPerMillion??ref.inputUsdPerMillion,m);
  const output=mulMicrousd(ref.outputTokens??0,ref.outputUsdPerMillion,m);
  return fresh+cached+output;
}
export function directFrontierReferenceTotalMicrousd(item){
  if(!safeInt(item.executionCount)||item.executionCount<1) throw new Error('positive-execution-count-required');
  const unit=directFrontierUnitCostMicrousd(item.directReference);
  const identical=item.directReference.identicalRequest===true;
  if(identical){
    if(item.directReference.responseCacheEligible!==true||!safeInt(item.directReference.responseCacheHitMicrousd)) throw new Error('identical-request-must-credit-response-cache-economics');
    return unit+(item.executionCount-1)*item.directReference.responseCacheHitMicrousd;
  }
  return unit*item.executionCount;
}
export function validateProvableWorkItem(item){
  const reasons=[];
  if(!item?.id)reasons.push('id-required');
  if(!EQUIV.has(item?.equivalenceClass))reasons.push('E0-E4-required');
  if(item?.proofVerified!==true)reasons.push('equivalence-proof-not-verified');
  if(!digest(item?.matchedObligationHash))reasons.push('matched-obligation-hash-required');
  if(!digest(item?.qualityContractHash))reasons.push('quality-contract-hash-required');
  if(!item?.proofRef)reasons.push('proof-ref-required');
  if(!item?.directReference?.cheapestLegitimateRouteVerified)reasons.push('cheapest-legitimate-direct-route-not-verified');
  if(!item?.directReference?.batchEconomicsConsidered)reasons.push('batch-economics-not-considered');
  if(!item?.directReference?.promptCacheEconomicsConsidered)reasons.push('prompt-cache-economics-not-considered');
  if(!item?.directReference?.responseCacheEconomicsConsidered)reasons.push('response-cache-economics-not-considered');
  if(!item?.directReference?.retryEconomicsConsidered)reasons.push('retry-economics-not-considered');
  try{directFrontierReferenceTotalMicrousd(item);}catch(e){reasons.push(String(e.message||e));}
  return {ok:reasons.length===0,reasons};
}
export function proveReferenceEconomics({workItems=[],actualAllInMicrousd,targetActualMicrousd=30_000_000}={}){
  if(!Array.isArray(workItems)||!workItems.length) return {ok:false,status:'PROVABLE_WORK_ITEMS_REQUIRED'};
  if(!safeInt(actualAllInMicrousd)) return {ok:false,status:'OBSERVED_ACTUAL_ALL_IN_COST_REQUIRED'};
  const invalid=[],rows=[];let reference=0,executions=0;
  for(const item of workItems){
    const v=validateProvableWorkItem(item);if(!v.ok){invalid.push({id:item?.id??null,reasons:v.reasons});continue;}
    const ref=directFrontierReferenceTotalMicrousd(item);reference+=ref;executions+=item.executionCount;
    rows.push({id:item.id,equivalenceClass:item.equivalenceClass,executionCount:item.executionCount,directReferenceMicrousd:ref,proofRef:item.proofRef});
  }
  if(invalid.length) return {ok:false,status:'REFERENCE_PROOF_REFUSED',invalid};
  const savings=reference-actualAllInMicrousd;
  const factor=actualAllInMicrousd>0?reference/actualAllInMicrousd:null;
  const target=1_000_000_000_000;
  return {ok:true,status:'PROVABLE_REFERENCE_ECONOMICS',certifiedExecutions:executions,directFrontierReferenceMicrousd:reference,
    actualAllInMicrousd,avoidedReferenceMicrousd:Math.max(0,savings),referenceCompressionFactor:factor,
    withinThirtyDollarEnvelope:actualAllInMicrousd<=targetActualMicrousd,
    millionDollarReferenceThresholdMet:reference>=target,
    target33333xMet:factor!=null&&factor>=33333.333333333336&&actualAllInMicrousd<=targetActualMicrousd&&reference>=target,
    theoremBoundary:'FOR_E0_E4_ONLY: QUALITY_EQUIVALENCE_IS_SUPPLIED_BY THE VERIFIED PROOF. THIS LEDGER PROVES COUNTERFACTUAL DIRECT-FRONTIER COST AVOIDANCE, NOT MARKET VALUE, RAW GPU FLOPS, OR E5/E6 QUALITY.' ,
    rows};
}
