import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrateEconomicRoute,
  compileReliabilityRouteFromCalibration,
  wilsonLowerBound
} from '../src/economic-route-calibration.mjs';

function trial(i,{success=true,routeId='marketplace',failureDomain='marketplace',providerReadback=true,completed=true,providerOrigin=true,settlementState='CLEARED'}={}){
  return {
    trialId:`t${i}`,
    routeId,
    failureDomain,
    observedAt:`2026-09-${String((i%20)+1).padStart(2,'0')}T12:00:00Z`,
    evidenceRefs:[`receipt:${i}`],
    completed,
    providerReadback,
    providerOrigin,
    settlementState,
    clearedContributionProfitCents:success?100:0
  };
}

test('Wilson lower bound is conservative and bounded',()=>{
  const lower=wilsonLowerBound(8,10);
  assert.ok(lower>0&&lower<0.8);
  assert.equal(wilsonLowerBound(0,10),0);
  assert.equal(wilsonLowerBound(11,10),null);
});

test('calibration refuses insufficient sample even when every observed trial wins',()=>{
  const result=calibrateEconomicRoute({routeId:'marketplace',failureDomain:'marketplace',trials:Array.from({length:19},(_,i)=>trial(i)),minTrials:20});
  assert.equal(result.calibrated,false);
  assert.equal(result.successProbabilityLowerBound,null);
  assert.equal(result.status,'ECONOMIC_ROUTE_CALIBRATION_INSUFFICIENT_EVIDENCE');
});

test('completed provider-readback trials produce a conservative lower bound',()=>{
  const trials=Array.from({length:100},(_,i)=>trial(i,{success:i<60}));
  const result=calibrateEconomicRoute({routeId:'marketplace',failureDomain:'marketplace',trials,minTrials:20});
  assert.equal(result.calibrated,true);
  assert.equal(result.completedTrials,100);
  assert.equal(result.successes,60);
  assert.ok(result.successProbabilityLowerBound>0&&result.successProbabilityLowerBound<0.6);
  assert.ok(result.calibrationRef.startsWith('sha256:'));
});

test('silence and non-readback outcomes cannot become failures',()=>{
  const trials=[
    ...Array.from({length:20},(_,i)=>trial(i,{success:i<10})),
    trial(90,{success:false,providerReadback:false}),
    trial(91,{success:false,completed:false})
  ];
  const result=calibrateEconomicRoute({routeId:'marketplace',failureDomain:'marketplace',trials,minTrials:20});
  assert.equal(result.completedTrials,20);
  assert.equal(result.invalidOrMismatchedTrials,2);
});

test('promise or uncleared money cannot count as success',()=>{
  const trials=Array.from({length:20},(_,i)=>trial(i,{success:true,settlementState:i===0?'PROMISED':'CLEARED'}));
  const result=calibrateEconomicRoute({routeId:'marketplace',failureDomain:'marketplace',trials,minTrials:20});
  assert.equal(result.successes,19);
});

test('calibration binding never mints independence evidence',()=>{
  const calibration=calibrateEconomicRoute({routeId:'marketplace',failureDomain:'marketplace',trials:Array.from({length:30},(_,i)=>trial(i,{success:i<15})),minTrials:20});
  const bound=compileReliabilityRouteFromCalibration({calibration,routeEvidenceRefs:['route:e'],policyCleared:true,executableNow:true});
  assert.equal(bound.ok,true);
  assert.deepEqual(bound.route.independenceEvidenceRefs,[]);
  assert.equal(bound.route.calibrationRefs[0],calibration.calibrationRef);
});

test('invalid calibration cannot enter reliability route',()=>{
  const calibration=calibrateEconomicRoute({routeId:'marketplace',failureDomain:'marketplace',trials:[],minTrials:20});
  const bound=compileReliabilityRouteFromCalibration({calibration,policyCleared:true,executableNow:true});
  assert.equal(bound.ok,false);
});
