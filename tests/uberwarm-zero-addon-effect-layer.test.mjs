import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProviderHttpAdapter, createIcemailAdapter,
  createMailforgeAdapter, createMaildosoInfrastructureAdapter
} from '../src/provider-http-adapters.mjs';

const approve={granted:true,grantedBy:'owner-fixture',
  scope:['provider:startWarmup','provider:prewarmPurchase'],
  expiresAt:'2030-01-01T00:00:00Z'};
const params={
  mailboxId:'mailbox-1',providerPayload:{enabled:true,costCents:0},
  ownerApproval:approve,idempotencyKey:'even-a-signed-grant-cannot-override-zero-addon'
};

test('generic providers never invoke native warmup API, regardless of owner grant or claimed price',async()=>{
  for(const make of [createIcemailAdapter,createMailforgeAdapter]){
    let calls=0;
    const provider=make({apiKey:'test-only-key'},{
      fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({})}}
    });
    for(const price of [undefined,0,60,3000]){
      const r=await provider.startWarmup({
        ...params,providerPayload:{enabled:true,costCents:price}
      });
      assert.equal(r.ok,false);
      assert.equal(r.status,'UNSUPPORTED_CAPABILITY');
      assert.match(r.reason,/UBERBOND_ZERO_PAID_WARMUP_LOCK/);
    }
    assert.equal(calls,0);
  }
});
test('zero-add-on lock also forbids prewarm/buy purchase endpoint',async()=>{
  let calls=0;
  const provider=createIcemailAdapter({apiKey:'test-key'},{
    fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({})}}
  });
  const r=await provider.prewarmPurchase({body:{mailboxes:['a@example.com']},
    ownerApproval:approve,idempotencyKey:'test:purchase',estimatedCostCents:0});
  assert.equal(r.ok,false);
  assert.equal(r.status,'UBERBOND_ZERO_PAID_WARMUP_LOCK');
  assert.equal(calls,0);
});
test('custom extension cannot mislabel paid POST as another capability to evade lock',async()=>{
  let calls=0;
  const provider=createProviderHttpAdapter({
    providerName:'untrusted-warmup-vendor',
    config:{apiKey:'test-only-key'},baseUrl:'https://example.org',
    routes:{createWorkspace:'/warmups/enable'},
    fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({})}},
    extensions:({requestJson})=>({
      startWarmup:()=>requestJson({
        capability:'createWorkspace',method:'POST',path:'/warmups/enable',
        body:{enabled:true},ownerApproval:approve,idempotencyKey:'bypass-attempt'
      })
    })
  });
  const r=await provider.startWarmup(params);
  assert.equal(r.ok,false);
  assert.equal(r.status,'UBERBOND_ZERO_PAID_WARMUP_LOCK');
  assert.equal(calls,0);
});
test('Maildoso extensions cannot purchase warmups under exact provider write route',async()=>{
  let calls=0;
  const p=createMaildosoInfrastructureAdapter({apiKey:'test'},{
    fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({})}}
  });
  const r=await p.prewarmPurchase({body:{product:'warmup'},
    ownerApproval:approve,idempotencyKey:'test',estimatedCostCents:0});
  assert.equal(r.ok,false);
  assert.equal(r.status,'UBERBOND_ZERO_PAID_WARMUP_LOCK');
  assert.equal(calls,0);
});
test('ordinary non-warmup mailbox infrastructure remains available',async()=>{
  let calls=0;
  const p=createProviderHttpAdapter({
    providerName:'neutral-provider',
    config:{apiKey:'key'},baseUrl:'https://example.org',
    routes:{listDomains:'/domains'},
    fetchImpl:async()=>{calls++;return {
      ok:true,status:200,json:async()=>({data:[{id:'d1',domain:'example.org'}]}),
      headers:{get:()=>null}
    }}
  });
  const r=await p.listDomains({});
  assert.equal(r.ok,true);
  assert.equal(calls,1);
});
