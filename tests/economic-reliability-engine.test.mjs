import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGET_SUCCESS_PROBABILITY,
  TARGET_ZERO_MONEY_PROBABILITY,
  evaluateEconomicReliability,
  rankReliabilityActions
} from '../src/economic-reliability-engine.mjs';
import { compileEconomicRouteDependencyReceipt } from '../src/economic-route-dependency.mjs';

function dependency(i,overrides={}){
  const factors={
    demandSource:`demand-${i}`,
    buyerPool:`buyers-${i}`,
    distributionRail:`distribution-${i}`,
    paymentRail:`payment-${i}`,
    fulfillmentRail:`fulfillment-${i}`,
    platformDependency:`platform-${i}`,
    providerDependency:`provider-${i}`,
    ...overrides
  };
  const factorEvidence=Object.fromEntries(Object.keys(factors).map(k=>[k,[`e:${i}:${k}`]]));
  return compileEconomicRouteDependencyReceipt({routeId:`r${i}`,factors,factorEvidence,observedAt:new Date('2026-09-14T12:00:00Z')}).receipt;
}

function route(i,{p=0.5,calibrated=true,evidence=true,executableNow=true,dependencyReceipt=dependency(i)}={}){
  return {
    routeId:`r${i}`,
    failureDomain:`domain-${i}`,
    successProbabilityLowerBound:p,
    evidenceRefs:evidence?[`e:${i}`]:[],
    calibrationRefs:calibrated?[`c:${i}`]:[],
    dependencyReceipt,
    policyCleared:true,
    executableNow,
    founderMinutes:0,
    timeToCashMinutes:1
  };
}

test('target is exactly 99.999999999 percent success',()=>{
  assert.equal(TARGET_SUCCESS_PROBABILITY,0.99999999999);
  assert.ok(Math.abs(TARGET_ZERO_MONEY_PROBABILITY-1e-11)<1e-15);
});

test('37 dependency-disjoint 50 percent routes cross target but 36 do not',()=>{
  const thirtySix=evaluateEconomicReliability({routes:Array.from({length:36},(_,i)=>route(i))});
  const thirtySeven=evaluateEconomicReliability({routes:Array.from({length:37},(_,i)=>route(i))});
  assert.equal(thirtySix.targetReached,false);
  assert.equal(thirtySeven.targetReached,true);
  assert.ok(thirtySeven.residualZeroProbability<=TARGET_ZERO_MONEY_PROBABILITY);
});

test('shared critical rail collapses nominally distinct routes into one component',()=>{
  const routes=Array.from({length:100},(_,i)=>route(i,{dependencyReceipt:dependency(i,{paymentRail:'shared-paypal'})}));
  const result=evaluateEconomicReliability({routes});
  assert.equal(result.independentFailureDomainCount,1);
  assert.equal(result.successProbability,0.5);
  assert.equal(result.targetReached,false);
  assert.ok(result.sharedDependencyEdges.some(x=>x.factor==='paymentRail'));
});

test('route without dependency receipt contributes zero reliability',()=>{
  const routes=Array.from({length:50},(_,i)=>route(i,{p:0.9,dependencyReceipt:null}));
  const result=evaluateEconomicReliability({routes});
  assert.equal(result.independentFailureDomainCount,0);
  assert.equal(result.successProbability,0);
  assert.equal(result.residualZeroProbability,1);
  assert.equal(result.dependencyWithheldCount,50);
  assert.equal(result.targetReached,false);
});

test('unproven high probability route cannot inflate a proven route',()=>{
  const result=evaluateEconomicReliability({routes:[route(1,{p:0.5}),route(2,{p:0.999999999,dependencyReceipt:null})]});
  assert.equal(result.independentFailureDomainCount,1);
  assert.equal(result.dependencyWithheldCount,1);
  assert.equal(result.successProbability,0.5);
  assert.equal(result.targetReached,false);
});

test('uncalibrated or non-executable routes are rejected',()=>{
  const result=evaluateEconomicReliability({routes:[route(1,{calibrated:false}),route(2,{executableNow:false}),route(3,{evidence:false})]});
  assert.equal(result.eligibleRouteCount,0);
  assert.equal(result.rejectedRouteCount,3);
  assert.equal(result.targetReached,false);
});

test('ranking prefers larger reliability gain per burden',()=>{
  const ranked=rankReliabilityActions({routes:[{...route(1,{p:0.2}),founderMinutes:20,timeToCashMinutes:60},{...route(2,{p:0.5}),founderMinutes:1,timeToCashMinutes:1}]});
  assert.equal(ranked[0].routeId,'r2');
});
