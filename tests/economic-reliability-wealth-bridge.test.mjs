import test from 'node:test';
import assert from 'node:assert/strict';
import { compileReliabilityFirstWealthPortfolio } from '../src/economic-reliability-wealth-bridge.mjs';
import { compileEconomicRouteDependencyReceipt } from '../src/economic-route-dependency.mjs';

function dependency(id,overrides={}){
  const factors={
    demandSource:`demand-${id}`,
    buyerPool:`buyers-${id}`,
    distributionRail:`distribution-${id}`,
    paymentRail:`payment-${id}`,
    fulfillmentRail:`fulfillment-${id}`,
    platformDependency:`platform-${id}`,
    providerDependency:`provider-${id}`,
    ...overrides
  };
  const factorEvidence=Object.fromEntries(Object.keys(factors).map(k=>[k,[`e:${id}:${k}`]]));
  return compileEconomicRouteDependencyReceipt({routeId:id,factors,factorEvidence,observedAt:new Date('2026-09-14T12:00:00Z')}).receipt;
}

function candidate(id,{p=0.5,expected=100,dependencyReceipt=dependency(id),calibrated=true}={}){
  return {
    id,
    valueSource:'REVENUE_GAIN',
    assetForm:'SERVICE',
    captureModel:'PROJECT_FEE',
    distribution:'MARKETPLACE',
    buyerClass:'SMB',
    evidenceRefs:[`e:${id}`],
    stopConditions:['deadline'],
    policyCleared:true,
    expectedClearedContribution:expected,
    probability:p,
    successProbabilityLowerBound:p,
    failureDomain:`domain-${id}`,
    regimeId:'regime-sep14',
    calibrationRefs:calibrated?[`c:${id}`]:[],
    dependencyReceipt,
    executableNow:true,
    founderMinutes:1,
    timeToCashMinutes:10,
    timeToCashDays:0,
    repeatability:0.5,
    defensibility:0.2,
    reversibility:1,
    evidenceQuality:0.9,
    optionValue:0.5,
    cashAtRisk:0,
    downside:0
  };
}

test('bridge selects by reliability gain after wealth eligibility',()=>{
  const result=compileReliabilityFirstWealthPortfolio({candidates:[candidate('low',{p:0.1,expected:1000}),candidate('high',{p:0.8,expected:50})],maxCanaries:1});
  assert.deepEqual(result.canaries,['high']);
  assert.equal(result.reliability.eligibleRouteCount,2);
});

test('wealth-ineligible candidate cannot enter reliability tournament',()=>{
  const bad={...candidate('bad',{p:0.99}),policyCleared:false};
  const good=candidate('good',{p:0.2});
  const result=compileReliabilityFirstWealthPortfolio({candidates:[bad,good],maxCanaries:2});
  assert.deepEqual(result.canaries,['good']);
  assert.equal(result.reliability.eligibleRouteCount,1);
});

test('uncalibrated high forecast cannot masquerade as reliability',()=>{
  const fake=candidate('fake',{p:0.999999,calibrated:false});
  const result=compileReliabilityFirstWealthPortfolio({candidates:[fake],maxCanaries:1});
  assert.equal(result.reliability.targetReached,false);
  assert.equal(result.reliability.eligibleRouteCount,0);
  assert.deepEqual(result.canaries,[]);
});

test('dependency-unproven candidate cannot enter canary ranking',()=>{
  const fake=candidate('fake',{p:0.999999,dependencyReceipt:null});
  const result=compileReliabilityFirstWealthPortfolio({candidates:[fake],maxCanaries:1});
  assert.equal(result.reliability.reliabilityContributingRouteCount,0);
  assert.deepEqual(result.canaries,[]);
});

test('shared payment rail collapses wealth candidates into one reliability component',()=>{
  const a=candidate('a',{p:0.6,dependencyReceipt:dependency('a',{paymentRail:'paypal'})});
  const b=candidate('b',{p:0.5,dependencyReceipt:dependency('b',{paymentRail:'paypal'})});
  const result=compileReliabilityFirstWealthPortfolio({candidates:[a,b],maxCanaries:2});
  assert.equal(result.reliability.independentFailureDomainCount,1);
  assert.equal(result.reliability.successProbability,0.6);
});
