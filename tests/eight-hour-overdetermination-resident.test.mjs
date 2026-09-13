import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runUniversalWealthOverdeterminationJob } from '../src/universal-wealth-overdetermination-job-handler.mjs';
import { createMissionAwareJobHandlers } from '../src/founder-outcome-job-handlers.mjs';

const stageNames=['OPPORTUNITY','OFFER','DISTRIBUTION','PAYMENT','FULFILLMENT','ACCEPTANCE','RENEWAL','RECONCILIATION'];
const readyStages=suffix=>Object.fromEntries(stageNames.map(stage=>[stage,{status:'READY',railId:`${stage.toLowerCase()}-${suffix}`,evidenceRefs:['observed']} ]));

function executionPath(id,extra={}){
  return {
    id,
    mechanismFamily:`family-${id}`,
    buyerPool:`buyer-${id}`,
    acquisitionChannel:`channel-${id}`,
    offerType:`offer-${id}`,
    paymentRail:`payment-${id}`,
    fulfillmentMode:`fulfillment-${id}`,
    geography:`geo-${id}`,
    pricingModel:`pricing-${id}`,
    stages:readyStages(id),
    successProbability:.3,
    evidenceQuality:.8,
    observedTrials:10,
    observedSuccesses:3,
    expectedNetContribution:100,
    minutesToLaunch:10,
    capitalAtRisk:0,
    ...extra
  };
}

async function fixture(input){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wealth-overdetermination-'));
  await fs.mkdir(path.join(root,'private'),{recursive:true});
  await fs.writeFile(path.join(root,'private/universal-wealth-input.json'),JSON.stringify(input));
  return root;
}

test('resident wealth pulse durably requests repair for an internal blocker without persisting raw path identity',async()=>{
  const blocked=executionPath('secret-internal');
  blocked.stages.FULFILLMENT={status:'BLOCKED_INTERNAL',railId:'fulfillment-secret'};
  const root=await fixture({executionPaths:[blocked],syntheticSamples:64,syntheticIterations:100});
  const queued=[];
  const receipt=await runUniversalWealthOverdeterminationJob({
    root,
    maxSearchCells:4,
    simulationIterations:100,
    syntheticSamples:64,
    syntheticIterations:100,
    enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:'repair-job-1'};}
  });
  assert.equal(queued.length,1);
  assert.equal(queued[0].type,'economic.repair.process');
  assert.equal(receipt.eightHourOverdetermination.repairDispatch.requested,true);
  assert.equal(receipt.eightHourOverdetermination.repairDispatch.jobId,'repair-job-1');
  const raw=await fs.readFile(path.join(root,'artifacts/universal-wealth-latest.json'),'utf8');
  assert.equal(raw.includes('secret-internal'),false);
  assert.equal(raw.includes('fulfillment-secret'),false);
});

test('authority-only bottleneck never enqueues autonomous economic repair',async()=>{
  const blocked=executionPath('owner-only');
  blocked.stages.PAYMENT={status:'BLOCKED_AUTHORITY',railId:'owner-payment'};
  const root=await fixture({executionPaths:[blocked],syntheticSamples:64,syntheticIterations:100});
  const queued=[];
  const receipt=await runUniversalWealthOverdeterminationJob({
    root,
    maxSearchCells:4,
    simulationIterations:100,
    syntheticSamples:64,
    syntheticIterations:100,
    enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:'unexpected'};}
  });
  assert.equal(queued.length,0);
  assert.equal(receipt.eightHourOverdetermination.ownerOnlyBlockerCount,1);
  assert.equal(receipt.eightHourOverdetermination.repairDispatch.requested,false);
});

test('mission-aware economic repair handler fails closed without durable enqueue',async()=>{
  const handlers=createMissionAwareJobHandlers({});
  const out=await handlers['economic.repair.process']({tasks:[{attemptId:'a',stage:'PAYMENT',blockerClass:'PROVIDER_OR_RAIL'}]});
  assert.equal(out.ok,false);
  assert.deepEqual(out.reasonCodes,['durable-enqueue-required']);
});

test('mission-aware repair dispatches only bounded downstream job for autonomous blocker',async()=>{
  const queued=[];
  const handlers=createMissionAwareJobHandlers({
    enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:`job-${queued.length}`};}
  });
  const out=await handlers['economic.repair.process']({tasks:[{attemptId:'a',stage:'PAYMENT',blockerClass:'PROVIDER_OR_RAIL',substituteRailIds:['alternate-payment']}]});
  assert.equal(out.ok,true);
  assert.equal(out.dispatchCount,1);
  assert.equal(queued[0].type,'prometheus.capability_gap.recompute');
  assert.match(queued[0].options.idempotencyKey,/^economic-repair:/);
});
