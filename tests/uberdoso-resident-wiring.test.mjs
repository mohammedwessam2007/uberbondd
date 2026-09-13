import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { startScheduler } from '../src/scheduler.mjs';
import { createMissionAwareJobHandlers } from '../src/founder-outcome-job-handlers.mjs';

async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'uberdoso-resident-'));
  const store=new Store(root);await store.init();
  return{root,store};
}
async function waitUntil(predicate,timeoutMs=1000){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,10));}
  return false;
}

test('durable scheduler emits a resident UberDoso reconciliation occurrence',async()=>{
  const f=await fixture();
  try{
    const enqueued=[];
    const queue={store:f.store,enqueue:async(type,payload,options)=>{enqueued.push({type,payload,options});return{id:`job-${enqueued.length}`};}};
    const stop=startScheduler(queue,{autopilot:true,maxBatch:10,replyPollMinutes:10,prometheus:{schedulingEnabled:false},domainMailbox:{schedulingEnabled:false}},{error:()=>{}});
    const observed=await waitUntil(()=>enqueued.some(job=>job.type==='uberdoso.reconcile'));
    stop();
    assert.equal(observed,true);
    const jobs=enqueued.filter(job=>job.type==='uberdoso.reconcile');
    assert.equal(jobs.length,1);
    assert.equal(jobs[0].options.singletonKey,'singleton:uberdoso.reconcile');
  } finally {await fs.rm(f.root,{recursive:true,force:true});}
});

test('mission-aware worker owns UberDoso handler and executes only internal bootstrap without physical evidence',async()=>{
  const f=await fixture();
  try{
    const downstream=[];
    const enqueueJob=async(type,payload,options)=>{downstream.push({type,payload,options});return{id:`child-${downstream.length}`};};
    const handlers=createMissionAwareJobHandlers({store:f.store,enqueueJob,cfg:{},pipeline:{},revenue:{},discoveryRunner:{}});
    assert.equal(typeof handlers['uberdoso.reconcile'],'function');
    const result=await handlers['uberdoso.reconcile']({date:'2026-09-13T00:00:00Z'});
    assert.equal(result.ok,true);
    assert.equal(result.registeredDomainCount,2);
    assert.equal(result.registeredMailboxCount,2);
    assert.equal(result.externalEffectAuthority,'NONE');
    assert.equal(result.externalEffectLedger.messages,0);
    assert.equal(result.externalEffectLedger.dnsChanges,0);
    assert.equal(result.externalEffectLedger.spendCents,0);
    assert.equal(downstream.length,0,'physical DNS/warmup evidence is absent, so resident worker must not invent downstream effects');
  } finally {await fs.rm(f.root,{recursive:true,force:true});}
});
