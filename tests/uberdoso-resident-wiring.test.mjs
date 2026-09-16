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
// Returns as soon as the predicate holds, so the budget only bounds failure.
// Raised from 1000ms because that bound is a race against machine load rather
// than a property of the code under test. The assertion is unchanged.
async function waitUntil(predicate,timeoutMs=15000){
  const start=Date.now();
  while(Date.now()-start<timeoutMs){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,10));}
  return false;
}

/**
 * Remove a fixture directory the scheduler may still be writing into.
 *
 * This test failed intermittently in the full suite and never in isolation, and
 * the first thing I changed was the wait budget above -- which was not the
 * cause. The actual error is ENOTEMPTY, thirty milliseconds in: the predicate
 * is satisfied almost immediately, stop() is called, and the directory is
 * deleted while work is still landing in it.
 *
 * stop() clears the interval timers and returns synchronously. It does not
 * await the promises already in flight, and with a one-second wealth heartbeat
 * and a dozen jobs firing their first tick immediately, several are mid-write
 * when it returns. That is a reasonable scheduler design -- a caller wanting
 * quiescence should wait for it -- and the test was not doing so.
 *
 * Under load the window widens, which is why parallelism exposed it.
 */
async function removeWhenQuiet(root, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      // ENOTEMPTY means a write landed between the walk and the rmdir, so the
      // work is still settling. Anything else is a real failure to surface.
      if (error?.code !== 'ENOTEMPTY' && error?.code !== 'EBUSY') throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  // Out of attempts: say so rather than leaving a silently undeleted fixture.
  await fs.rm(root, { recursive: true, force: true });
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
  } finally {await removeWhenQuiet(f.root);}
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
  } finally {await removeWhenQuiet(f.root);}
});
