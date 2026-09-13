import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrateEconomicRoute,
  compileReliabilityRouteFromCalibration,
  wilsonLowerBound
} from '../src/economic-route-calibration.mjs';

const NOW=new Date('2026-09-14T12:00:00Z');
function trial(i,{success=true,routeId='marketplace',failureDomain='marketplace',regimeId='regime-sep14',providerReadback=true,completed=true,providerOrigin=true,settlementState='CLEARED',observedAt=null}={}){
  return {
    trialId:`t${i}`,
    routeId,
    failureDomain,
    regimeId,
    observedAt:observedAt||`2026-09-${String((i%13)+1).padStart(2,'0')}T12:00:00Z`,
    evidenceRefs:[`receipt:${i}`],
    completed,
    providerReadback,
    providerOrigin,
    settlementState,
    clearedContributionProfitCents:success?100:0
  };
}
const calibrate=({trials,minTrials=20,regimeId='regime-sep14',maxTrialAgeMs}={})=>calibrateEconomicRoute({routeId:'marketplace',failureDomain:'marketplace',regimeId,trials,minTrials,now:NOW,...(maxTrialAgeMs?{maxTrialAgeMs}:{})});

test('Wilson lower bound is conservative and bounded',()=>{
  const lower=wilsonLowerBound(8,10);
  assert.ok(lower>0&&lower<0.8);
  assert.equal(wilsonLowerBound(0,10),0);
  assert.equal(wilsonLowerBound(11,10),null);
});

test('calibration refuses insufficient fresh sample even when every observed trial wins',()=>{
  const result=calibrate({trials:Array.from({length:19},(_,i)=>trial(i)),minTrials:20});
  assert.equal(result.calibrated,false);
  assert.equal(result.successProbabilityLowerBound,null);
});

test('completed fresh provider-readback trials produce a conservative lower bound',()=>{
  const trials=Array.from({length:100},(_,i)=>trial(i,{success:i<60}));
  const result=calibrate({trials});
  assert.equal(result.calibrated,true);
  assert.equal(result.completedTrials,100);
  assert.equal(result.successes,60);
  assert.ok(result.successProbabilityLowerBound>0&&result.successProbabilityLowerBound<0.6);
  assert.ok(result.calibrationRef.startsWith('sha256:'));
});

test('silence and non-readback outcomes cannot become failures',()=>{
  const trials=[...Array.from({length:20},(_,i)=>trial(i,{success:i<10})),trial(90,{success:false,providerReadback:false}),trial(91,{success:false,completed:false})];
  const result=calibrate({trials});
  assert.equal(result.completedTrials,20);
  assert.equal(result.invalidOrMismatchedTrials,2);
});

test('promise or uncleared money cannot count as success',()=>{
  const trials=Array.from({length:20},(_,i)=>trial(i,{success:true,settlementState:i===0?'PROMISED':'CLEARED'}));
  const result=calibrate({trials});
  assert.equal(result.successes,19);
});

test('stale trials cannot certify current reliability',()=>{
  const trials=Array.from({length:20},(_,i)=>trial(i,{observedAt:'2026-07-01T12:00:00Z'}));
  const result=calibrate({trials,maxTrialAgeMs:30*24*60*60*1000});
  assert.equal(result.completedTrials,0);
  assert.equal(result.staleOrFutureTrials,20);
  assert.equal(result.calibrated,false);
});

test('future-skewed trials cannot certify current reliability',()=>{
  const trials=Array.from({length:20},(_,i)=>trial(i,{observedAt:'2026-09-15T12:00:00Z'}));
  const result=calibrate({trials});
  assert.equal(result.completedTrials,0);
  assert.equal(result.staleOrFutureTrials,20);
  assert.equal(result.calibrated,false);
});

test('regime mismatch cannot certify the current route regime',()=>{
  const trials=Array.from({length:20},(_,i)=>trial(i,{regimeId:'old-regime'}));
  const result=calibrate({trials,regimeId:'regime-sep14'});
  assert.equal(result.completedTrials,0);
  assert.equal(result.invalidOrMismatchedTrials,20);
  assert.equal(result.calibrated,false);
});

test('calibration binding never mints independence evidence',()=>{
  const calibration=calibrate({trials:Array.from({length:30},(_,i)=>trial(i,{success:i<15}))});
  const bound=compileReliabilityRouteFromCalibration({calibration,routeEvidenceRefs:['route:e'],policyCleared:true,executableNow:true});
  assert.equal(bound.ok,true);
  assert.deepEqual(bound.route.independenceEvidenceRefs,[]);
  assert.equal(bound.route.regimeId,'regime-sep14');
  assert.equal(bound.route.calibrationRefs[0],calibration.calibrationRef);
});

test('invalid calibration cannot enter reliability route',()=>{
  const calibration=calibrate({trials:[]});
  const bound=compileReliabilityRouteFromCalibration({calibration,policyCleared:true,executableNow:true});
  assert.equal(bound.ok,false);
});
