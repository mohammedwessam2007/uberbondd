import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runEconomicWealthResidentSupervisor } from '../src/economic-wealth-resident-supervisor.mjs';
import { runEconomicWealthRepairJob, runEconomicWealthSaturationJob } from '../src/economic-wealth-repair-job-handler.mjs';

const allStages=(suffix='x',override={})=>Object.fromEntries(['OPPORTUNITY','OFFER','DISTRIBUTION','PAYMENT','FULFILLMENT','ACCEPTANCE','RENEWAL','RECONCILIATION'].map(stage=>[stage,override[stage]||{status:'READY',railId:`${stage.toLowerCase()}-${suffix}`,evidenceRefs:['e']} ]));

async function tempRoot(input){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'econ-saturation-'));
  await fs.mkdir(path.join(root,'private'),{recursive:true});
  await fs.writeFile(path.join(root,'private/universal-wealth-input.json'),JSON.stringify(input),'utf8');
  return root;
}

test('resident supervisor queues bounded repair/saturation work and does not persist private path ids',async()=>{
  const secret='PRIVATE-PATH-SECRET-99';
  const root=await tempRoot({
    executionPaths:[{id:secret,mechanismFamily:'service',independenceClass:'svc-a',stages:allStages('a',{OFFER:{status:'BLOCKED_INTERNAL',railId:null,evidenceRefs:[]}}),successProbability:.2,evidenceQuality:.5,expectedNetContribution:100}],
    saturationMinimumIndependentPaths:4,
    minimumMechanismFamilies:3,
    targetNightClearanceProbability:.9
  });
  const queued=[];
  const receipt=await runEconomicWealthResidentSupervisor({root,maxSearchCells:4,simulationIterations:40,syntheticSamples:64,syntheticIterations:40,maxQueuedRepairs:4,enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:`j-${queued.length}`};}});
  assert.ok(receipt.economicSaturation.queuedJobCount>0);
  assert.ok(queued.every(x=>['economic.wealth.repair','economic.wealth.saturate'].includes(x.type)));
  const persisted=await fs.readFile(path.join(root,'artifacts/universal-wealth-latest.json'),'utf8');
  assert.equal(persisted.includes(secret),false);
});

test('authority-only blocker never queues economic repair mission',async()=>{
  const root=await tempRoot({executionPaths:[{id:'authority-secret',mechanismFamily:'svc',independenceClass:'svc',stages:allStages('a',{PAYMENT:{status:'BLOCKED_AUTHORITY',railId:null,evidenceRefs:[]}}),successProbability:.2,evidenceQuality:.5}]});
  const queued=[];
  await runEconomicWealthResidentSupervisor({root,maxSearchCells:4,simulationIterations:30,syntheticSamples:64,syntheticIterations:30,maxQueuedRepairs:4,enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:`j-${queued.length}`};}});
  assert.equal(queued.some(x=>x.type==='economic.wealth.repair'),false);
});

test('repair worker uses Wallbreaker and queues only bounded preparation for internal blocker',async()=>{
  const queued=[];
  const mission={id:'repair-a',blockerClass:'INTERNAL_SOLVABLE',stage:'OFFER',problem:{objective:'repair offer readiness',successCriteria:['offer ready'],hardConstraints:[],unknowns:[],evidenceRefs:[],maxSpendCents:0,maxFounderMinutes:0,riskBudget:3},failure:{failureClass:'IMPLEMENTATION_DEFECT',candidateId:'p1',evidenceRefs:[]},candidateCountermoves:[{id:'c1',family:'offer-repair',mechanism:'repair local offer compiler',reversible:true,successProbability:.2,expectedContributionCents:0,costCents:0,founderMinutes:0,risk:1,evidenceStrength:1,novelty:1,robustness:1,evidenceRefs:['test:repair']} ]};
  const result=await runEconomicWealthRepairJob({mission,now:new Date('2026-09-13T00:00:00Z'),enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:'job-1'};}});
  assert.equal(result.ok,true);
  assert.equal(result.queuedJobCount,1);
  assert.deepEqual(result.queuedJobTypes,['prometheus.upgrade.propose']);
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.ok(result.wallbreakerReceiptId);
});

test('saturation worker queues only existing research/discovery/local preparation job families',async()=>{
  const queued=[];
  const result=await runEconomicWealthSaturationJob({request:{id:'sat-a',reason:'expand-independent-paths'},now:new Date('2026-09-13T00:00:00Z'),enqueueJob:async(type,payload,options)=>{queued.push(type);return{id:`j-${queued.length}`};}});
  const allowed=new Set(['research.batch','discovery.run','prometheus.commercial.catalog','prometheus.commercial.tournament','prometheus.capability_genome.plan','prometheus.capability_gap.recompute']);
  assert.equal(result.queuedJobCount,6);
  assert.ok(queued.every(type=>allowed.has(type)));
  assert.equal(result.capitalDeploymentAuthority,'NONE');
});

test('eight diversified high-evidence paths can meet structural/probabilistic saturation without creating money evidence',async()=>{
  const executionPaths=Array.from({length:8},(_,i)=>({id:`p-${i}`,mechanismFamily:`family-${i}`,independenceClass:`class-${i}`,stages:allStages(String(i)),successProbability:.8,evidenceQuality:1,expectedNetContribution:100+i}));
  const root=await tempRoot({executionPaths,saturationMinimumIndependentPaths:8,minimumMechanismFamilies:6,targetNightClearanceProbability:.995});
  const queued=[];
  const receipt=await runEconomicWealthResidentSupervisor({root,maxSearchCells:4,simulationIterations:30,syntheticSamples:64,syntheticIterations:30,maxQueuedRepairs:8,enqueueJob:async(type,payload,options)=>{queued.push(type);return{id:`j-${queued.length}`};}});
  assert.equal(receipt.economicSaturation.status,'OVERDETERMINED_UNPROVEN');
  assert.equal(receipt.economicSaturation.structuralSaturation,true);
  assert.equal(receipt.economicSaturation.probabilisticSaturation,true);
  assert.equal(receipt.economicSaturation.queuedJobCount,0);
  assert.equal(receipt.economicInevitability.realizedPathCount,0);
});
