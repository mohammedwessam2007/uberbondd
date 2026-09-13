import test from 'node:test';
import assert from 'node:assert/strict';
import { planEconomicReliabilityExpansion } from '../src/economic-reliability-expansion-planner.mjs';
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

function route(i,{p=0.5,calibrated=true,minutes=1,dependencyReceipt=dependency(i)}={}){
  return {
    routeId:`r${i}`,
    failureDomain:`domain-${i}`,
    successProbabilityLowerBound:p,
    evidenceRefs:[`e:${i}`],
    calibrationRefs:calibrated?[`c:${i}`]:[],
    dependencyReceipt,
    policyCleared:true,
    executableNow:true,
    founderMinutes:minutes,
    timeToCashMinutes:10
  };
}

test('shared dependency weaker route has zero marginal reliability gain',()=>{
  const result=planEconomicReliabilityExpansion({
    activeRoutes:[route(1,{p:0.6,dependencyReceipt:dependency(1,{paymentRail:'same-pay'})})],
    candidateRoutes:[route(2,{p:0.4,dependencyReceipt:dependency(2,{paymentRail:'same-pay'})})],
    maxAdditions:3
  });
  assert.equal(result.selectedCount,0);
  assert.deepEqual(result.rejectedNoGain,['r2']);
  assert.equal(result.finalReliability.successProbability,0.6);
});

test('dependency-disjoint evidenced route has positive marginal gain',()=>{
  const result=planEconomicReliabilityExpansion({activeRoutes:[route(1,{p:0.5})],candidateRoutes:[route(2,{p:0.5})],maxAdditions:1});
  assert.equal(result.selectedCount,1);
  assert.equal(result.selectedAdditions[0].routeId,'r2');
  assert.ok(result.selectedAdditions[0].logReliabilityGain>0);
  assert.equal(result.finalReliability.successProbability,0.75);
});

test('uncalibrated or dependency-unproven candidate has zero gain',()=>{
  const result=planEconomicReliabilityExpansion({
    activeRoutes:[route(1,{p:0.5})],
    candidateRoutes:[route(2,{p:0.99,calibrated:false}),route(3,{p:0.99,dependencyReceipt:null})],
    maxAdditions:2
  });
  assert.equal(result.selectedCount,0);
  assert.deepEqual(new Set(result.rejectedNoGain),new Set(['r2','r3']));
  assert.equal(result.finalReliability.successProbability,0.5);
});

test('36 disjoint 50 percent components plus one disjoint candidate crosses target',()=>{
  const active=Array.from({length:36},(_,i)=>route(i,{p:0.5}));
  const candidate=route(100,{p:0.5});
  const result=planEconomicReliabilityExpansion({activeRoutes:active,candidateRoutes:[candidate],maxAdditions:1});
  assert.equal(result.startReliability.targetReached,false);
  assert.equal(result.finalReliability.targetReached,true);
  assert.equal(result.status,'ECONOMIC_RELIABILITY_TARGET_REACHED');
  assert.deepEqual(result.selectedAdditions.map(x=>x.routeId),['r100']);
});

test('planner prefers better marginal reliability gain per burden and recomputes after selection',()=>{
  const sharedFast='fast-shared-buyers';
  const result=planEconomicReliabilityExpansion({
    activeRoutes:[route(1,{p:0.2})],
    candidateRoutes:[
      route(2,{p:0.6,minutes:1,dependencyReceipt:dependency(2,{buyerPool:sharedFast})}),
      route(3,{p:0.8,minutes:20}),
      route(4,{p:0.5,minutes:1,dependencyReceipt:dependency(4,{buyerPool:sharedFast})})
    ],
    maxAdditions:2
  });
  assert.equal(result.selectedAdditions[0].routeId,'r2');
  assert.equal(result.selectedAdditions[1].routeId,'r3');
  assert.ok(result.rejectedNoGain.includes('r4'));
});

test('planner never claims target when no evidence-backed path crosses it',()=>{
  const result=planEconomicReliabilityExpansion({activeRoutes:[],candidateRoutes:[route(1,{p:0.9,dependencyReceipt:null}),route(2,{p:0.9,calibrated:false})],maxAdditions:10});
  assert.equal(result.targetReached,false);
  assert.equal(result.status,'ECONOMIC_RELIABILITY_EXPANSION_REQUIRED');
  assert.equal(result.finalReliability.residualZeroProbability,1);
});
