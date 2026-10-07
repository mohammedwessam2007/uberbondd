import test from 'node:test';
import assert from 'node:assert/strict';
import { compileInfiniteOpusMarket } from '../src/infinite-opus-market.mjs';
import { runGovernedHaiku55LiveCanary, inspectGovernedHaiku55LiveCanaryState, HAIKU55_LIVE_CANARY_MAX_USD } from '../scripts/infinite-opus-haiku55-live-canary.mjs';
import { TYPINGMIND_HAIKU55_MODEL } from '../src/infinite-opus-typingmind-live.mjs';

const now=Date.parse('2026-10-07T19:30:00Z');
const iso=new Date(now).toISOString();

const market=()=>compileInfiniteOpusMarket({data:[{
  id:TYPINGMIND_HAIKU55_MODEL,
  canonical_slug:'anthropic/claude-haiku-5.5-20261007',
  pricing:{
    prompt:'0.0000001',completion:'0.0000005',input_cache_read:'0.00000001',input_cache_write:'0.000000125',
    overrides:[{min_prompt_tokens:100000,prompt:'0.0000005',completion:'0.0000025',input_cache_read:'0.00000005',input_cache_write:'0.000000625'}]
  },
  context_length:1000000,
  top_provider:{max_completion_tokens:128000},
  supported_parameters:['reasoning','reasoning_effort'],
  architecture:{input_modalities:['text']}
}]},{verifiedAt:iso,ttlMs:60*60*1000});

const auth={
  evidenceRef:'owner://october-runtime',
  month:'2026-10',
  maxMonthlyMicrousd:20_000_000,
  expiresAt:'2026-11-01T00:00:00Z',
  crownRoutes:[]
};

const makeStore=()=>{
  let settings={};
  return {
    transaction:async fn=>fn({
      transactionClient:false,
      getSettings:async()=>structuredClone(settings),
      setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v);}
    }),
    dump:()=>structuredClone(settings)
  };
};

const key=usage=>({data:{label:'runtime',limit:20,limit_remaining:20-usage,usage_monthly:usage,limit_reset:'monthly'}});

test('Haiku 5.5 live canary proves one bounded call then becomes zero-call idempotent',async()=>{
  const rows=[
    key(0),
    {id:'gen-haiku55-canary',model:TYPINGMIND_HAIKU55_MODEL,
      choices:[{message:{role:'assistant',content:'Acknowledged.'}}],
      usage:{cost:.00002,prompt_tokens:20,completion_tokens:2,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
    {data:{id:'gen-haiku55-canary',provider_name:'Anthropic',router:'openrouter/auto',
      model:'anthropic/claude-haiku-5.5-20261007',total_cost:.00002,tokens_prompt:20,tokens_completion:2}},
    key(.00002)
  ];
  let calls=0;
  const fetchImpl=async()=>{calls++;const body=rows.shift();assert.ok(body,'unexpected provider call');return {ok:true,status:200,text:async()=>JSON.stringify(body)};};
  const store=makeStore();

  const first=await runGovernedHaiku55LiveCanary({
    store,apiKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:auth,marketSnapshot:market(),fetchImpl,clock:()=>now
  });
  assert.equal(first.ok,true);
  assert.equal(first.status,'HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY');
  assert.equal(first.modelRevision,'anthropic/claude-haiku-5.5-20261007');
  assert.equal(first.upstreamProvider,'Anthropic');
  assert.equal(first.actualCostUsd,.00002);
  assert.equal(first.providerCallsPerformed,1);
  assert.equal(first.semanticAuthority,'NONE');
  assert.equal(first.crownSuppressionAuthority,'NONE');
  assert.equal(first.maximumSpendUsd,HAIKU55_LIVE_CANARY_MAX_USD);
  assert.match(first.outputDigest,/^sha256:[0-9a-f]{64}$/);

  const callsAfterFirst=calls;
  const second=await runGovernedHaiku55LiveCanary({
    store,apiKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:auth,marketSnapshot:market(),fetchImpl,clock:()=>now+1000
  });
  assert.deepEqual(second,first);
  assert.equal(calls,callsAfterFirst);
});

test('Haiku 5.5 canary refuses absent current route with zero provider calls',async()=>{
  const absent=compileInfiniteOpusMarket({data:[]},{verifiedAt:iso,ttlMs:60*60*1000});
  let calls=0;
  const out=await runGovernedHaiku55LiveCanary({
    store:makeStore(),apiKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:auth,marketSnapshot:absent,
    fetchImpl:async()=>{calls++;throw new Error('must not call')},clock:()=>now
  });
  assert.equal(out.ok,false);
  assert.equal(out.status,'HAIKU_5_5_CURRENT_FIXED_PRICE_ROUTE_REQUIRED');
  assert.equal(out.providerCallsPerformed,0);
  assert.equal(calls,0);
});


test('read-only diagnostic preserves unknown crossing instead of laundering null into zero',async()=>{
  let settings={
    infiniteOpusHaiku55LiveCanary20261007V1:{
      status:'FAILED_RECONCILIATION_REQUIRED_NO_RETRY',
      reason:'fixture-pre-or-post-dispatch-unknown',
      providerCallsPerformed:null,
      automaticRetryAuthorized:false
    },
    infiniteOpusRuntimeV1:{
      ledger:{
        calls:[{
          callId:'openrouter-haiku55-live-canary-20261007-v1',
          taskId:'haiku55-live-canary-20261007-v1',
          model:TYPINGMIND_HAIKU55_MODEL,provider:'openrouter',role:'WORKER',
          status:'DISPATCHED',ceilingMicrousd:100,actualMicrousd:0,reservedDate:'2026-10-07'
        }],
        incidents:[]
      }
    }
  };
  const store={
    transaction:async fn=>fn({
      getSettings:async()=>structuredClone(settings),
      setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v);}
    })
  };
  const out=await inspectGovernedHaiku55LiveCanaryState(store);
  assert.equal(out.providerInferenceCallsPerformed,0);
  assert.equal(out.canary.providerCallsPerformed,null);
  assert.equal(out.ledgerCall.status,'DISPATCHED');
  assert.equal(out.ledgerCall.actualMicrousd,0);
  assert.equal(out.spendUsd,0);
  assert.match(out.truthBoundary,/DISPATCHED means provider crossing or charge may be unknown/);
});
