import test from 'node:test';
import assert from 'node:assert/strict';
import { planEconomicReliabilityExpansion } from '../src/economic-reliability-expansion-planner.mjs';

function route(i,{p=0.5,domain=`d${i}`,independent=true,calibrated=true,minutes=1}={}){
  return {
    routeId:`r${i}`,
    failureDomain:domain,
    successProbabilityLowerBound:p,
    evidenceRefs:[`e:${i}`],
    calibrationRefs:calibrated?[`c:${i}`]:[],
    independenceEvidenceRefs:independent?[`i:${i}`]:[],
    policyCleared:true,
    executableNow:true,
    founderMinutes:minutes,
    timeToCashMinutes:10
  };
}

test('same-domain weaker route has zero marginal reliability gain',()=>{
  const result=planEconomicReliabilityExpansion({
    activeRoutes:[route(1,{p:0.6,domain:'marketplace'})],
    candidateRoutes:[route(2,{p:0.4,domain:'marketplace'})],
    maxAdditions:3
  });
  assert.equal(result.selectedCount,0);
  assert.deepEqual(result.rejectedNoGain,['r2']);
  assert.equal(result.finalReliability.successProbability,0.6);
});

test('orthogonal evidenced route has positive marginal gain',()=>{
  const result=planEconomicReliabilityExpansion({
    activeRoutes:[route(1,{p:0.5,domain:'marketplace'})],
    candidateRoutes:[route(2,{p:0.5,domain:'bounty'})],
    maxAdditions:1
  });
  assert.equal(result.selectedCount,1);
  assert.equal(result.selectedAdditions[0].routeId,'r2');
  assert.ok(result.selectedAdditions[0].logReliabilityGain>0);
  assert.equal(result.finalReliability.successProbability,0.75);
});

test('uncalibrated or independence-unproven candidate has zero gain',()=>{
  const result=planEconomicReliabilityExpansion({
    activeRoutes:[route(1,{p:0.5,domain:'marketplace'})],
    candidateRoutes:[
      route(2,{p:0.99,domain:'bounty',calibrated:false}),
      route(3,{p:0.99,domain:'referral',independent:false})
    ],
    maxAdditions:2
  });
  assert.equal(result.selectedCount,0);
  assert.deepEqual(new Set(result.rejectedNoGain),new Set(['r2','r3']));
  assert.equal(result.finalReliability.successProbability,0.5);
});

test('36 independent 50 percent domains plus one orthogonal 50 percent candidate crosses target',()=>{
  const active=Array.from({length:36},(_,i)=>route(i,{p:0.5,domain:`active-${i}`}));
  const candidate=route(100,{p:0.5,domain:'new-orthogonal'});
  const result=planEconomicReliabilityExpansion({activeRoutes:active,candidateRoutes:[candidate],maxAdditions:1});
  assert.equal(result.startReliability.targetReached,false);
  assert.equal(result.finalReliability.targetReached,true);
  assert.equal(result.status,'ECONOMIC_RELIABILITY_TARGET_REACHED');
  assert.deepEqual(result.selectedAdditions.map(x=>x.routeId),['r100']);
});

test('planner prefers better marginal reliability gain per burden and recomputes after selection',()=>{
  const result=planEconomicReliabilityExpansion({
    activeRoutes:[route(1,{p:0.2,domain:'base'})],
    candidateRoutes:[
      route(2,{p:0.6,domain:'fast',minutes:1}),
      route(3,{p:0.8,domain:'slow',minutes:20}),
      route(4,{p:0.5,domain:'fast',minutes:1})
    ],
    maxAdditions:2
  });
  assert.equal(result.selectedAdditions[0].routeId,'r2');
  assert.equal(result.selectedAdditions[1].routeId,'r3');
  assert.ok(result.rejectedNoGain.includes('r4'));
});

test('planner never claims target when no evidence-backed path crosses it',()=>{
  const result=planEconomicReliabilityExpansion({
    activeRoutes:[],
    candidateRoutes:[route(1,{p:0.9,independent:false}),route(2,{p:0.9,calibrated:false})],
    maxAdditions:10
  });
  assert.equal(result.targetReached,false);
  assert.equal(result.status,'ECONOMIC_RELIABILITY_EXPANSION_REQUIRED');
  assert.equal(result.finalReliability.residualZeroProbability,1);
});
