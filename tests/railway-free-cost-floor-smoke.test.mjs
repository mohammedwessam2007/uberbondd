import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRailwayFreeFloor as estimate } from '../src/railway-free-cost-floor.mjs';
const month=30*86400;
const input=()=>({billingPeriodSeconds:month,services:[
  {role:'web',memoryGb:0.125,averageCpuVcpu:0,runningSeconds:month/4},
  {role:'worker',memoryGb:0.125,averageCpuVcpu:0,runningSeconds:month/4}],
  volumeGb:0,volumeSeconds:0,egressGb:0,remainingFreeCreditUsd:1,
  freePlanAuthenticated:true,providerZeroOverageVerified:true,
  requiresRailwayCron:false,requiresCustomDomain:false});
test('two always-on 128MiB services exceed $1 on RAM alone',()=>{
  const x=input();x.services.forEach(s=>s.runningSeconds=month);
  const r=estimate(x);assert.equal(r.status,'HOLD');assert.ok(r.costs.memoryUsd>2.5);
});
test('one always-on 128MiB service exceeds $1 on RAM alone',()=>{
  const x=input();x.services[0].runningSeconds=month;x.services[1].runningSeconds=0;
  assert.equal(estimate(x).status,'HOLD');
});
test('quarter-duty estimate never grants authority',()=>{
  const r=estimate(input());assert.equal(r.status,'BUDGET_PLAUSIBLE_UNVERIFIED');
  assert.equal(r.deploymentPermitted,false);assert.equal(r.resourceCreationPermitted,false);
});
test('billing eligibility and zero-overage unknown hold',()=>{
  for(const k of ['freePlanAuthenticated','providerZeroOverageVerified']){
    const x=input();x[k]=false;assert.equal(estimate(x).status,'HOLD');
  }
});
test('unavailable Free features hold',()=>{
  for(const k of ['requiresRailwayCron','requiresCustomDomain']){
    const x=input();x[k]=true;assert.equal(estimate(x).status,'HOLD');
  }
});
test('inflated Free credit and invalid arithmetic hold',()=>{
  for(const credit of [2,Infinity,NaN,-1]){
    assert.equal(estimate({...input(),remainingFreeCreditUsd:credit}).status,'HOLD');
  }
});
test('credential fields cannot enter or leak into output',()=>{
  const r=estimate({...input(),DATABASE_URL:'do-not-print'});
  assert.equal(r.status,'HOLD');assert.ok(!JSON.stringify(r).includes('do-not-print'));
});
test('hostile Proxy and array getter never execute',()=>{
  let calls=0;const x=input();
  Object.defineProperty(x.services,0,{get(){calls++;throw Error('getter');}});
  assert.equal(estimate(x).status,'HOLD');assert.equal(calls,0);
  const p=new Proxy(input(),{ownKeys(){calls++;throw Error('proxy');}});
  assert.equal(estimate(p).status,'HOLD');assert.equal(calls,0);
});

test('T238: any volume request holds even when estimated total fits free credit',()=>{
  for(const patch of [
    {volumeGb:0.01,volumeSeconds:month},
    {volumeGb:0.01,volumeSeconds:0},
    {volumeGb:0,volumeSeconds:1}
  ]){
    const r=estimate({...input(),...patch});
    assert.equal(r.status,'HOLD');
    assert.ok(r.reasons.includes('BILLABLE_VOLUME_NOT_AUTHORIZED'));
    assert.equal(r.resourceCreationPermitted,false);
  }
});
