import test from 'node:test';
import assert from 'node:assert/strict';
import { runEconomicReliabilityControlLoop, domainsNeededAtProbability } from '../src/economic-reliability-control-loop.mjs';

function route(id,{domain=id,independent=true,policyCleared=true,executableNow=true,minTrials=20}={}){
  return {
    routeId:id,
    failureDomain:domain,
    routeEvidenceRefs:[`route:${id}`],
    independenceEvidenceRefs:independent?[`ind:${id}`]:[],
    policyCleared,
    executableNow,
    founderMinutes:1,
    timeToCashMinutes:10,
    minTrials
  };
}

function trials(id,{domain=id,n=20,wins=10}={}){
  return Array.from({length:n},(_,i)=>({
    trialId:`${id}-t${i}`,
    routeId:id,
    failureDomain:domain,
    observedAt:`2026-09-${String((i%20)+1).padStart(2,'0')}T12:00:00Z`,
    evidenceRefs:[`receipt:${id}:${i}`],
    completed:true,
    providerReadback:true,
    providerOrigin:true,
    settlementState:i<wins?'CLEARED':'FAILED',
    clearedContributionProfitCents:i<wins?100:0
  }));
}

test('insufficient calibration emits provider-readback collection work',()=>{
  const result=runEconomicReliabilityControlLoop({activeRoutes:[route('market')],trials:trials('market',{n:5,wins:3})});
  assert.equal(result.targetReached,false);
  const request=result.nextActions.find(x=>x.routeId==='market');
  assert.equal(request.type,'COLLECT_PROVIDER_READBACK_TRIALS');
  assert.equal(request.additionalCompletedTrialsRequired,15);
});

test('calibrated route without independence proof emits independence work',()=>{
  const result=runEconomicReliabilityControlLoop({activeRoutes:[route('market',{independent:false})],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.targetReached,false);
  assert.equal(result.nextActions.find(x=>x.routeId==='market').type,'PROVE_FAILURE_DOMAIN_INDEPENDENCE');
  assert.equal(result.reliability.reliabilityContributingRouteCount,0);
});

test('calibrated independent candidate can be selected as orthogonal expansion',()=>{
  const active=route('market',{domain:'marketplace'});
  const candidate=route('bounty',{domain:'bounty'});
  const result=runEconomicReliabilityControlLoop({
    activeRoutes:[active],candidateRoutes:[candidate],
    trials:[...trials('market',{domain:'marketplace',n:40,wins:30}),...trials('bounty',{domain:'bounty',n:40,wins:30})],
    maxAdditions:1
  });
  assert.equal(result.targetReached,false);
  assert.equal(result.nextActions[0].type,'ACTIVATE_SELECTED_ORTHOGONAL_ROUTE');
  assert.equal(result.nextActions[0].routeId,'bounty');
  assert.ok(result.nextActions[0].residualAfter<result.nextActions[0].residualBefore);
});

test('policy blocked calibrated route does not silently disappear',()=>{
  const result=runEconomicReliabilityControlLoop({activeRoutes:[route('market',{policyCleared:false})],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.targetReached,false);
  assert.equal(result.nextActions.find(x=>x.routeId==='market').type,'RESOLVE_POLICY_CLEARANCE');
});

test('execution blocked calibrated route emits dependency closure',()=>{
  const result=runEconomicReliabilityControlLoop({activeRoutes:[route('market',{executableNow:false})],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.targetReached,false);
  assert.equal(result.nextActions.find(x=>x.routeId==='market').type,'CLOSE_EXECUTION_DEPENDENCIES');
});

test('below target with actionable route never returns empty next actions',()=>{
  const result=runEconomicReliabilityControlLoop({activeRoutes:[route('market')],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.targetReached,false);
  assert.ok(result.nextActions.length>0);
});

test('domains-needed calculator returns 37 from certainty-free start at p=0.5',()=>{
  assert.equal(domainsNeededAtProbability({currentResidual:1,p:0.5}),37);
});

test('control loop never grants external or money authority',()=>{
  const result=runEconomicReliabilityControlLoop({activeRoutes:[route('market')],trials:trials('market',{n:30,wins:20})});
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.moneyAuthority,'NONE');
  assert.equal(result.status,'ECONOMIC_RELIABILITY_WORK_REMAINS');
});
