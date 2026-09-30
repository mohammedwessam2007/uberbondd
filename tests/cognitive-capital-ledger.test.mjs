import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createCognitiveCapitalLedger, appendObservedCapitalCost, registerCognitiveCapitalAsset, closeCognitiveCapitalLedger, auditCognitiveCapitalEconomics } from '../src/cognitive-capital-ledger.mjs';
import { createProvableExecutionLedger, appendProvableExecution } from '../src/provable-execution-ledger.mjs';

const hp=x=>'sha256:'+crypto.createHash('sha256').update(String(x)).digest('hex');
const ref=()=>{
 const directReference={
  model:'anthropic/claude-opus-5.5',priceEvidenceRef:'price://observed',counterfactualOptimizationEvidenceRef:'route://cheapest',
  freshInputTokens:1000,cachedInputTokens:0,outputTokens:20,inputUsdPerMillion:4,outputUsdPerMillion:20,cacheReadUsdPerMillion:.2,
  batchMultiplier:1,providerPriceMultiplier:1,platformFeeRate:0,identicalRequest:false,responseCacheEligible:false,
  cheapestLegitimateRouteVerified:true,batchEconomicsConsidered:true,promptCacheEconomicsConsidered:true,responseCacheEconomicsConsidered:true,retryEconomicsConsidered:true,
  promptHash:hp('prompt'),matchedOutputHash:hp('output'),tokenizerHash:hp('tok'),tokenizerReceiptRef:'tok://1'
 };
 return {directReference,referenceContractHash:hp(JSON.stringify(directReference))};
};

function proofLedger(){
 let l=createProvableExecutionLedger({period:'2026-09'});
 const {directReference,referenceContractHash}=ref();
 l=appendProvableExecution(l,{
  executionId:'e1',taskId:'t1',completedAt:'2026-09-30T20:00:00Z',equivalenceClass:'E3',proofVerified:true,
  matchedObligationHash:hp('obl'),qualityContractHash:hp('q'),proofRef:'df://1',
  referenceContractHash,directReference
 });
 return l;
}

test('closed observed cost ledger plus provable executions yields receipt-grade finite multiplier',()=>{
 let c=createCognitiveCapitalLedger({period:'2026-09',campaignId:'c1',requiredCostClasses:['SEED_CROWN','RUNTIME_COMPUTE','PLATFORM']});
 c=registerCognitiveCapitalAsset(c,{assetId:'df1',kind:'DECISION_FRANCHISE',evidenceRef:'proof://df1',qualityBasis:'E3'});
 c=appendObservedCapitalCost(c,{receiptId:'r1',assetId:'df1',costClass:'SEED_CROWN',actualMicrousd:100,basis:'OBSERVED_EXTERNAL_BILL',evidenceRef:'bill://1',observedAt:'2026-09-30T20:00:00Z'});
 c=appendObservedCapitalCost(c,{receiptId:'r2',assetId:'df1',costClass:'RUNTIME_COMPUTE',actualMicrousd:10,basis:'OBSERVED_RUNTIME_METER',evidenceRef:'meter://1',observedAt:'2026-09-30T20:01:00Z'});
 c=appendObservedCapitalCost(c,{receiptId:'r3',assetId:'df1',costClass:'PLATFORM',actualMicrousd:0,basis:'OBSERVED_ZERO_COST',evidenceRef:'platform://zero',observedAt:'2026-09-30T20:02:00Z'});
 c=closeCognitiveCapitalLedger(c,{closureEvidenceRef:'audit://closed',closedAt:'2026-09-30T21:00:00Z'});
 const out=auditCognitiveCapitalEconomics({capitalLedger:c,provableExecutionLedger:proofLedger()});
 assert.equal(out.ok,true);assert.equal(out.observedAllInMicrousd,110);assert.ok(out.referenceCompressionFactor>1);
});

test('missing cost class cannot close campaign',()=>{
 let c=createCognitiveCapitalLedger({period:'2026-09',campaignId:'c2',requiredCostClasses:['SEED_CROWN','RUNTIME_COMPUTE']});
 c=appendObservedCapitalCost(c,{receiptId:'r1',assetId:'a',costClass:'SEED_CROWN',actualMicrousd:1,basis:'OBSERVED_EXTERNAL_BILL',evidenceRef:'bill://1',observedAt:'2026-09-30T20:00:00Z'});
 assert.throws(()=>closeCognitiveCapitalLedger(c,{closureEvidenceRef:'audit://x',closedAt:'2026-09-30T21:00:00Z'}),/capital-cost-classes-incomplete/);
});

test('zero observed denominator cannot become infinity claim',()=>{
 let c=createCognitiveCapitalLedger({period:'2026-09',campaignId:'c3',requiredCostClasses:['RUNTIME_COMPUTE']});
 c=appendObservedCapitalCost(c,{receiptId:'z',assetId:'a',costClass:'RUNTIME_COMPUTE',actualMicrousd:0,basis:'OBSERVED_ZERO_COST',evidenceRef:'meter://zero',observedAt:'2026-09-30T20:00:00Z'});
 c=closeCognitiveCapitalLedger(c,{closureEvidenceRef:'audit://z',closedAt:'2026-09-30T21:00:00Z'});
 const out=auditCognitiveCapitalEconomics({capitalLedger:c,provableExecutionLedger:proofLedger()});
 assert.equal(out.ok,false);assert.equal(out.status,'NONZERO_OBSERVED_ALL_IN_COST_REQUIRED_FOR_FINITE_MULTIPLIER');
});

test('tampered cost receipt is refused',()=>{
 let c=createCognitiveCapitalLedger({period:'2026-09',campaignId:'c4',requiredCostClasses:['RUNTIME_COMPUTE']});
 c=appendObservedCapitalCost(c,{receiptId:'r',assetId:'a',costClass:'RUNTIME_COMPUTE',actualMicrousd:5,basis:'OBSERVED_RUNTIME_METER',evidenceRef:'meter://1',observedAt:'2026-09-30T20:00:00Z'});
 c=closeCognitiveCapitalLedger(c,{closureEvidenceRef:'audit://1',closedAt:'2026-09-30T21:00:00Z'});
 c.costReceipts[0].actualMicrousd=1;
 const out=auditCognitiveCapitalEconomics({capitalLedger:c,provableExecutionLedger:proofLedger()});
 assert.equal(out.ok,false);assert.equal(out.status,'CAPITAL_LEDGER_TAMPERED');
});
