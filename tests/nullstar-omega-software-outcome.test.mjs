import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSoftwareOutcome } from '../src/nullstar-omega-software-outcome.mjs';

const modules = (count, touchedCount) => Array.from({ length: count }, (_, i) => ({
  path: `src/m${i}.mjs`,
  introducedIn: 'a'.repeat(40),
  touchedByLater: i < touchedCount ? ['b'.repeat(40)] : []
}));

const score = (count, touchedCount) => scoreSoftwareOutcome({
  introduced: modules(count, touchedCount),
  branchBase: 'a'.repeat(40),
  head: 'c'.repeat(40)
});

test('a module untouched after introduction was right the first time', () => {
  const result = score(10, 0);
  assert.equal(result.score, 1);
  assert.equal(result.untouchedAfterIntroduction, 10);
});

test('a module edited later counts against the score', () => {
  const result = score(10, 4);
  assert.equal(result.score, 0.6);
  assert.equal(result.touchedAfterIntroduction, 4);
  assert.equal(result.touchedModules.length, 4);
});

test('a denominator under five is refused rather than reported', () => {
  const result = score(4, 0);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('denominator-too-small-to-score:need-at-least-five-modules'));
  assert.equal(result.modulesSupplied, 4);
});

test('no modules is not a perfect score', () => {
  const result = scoreSoftwareOutcome({ introduced: [], branchBase: 'a', head: 'b' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('at-least-one-introduced-module-required'));
});

test('the count supplied is reported back, so a narrowed denominator is visible', () => {
  const result = score(6, 3);
  assert.equal(result.modules, 6);
  assert.equal(result.score, 0.5);
});

test('scoring this dimension needs no model provider', () => {
  const result = score(9, 3);
  assert.equal(result.providerRequired, false);
  assert.match(result.truthBoundary, /FLOOR ON FIRST-ATTEMPT CORRECTNESS/);
});

test('the base and head must be named or nothing is scored', () => {
  const result = scoreSoftwareOutcome({ introduced: modules(9, 0), head: 'c' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('branch-base-required'));
});
