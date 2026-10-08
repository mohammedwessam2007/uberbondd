import test from 'node:test';
import assert from 'node:assert/strict';
import { createInfiniteOpusRuntime, INFINITE_OPUS_TASK_SCHEMA } from '../src/infinite-opus-native-runtime.mjs';
import { compileInfiniteOpusMarket } from '../src/infinite-opus-market.mjs';
import { compileOpenRouterJevEndpointPriceRecord, augmentInfiniteOpusMarketWithDecisionRecord } from '../src/openrouter-decision-market.mjs';
import { createGovernedJevRuntimeService } from '../src/jev-governed-runtime-service.mjs';
import { runPendingNativeJevTriage } from '../scripts/infinite-opus-jev-pagefault-triage.mjs';

const NOW=Date.parse('2026-10-07T17:30:00Z');
const auth={evidenceRef:'fixture://october-runtime',month:'2026-10',maxMonthlyMicrousd:20_000_000,expiresAt:'2026-11-01T00:00:00Z',crownRoutes:[]};

const makeStore=()=>{
  let settings={};
  return {
    transaction:async fn=>fn({
      getSettings:async()=>structuredClone(settings),
      setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}
    }),
    dump:()=>structuredClone(settings)
  };
};

const task=id=>({
  schemaVersion:INFINITE_OPUS_TASK_SCHEMA,
  taskId:id,
  taskClass:'RESEARCH_SYNTHESIS',
  stakes:'NORMAL',
  sideEffectClass:'NONE',
  obligation:{kind:'answer',claim:'fixture unresolved semantic obligation'}
});

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

const response=(body,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});
function liveFetch(){
  let calls=0;
  const fetchImpl=async url=>{
    calls++;
    if(String(url).endsWith('/v1/key'))return response({data:{label:'fixture',limit:20,limit_remaining:19.9,usage_monthly:.1,limit_reset:'monthly'}});
    if(String(url).endsWith('/alpha/decisions'))return response({
      id:'jev-pf-fixture-'+calls,
      model:'typesafe/jev-1.13-20260917',
      provider:'TypeSafe',
      answers:{
        task_shape:{type:'choice',choice:'research',confidence:.98},
        hard_reasoning:{type:'score',score:2,confidence:.97},
        source_compression_value:{type:'score',score:1,confidence:.8},
        crown_necessity:{type:'noul',noul:.8}
      },
      usage:{cost:.00001,input_tokens:300,output_tokens:40}
    });
    throw new Error('unexpected-url:'+url);
  };
  return {fetchImpl,calls:()=>calls};
}

test('native semantic page fault exposes only hashed JEV triage plan and stays unresolved',async()=>{
  const s=makeStore(),runtime=createInfiniteOpusRuntime({store:s,clock:()=>NOW});
  const queued=await runtime.execute(task('pf-native-1'));
  assert.equal(queued.status,'CROWN_PAGE_FAULT_QUEUED');
  const pending=await runtime.listPendingJevTriage();
  assert.equal(pending.ok,true);
  assert.equal(pending.count,1);
  assert.equal(pending.rows[0].taskId,'pf-native-1');
  assert.equal(pending.rows[0].semanticAuthority,'NONE');
  const encoded=JSON.stringify(pending.rows[0]);
  assert.doesNotMatch(encoded,/fixture unresolved semantic obligation/);
  assert.doesNotMatch(encoded,/"context":/);
  assert.doesNotMatch(encoded,/"obligation":/);
  assert.equal((await runtime.snapshot()).pendingDebts,1);
});

test('live JEV triage records a hard-residual lane but never settles semantic debt',async()=>{
  const s=makeStore();
  const queueRuntime=createInfiniteOpusRuntime({store:s,clock:()=>NOW});
  await queueRuntime.execute(task('pf-native-2'));
  const net=liveFetch();
  const service=createGovernedJevRuntimeService({
    store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,
    marketSnapshot:market(),fetchImpl:net.fetchImpl,clock:()=>NOW
  });
  const out=await service.triagePageFault({taskId:'pf-native-2',maximumSpendUsd:.001});
  assert.equal(out.ok,true);
  assert.equal(out.status,'JEV_PAGE_FAULT_TRIAGE_OBSERVED_NONAUTHORITATIVE');
  assert.equal(out.recommendedLane,'SOL_PRO_HARD_RESIDUAL');
  assert.equal(out.reviewRecommendation,'FRONTIER_REVIEW_RECOMMENDED');
  assert.equal(out.semanticAuthority,'NONE');
  assert.equal(out.crownSuppressionAuthority,'NONE');
  assert.equal(out.providerCallsPerformed,1);
  assert.equal(net.calls(),3);
  assert.equal((await service.runtime.snapshot()).pendingDebts,1);
  const pendingAfter=await service.runtime.listPendingJevTriage();
  assert.equal(pendingAfter.count,0);

  const calls=net.calls();
  const repeat=await service.triagePageFault({taskId:'pf-native-2',maximumSpendUsd:.001});
  assert.equal(repeat.status,'JEV_PAGE_FAULT_NOT_PENDING_OR_ALREADY_TRIAGED');
  assert.equal(repeat.providerCallsPerformed,0);
  assert.equal(net.calls(),calls);
});

test('bounded startup triage processes distinct debts once under aggregate ceiling',async()=>{
  const s=makeStore(),runtime=createInfiniteOpusRuntime({store:s,clock:()=>NOW});
  await runtime.execute(task('pf-batch-1'));
  await runtime.execute(task('pf-batch-2'));
  const net=liveFetch();
  const first=await runPendingNativeJevTriage({
    store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,
    marketSnapshot:market(),fetchImpl:net.fetchImpl,clock:()=>NOW,maxCalls:2,maxTotalUsd:.005
  });
  assert.equal(first.ok,true);
  assert.equal(first.triagedCount,2);
  assert.equal(first.providerCallsPerformed,2);
  assert.equal(first.actualSpendUsd,.00002);
  assert.equal((await createInfiniteOpusRuntime({store:s,clock:()=>NOW}).snapshot()).pendingDebts,2);
  const calls=net.calls();
  const second=await runPendingNativeJevTriage({
    store:s,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,
    marketSnapshot:market(),fetchImpl:net.fetchImpl,clock:()=>NOW+1000,maxCalls:2,maxTotalUsd:.005
  });
  assert.equal(second.status,'NO_UNTRIAGED_NATIVE_PAGE_FAULTS');
  assert.equal(second.providerCallsPerformed,0);
  assert.equal(net.calls(),calls);
});

test('post-dispatch Jev network uncertainty holds cost UNKNOWN and stops before next pagefault',async()=>{
  const st=makeStore(),runtime=createInfiniteOpusRuntime({store:st,clock:()=>NOW});
  await runtime.execute(task('pf-uncertain-1'));
  await runtime.execute(task('pf-uncertain-2'));
  let generationPosts=0,metadataGETs=0;
  const fetchImpl=async url=>{
    if(String(url).endsWith('/v1/key'))
      return response({data:{label:'fixture',limit:20,limit_remaining:19.9,usage_monthly:.1,limit_reset:'monthly'}});
    if(String(url).endsWith('/alpha/decisions')){generationPosts++;throw Error('simulated network collapse after ambiguous provider crossing');}
    metadataGETs++;throw Error('unexpected-url:'+url);
  };
  const out=await runPendingNativeJevTriage({
    store:st,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,
    marketSnapshot:market(),fetchImpl,clock:()=>NOW,maxCalls:2,maxTotalUsd:.005
  });
  assert.equal(out.ok,false);
  assert.equal(out.status,'NATIVE_JEV_TRIAGE_DISPATCH_OR_COST_UNKNOWN_HOLD');
  assert.equal(out.providerCallsPerformed,1);
  assert.equal(out.actualSpendUsd,null);
  assert.equal(out.observedSpendLowerBoundUsd,0);
  assert.equal(out.results.length,1);
  assert.equal(out.results[0].providerCallsPerformed,1);
  assert.equal(out.results[0].observedCostUsd,null);
  assert.equal(out.automaticRetryAuthorized,false);
  assert.equal(generationPosts,1);
  assert.equal(metadataGETs,0);
  const ledger=st.dump().infiniteOpusRuntimeV1.ledger;
  assert.equal(ledger.calls.length,1);
  assert.equal(ledger.calls[0].status,'DISPATCHED');
});

test('no pending native Jev triage is readable with no model price, key or paid authorization',async()=>{
 const store=makeStore();
 const network=async()=>{throw Error('no provider calls allowed for zero debt');};
 const r=await runPendingNativeJevTriage({
  store,apiKey:'',paidAuthorization:null,marketSnapshot:null,
  fetchImpl:network,clock:()=>NOW,maxCalls:2,maxTotalUsd:.005
 });
 assert.equal(r.ok,true);
 assert.equal(r.status,'NO_UNTRIAGED_NATIVE_PAGE_FAULTS');
 assert.equal(r.pendingAtStart,0);
 assert.equal(r.providerCallsPerformed,0);
 assert.equal(r.actualSpendUsd,0);
 assert.equal(r.semanticAuthority,'NONE');
});

test('pending native debt with unobserved current Jev price remains held, never dispatched',async()=>{
 const store=makeStore();
 const runtime=createInfiniteOpusRuntime({store,clock:()=>NOW});
 await runtime.execute(task('pf-no-price-1'));
 let requests=0;
 const r=await runPendingNativeJevTriage({
  store,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:auth,
  marketSnapshot:null,clock:()=>NOW,maxCalls:2,maxTotalUsd:.005,
  fetchImpl:async()=>{requests++;throw Error('must never reach provider');}
 });
 assert.equal(r.ok,false);
 assert.equal(r.status,'NATIVE_JEV_PAGE_FAULT_ROUTE_OR_AUTH_UNAVAILABLE_HOLD');
 assert.equal(r.pendingAtStart,1);
 assert.equal(r.providerCallsPerformed,0);
 assert.equal(r.actualSpendUsd,0);
 assert.equal(r.automaticRetryAuthorized,false);
 assert.equal(requests,0);
 const pending=await runtime.listPendingJevTriage();
 assert.equal(pending.count,1);
});

test('pending debt with missing paid authorization remains held without network effects',async()=>{
 const store=makeStore(),runtime=createInfiniteOpusRuntime({store,clock:()=>NOW});
 await runtime.execute(task('pf-no-auth-1'));
 const r=await runPendingNativeJevTriage({
  store,apiKey:'sk-or-v1-fixture-key-long-enough',paidAuthorization:null,
  marketSnapshot:market(),clock:()=>NOW,maxCalls:1,
  fetchImpl:async()=>{throw Error('unexpected network');}
 });
 assert.equal(r.ok,false);
 assert.equal(r.status,'NATIVE_JEV_PAGE_FAULT_ROUTE_OR_AUTH_UNAVAILABLE_HOLD');
 assert.equal(r.providerCallsPerformed,0);
 assert.equal((await runtime.listPendingJevTriage()).count,1);
});
