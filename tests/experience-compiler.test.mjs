import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeExperience, compileExperiences, realityContact, nonTotalization,
  EXPERIENCE_DIMENSIONS, UNCOPYABLE_REASONS
} from '../src/experience-compiler.mjs';

// The obvious version of this module is a scoring function, and the obvious
// version is the failure: a system that ranks a life by expected value will
// recommend against rest, against play, against the unrepeatable thing that
// produces no measurable gain -- and be internally correct every time. These
// tests are almost entirely about the things the score is not allowed to eat.

const experience = (name, produces, extra = {}) => ({ name, produces, ...extra });

test('an experience whose value is being had is not ranked against ones that pay off', () => {
  const compiled = compileExperiences([
    experience('Language intensive', { learning: 0.9, capability: 0.8, relationships: 0.4 }),
    experience('A day doing nothing in particular', { rest: 0.9, joy: 0.6 }, { presentValue: true })
  ]);
  assert.deepEqual(compiled.ranked.map(row => row.name), ['Language intensive']);
  assert.deepEqual(compiled.beyondComparison.map(row => row.name), ['A day doing nothing in particular']);
  assert.match(compiled.boundary, /RANKING THEM WOULD BE A CATEGORY ERROR/);
});

test('an uncopyable experience is set apart, not given a bonus', () => {
  // A bonus is a number, and a number large enough elsewhere always outvotes
  // it. Being outside the ranking is the only version of this that holds.
  const compiled = compileExperiences([
    experience('Repeatable course', { learning: 1, capability: 1, creativity: 1, novelty: 1, memory: 1, opportunity: 1 }),
    experience('This summer with his grandfather', { relationships: 0.5 }, { uncopyable: 'PERSON_BOUND' })
  ]);
  assert.equal(compiled.ranked.length, 1);
  assert.equal(compiled.beyondComparison[0].uncopyable, 'PERSON_BOUND');
  assert.ok(UNCOPYABLE_REASONS.includes('AGE_BOUND'));
});

test('compound value counts dimensions rather than summing them', () => {
  // A sum erases the difference between a little of six things and a lot of
  // one, which is the difference the compiler exists to surface.
  const compiled = compileExperiences([
    experience('Narrow and deep', { learning: 1 }),
    experience('Broad', { learning: 0.2, relationships: 0.2, novelty: 0.2, memory: 0.2 })
  ]);
  // The magnitudes are deliberately set so the two orderings disagree: summing
  // would put 'Narrow and deep' (1.0) above 'Broad' (0.8). If the fixture let
  // them agree, this test would pass under either rule and prove nothing.
  assert.equal(compiled.ranked[0].name, 'Broad');
  assert.equal(compiled.ranked[0].compound, 4);
  assert.ok(compiled.ranked[0].magnitude < compiled.ranked[1].magnitude,
    'the broader experience must win on dimensions while losing on the sum');
});

test('the module ships no weighting, because a weighting is a claim about what matters', () => {
  const compiled = compileExperiences([experience('X', { joy: 1 })]);
  assert.equal(Object.hasOwn(compiled, 'weights'), false);
  assert.ok(EXPERIENCE_DIMENSIONS.includes('rest'), 'rest must be nameable, not an absence of productivity');
  assert.ok(EXPERIENCE_DIMENSIONS.includes('joy'));
});

test('an unrecognised dimension is dropped rather than silently weighted', () => {
  const { experience: row } = normalizeExperience(experience('X', { learning: 0.5, shareholderValue: 1 }));
  assert.deepEqual(row.dimensionsTouched, ['learning']);
});

test('a magnitude outside 0..1 is dropped rather than clamped into a claim', () => {
  const { experience: row } = normalizeExperience(experience('X', { learning: 4, joy: -1, rest: 0.5 }));
  assert.deepEqual(row.dimensionsTouched, ['rest']);
});

// ---- Reality contact --------------------------------------------------------

test('a reversible probe beats more modelling, whatever the model already says', () => {
  // A system with unlimited reasoning capacity always prefers to reason, which
  // is how it ends up confident about a life nobody has lived.
  const verdict = realityContact({
    question: 'Would I like living there', modelled: true, reversibleProbeAvailable: true, probeCostHours: 40
  });
  assert.equal(verdict.status, 'GO_AND_FIND_OUT');
  assert.equal(verdict.probeCostHours, 40);
});

test('with no probe the model stands as a model, and with neither it is unknown', () => {
  assert.equal(realityContact({ question: 'q', modelled: true }).status, 'MODEL_IS_WHAT_IS_AVAILABLE');
  assert.equal(realityContact({ question: 'q', modelled: false }).status, 'INSUFFICIENT_BASIS');
});

// ---- Non-totalization -------------------------------------------------------

test('an off-limits domain stays unmodelled however useful modelling it would be', () => {
  // A rule that yields once the payoff is high enough is not a rule. The
  // usefulness is recorded precisely so it can be seen not to have won.
  const verdict = nonTotalization({ domain: 'his marriage', declaredOffLimits: true, usefulnessOfModelling: 0.99 });
  assert.equal(verdict.status, 'NOT_MODELLED');
  assert.equal(verdict.usefulnessOfModelling, 0.99);
  assert.match(verdict.law, /HOWEVER_USEFUL_MODELLING_IT_WOULD_BE/);
});

test('a domain not declared off-limits is modellable', () => {
  assert.equal(nonTotalization({ domain: 'career options' }).status, 'MODELLABLE');
});
