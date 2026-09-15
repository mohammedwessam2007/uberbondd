import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DENOMINATOR_STATES, OMEGA_DIMENSIONS, classifyDimension, compileOmegaDenominator
} from '../src/nullstar-omega-denominator.mjs';

const dim = (over = {}) => ({ id: 'N99', name: 'TEST_DIMENSION', modules: ['src/a.mjs'], tests: ['tests/a.test.mjs'], ...over });

test('the denominator carries exactly twenty-four dimensions with unique ids', () => {
  assert.equal(OMEGA_DIMENSIONS.length, 24);
  assert.equal(new Set(OMEGA_DIMENSIONS.map(d => d.id)).size, 24);
  for (const d of OMEGA_DIMENSIONS) assert.match(d.id, /^N\d{2}$/);
});

test('removing a dimension fails the compile', () => {
  // A denominator you can shorten reports a better number every time a hard
  // dimension becomes inconvenient. This is the only guard that stops that.
  const out = compileOmegaDenominator({ fileIndex: new Set(), previousDimensionIds: ['N01', 'N_GONE'] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('dimension-may-not-be-removed:N_GONE'));
});

test('a compile never drops a dimension and every state is canonical', () => {
  const out = compileOmegaDenominator({ fileIndex: new Set(['src/a.mjs']) });
  assert.equal(out.ok, true);
  assert.equal(out.dimensions.length, 24);
  assert.equal(Object.values(out.counts.byState).reduce((a, b) => a + b, 0), 24);
  for (const row of out.dimensions) assert.ok(DENOMINATOR_STATES.includes(row.state));
});

test('the ladder climbs only on evidence of a stronger kind', () => {
  const none = new Set();
  assert.equal(classifyDimension(dim(), none).state, 'ABSENT');
  assert.equal(classifyDimension(dim({ modules: [], tests: [], canonDocs: ['docs/x.md'] }), new Set(['docs/x.md'])).state, 'CANON');
  assert.equal(classifyDimension(dim(), new Set(['src/a.mjs'])).state, 'IMPLEMENTED');
  assert.equal(classifyDimension(dim(), new Set(['src/a.mjs', 'tests/a.test.mjs'])).state, 'VERIFIED');
});

test('a partial module set with tests is PARTIAL, not VERIFIED', () => {
  const two = dim({ modules: ['src/a.mjs', 'src/b.mjs'] });
  assert.equal(classifyDimension(two, new Set(['src/a.mjs', 'tests/a.test.mjs'])).state, 'PARTIAL');
});

test('OPERATING requires a receipt that only a real run produces', () => {
  const d = dim({ runtimeReceipts: ['artifacts/run.json'] });
  // Source and tests alone cannot reach it: the difference between a system
  // that could work and one that has is the receipt.
  assert.equal(classifyDimension(d, new Set(['src/a.mjs', 'tests/a.test.mjs'])).state, 'VERIFIED');
  assert.equal(classifyDimension(d, new Set(['src/a.mjs', 'tests/a.test.mjs', 'artifacts/run.json'])).state, 'OPERATING');
});

test('a calibration rung requires a placement, not just a receipt file', () => {
  // This test used to assert that the presence of artifacts/cal.json was
  // enough to reach the top of the ladder. That is the defect, not the
  // contract: two forecasts about this repository earned the same label a
  // system calibrated against the outside world would carry. A rung now comes
  // from the placement recorded inside the receipt.
  const d = dim({ runtimeReceipts: ['artifacts/run.json'], calibrationReceipts: ['artifacts/cal.json'] });
  const withoutReceipt = new Set(['src/a.mjs', 'tests/a.test.mjs', 'artifacts/run.json']);
  const withReceipt = new Set(['src/a.mjs', 'tests/a.test.mjs', 'artifacts/run.json', 'artifacts/cal.json']);

  assert.equal(classifyDimension(d, withoutReceipt).state, 'OPERATING');
  // The file exists and says nothing, so it lifts nothing.
  assert.equal(classifyDimension(d, withReceipt, () => ({})).state, 'OPERATING');
  // The file exists and names what it earned.
  assert.equal(
    classifyDimension(d, withReceipt, () => ({ calibrationPlacement: { status: 'REPOSITORY_LOCAL_CALIBRATED' } })).state,
    'REPOSITORY_LOCAL_CALIBRATED'
  );
});

test('the compile carries no authority and a zero effect ledger', () => {
  const out = compileOmegaDenominator({ fileIndex: new Set(['src/a.mjs']) });
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.externalEffectLedger.providerCalls, 0);
  assert.match(out.truthBoundary, /NO_STATE_HERE_PROVES_RUNTIME_QUALITY/);
  assert.match(out.immutabilityLaw, /ADDITIVE_ONLY/);
});

test('the digest tracks states, not ordering noise', () => {
  const a = compileOmegaDenominator({ fileIndex: new Set(['src/a.mjs']) });
  const b = compileOmegaDenominator({ fileIndex: new Set(['src/a.mjs']) });
  assert.equal(a.denominatorDigest, b.denominatorDigest);
  const c = compileOmegaDenominator({ fileIndex: new Set(['src/living-self-model.mjs', 'tests/sovereign-coverage-matrix.test.mjs']) });
  assert.notEqual(a.denominatorDigest, c.denominatorDigest);
});

test('a calibration receipt with no placement does not advance past OPERATING', () => {
  // The live defect: `if (calibration.length) state = 'REALITY_CALIBRATED'`
  // awarded the top rung for the existence of a file.
  const dimension = {
    id: 'NXX', name: 'TEST',
    modules: ['src/a.mjs'], tests: ['tests/a.test.mjs'],
    runtimeReceipts: ['artifacts/r.json'],
    calibrationReceipts: ['artifacts/c.json']
  };
  const index = new Set(['src/a.mjs', 'tests/a.test.mjs', 'artifacts/r.json', 'artifacts/c.json']);
  const row = classifyDimension(dimension, index, () => ({}));
  assert.equal(row.state, 'OPERATING');
  assert.equal(row.evidence.calibrationPlacement.rung, null);
  assert.match(row.evidence.calibrationPlacement.note, /Presence of a file is not calibration/);
});

test('the dimension takes exactly the rung the receipt earned, not the top one', () => {
  const dimension = {
    id: 'NXX', name: 'TEST',
    modules: ['src/a.mjs'], tests: ['tests/a.test.mjs'],
    runtimeReceipts: ['artifacts/r.json'],
    calibrationReceipts: ['artifacts/c.json']
  };
  const index = new Set(['src/a.mjs', 'tests/a.test.mjs', 'artifacts/r.json', 'artifacts/c.json']);
  const row = classifyDimension(dimension, index, () => ({
    calibrationPlacement: { status: 'REPOSITORY_LOCAL_CALIBRATED', sample: { scoredForecasts: 2 } }
  }));
  assert.equal(row.state, 'REPOSITORY_LOCAL_CALIBRATED');
  assert.equal(row.evidence.calibrationPlacement.sample.scoredForecasts, 2);
});

test('an unmeasured or simulated placement cannot lift a dimension', () => {
  const dimension = {
    id: 'NXX', name: 'TEST',
    modules: ['src/a.mjs'], tests: ['tests/a.test.mjs'],
    runtimeReceipts: ['artifacts/r.json'],
    calibrationReceipts: ['artifacts/c.json']
  };
  const index = new Set(['src/a.mjs', 'tests/a.test.mjs', 'artifacts/r.json', 'artifacts/c.json']);
  for (const status of ['UNMEASURED', 'INTERNAL_SIMULATED']) {
    const row = classifyDimension(dimension, index, () => ({ calibrationPlacement: { status } }));
    assert.equal(row.state, 'OPERATING', `${status} must not advance the dimension`);
  }
});

test('a placement naming a state outside the ladder is ignored rather than trusted', () => {
  const dimension = {
    id: 'NXX', name: 'TEST',
    modules: ['src/a.mjs'], tests: ['tests/a.test.mjs'],
    runtimeReceipts: ['artifacts/r.json'],
    calibrationReceipts: ['artifacts/c.json']
  };
  const index = new Set(['src/a.mjs', 'tests/a.test.mjs', 'artifacts/r.json', 'artifacts/c.json']);
  const row = classifyDimension(dimension, index, () => ({
    calibrationPlacement: { status: 'TOTALLY_CALIBRATED_TRUST_ME' }
  }));
  assert.equal(row.state, 'OPERATING');
});

test('REALITY_CALIBRATED is no longer a state anything can reach', () => {
  assert.ok(!DENOMINATOR_STATES.includes('REALITY_CALIBRATED'));
  assert.ok(DENOMINATOR_STATES.includes('REPOSITORY_LOCAL_CALIBRATED'));
  assert.ok(DENOMINATOR_STATES.includes('EXTERNALLY_CALIBRATED'));
});
