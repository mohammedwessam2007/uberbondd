import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dependency, mapRedundancy, classify,
  FRAGILITY_CLASSES, CRITICAL_DOMAINS
} from '../src/anti-fragility-map.mjs';

// Three income sources all invoicing the same client is one income source. The
// instance count says three and the failure count says one, and only the second
// number is about survival.

const dep = (name, domain, failureModes, extra = {}) =>
  dependency({ name, domain, failureModes, ...extra }).dependency;

test('a dependency listing no failure mode is refused', () => {
  const unexamined = dependency({ name: 'the main client', domain: 'INCOME' });
  assert.equal(unexamined.ok, false);
  assert.deepEqual(unexamined.reasonCodes, ['failure-modes-required']);
  assert.match(unexamined.note, /how the theatre starts/);
});

test('three instances sharing one failure mode is a single point of failure', () => {
  const mapped = mapRedundancy([
    dep('retainer A', 'INCOME', ['the client stops paying']),
    dep('retainer B', 'INCOME', ['the client stops paying']),
    dep('retainer C', 'INCOME', ['the client stops paying'])
  ]);
  const income = mapped.domains.find(row => row.domain === 'INCOME');
  assert.equal(income.instances, 3);
  assert.deepEqual(income.sharedFailureModes, ['the client stops paying']);
  assert.equal(income.singlePointOfFailure, true);
  assert.equal(income.independentSurvivableModes, 0);
  assert.equal(mapped.status, 'SINGLE_POINT_OF_FAILURE_PRESENT');
  assert.match(mapped.law, /NEVER_IN_INSTANCES/);
});

test('genuinely independent instances are not a single point of failure', () => {
  const mapped = mapRedundancy([
    dep('consulting', 'INCOME', ['clients dry up']),
    dep('rental income', 'INCOME', ['the tenant leaves'])
  ]);
  const income = mapped.domains.find(row => row.domain === 'INCOME');
  assert.equal(income.singlePointOfFailure, false);
  assert.equal(income.independentSurvivableModes, 2);
  assert.equal(mapped.status, 'REDUNDANCY_MAPPED');
});

test('a partly shared mode still makes the domain a single point of failure', () => {
  // Two sources that both die if the industry dies are not two sources for that
  // event, however different they look otherwise.
  const mapped = mapRedundancy([
    dep('consulting', 'INCOME', ['the industry collapses', 'clients dry up']),
    dep('teaching', 'INCOME', ['the industry collapses', 'the school closes'])
  ]);
  const income = mapped.domains.find(row => row.domain === 'INCOME');
  assert.deepEqual(income.sharedFailureModes, ['the industry collapses']);
  assert.equal(income.singlePointOfFailure, true);
  assert.equal(income.independentSurvivableModes, 2);
});

test('instances and independent modes are both reported', () => {
  const mapped = mapRedundancy([dep('a', 'MEMORY', ['provider shuts down'])]);
  const memory = mapped.domains.find(row => row.domain === 'MEMORY');
  assert.equal(memory.instances, 1);
  assert.ok('independentSurvivableModes' in memory);
});

test('an unmapped domain is unmapped, not proven safe', () => {
  const mapped = mapRedundancy([dep('a', 'INCOME', ['x'])]);
  assert.ok(mapped.domainsWithNoRecordedDependency.includes('HOUSING'));
  assert.match(mapped.uncoveredBoundary, /UNMAPPED__NOT_PROVEN_SAFE/);
});

test('the cost of duplication is reported beside the coverage', () => {
  const mapped = mapRedundancy([
    dep('a', 'INCOME', ['x'], { maintenanceCostPerMonth: 120 }),
    dep('b', 'MEMORY', ['y'], { maintenanceCostPerMonth: 30 })
  ]);
  assert.equal(mapped.maintenanceCostPerMonth, 150);
  assert.match(mapped.costBoundary, /REDUNDANCY_IS_NOT_MAXIMISED_BLINDLY/);
});

test('a missing maintenance cost does not count as zero cost claimed', () => {
  // It contributes nothing to the total, which is different from asserting the
  // dependency is free; the total is a floor, not a measurement.
  const mapped = mapRedundancy([dep('a', 'INCOME', ['x'])]);
  assert.equal(mapped.maintenanceCostPerMonth, 0);
});

test('a system nobody shook has an unknown class', () => {
  const unstressed = classify({ system: 'the income mix', predictedClass: 'ROBUST' });
  assert.equal(unstressed.observedClass, 'UNKNOWN_NOT_STRESSED');
  assert.equal(unstressed.predictedClass, 'ROBUST');
  assert.match(unstressed.law, /ROBUST_WRITTEN_ON_IT_IS_A_PREDICTION/);
});

test('a prediction is held apart from the observation so it can be scored', () => {
  const missed = classify({
    system: 'the income mix', predictedClass: 'ROBUST',
    stressesObserved: [{ event: 'the client left', degraded: true, recovered: false }]
  });
  assert.equal(missed.observedClass, 'FRAGILE');
  assert.equal(missed.predictionHeld, 'PREDICTION_MISSED');

  const matched = classify({
    system: 'x', predictedClass: 'RESILIENT',
    stressesObserved: [{ event: 'a bad quarter', degraded: true, recovered: true }]
  });
  assert.equal(matched.predictionHeld, 'PREDICTION_MATCHED');
});

test('gaining from variation outranks the weaker readings of the same stress', () => {
  const gained = classify({
    system: 'x',
    stressesObserved: [{ event: 'lost the anchor client', degraded: true, recovered: true, betterAfterwards: true }]
  });
  assert.equal(gained.observedClass, 'GAINS_FROM_VARIATION');
});

test('a class is bounded to the stresses actually seen', () => {
  const observed = classify({ system: 'x', stressesObserved: [{ event: 'a mild wobble' }] });
  assert.equal(observed.observedClass, 'ROBUST');
  assert.match(observed.evidenceBoundary, /NOT_FROM_STRESSES_NOT_YET_SEEN/);
});

test('an invented fragility class is refused', () => {
  const invented = classify({ system: 'x', predictedClass: 'BULLETPROOF' });
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.reasonCodes, ['known-fragility-class-required']);
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(FRAGILITY_CLASSES), true);
  assert.equal(Object.isFrozen(CRITICAL_DOMAINS), true);
  assert.equal(mapRedundancy([]).businessEffectAuthority, 'NONE');
  assert.equal(classify({ system: 'x' }).businessEffectAuthority, 'NONE');
});
