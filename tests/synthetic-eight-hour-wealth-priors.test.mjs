import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOpenWorldMoneyUniverse} from '../src/eight-hour-wealth-universe-simulator.mjs';
import {compileSyntheticUniverseMechanisms,simulateSyntheticEightHourUniverse,SYNTHETIC_EIGHT_HOUR_SCENARIOS} from '../src/synthetic-eight-hour-wealth-priors.mjs';

test('synthetic priors are explicitly synthetic and carry no forecast authority',()=>{
  const universe=compileOpenWorldMoneyUniverse({materializedSamples:64,seed:'prior-test'});
  const x=compileSyntheticUniverseMechanisms({universe,scenario:'BASE',maxMechanisms:64,seed:'prior-test'});
  assert.equal(x.synthetic,true);
  assert.equal(x.forecastAuthority,'NONE');
  assert.equal(x.mechanismCount,64);
  assert.ok(x.mechanisms.every(m=>m.syntheticPrior===true&&m.evidenceQuality===0));
  assert.match(x.truthBoundary,/NOT_MARKET_EVIDENCE/);
});

test('regulated/capital-intensive synthetic cells are not silently cleared',()=>{
  const universe={samples:[{id:'c1',assetForms:'CAPITAL',captureModels:'YIELD',horizons:'HOURS'}]};
  const x=compileSyntheticUniverseMechanisms({universe,scenario:'BASE'});
  assert.equal(x.mechanisms[0].policyCleared,false);
  assert.ok(x.mechanisms[0].cashAtRisk>0);
});

test('synthetic scenario simulator produces deterministic labeled 8-hour counterfactuals',()=>{
  const args={domains:['general'],materializedSamples:256,scenario:'AGGRESSIVE',sleepHours:8,iterations:1200,seed:'synthetic-night',maxConcurrentMechanisms:32,maxCapitalAtRisk:0};
  const a=simulateSyntheticEightHourUniverse(args);
  const b=simulateSyntheticEightHourUniverse(args);
  assert.equal(a.synthetic,true);
  assert.equal(a.forecastAuthority,'NONE');
  assert.equal(a.universe.unknownMechanismFrontier,true);
  assert.deepEqual(a.simulation.simulation,b.simulation.simulation);
  assert.ok(a.simulation.fantasyGrossCeiling>=a.simulation.executableGrossCeiling);
  assert.match(a.truthBoundary,/SYNTHETIC_COUNTERFACTUALS/);
});

test('conservative/base/aggressive scenario library remains ordered in prior ranges',()=>{
  assert.ok(SYNTHETIC_EIGHT_HOUR_SCENARIOS.CONSERVATIVE.grossMax<SYNTHETIC_EIGHT_HOUR_SCENARIOS.BASE.grossMax);
  assert.ok(SYNTHETIC_EIGHT_HOUR_SCENARIOS.BASE.grossMax<SYNTHETIC_EIGHT_HOUR_SCENARIOS.AGGRESSIVE.grossMax);
  assert.ok(SYNTHETIC_EIGHT_HOUR_SCENARIOS.CONSERVATIVE.successMax<SYNTHETIC_EIGHT_HOUR_SCENARIOS.AGGRESSIVE.successMax);
});
