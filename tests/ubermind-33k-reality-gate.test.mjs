import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReferenceCapacityModel,audit33kEvidencePrerequisites }
  from '../src/ubermind-33k-reality-gate.mjs';
import {proveReferenceEconomics} from '../src/provable-reference-economics.mjs';
const H='sha256:'+'a'.repeat(64);
const ref=()=>({model:'anthropic/claude-opus-5.5',priceEvidenceRef:'fixture:price',counterfactualOptimizationEvidenceRef:'fixture:route',
 freshInputTokens:0,cachedInputTokens:0,outputTokens:50_000_000_000,
 inputUsdPerMillion:4,outputUsdPerMillion:20,
 batchMultiplier:1,providerPriceMultiplier:1,
 cheapestLegitimateRouteVerified:true,batchEconomicsConsidered:true,promptCacheEconomicsConsidered:true,responseCacheEconomicsConsidered:true,retryEconomicsConsidered:true});
const hypothetical=()=>({id:'synthetic',equivalenceClass:'E1',proofVerified:true,
 matchedObligationHash:H,qualityContractHash:H,proofRef:'fixture:synthetic',executionCount:1,directReference:ref()});
test('legacy 50-billion-output-token fixture is arithmetic ONLY; no external 33k claim',()=>{
 const v=proveReferenceEconomics({workItems:[hypothetical()],actualAllInMicrousd:30_000_000});
 assert.equal(v.ok,true);assert.equal(v.arithmeticTarget33333xMet,true);
 assert.equal(v.target33333xMet,false);assert.equal(v.reportedMultiplierAuthority,'NONE');
});
test('official catalog geometry bounds a single Opus API request, unlike 50B-token fiction',()=>{
 const v=evaluateReferenceCapacityModel({
  model:'anthropic/claude-opus-5.5',
  sourceUrl:'https://openrouter.ai/anthropic/claude-opus-5.5/',
  observedAt:'2026-10-08T00:00:00Z',contextTokens:1_000_000,maxOutputTokens:128_000,
  inputUsdPerMillion:4,outputUsdPerMillion:20
 });
 assert.equal(v.ok,true);
 assert.ok(v.theoreticalMaxDirectUsdPerRequest<7);
 assert.ok(v.minimumDistinctReferenceRequestsFor1mUsd>140_000);
 assert.equal(v.target33333xVerified,false);
});
test('no independent paid-work evidence is a hold, not a achieved multiplier',()=>{
 const v=audit33kEvidencePrerequisites({taskClass:'FRONTIER_OPEN_ENDED_REASONING',period:'2026-10'});
 assert.equal(v.ok,false);assert.equal(v.empiricalMultiplier,null);
 assert.equal(v.target33333xConfirmed,false);
 assert.ok(v.reasons.includes('NO_AUTHENTICATED_FINISHED_WORK'));
 assert.ok(v.reasons.includes('INDEPENDENT_PAIRED_QUALITY_RECEIPTS_MISSING'));
});
test('even trillion-microusd self-asserted value and fabricated receipts cannot self-promote',()=>{
 const executions=[{executionId:'e1',taskFingerprint:'a'.repeat(64),qualityContractId:'q1',
  completedAt:'2026-10-08T01:00:00Z',synthetic:false}];
 const v=audit33kEvidencePrerequisites({
  taskClass:'FRONTIER_OPEN_ENDED_REASONING',period:'2026-10',
  observedExecutions:executions,
  independentQualityReceipts:[{id:'faker'}],
  independentProviderBills:[{id:'faker'}],
  independentlyCertifiedCheapestReference:{externalAuditorId:'self',marketTimestamp:'now',cacheBatchAndRetryDiscountAudit:true},
  independentlyReconciledAllInMicrousd:30_000_000,
  claimedDirectReferenceMicrousd:1_000_000_000_000,
  productionCustomerDemandReceipts:[{id:'faker'}]
 });
 assert.equal(v.arithmeticThresholdWouldBeMet,true);
 assert.equal(v.target33333xConfirmed,false);
 assert.equal(v.admittedIndependentWorkCount,0);
 assert.ok(v.reasons.includes('EXTERNAL_INDEPENDENT_CRYPTOGRAPHIC_AUDIT_NOT_PERFORMED'));
});
test('cloned task fingerprints cannot count as independent external demand',()=>{
 const x={executionId:'e1',taskFingerprint:'a'.repeat(64),qualityContractId:'q1',completedAt:'2026-10-08T01:00:00Z'};
 const v=audit33kEvidencePrerequisites({taskClass:'EXACT',period:'2026-10',
  observedExecutions:[x,{...x,executionId:'e2'}]});
 assert.ok(v.reasons.includes('DUPLICATE_SYNTHETIC_OR_UNBOUND_EXECUTION'));
});
test('unsupported capacity catalog is refused not estimated',()=>{
 const v=evaluateReferenceCapacityModel({model:'fake',sourceUrl:'https://openrouter.ai/',
  observedAt:'2026-10-08T00:00:00Z',contextTokens:32_000,maxOutputTokens:50_000,
  inputUsdPerMillion:4,outputUsdPerMillion:20});
 assert.equal(v.ok,false);
});

test('astronomical cost parameters refuse unsafe counterfactual arithmetic',()=>{
 const z={...hypothetical(),directReference:{...ref(),outputTokens:Number.MAX_SAFE_INTEGER}};
 const r=proveReferenceEconomics({workItems:[z],actualAllInMicrousd:100});
 assert.equal(r.ok,false);
 assert.equal(r.status,'REFERENCE_PROOF_REFUSED');
});
