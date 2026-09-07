import test from 'node:test';
import assert from 'node:assert/strict';
import {
  branch, evaluateDecision, inventoryBreadth, crossFutureValue,
  LIFE_DIMENSIONS, CLOSURE_KINDS, REACHABILITY
} from '../src/life-possibility-engine.mjs';

// The dangerous failure is not closing futures by accident. It is the fix:
// turn optionality into a number, maximise it, and the engine argues against
// every commitment whose whole point is closing branches on purpose.

const b = (name, dimension, extra = {}) =>
  branch({ name, dimension, reachability: 'REACHABLE_NOW', valued: true, ...extra }).branch;

test('a branch that names its own dimension freely is refused', () => {
  const invented = branch({ name: 'become a person who travels', dimension: 'WANDERING', reachability: 'REACHABLE_NOW' });
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.reasonCodes, ['known-life-dimension-required']);
  assert.match(invented.note, /manufacture breadth by renaming itself/);
  assert.ok(invented.known.includes('GEOGRAPHIC_FREEDOM'));
});

test('a branch with no reachability is refused, because existing is not reaching', () => {
  const floating = branch({ name: 'run a lab', dimension: 'CAREER' });
  assert.equal(floating.ok, false);
  assert.deepEqual(floating.reasonCodes, ['known-reachability-required']);
});

test('a closed branch with no stated kind cannot be counted', () => {
  const evaluated = evaluateDecision({
    decision: 'take the hospital post',
    closes: [{ branch: b('move to Berlin', 'GEOGRAPHIC_FREEDOM') }]
  });
  assert.equal(evaluated.ok, false);
  assert.deepEqual(evaluated.reasonCodes, ['closure-kind-required']);
  assert.match(evaluated.note, /a deliberate commitment is not a loss/);
});

test('a deliberate commitment that names no exchange is not deliberate', () => {
  // Otherwise "DELIBERATE_COMMITMENT" is a free label that launders any loss.
  const evaluated = evaluateDecision({
    decision: 'marry',
    closes: [{ branch: b('every other partnership', 'RELATIONSHIPS'), kind: 'DELIBERATE_COMMITMENT' }]
  });
  assert.equal(evaluated.ok, false);
  assert.deepEqual(evaluated.reasonCodes, ['deliberate-closure-requires-exchange']);
  assert.match(evaluated.note, /wearing a better word/);
});

test('a deliberate closure is a purchase and is not reported as loss', () => {
  const evaluated = evaluateDecision({
    decision: 'commit to surgery training',
    opens: [b('operate independently', 'CAREER')],
    closes: [
      { branch: b('three other specialties', 'CAREER'), kind: 'DELIBERATE_COMMITMENT', inExchangeFor: 'depth in one craft' },
      { branch: b('a year of travel', 'EXPERIENCE'), kind: 'UNNECESSARY_CLOSURE' }
    ]
  });
  assert.equal(evaluated.ok, true);
  assert.deepEqual(evaluated.unnecessarilyClosed.map(row => row.branch), ['a year of travel']);
  assert.deepEqual(evaluated.deliberatelyClosed.map(row => row.branch), ['three other specialties']);
  assert.equal(evaluated.deliberatelyClosed[0].inExchangeFor, 'depth in one craft');
});

test('no single optionality score is emitted for a caller to maximise', () => {
  const evaluated = evaluateDecision({
    decision: 'commit',
    opens: [b('a', 'CAREER')],
    closes: [{ branch: b('b', 'CAREER'), kind: 'DELIBERATE_COMMITMENT', inExchangeFor: 'depth' }]
  });
  assert.equal(evaluated.ok, true);
  // The absence is the invariant. A net number here is the number that argues
  // against every deliberate commitment.
  for (const key of ['score', 'optionality', 'optionalityScore', 'net', 'netFutures']) {
    assert.equal(evaluated[key], undefined, `evaluateDecision must not emit ${key}`);
  }
  assert.match(evaluated.scoreWithheld, /ARGUES_AGAINST_EVERY_DELIBERATE_COMMITMENT/);
});

test('a decision never reaches beyond recommendation', () => {
  const evaluated = evaluateDecision({ decision: 'anything' });
  assert.equal(evaluated.authorityBoundary, 'RECOMMENDATION__MOHAMED_CHOOSES');
  assert.equal(evaluated.businessEffectAuthority, 'NONE');
});

test('forty branches in one dimension is one dimension, not a wide life', () => {
  const careers = Array.from({ length: 8 }, (_, i) => b(`career ${i}`, 'CAREER'));
  const compiled = inventoryBreadth([...careers, b('learn Japanese', 'LANGUAGE')]);
  assert.equal(compiled.valuedBranchCount, 9);
  assert.equal(compiled.dimensionsRepresented, 2);
  assert.equal(compiled.concentrated, true);
  assert.equal(compiled.status, 'INVENTORY_CONCENTRATED');
  assert.equal(compiled.dominantDimension.dimension, 'CAREER');
  assert.match(compiled.law, /BREADTH_IS_DIMENSIONS_REPRESENTED__NOT_BRANCH_COUNT/);
});

test('a spread inventory is not flagged as concentrated', () => {
  const compiled = inventoryBreadth([
    b('a', 'CAREER'), b('b', 'LANGUAGE'), b('c', 'RELATIONSHIPS'), b('d', 'CREATIVE')
  ]);
  assert.equal(compiled.concentrated, false);
  assert.equal(compiled.dimensionsRepresented, 4);
});

test('unvalued branches do not pad the inventory', () => {
  const compiled = inventoryBreadth([
    b('wanted', 'CAREER'),
    branch({ name: 'not wanted', dimension: 'WEALTH', reachability: 'REACHABLE_NOW', valued: false }).branch
  ]);
  assert.equal(compiled.valuedBranchCount, 1);
  assert.equal(compiled.dimensionsRepresented, 1);
});

test('a prerequisite inside one dimension is a fact about that dimension', () => {
  const compiled = crossFutureValue([
    b('surgeon', 'CAREER', { requires: ['medical licence'] }),
    b('physician', 'CAREER', { requires: ['medical licence'] }),
    b('researcher', 'CAREER', { requires: ['medical licence'] })
  ]);
  assert.deepEqual(compiled.highValue, []);
  assert.equal(compiled.singleDimensionOnly[0].requirement, 'medical licence');
  assert.equal(compiled.singleDimensionOnly[0].dimensionsSpanned, 1);
  assert.match(compiled.law, /FACT_ABOUT_THAT_DIMENSION/);
});

test('a prerequisite crossing dimensions is cross-future value', () => {
  const compiled = crossFutureValue([
    b('work abroad', 'CAREER', { requires: ['conversational German'] }),
    b('live in Vienna', 'GEOGRAPHIC_FREEDOM', { requires: ['conversational German'] }),
    b('read the primary sources', 'KNOWLEDGE', { requires: ['conversational German'] }),
    b('one thing', 'WEALTH', { requires: ['capital'] })
  ]);
  assert.deepEqual(compiled.highValue.map(row => row.requirement), ['conversational German']);
  assert.equal(compiled.highValue[0].dimensionsSpanned, 3);
  assert.deepEqual(compiled.highValue[0].dimensions, ['CAREER', 'GEOGRAPHIC_FREEDOM', 'KNOWLEDGE']);
  assert.deepEqual(compiled.singleDimensionOnly.map(row => row.requirement), ['capital']);
});

test('the cross-future threshold cannot be lowered to one dimension', () => {
  // Threshold 1 would make every requirement "cross-future" and delete the rule.
  const compiled = crossFutureValue([b('a', 'CAREER', { requires: ['x'] })], { minimumDimensions: 1 });
  assert.equal(compiled.ok, false);
  assert.deepEqual(compiled.reasonCodes, ['minimum-dimensions-between-2-and-dimension-count']);
});

test('vocabularies are closed and frozen', () => {
  assert.equal(Object.isFrozen(LIFE_DIMENSIONS), true);
  assert.equal(Object.isFrozen(CLOSURE_KINDS), true);
  assert.equal(Object.isFrozen(REACHABILITY), true);
  assert.ok(CLOSURE_KINDS.includes('UNNECESSARY_CLOSURE'));
});
