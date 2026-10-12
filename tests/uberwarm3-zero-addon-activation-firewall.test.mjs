import test from 'node:test';
import assert from 'node:assert/strict';
import { requestMailboxWarmupStart } from '../src/warmup-orchestrator.mjs';
const D={domainId:'d',dnsState:{status:'GREEN'}};
const M={mailboxId:'m',address:'tara@example.net',authenticationStatus:'AUTHENTICATED',paused:false};
function adapter(){
  const calls={warmupCapable:0,startWarmup:0};
  return {calls,
    async warmupCapable(){calls.warmupCapable++;return {ok:true,status:'CAPABLE'}},
    async startWarmup(){calls.startWarmup++;return {ok:true,status:'WARMUP_ACTIVE'}}
  };
}
const zeroCost = async()=>({
  verified:true,incrementalRecurringCostCents:0,providerReceiptId:'authenticated:free-entitlement'
});
const owner = async ({requiredScope})=>requiredScope==='provider-warmup-zero-add-on-only';
test('old generic live activation path cannot accidentally start billable provider warmup',async()=>{
  const p=adapter();
  const result=await requestMailboxWarmupStart({
    domainState:D,mailboxState:M,providerAdapter:p,
    ownerApproval:{granted:true},date:'2026-10-12T18:00:00Z'
  });
  assert.equal(result.ok,false);
  assert.equal(result.state,'WARMUP_BLOCKED');
  assert.equal(result.providerCalls,0);
  assert.equal(p.calls.warmupCapable,0);
  assert.equal(p.calls.startWarmup,0);
});
test('explicit $0.60 increment and unknown price both block before provider calls',async()=>{
  for(const price of [60,null,undefined]){
    const p=adapter();
    const result=await requestMailboxWarmupStart({
      domainState:D,mailboxState:M,providerAdapter:p,
      ownerApproval:{granted:true},verifyCurrentOwnerWarmupApproval:owner,
      verifyZeroCostWarmupEntitlement:async()=>({
        verified:true,incrementalRecurringCostCents:price,providerReceiptId:'provider-receipt'
      }),
      date:'2026-10-12T18:00:00Z'
    });
    assert.equal(result.ok,false);
    assert.equal(p.calls.startWarmup,0);
    assert.equal(p.calls.warmupCapable,0);
  }
});
test('a forged owner grant does not replace live trusted owner verifier',async()=>{
  const p=adapter();
  const result=await requestMailboxWarmupStart({
    domainState:D,mailboxState:M,providerAdapter:p,
    ownerApproval:{granted:true,scopes:['provider-warmup-zero-add-on-only']},
    verifyZeroCostWarmupEntitlement:zeroCost,
    verifyCurrentOwnerWarmupApproval:async()=>false,
    date:'2026-10-12T18:00:00Z'
  });
  assert.equal(result.ok,false);
  assert.equal(p.calls.startWarmup,0);
});
test('actual authenticated free entitlement and owner authorization permit zero-cost provider flow',async()=>{
  const p=adapter();
  const result=await requestMailboxWarmupStart({
    domainState:D,mailboxState:M,providerAdapter:p,
    ownerApproval:{granted:true},verifyZeroCostWarmupEntitlement:zeroCost,
    verifyCurrentOwnerWarmupApproval:owner,
    date:'2026-10-12T18:00:00Z'
  });
  assert.equal(result.ok,true);
  assert.equal(result.state,'WARMUP_ACTIVE');
  assert.equal(p.calls.warmupCapable,1);
  assert.equal(p.calls.startWarmup,1);
});
test('broken or throwing cost verifier cannot charge, even when owner says yes',async()=>{
  for(const verify of [()=>{throw Error('provider missing')},async()=>({verified:false,incrementalRecurringCostCents:0})]){
    const p=adapter();
    const result=await requestMailboxWarmupStart({
      domainState:D,mailboxState:M,providerAdapter:p,
      ownerApproval:{granted:true},verifyZeroCostWarmupEntitlement:verify,
      verifyCurrentOwnerWarmupApproval:owner,date:'2026-10-12T18:00:00Z'
    });
    assert.equal(result.ok,false);
    assert.equal(p.calls.startWarmup,0);
  }
});
