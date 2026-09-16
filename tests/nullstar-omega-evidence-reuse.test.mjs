import test from 'node:test';
import assert from 'node:assert/strict';
import { admitDimensionEvidence } from '../src/nullstar-omega-evidence-reuse.mjs';

test('dimensions reading different observations are all admitted', () => {
  const result = admitDimensionEvidence({
    claims: [
      { dimension: 'calibration', evidenceKeys: ['loop:a', 'loop:b'] },
      { dimension: 'software', evidenceKeys: ['git:m1', 'git:m2'] }
    ]
  });
  assert.equal(result.status, 'ALL_DIMENSIONS_ADMITTED');
  assert.equal(result.distinctObservations, 4);
  assert.deepEqual(result.refusedDimensions, []);
});

test('a dimension re-slicing evidence already spoken for is refused', () => {
  const result = admitDimensionEvidence({
    claims: [
      { dimension: 'calibration', evidenceKeys: ['loop:a', 'loop:b', 'loop:c'] },
      { dimension: 'forecasting', evidenceKeys: ['loop:a', 'loop:b', 'loop:c'] }
    ]
  });
  assert.equal(result.status, 'SOME_DIMENSIONS_REFUSED_AS_EVIDENCE_REUSE');
  assert.deepEqual(result.refusedDimensions, ['forecasting']);
  assert.equal(result.refused[0].overlapRatio, 1);
  assert.deepEqual(result.refused[0].alreadyScoring, ['calibration']);
});

test('touching one shared observation among many is allowed', () => {
  const result = admitDimensionEvidence({
    claims: [
      { dimension: 'calibration', evidenceKeys: ['loop:a', 'loop:b'] },
      { dimension: 'causality', evidenceKeys: ['loop:a', 'ep:1', 'ep:2', 'ep:3'] }
    ]
  });
  assert.equal(result.status, 'ALL_DIMENSIONS_ADMITTED');
  assert.equal(result.admitted[1].overlapRatio, 0.25);
});

test('exactly half overlapping is admitted; more than half is not', () => {
  const half = admitDimensionEvidence({
    claims: [
      { dimension: 'a', evidenceKeys: ['x', 'y'] },
      { dimension: 'b', evidenceKeys: ['x', 'z'] }
    ]
  });
  assert.deepEqual(half.refusedDimensions, []);

  const more = admitDimensionEvidence({
    claims: [
      { dimension: 'a', evidenceKeys: ['x', 'y'] },
      { dimension: 'b', evidenceKeys: ['x', 'y', 'z'] }
    ]
  });
  assert.deepEqual(more.refusedDimensions, ['b']);
});

test('a dimension naming no observations is refused, not admitted for free', () => {
  const result = admitDimensionEvidence({
    claims: [
      { dimension: 'calibration', evidenceKeys: ['loop:a'] },
      { dimension: 'invention', evidenceKeys: [] }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('every-dimension-must-name-the-observations-it-is-scored-from'));
  assert.deepEqual(result.missingKeys, ['invention']);
});

test('the same dimension may not be claimed twice', () => {
  const result = admitDimensionEvidence({
    claims: [
      { dimension: 'calibration', evidenceKeys: ['a'] },
      { dimension: 'calibration', evidenceKeys: ['b'] }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('a-dimension-may-be-claimed-once'));
});

test('settlement order is reported, because first claim keeps the observation', () => {
  const result = admitDimensionEvidence({
    claims: [
      { dimension: 'first', evidenceKeys: ['shared', 'own1'] },
      { dimension: 'second', evidenceKeys: ['shared', 'own2'] }
    ]
  });
  assert.deepEqual(result.settlementOrder, ['first', 'second']);
  assert.equal(result.admitted[1].overlappingCount, 1);
});

test('a stricter ratio refuses what the default allows', () => {
  const claims = [
    { dimension: 'a', evidenceKeys: ['x', 'y'] },
    { dimension: 'b', evidenceKeys: ['x', 'z'] }
  ];
  assert.deepEqual(admitDimensionEvidence({ claims }).refusedDimensions, []);
  assert.deepEqual(admitDimensionEvidence({ claims, maxOverlapRatio: 0.1 }).refusedDimensions, ['b']);
});
