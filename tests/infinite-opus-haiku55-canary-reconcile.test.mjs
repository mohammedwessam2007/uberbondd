import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileHaiku55CanaryWithoutReplay } from '../scripts/infinite-opus-haiku55-canary-reconcile.mjs';
import { createCognitionLedger } from '../src/cognition-ledger.mjs';
import { createProvableExecutionLedger } from '../src/provable-execution-ledger.mjs';
import { INFINITE_OPUS_TASK_SCHEMA } from '../src/infinite-opus-native-runtime.mjs';

const now=Date.parse('2026-10-07T20:00:00Z');
const callId='openrouter-haiku55-live-canary-20261007-v1';
const stateKey='infiniteOpusHaiku55LiveCanary20261007V1';
const storeWith=(status='DISPATCHED',receiptRef=null)=>{
  const ledger=createCognitionLedger({month:'2026-10',monthlyCapMicrousd:20_000_000});
  ledger.calls.push({
    callId,taskId:'haiku55-live-canary-20261007-v1',
    model:'anthropic/claude-haiku-5.5',provider:'openrouter',
    qualityClass:'Q_SHADOW_CONTROL',role:'WORKER',
    cacheState:'MISS_OR_UNKNOWN',ceilingMicrousd:100,
    actualMicrousd:0,status,reservedDate:'2026-10-07',
    ...(receiptRef?{receiptRef}:{})
  });
  let data={
    [stateKey]:{status:'FAILED_RECONCILIATION_REQUIRED_NO_RETRY',
      reason:'lossless-json-value-required',providerCallsPerformed:null},
    infiniteOpusRuntimeV1:{schemaVersion:INFINITE_OPUS_TASK_SCHEMA,version:0,ledger,
      tasks:{},proofLedger:createProvableExecutionLedger({period:'2026-10'})}
  };
  return{
    transaction:async fn=>fn({
      transactionClient:false,
      getSettings:async()=>structuredClone(data),
      setSetting:async(k,v)=>{data[k]=structuredClone(v);}
    }),
    dump:()=>structuredClone(data)
  };
};
const fetchForbidden=async()=>{throw new Error('network-forbidden');};

test('actual production DISPATCHED without receiptRef stays UNKNOWN, no retry and no network',async()=>{
  const store=storeWith();
  const out=await reconcileHaiku55CanaryWithoutReplay({
    store,apiKey:'test-not-a-secret',fetchImpl:fetchForbidden,clock:()=>now
  });
  assert.equal(out.ok,false);
  assert.equal(out.status,'HAIKU_5_5_DISPATCH_UNCERTAIN_ID_UNRECOVERED');
  assert.equal(out.originalProviderCrossing,null);
  assert.equal(out.reconciliationInferenceCallsPerformed,0);
  assert.equal(out.metadataCallsPerformed,0);
  assert.equal(store.dump().infiniteOpusRuntimeV1.ledger.calls[0].status,'DISPATCHED');
  assert.equal(store.dump()[stateKey].status,'FAILED_RECONCILIATION_REQUIRED_NO_RETRY');
});

test('reserved not dispatched never crosses network or claims callability',async()=>{
  const out=await reconcileHaiku55CanaryWithoutReplay({
    store:storeWith('RESERVED'),apiKey:'test',fetchImpl:fetchForbidden,clock:()=>now
  });
  assert.equal(out.status,'HAIKU_5_5_CANARY_RESERVED_NOT_DISPATCHED');
  assert.equal(out.metadataCallsPerformed,0);
});

test('bad metadata cannot launder a provider crossing into Crown authority',async()=>{
  let metadata=0;
  const store=storeWith('DISPATCHED','gen-observed-haiku');
  const out=await reconcileHaiku55CanaryWithoutReplay({
    store,apiKey:'test',clock:()=>now,
    fetchImpl:async(url,args)=>{metadata++;
      assert.equal(args.method,'GET');
      assert.match(url,/\/api\/v1\/generation\?id=/);
      return {ok:true,json:async()=>({data:{id:'wrong-id',model:'anthropic/claude-opus-5.5',total_cost:0,provider_name:'Anthropic'}})};
    }
  });
  assert.equal(metadata,1);
  assert.equal(out.status,'HAIKU_5_5_PROVIDER_METADATA_REFUSED');
  assert.equal(out.semanticAuthority,'NONE');
  assert.equal(store.dump().infiniteOpusRuntimeV1.ledger.calls[0].status,'DISPATCHED');
});

test('exact provider metadata settles the original ledger with one GET and zero inference',async()=>{
  const store=storeWith('DISPATCHED','gen-observed-haiku');
  let requests=0;
  const out=await reconcileHaiku55CanaryWithoutReplay({
    store,apiKey:'test',clock:()=>now,
    fetchImpl:async(url,args)=>{
      requests++;assert.equal(args.method,'GET');
      return {ok:true,json:async()=>({data:{
        id:'gen-observed-haiku',model:'anthropic/claude-haiku-5.5-20261007',
        provider_name:'Anthropic',total_cost:.00002,tokens_prompt:20,tokens_completion:2
      }})};
    }
  });
  assert.equal(requests,1);
  assert.equal(out.ok,true);
  assert.equal(out.actualCostUsd,.00002);
  assert.equal(out.reconciliationInferenceCallsPerformed,0);
  assert.equal(out.semanticAuthority,'NONE');
  assert.equal(out.crownSuppressionAuthority,'NONE');
  assert.equal(store.dump().infiniteOpusRuntimeV1.ledger.calls[0].status,'SETTLED');
  assert.equal(store.dump().infiniteOpusRuntimeV1.ledger.calls[0].actualMicrousd,20);
  assert.equal(store.dump()[stateKey].status,'HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY');
});
