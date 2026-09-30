import test from 'node:test';import assert from 'node:assert/strict';
import {directFrontierReferenceTotalMicrousd,proveReferenceEconomics} from '../src/provable-reference-economics.mjs';
const H='sha256:'+'a'.repeat(64);
const ref=(extra={})=>({model:'frontier/model',priceEvidenceRef:'catalog://dated',counterfactualOptimizationEvidenceRef:'optimizer://dated',
 freshInputTokens:1000,cachedInputTokens:0,outputTokens:100,inputUsdPerMillion:4,cacheReadUsdPerMillion:.2,outputUsdPerMillion:20,
 batchMultiplier:1,providerPriceMultiplier:1,platformFeeRate:0,identicalRequest:false,cheapestLegitimateRouteVerified:true,
 batchEconomicsConsidered:true,promptCacheEconomicsConsidered:true,responseCacheEconomicsConsidered:true,retryEconomicsConsidered:true,...extra});
const item=(extra={})=>({id:'x',equivalenceClass:'E1',proofVerified:true,matchedObligationHash:H,qualityContractHash:H,proofRef:'proof://x',executionCount:10,directReference:ref(),...extra});
test('E0-E4 reference economics is arithmetic once proof and conservative counterfactual close',()=>{const r=proveReferenceEconomics({workItems:[item()],actualAllInMicrousd:1000});assert.equal(r.ok,true);assert.equal(r.certifiedExecutions,10);assert.ok(r.referenceCompressionFactor>1);});
test('E5/E6 cannot enter theorem ledger',()=>{assert.equal(proveReferenceEconomics({workItems:[item({equivalenceClass:'E5'})],actualAllInMicrousd:1}).ok,false);});
test('identical requests must credit direct response caching rather than multiplying fresh cost',()=>{const x=item({executionCount:100,directReference:ref({identicalRequest:true,responseCacheEligible:true,responseCacheHitMicrousd:0})});assert.equal(directFrontierReferenceTotalMicrousd(x),directFrontierReferenceTotalMicrousd({...x,executionCount:1}));});
test('identical request without response-cache economics is refused',()=>{assert.throws(()=>directFrontierReferenceTotalMicrousd(item({directReference:ref({identicalRequest:true})})));});
test('33,333x target is mechanically recognized only when reference >= $1M and actual <= $30',()=>{const expensive=ref({freshInputTokens:0,outputTokens:50000000000,inputUsdPerMillion:0,outputUsdPerMillion:20});const r=proveReferenceEconomics({workItems:[item({executionCount:1,directReference:expensive})],actualAllInMicrousd:30_000_000});assert.equal(r.millionDollarReferenceThresholdMet,true);assert.equal(r.target33333xMet,true);});
test('synthetic or unverified proof cannot manufacture reference value',()=>{assert.equal(proveReferenceEconomics({workItems:[item({proofVerified:false})],actualAllInMicrousd:1}).ok,false);});
