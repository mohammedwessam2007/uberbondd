import test from 'node:test';
import assert from 'node:assert/strict';
import { compileComputeSovereigntyCapacityFrontier } from '../src/compute-sovereignty-capacity.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';

const NOW='2026-09-06T01:00:00.000Z';
const catalog=[{provider:'openai',canonicalModel:'frontier-a'},{provider:'google',canonicalModel:'frontier-b'}];
const profile={id:'openai-a',provider:'openai',model:'frontier-a',revision:'rev-1',transportProvider:'ai-gateway',transportModel:'openai/frontier-a',transportSourceRef:'official://transport',transportVerifiedAt:NOW,pricingSourceRef:'official://pricing',pricingVerifiedAt:NOW,enabled:true,centsPerMillionInputTokens:100,centsPerMillionOutputTokens:500};

test('catalog presence is discovered-only when no canonical profile exists',()=>{
  const result=compileComputeSovereigntyCapacityFrontier({catalogCandidates:catalog,profiles:[],benchmarks:[],budgetCents:100,now:NOW});
  assert.equal(result.ok,true);
  assert.equal(result.receipt.counts.discovered,2);
  assert.equal(result.receipt.counts.configured,0);
  assert.ok(result.receipt.models.every(row=>row.state==='DISCOVERED_ONLY'));
});

test('label-only profile cannot mint configured capacity',()=>{
  const result=compileComputeSovereigntyCapacityFrontier({catalogCandidates:catalog,profiles:[{id:'fake',provider:'openai',model:'frontier-a',revision:'rev-1',enabled:true}],benchmarks:[],budgetCents:100,now:NOW});
  const row=result.receipt.models.find(item=>item.model==='frontier-a');
  assert.equal(row.configured,false);
  assert.equal(row.state,'DISCOVERED_ONLY');
});

test('configured profile is not callable without producer-bound live receipt',()=>{
  const result=compileComputeSovereigntyCapacityFrontier({catalogCandidates:catalog,profiles:[profile],benchmarks:[],budgetCents:100,estimatedInputTokens:1000,estimatedOutputTokens:100,now:NOW});
  const row=result.receipt.models.find(item=>item.model==='frontier-a');
  assert.equal(row.configured,true);
  assert.equal(row.callableNow,false);
  assert.equal(row.affordable,false);
  assert.equal(row.trustedForTask,false);
  assert.equal(row.state,'CONFIGURED_NOT_LIVE_PROVEN');
  assert.equal(row.pricingFresh,true);
  assert.equal(row.transportEvidenceFresh,true);
});

test('stale profile evidence remains configured but cannot be laundered into fresh economic trust',()=>{
  const stale={...profile,pricingVerifiedAt:'2026-01-01T00:00:00Z',transportVerifiedAt:'2026-01-01T00:00:00Z'};
  const result=compileComputeSovereigntyCapacityFrontier({catalogCandidates:catalog,profiles:[stale],benchmarks:[],budgetCents:100,estimatedInputTokens:1000,estimatedOutputTokens:100,now:NOW,profileEvidenceMaxAgeMs:7*24*60*60*1000});
  const row=result.receipt.models.find(item=>item.model==='frontier-a');
  assert.equal(row.configured,true);
  assert.equal(row.pricingFresh,false);
  assert.equal(row.transportEvidenceFresh,false);
  assert.equal(row.affordable,false);
  assert.equal(row.trustedForTask,false);
  assert.equal(result.receipt.counts.stalePricing,1);
  assert.equal(result.receipt.counts.staleTransportEvidence,1);
});

test('future-dated pricing and transport evidence is not fresh',()=>{
  const future={...profile,pricingVerifiedAt:'2026-09-07T00:00:00Z',transportVerifiedAt:'2026-09-07T00:00:00Z'};
  const result=compileComputeSovereigntyCapacityFrontier({catalogCandidates:catalog,profiles:[future],benchmarks:[],budgetCents:100,now:NOW});
  const row=result.receipt.models.find(item=>item.model==='frontier-a');
  assert.equal(row.pricingFresh,false);
  assert.equal(row.transportEvidenceFresh,false);
});

test('synthetic callability receipt can never mint live capacity',()=>{
  const built=buildFrontierCallabilityProbeReceipt({observedAt:NOW,sourceRef:'runtime://synthetic-test',observations:[{profileId:'openai-a',status:'CALLABLE_NOW',observedProvider:'openai',observedModel:'frontier-a',observedRevision:'rev-1',observedTransportProvider:'ai-gateway',observedTransportModel:'openai/frontier-a',observedAt:NOW,sourceRef:'runtime://synthetic-provider',providerRequestId:'synthetic-request',identityVerification:'OBSERVED',evidenceClass:'OBSERVED_RUNTIME'}]});
  assert.equal(built.ok,true);
  const result=compileComputeSovereigntyCapacityFrontier({catalogCandidates:catalog,profiles:[profile],callabilityReceipt:built.receipt,callabilityReceiptDigest:built.receiptDigest,benchmarks:[],budgetCents:100,now:NOW});
  assert.equal(result.receipt.liveCallabilityReceiptAccepted,false);
  assert.equal(result.receipt.counts.callableNow,0);
});

test('transport mismatch would not match a profile even if provider model and revision align',()=>{
  const mismatched={...profile,transportModel:'openai/other-frontier-a'};
  const result=compileComputeSovereigntyCapacityFrontier({catalogCandidates:catalog,profiles:[mismatched],benchmarks:[],budgetCents:100,now:NOW});
  const row=result.receipt.models.find(item=>item.model==='frontier-a');
  assert.equal(row.configured,true);
  assert.equal(row.callableNow,false);
  assert.equal(row.transportModel,'openai/other-frontier-a');
});

test('profile missing from catalog stays configured but is not laundered into discovered truth',()=>{
  const result=compileComputeSovereigntyCapacityFrontier({catalogCandidates:[],profiles:[profile],benchmarks:[],budgetCents:100,now:NOW});
  assert.equal(result.receipt.models.length,1);
  assert.equal(result.receipt.models[0].discovered,false);
  assert.equal(result.receipt.models[0].configured,true);
  assert.equal(result.receipt.models[0].callableNow,false);
});

test('invalid budgets token estimates and evidence age bounds fail closed',()=>{
  assert.equal(compileComputeSovereigntyCapacityFrontier({catalogCandidates:[],profiles:[],benchmarks:[],budgetCents:-1,now:NOW}).ok,false);
  assert.equal(compileComputeSovereigntyCapacityFrontier({catalogCandidates:[],profiles:[],benchmarks:[],estimatedInputTokens:-2,now:NOW}).ok,false);
  assert.equal(compileComputeSovereigntyCapacityFrontier({catalogCandidates:[],profiles:[],benchmarks:[],profileEvidenceMaxAgeMs:-1,now:NOW}).ok,false);
});
