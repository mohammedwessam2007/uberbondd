import test from 'node:test';
import assert from 'node:assert/strict';
import {OPEN_WORLD_ECONOMIC_AXES,compileOpenWorldMoneyUniverse,normalizeEightHourMechanism,simulateEightHourWealthUniverse} from '../src/eight-hour-wealth-universe-simulator.mjs';

const mech=(extra={})=>({
  id:'digital-sale',policyCleared:true,authorityAvailable:true,grossIfSuccess:100,
  successProbabilityPerAttempt:.05,attemptsPerHour:10,settlementProbabilityWithinWindow:.8,
  deliveryAcceptanceProbability:.95,netMargin:.9,setupHours:.5,fixedCost:10,cashAtRisk:0,
  capitalLossProbability:0,evidenceQuality:.7,...extra
});

test('open-world universe is combinatorial and preserves unknown frontier',()=>{
  const x=compileOpenWorldMoneyUniverse({domains:['general','medical'],materializedSamples:100});
  assert.equal(x.materializedSampleCount,100);
  assert.equal(x.openWorld,true);
  assert.equal(x.unknownMechanismFrontier,true);
  assert.ok(BigInt(x.addressableCombinationCount)>1000000n);
  assert.match(x.truthBoundary,/CANNOT_PROVE_ALL_POSSIBLE/);
});

test('sampling spans multiple axes instead of first-N lexicographic cells',()=>{
  const x=compileOpenWorldMoneyUniverse({materializedSamples:500,seed:'coverage'});
  assert.ok(new Set(x.samples.map(v=>v.captureModels)).size>10);
  assert.ok(new Set(x.samples.map(v=>v.assetForms)).size>10);
  assert.ok(new Set(x.samples.map(v=>v.distribution)).size>10);
  assert.ok(OPEN_WORLD_ECONOMIC_AXES.captureModels.length>30);
});

test('eight-hour normalization converts explicit assumptions into bounded attempt economics',()=>{
  const x=normalizeEightHourMechanism(mech(),8);
  assert.equal(x.valid,true);
  assert.equal(x.attempts,75);
  assert.ok(x.expectedClearedGross>0);
  assert.ok(x.fantasyGrossCeiling>x.expectedClearedGross);
});

test('no authority means hypothesis can contribute to fantasy ceiling but not executable simulation',()=>{
  const x=simulateEightHourWealthUniverse({mechanisms:[mech({authorityAvailable:false})],iterations:500});
  assert.ok(x.fantasyGrossCeiling>0);
  assert.equal(x.executableGrossCeiling,0);
  assert.equal(x.selectedMechanismCount,0);
  assert.equal(x.status,'NO_EXECUTABLE_MECHANISMS_TO_SIMULATE');
});

test('capital-at-risk limit excludes capitalized methods from tonight simulation',()=>{
  const x=simulateEightHourWealthUniverse({mechanisms:[mech({id:'capitalized',cashAtRisk:100})],maxCapitalAtRisk:0,iterations:500});
  assert.equal(x.selectedMechanismCount,0);
  assert.equal(x.exclusionReasons['capital-at-risk-limit'],1);
});

test('simulation is deterministic for a fixed seed and emits percentile distribution',()=>{
  const args={mechanisms:[mech(),mech({id:'license',grossIfSuccess:300,successProbabilityPerAttempt:.01,attemptsPerHour:6})],iterations:2000,seed:'night-1'};
  const a=simulateEightHourWealthUniverse(args);
  const b=simulateEightHourWealthUniverse(args);
  assert.deepEqual(a.simulation,b.simulation);
  assert.ok(a.simulation.p90>=a.simulation.p50);
  assert.ok(a.simulation.p50>=a.simulation.p10);
  assert.ok(a.expectedClearedGross>0);
  assert.equal(a.moneyClaimAuthority,'NONE');
  assert.match(a.truthBoundary,/COUNTERFACTUAL_MONTE_CARLO/);
});

test('parallelism is explicitly constrained rather than summing every attractive fantasy',()=>{
  const mechanisms=Array.from({length:20},(_,i)=>mech({id:`m${i}`,expected:i}));
  const x=simulateEightHourWealthUniverse({mechanisms,maxConcurrentMechanisms:3,iterations:500});
  assert.equal(x.selectedMechanismCount,3);
  assert.ok(x.fantasyGrossCeiling>x.executableGrossCeiling);
});

test('evidence weighting can only discount expectation, never create money',()=>{
  const x=simulateEightHourWealthUniverse({mechanisms:[mech({evidenceQuality:0})],iterations:500});
  assert.ok(x.analyticExpectedNetContribution>x.evidenceWeightedExpectedNetContribution);
  assert.equal(x.assumptionsAreHypotheses,true);
});
