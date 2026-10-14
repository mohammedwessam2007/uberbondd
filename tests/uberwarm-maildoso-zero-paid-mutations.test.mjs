import test from 'node:test';
import assert from 'node:assert/strict';
import {createUberMaildosoAdapter} from '../src/ubermaildoso.mjs';

test('Maildoso warm-up create and update cannot bill even with wildcard approval',async()=>{
  let providerCalls=0;
  const adapter=createUberMaildosoAdapter({token:'test-only-key',
    fetchImpl:async()=>{providerCalls++;throw Error('paid route should not execute')}
  });
  const approval={authorized:true,authorizedBy:'owner-fixture',
    receiptId:'signed-auth-fixture',scopes:['*'],expiresAt:'2030-01-01T00:00:00Z'};
  for (const action of ['createWarmup','updateWarmup']){
    for(const payload of [{enabled:true},{enabled:true,incrementalRecurringCostCents:0},
      {enabled:true,incrementalRecurringCostCents:60}]){
      const r=await adapter.mutate(action,{body:payload,approval});
      assert.equal(r.status,'UBERBOND_ZERO_PAID_WARMUP_LOCK');
      assert.equal(r.providerCalls,0);
      assert.equal(r.externalEffects,0);
    }
  }
  assert.equal(providerCalls,0);
});
test('Maildoso read-only warm-up state remains accessible for charge reconciliation',async()=>{
  let reads=0;
  const adapter=createUberMaildosoAdapter({token:'test-only-key',
    fetchImpl:async(url,options)=>{
      reads++;
      assert.equal(options.method,'GET');
      assert.match(String(url),/services\/warmups/);
      return {ok:true,status:200,text:async()=>JSON.stringify({items:[]}),
        headers:{get:()=>null}}
    }
  });
  const r=await adapter.read('warmups');
  assert.equal(r.ok,true);
  assert.equal(reads,1);
});
