import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCreatorRevenueCell,recordCreatorOutcome,scoreCreatorExperiment,validateVirtualCreator} from '../src/ai-creator-revenue-cell.mjs';

test('rejects real-person impersonation',()=>{
 const out=validateVirtualCreator({identity:'x',impersonatesRealPerson:true,syntheticDisclosure:true,monetizationRoutes:['affiliate']});
 assert.equal(out.ok,false);
 assert.ok(out.reasons.includes('real-person-impersonation-prohibited'));
});

test('rejects adult content for this revenue cell',()=>{
 const out=validateVirtualCreator({identity:'x',adultContent:true,syntheticDisclosure:true,monetizationRoutes:['affiliate']});
 assert.equal(out.ok,false);
 assert.ok(out.reasons.includes('adult-content-not-supported-by-this-cell'));
});

test('ranks higher economic-density creator experiments first',()=>{
 const common={hookStrength:.8,retentionPotential:.8,repeatability:.8,monetizationFit:.8,differentiation:.8,cashCost:0};
 const fast=scoreCreatorExperiment({...common,founderMinutes:5});
 const slow=scoreCreatorExperiment({...common,founderMinutes:50});
 assert.ok(fast>slow);
});

test('selects bounded top experiments',()=>{
 const creator={identity:'Nova Lab',syntheticDisclosure:true,adultContent:false,impersonatesRealPerson:false,monetizationRoutes:['sponsorship','affiliate']};
 const out=buildCreatorRevenueCell({creator,maxLive:2,experiments:[
  {id:'a',hookStrength:.9,retentionPotential:.9,repeatability:.9,monetizationFit:.9,differentiation:.9,founderMinutes:5},
  {id:'b',hookStrength:.7,retentionPotential:.7,repeatability:.7,monetizationFit:.7,differentiation:.7,founderMinutes:5},
  {id:'c',hookStrength:.2,retentionPotential:.2,repeatability:.2,monetizationFit:.2,differentiation:.2,founderMinutes:5}
 ]});
 assert.deepEqual(out.selected,['a','b']);
 assert.equal(out.truthBoundary,'NO_REVENUE_CLAIM_WITHOUT_CLEARED_PAYMENT_RECEIPT');
});

test('promotes only cleared profitable outcomes',()=>{
 const noCash=recordCreatorOutcome({experimentId:'a',views:1_000_000,clearedRevenue:0,cost:10,founderMinutes:5});
 const cash=recordCreatorOutcome({experimentId:'a',views:1000,clearedRevenue:100,cost:10,founderMinutes:5});
 assert.equal(noCash.promotable,false);
 assert.equal(cash.promotable,true);
 assert.equal(cash.contribution,90);
});
