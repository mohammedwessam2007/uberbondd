import test from 'node:test';
import assert from 'node:assert/strict';
import {
  observe, applyToPresent, longRangeThemes, recordTransformation,
  CLAIM_TENSES, TRANSFORMATION_KINDS
} from '../src/temporal-civilization.mjs';

// Collapse: an observation from 22 quoted as a fact about the person today. It
// was true, it was well evidenced, and it is now a claim about someone who no
// longer exists in that form. Severance: the overcorrection that loses the
// theme surfacing at 18, again at 27, again at 41.

const o = (statement, atAge, theme = null) => observe({ statement, atAge, theme }).observation;

test('an undated observation is refused', () => {
  const floating = observe({ statement: 'dislikes large groups' });
  assert.equal(floating.ok, false);
  assert.deepEqual(floating.reasonCodes, ['era-required']);
  assert.match(floating.note, /told apart from a present one/);
});

test('observed once at one age is a fact about that age', () => {
  const applied = applyToPresent({
    statement: 'dislikes large groups',
    observations: [o('dislikes large groups', 22)],
    presentAge: 34
  });
  assert.equal(applied.status, 'CLAIM_IS_ABOUT_THAT_ERA');
  assert.equal(applied.tense, 'STALE_UNTESTED');
  assert.equal(applied.yearsSinceLastObserved, 12);
  assert.equal(applied.requiredToApply, 'RE_OBSERVE_IN_THE_CURRENT_ERA');
  assert.match(applied.law, /STRENGTH_OF_EVIDENCE_DOES_NOT_MAKE_IT_PRESENT_TENSE/);
});

test('persistence across eras earns the present tense', () => {
  const applied = applyToPresent({
    statement: 'dislikes large groups',
    observations: [o('dislikes large groups', 22), o('dislikes large groups', 31)],
    presentAge: 34
  });
  assert.equal(applied.status, 'MAY_BE_APPLIED_TO_PRESENT');
  assert.equal(applied.tense, 'PERSISTS_ACROSS_ERAS');
  assert.deepEqual(applied.observedAtAges, [22, 31]);
});

test('repeating the same observation within one era does not create persistence', () => {
  const applied = applyToPresent({
    statement: 'x',
    observations: [o('x', 22), o('x', 22), o('x', 22)],
    presentAge: 30
  });
  assert.equal(applied.erasSpanned, 1);
  assert.equal(applied.status, 'CLAIM_IS_ABOUT_THAT_ERA');
});

test('an observation from the current era is about that era, not stale', () => {
  const applied = applyToPresent({ statement: 'x', observations: [o('x', 34)], presentAge: 34 });
  assert.equal(applied.tense, 'ABOUT_THAT_ERA');
  assert.equal(applied.yearsSinceLastObserved, 0);
});

test('a statement no observation supports cannot be applied at all', () => {
  const unsupported = applyToPresent({ statement: 'invented', observations: [o('other', 20)], presentAge: 30 });
  assert.equal(unsupported.ok, false);
  assert.deepEqual(unsupported.reasonCodes, ['no-observation-supports-this-statement']);
});

test('a theme inside one era is a period of interest, not a thread through a life', () => {
  const themes = longRangeThemes([
    o('read three books on it', 19, 'astronomy'),
    o('took a course', 19, 'astronomy'),
    o('joined a club', 19, 'astronomy')
  ]);
  assert.deepEqual(themes.recurring, []);
  assert.equal(themes.singleEraOnly[0].theme, 'astronomy');
  assert.match(themes.law, /NOT_A_THREAD_THROUGH_A_LIFE/);
});

test('a theme surfacing across decades is the object worth keeping the archive for', () => {
  const themes = longRangeThemes([
    o('built a telescope', 18, 'astronomy'),
    o('went back to it', 27, 'astronomy'),
    o('still returning to it', 41, 'astronomy'),
    o('one passing interest', 30, 'sailing')
  ]);
  assert.deepEqual(themes.recurring.map(row => row.theme), ['astronomy']);
  assert.equal(themes.recurring[0].erasSpanned, 3);
  assert.equal(themes.recurring[0].span, 23);
  assert.deepEqual(themes.singleEraOnly.map(row => row.theme), ['sailing']);
});

test('recurrence is a pattern in the record, not a fixed trait', () => {
  const themes = longRangeThemes([o('a', 18, 't'), o('b', 30, 't')]);
  assert.match(themes.interpretationBoundary, /NOT_EVIDENCE_OF_A_FIXED_TRAIT_OR_A_DESTINY/);
});

test('the theme threshold cannot be lowered to one era', () => {
  const collapsed = longRangeThemes([o('a', 18, 't')], { minimumEras: 1 });
  assert.equal(collapsed.ok, false);
  assert.deepEqual(collapsed.reasonCodes, ['minimum-eras-between-2-and-20-required']);
});

test('a change nobody understands is recorded as unexplained', () => {
  const recorded = recordTransformation({
    fromAge: 24, toAge: 29, kind: 'UNEXPLAINED', description: 'stopped caring about it and cannot say why'
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.transformation.kind, 'UNEXPLAINED');
  assert.equal(recorded.transformation.years, 5);
  assert.match(recorded.law, /NOT_FITTED_TO_THE_NEAREST_CAUSE/);
  assert.ok(TRANSFORMATION_KINDS.includes('UNEXPLAINED'));
});

test('a transformation running backwards is refused', () => {
  const backwards = recordTransformation({ fromAge: 30, toAge: 24, kind: 'VALUE_CHANGED', description: 'x' });
  assert.equal(backwards.ok, false);
  assert.deepEqual(backwards.reasonCodes, ['later-era-must-follow-earlier']);
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(CLAIM_TENSES), true);
  assert.equal(Object.isFrozen(TRANSFORMATION_KINDS), true);
  assert.equal(longRangeThemes([]).businessEffectAuthority, 'NONE');
  assert.equal(observe({ statement: 'x', atAge: 20 }).businessEffectAuthority, 'NONE');
});
