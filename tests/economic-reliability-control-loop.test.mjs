import test from 'node:test';
import assert from 'node:assert/strict';
import { runEconomicReliabilityControlLoop, domainsNeededAtProbability } from '../src/economic-reliability-control-loop.mjs';
import { compileEconomicRouteDependencyReceipt } from '../src/economic-route-dependency.mjs';

const NOW=new Date('2026-09-14T12:00:00Z');
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
  return compileEconomicRouteDependencyReceipt({routeId:id,factors,factorEvidence,observedAt:NOW}).receipt;
}

function route(id,{domain=id,regimeId='regime-sep14',dependencyReceipt=dependency(id),policyCleared=true,executableNow=true,minTrials=20}={}){
  return {
    routeId:id,
    failureDomain:domain,
    regimeId,
    routeEvidenceRefs:[`route:${id}`],
    dependencyReceipt,
    policyCleared,
    executableNow,
    founderMinutes:1,
    timeToCashMinutes:10,
    minTrials
  };
}

function trials(id,{domain=id,regimeId='regime-sep14',n=20,wins=10,observedAt=null}={}){
  return Array.from({length:n},(_,i)=>({
    trialId:`${id}-t${i}`,
    routeId:id,
    failureDomain:domain,
    regimeId,
    observedAt:observedAt||`2026-09-${String((i%13)+1).padStart(2,'0')}T12:00:00Z`,
    evidenceRefs:[`receipt:${id}:${i}`],
    completed:true,
    providerReadback:true,
    providerOrigin:true,
    settlementState:i<wins?'CLEARED':'FAILED',
    clearedContributionProfitCents:i<wins?100:0
  }));
}

const run=args=>runEconomicReliabilityControlLoop({...args,now:NOW});

test('insufficient calibration emits fresh provider-readback collection work',()=>{
  const result=run({activeRoutes:[route('market')],trials:trials('market',{n:5,wins:3})});
  assert.equal(result.targetReached,false);
  const request=result.nextActions.find(x=>x.routeId==='market');
  assert.equal(request.type,'COLLECT_FRESH_PROVIDER_READBACK_TRIALS');
  assert.equal(request.additionalCompletedTrialsRequired,15);
});

test('stale evidence triggers fresh evidence work instead of using old success rate',()=>{
  const result=run({activeRoutes:[route('market')],trials:trials('market',{n:30,wins:30,observedAt:'2026-07-01T12:00:00Z'})});
  const request=result.nextActions.find(x=>x.routeId==='market');
  assert.equal(request.type,'COLLECT_FRESH_PROVIDER_READBACK_TRIALS');
  assert.equal(result.reliability.reliabilityContributingRouteCount,0);
});

test('calibrated route without dependency fingerprint emits fingerprint work',()=>{
  const result=run({activeRoutes:[route('market',{dependencyReceipt:null})],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.targetReached,false);
  assert.equal(result.nextActions.find(x=>x.routeId==='market').type,'BUILD_EVIDENCED_DEPENDENCY_FINGERPRINT');
  assert.equal(result.reliability.reliabilityContributingRouteCount,0);
});

test('calibrated dependency-disjoint candidate can be selected as orthogonal expansion',()=>{
  const active=route('market',{domain:'marketplace'});
  const candidate=route('bounty',{domain:'bounty'});
  const result=run({
    activeRoutes:[active],candidateRoutes:[candidate],
    trials:[...trials('market',{domain:'marketplace',n:40,wins:30}),...trials('bounty',{domain:'bounty',n:40,wins:30})],
    maxAdditions:1
  });
  assert.equal(result.targetReached,false);
  assert.equal(result.nextActions[0].type,'ACTIVATE_SELECTED_ORTHOGONAL_ROUTE');
  assert.equal(result.nextActions[0].routeId,'bounty');
  assert.ok(result.nextActions[0].residualAfter<result.nextActions[0].residualBefore);
});

test('shared dependency prevents fake orthogonal expansion',()=>{
  const active=route('market',{domain:'marketplace',dependencyReceipt:dependency('market',{paymentRail:'paypal'})});
  const candidate=route('bounty',{domain:'bounty',dependencyReceipt:dependency('bounty',{paymentRail:'paypal'})});
  const result=run({activeRoutes:[active],candidateRoutes:[candidate],trials:[...trials('market',{domain:'marketplace',n:40,wins:30}),...trials('bounty',{domain:'bounty',n:40,wins:30})],maxAdditions:1});
  assert.equal(result.expansion.selectedCount,0);
});

test('policy blocked calibrated route does not silently disappear',()=>{
  const result=run({activeRoutes:[route('market',{policyCleared:false})],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.nextActions.find(x=>x.routeId==='market').type,'RESOLVE_POLICY_CLEARANCE');
});

test('execution blocked calibrated route emits dependency closure',()=>{
  const result=run({activeRoutes:[route('market',{executableNow:false})],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.nextActions.find(x=>x.routeId==='market').type,'CLOSE_EXECUTION_DEPENDENCIES');
});

test('below target with actionable route never returns empty next actions',()=>{
  const result=run({activeRoutes:[route('market')],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.targetReached,false);
  assert.ok(result.nextActions.length>0);
});

test('domains-needed calculator returns 37 from certainty-free start at p=0.5',()=>{
  assert.equal(domainsNeededAtProbability({currentResidual:1,p:0.5}),37);
});

test('control loop never grants external or money authority',()=>{
  const result=run({activeRoutes:[route('market')],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.moneyAuthority,'NONE');
  assert.equal(result.status,'ECONOMIC_RELIABILITY_WORK_REMAINS');
});
