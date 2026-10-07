import test from 'node:test';
import assert from 'node:assert/strict';
import { compileInfiniteOpusMarket } from '../src/infinite-opus-market.mjs';
import { compileOpenRouterJevEndpointPriceRecord, augmentInfiniteOpusMarketWithDecisionRecord } from '../src/openrouter-decision-market.mjs';
import { createGovernedJevRuntimeService } from '../src/jev-governed-runtime-service.mjs';
import { runGovernedJevLiveCanary, JEV_LIVE_CANARY_MAX_USD } from '../scripts/infinite-opus-jev-live-canary.mjs';

const NOW=Date.parse('2026-10-07T17:00:00Z');
const auth={evidenceRef:'fixture://october-runtime',month:'2026-10',maxMonthlyMicrousd:20_000_000,expiresAt:'2026-11-01T00:00:00Z',crownRoutes:[]};

function store(){
  let settings={};
  return {
    transaction:async fn=>fn({
      getSettings:async()=>structuredClone(settings),
      setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}
    }),
    dump:()=>structuredClone(settings)
  };
}

function market(){
  const base=compileInfiniteOpusMarket({data:[{
    id:'openai/gpt-6.1-sol',
    pricing:{prompt:'0.000002',completion:'0.00001'},
    context_length:1_050_000,
    top_provider:{max_completion_tokens:8192},
    supported_parameters:[],
    architecture:{input_modalities:['text']}
  }]},{verifiedAt:new Date(NOW).toISOString(),ttlMs:60*60*1000});
  const record=compileOpenRouterJevEndpointPriceRecord({data:{
    id:'typesafe/jev-1.13',
    endpoints:[{status:0,provider_name:'TypeSafe',model_id:'typesafe/jev-1.13',context_length:32000,pricing:{prompt:'0.000000042',completion:'0'}}]
  }},{verifiedAt:new Date(NOW).toISOString(),ttlMs:60*60*1000});
  return augmentInfiniteOpusMarketWithDecisionRecord(base,record);
}

const response=(body,status=200)=>({
  ok:status>=200&&status<300,
  status,
  text:async()=>JSON.stringify(body)
});

function successfulFetch(){
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    if(String(url).endsWith('/v1/key'))return response({data:{label:'fixture',limit:20,limit_remaining:19.99,usage_monthly:.01,limit_reset:'monthly'}});
    if(String(url).endsWith('/alpha/decisions'))return response({
      id:'jev-live-fixture-1',
      model:'typesafe/jev-1.13-20261007',
      provider:'TypeSafe',
      answers:{
        route:{type:'choice',choice:'bounded',confidence:.9},
        hard_reasoning:{type:'score',score:0,confidence:.9},
        crown_necessity:{type:'noul',noul:.1}
      },
      usage:{cost:.00001,input_tokens:200,output_tokens:0}
    });
    throw new Error('unexpected-url:'+url);
  };
  return {fetchImpl,calls:()=>calls};
}

const questions={
  route:{type:'choice',instructions:'route?',criteria:{exact:'exact',bounded:'bounded',frontier:'frontier'}},
  hard_reasoning:{type:'score',instructions:'hard?',criteria:['routine','moderate','hard']},
  crown_necessity:{type:'noul',instructions:'crown?'}
};

test('governed JEV decision executes inside sub-mill ledger and never gains authority',async()=>{
  const s=store(),net=successfulFetch();
  const service=createGovernedJevRuntimeService({store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,marketSnapshot:market(),fetchImpl:net.fetchImpl,clock:()=>NOW});
  const out=await service.executeDecision({operationId:'fixture-jev-decision',state:{x:1},questions,inputTokenCeiling:512,maximumSpendUsd:.001});
  assert.equal(out.ok,true);
  assert.equal(out.providerCallsPerformed,1);
  assert.equal(out.observedCostMicrousd,10);
  assert.equal(out.semanticAuthority,'NONE');
  assert.equal(out.crownSuppressionAuthority,'NONE');
  assert.equal(net.calls(),3);
  assert.equal((await service.runtime.snapshot()).budget.monthSpentMicrousd,10);
});

test('governed JEV refuses a decision whose conservative ceiling exceeds the explicit sub-mill bound',async()=>{
  const s=store(),net=successfulFetch();
  const service=createGovernedJevRuntimeService({store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,marketSnapshot:market(),fetchImpl:net.fetchImpl,clock:()=>NOW});
  const out=await service.executeDecision({operationId:'fixture-too-large',state:{x:1},questions,inputTokenCeiling:32000,maximumSpendUsd:.001});
  assert.equal(out.ok,false);
  assert.equal(out.status,'JEV_DECISION_ESTIMATE_EXCEEDS_BOUND');
  assert.equal(out.providerCallsPerformed,0);
  assert.equal(net.calls(),0);
});

test('live JEV canary is durable and second invocation performs zero provider calls',async()=>{
  const s=store(),net=successfulFetch();
  const first=await runGovernedJevLiveCanary({store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,marketSnapshot:market(),fetchImpl:net.fetchImpl,clock:()=>NOW});
  assert.equal(first.ok,true);
  assert.equal(first.status,'JEV_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY');
  assert.ok(first.actualCostUsd<=JEV_LIVE_CANARY_MAX_USD);
  assert.deepEqual(first.answerTypes,{route:'choice',hard_reasoning:'score',crown_necessity:'noul'});
  assert.equal(first.hiddenDecisionValuesExposed,false);
  const callsAfterFirst=net.calls();
  const second=await runGovernedJevLiveCanary({store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,marketSnapshot:market(),fetchImpl:net.fetchImpl,clock:()=>NOW+1000});
  assert.equal(second.ok,true);
  assert.equal(net.calls(),callsAfterFirst);
});

test('provider failure after dispatch is retained and never automatically retried',async()=>{
  const s=store();
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    if(String(url).endsWith('/v1/key'))return response({data:{label:'fixture',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}});
    if(String(url).endsWith('/alpha/decisions'))return response({error:'fixture-provider-failure'},503);
    throw new Error('unexpected-url');
  };
  const first=await runGovernedJevLiveCanary({store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,marketSnapshot:market(),fetchImpl,clock:()=>NOW});
  assert.equal(first.ok,false);
  assert.equal(first.providerCallsPerformed,1);
  assert.equal(first.automaticRetryAuthorized,false);
  const after=calls;
  const second=await runGovernedJevLiveCanary({store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,marketSnapshot:market(),fetchImpl,clock:()=>NOW+1000});
  assert.equal(second.ok,false);
  assert.equal(calls,after);
});
