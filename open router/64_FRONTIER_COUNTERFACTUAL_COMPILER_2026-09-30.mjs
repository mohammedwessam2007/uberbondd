import crypto from 'node:crypto';
const sha=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const digest=x=>typeof x==='string'&&/^sha256:[0-9a-f]{64}$/.test(x);
const safe=x=>Number.isSafeInteger(x)&&x>=0;
export function compileDirectFrontierCounterfactual({model,providerRoute,canonicalPrompt,matchedOutput,tokenizerReceipt,priceReceipt,economics={},verifyTokenizerReceipt=null,verifyPriceReceipt=null}={}){
 const reasons=[];
 if(!model||!providerRoute)reasons.push('model-and-route-required');
 if(typeof canonicalPrompt!=='string'||typeof matchedOutput!=='string')reasons.push('canonical-prompt-and-matched-output-required');
 if(typeof verifyTokenizerReceipt!=='function'||verifyTokenizerReceipt(tokenizerReceipt)!==true||!tokenizerReceipt?.verified||!safe(tokenizerReceipt.inputTokens)||!safe(tokenizerReceipt.outputTokens)||!digest(tokenizerReceipt.tokenizerHash)||!tokenizerReceipt.evidenceRef)reasons.push('verified-tokenizer-receipt-required');
 if(tokenizerReceipt.promptHash!==sha(canonicalPrompt)||tokenizerReceipt.outputHash!==sha(matchedOutput))reasons.push('tokenizer-receipt-content-binding-mismatch');
 if(typeof verifyPriceReceipt!=='function'||verifyPriceReceipt(priceReceipt)!==true||!priceReceipt?.verified||priceReceipt.model!==model||priceReceipt.providerRoute!==providerRoute||!priceReceipt.evidenceRef||!Number.isFinite(priceReceipt.inputUsdPerMillion)||!Number.isFinite(priceReceipt.outputUsdPerMillion))reasons.push('verified-current-price-receipt-required');
 if(!safe(economics.cachedInputTokens??0)||(economics.cachedInputTokens??0)>tokenizerReceipt.inputTokens)reasons.push('cached-input-token-bound-required');
 const flags=['cheapestLegitimateRouteVerified','batchEconomicsConsidered','promptCacheEconomicsConsidered','responseCacheEconomicsConsidered','retryEconomicsConsidered'];
 for(const k of flags)if(economics[k]!==true)reasons.push(k+'-required');
 if(reasons.length)return{ok:false,status:'DIRECT_FRONTIER_COUNTERFACTUAL_REFUSED',reasons};
 const directReference={model,providerRoute,priceEvidenceRef:priceReceipt.evidenceRef,counterfactualOptimizationEvidenceRef:economics.evidenceRef??priceReceipt.evidenceRef,
  freshInputTokens:tokenizerReceipt.inputTokens-(economics.cachedInputTokens??0),cachedInputTokens:economics.cachedInputTokens??0,outputTokens:tokenizerReceipt.outputTokens,
  inputUsdPerMillion:priceReceipt.inputUsdPerMillion,cacheReadUsdPerMillion:priceReceipt.cacheReadUsdPerMillion??priceReceipt.inputUsdPerMillion,
  outputUsdPerMillion:priceReceipt.outputUsdPerMillion,batchMultiplier:economics.batchMultiplier??1,providerPriceMultiplier:economics.providerPriceMultiplier??1,
  platformFeeRate:economics.platformFeeRate??0,identicalRequest:economics.identicalRequest===true,responseCacheEligible:economics.responseCacheEligible===true,
  responseCacheHitMicrousd:economics.responseCacheHitMicrousd,cheapestLegitimateRouteVerified:true,batchEconomicsConsidered:true,promptCacheEconomicsConsidered:true,responseCacheEconomicsConsidered:true,retryEconomicsConsidered:true,
  promptHash:sha(canonicalPrompt),matchedOutputHash:sha(matchedOutput),tokenizerReceiptRef:tokenizerReceipt.evidenceRef,tokenizerHash:tokenizerReceipt.tokenizerHash};
 return{ok:true,status:'DIRECT_FRONTIER_COUNTERFACTUAL_COMPILED',directReference,referenceContractHash:sha(directReference),semanticAuthority:'NONE',
  law:'COUNTERFACTUAL_COST_IS_COMPUTED_FROM_BOUND_CONTENT_TOKENIZATION_AND_DATED_ROUTE_ECONOMICS; NO CEREMONIAL FRONTIER CALL IS REQUIRED'};
}
