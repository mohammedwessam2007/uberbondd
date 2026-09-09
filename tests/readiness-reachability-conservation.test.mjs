import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReachabilityConservation } from '../src/readiness-reachability-conservation.mjs';

function valid() {
  return {
    repository: { sourceModules: 400 },
    reachability: {
      srcModules: 400,
      reachableFromProduction: 150,
      reachableFromUnattendedOperatorScriptsOnly: 100,
      reachableFromFounderInteractiveOnly: 20,
      noEntryPointAtAll: 130,
      partitionExact: true,
      allClassified: true,
      unclassified: [],
      staleClassifications: [],
      founderInteractiveClassificationViolations: []
    }
  };
}

test('valid reachability partition conserves the exact source-module denominator', () => {
  const out = verifyReachabilityConservation(valid());
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.sourceModules, 400);
  assert.deepEqual(out.counts, { srcModules: 400, production: 150, unattendedOperatorOnly: 100, founderInteractiveOnly: 20, unreachable: 130 });
});

test('partitionExact=true cannot hide arithmetic loss', () => {
  const x = valid();
  x.reachability.noEntryPointAtAll = 129;
  const out = verifyReachabilityConservation(x);
  assert.ok(out.reasonCodes.includes('reachability-partition-arithmetic-mismatch'));
  assert.ok(out.reasonCodes.includes('reachability-partition-flag-must-match-arithmetic'));
});

test('partitionExact=false remains an explicit refusal even when arithmetic happens to balance', () => {
  const x = valid();
  x.reachability.partitionExact = false;
  const out = verifyReachabilityConservation(x);
  assert.ok(out.reasonCodes.includes('reachability-partition-must-be-exact'));
  assert.ok(out.reasonCodes.includes('reachability-partition-flag-must-match-arithmetic'));
});

test('readiness source-module count must equal the reachability denominator', () => {
  const x = valid();
  x.repository.sourceModules = 401;
  const out = verifyReachabilityConservation(x);
  assert.ok(out.reasonCodes.includes('readiness-source-modules-must-match-reachability-denominator'));
});

test('string, fractional, negative, and missing counts cannot enter reachability arithmetic', () => {
  for (const [field, value] of [['srcModules','400'],['reachableFromProduction',1.5],['reachableFromUnattendedOperatorScriptsOnly',-1],['reachableFromFounderInteractiveOnly',undefined]]) {
    const x = valid();
    x.reachability[field] = value;
    const out = verifyReachabilityConservation(x);
    const normalized = field === 'reachableFromProduction' ? 'production' : field === 'reachableFromUnattendedOperatorScriptsOnly' ? 'unattendedOperatorOnly' : field === 'reachableFromFounderInteractiveOnly' ? 'founderInteractiveOnly' : 'srcModules';
    assert.ok(out.reasonCodes.includes(`reachability-count-must-be-nonnegative-integer:${normalized}`), `${field}: ${JSON.stringify(out)}`);
  }
});

test('classification detail lists cannot contradict allClassified=true', () => {
  for (const [field, reason] of [['unclassified','reachability-unclassified-list-must-be-empty'],['staleClassifications','reachability-stale-classifications-must-be-empty'],['founderInteractiveClassificationViolations','reachability-founder-classification-violations-must-be-empty']]) {
    const x = valid();
    x.reachability[field] = ['src/ghost.mjs'];
    assert.ok(verifyReachabilityConservation(x).reasonCodes.includes(reason));
  }
});
