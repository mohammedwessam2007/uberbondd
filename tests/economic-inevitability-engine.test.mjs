import test from 'node:test';
import assert from 'node:assert/strict';
import {ECONOMIC_STAGES,PUBLIC_SUCCESS_DONOR_ATOMS,compileEconomicExecutionPath,compileEconomicInevitabilityPlan} from '../src/economic-inevitability-engine.mjs';

const readyStages=(suffix='x')=>Object.fromEntries(ECONOMIC_STAGES.map(s=>[s,{status:'READY',railId:`${s.toLowerCase()}-${suffix}`,evidenceRefs:['r']} ]));
const path=(id,suffix=id,extra={})=>({id,mechanismFamily:`family-${id}`,independenceClass:`class-${id}`,stages:readyStages(suffix),successProbability:.3,evidenceQuality:.8,expectedNetContribution:100,...extra});

test('fully ready path is executable but not money until payment and delivery are observed',()=>{
  const x=compileEconomicExecutionPath(path('a'));
  assert.equal(x.executable,true);
  assert.equal(x.realized,false);
  assert.equal(x.maturity,'EXECUTABLE_UNPROVEN');
});

test('authority blocker cannot enter autonomous resolution queue',()=>{
  const p=path('a'); p.stages.PAYMENT={status:'BLOCKED_AUTHORITY'};
  const x=compileEconomicInevitabilityPlan({paths:[p]});
  assert.equal(x.executablePathCount,0);
  assert.equal(x.ownerOnlyBlockers.length,1);
  assert.equal(x.autonomousResolutionTasks.some(t=>t.class==='AUTHORITY_REQUIRED'),false);
});

test('prohibited path is killed rather than optimized',()=>{
  const p=path('a'); p.stages.DISTRIBUTION={status:'PROHIBITED'};
  const x=compileEconomicExecutionPath(p);
  assert.equal(x.maturity,'KILLED');
  assert.equal(x.blockers[0].resolution.includes('kill-path'),true);
});

test('three independent ready paths without shared critical rails reach multipath ready',()=>{
  const x=compileEconomicInevitabilityPlan({paths:[path('a'),path('b'),path('c')]});
  assert.equal(x.status,'MULTIPATH_EXECUTION_READY_UNPROVEN');
  assert.equal(x.independentExecutionClassCount,3);
  assert.deepEqual(x.singlePointFailures,{distributionRail:null,paymentRail:null,fulfillmentRail:null});
});

test('shared payment rail is treated as a single point of failure',()=>{
  const ps=[path('a'),path('b'),path('c')];
  for(const p of ps) p.stages.PAYMENT={status:'READY',railId:'paypal-live'};
  const x=compileEconomicInevitabilityPlan({paths:ps});
  assert.equal(x.singlePointFailures.paymentRail,'paypal-live');
  assert.notEqual(x.status,'MULTIPATH_EXECUTION_READY_UNPROVEN');
});

test('cleared payment plus accepted delivery upgrades from theory to observed money loop',()=>{
  const a=path('a','a',{observedClearedPayments:1,acceptedDeliveries:1});
  const x=compileEconomicInevitabilityPlan({paths:[a,path('b'),path('c')]});
  assert.equal(x.realizedPathCount,1);
  assert.equal(x.status,'RESILIENT_MONEY_LOOP_OBSERVED');
});

test('repeated independent observed loops plus renewal reach strongest evidence state',()=>{
  const ps=['a','b','c'].map(id=>path(id,id,{observedClearedPayments:2,acceptedDeliveries:2,recurringPayments:id==='a'?1:0}));
  const x=compileEconomicInevitabilityPlan({paths:ps});
  assert.equal(x.status,'REPEATED_REDUNDANT_MONEY_LOOP_OBSERVED');
});

test('policy-cleared donor inputs are retained only as one-way digests',()=>{
  const x=compileEconomicInevitabilityPlan({paths:[],policyClearedDonorDigests:['cleared-mechanism-evidence']});
  assert.equal(x.policyClearedDonorDigests.length,1);
  assert.equal(JSON.stringify(x).includes('cleared-mechanism-evidence'),false);
});

test('public donor atoms cover recurring, borrowed distribution, productization and fulfillment patterns',()=>{
  const ids=new Set(PUBLIC_SUCCESS_DONOR_ATOMS.map(x=>x.id));
  for(const id of ['subscription-plus-usage-billing','borrowed-marketplace-demand','internal-tool-to-product','productized-fulfillment']) assert.equal(ids.has(id),true);
});

test('unknown readiness is penalized and never interpreted as ready or failed',()=>{
  const p=path('a'); delete p.stages.RECONCILIATION;
  const x=compileEconomicInevitabilityPlan({paths:[p]});
  assert.equal(x.blockerCounts.UNKNOWN,1);
  assert.equal(x.executablePathCount,0);
});
