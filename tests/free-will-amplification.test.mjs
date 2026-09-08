import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCycle, amplificationTrend, LOOP_STAGES, REALITY_STAGES, RESOLUTION_DIMENSIONS
} from '../src/free-will-amplification.mjs';

// A system that hands someone forty options they understand no better than the
// four they had has amplified nothing. It has added noise, and it will score
// well, because option count went up and option count is a number.

const full = { ...Object.fromEntries(LOOP_STAGES.map(s => [s, true])) };
const cycle = (deltas, extra = {}) => scoreCycle({
  subject: 'a decision', stagesCompleted: LOOP_STAGES, realityContact: 'tried it for a month',
  deltas, ...extra
});

test('an unreported delta is refused rather than defaulted', () => {
  const partial = scoreCycle({
    subject: 'x', stagesCompleted: LOOP_STAGES, realityContact: 'y',
    deltas: { UNDERSTANDING: 1, CAPABILITY: 0 }
  });
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.reasonCodes, ['every-resolution-delta-required']);
  assert.equal(partial.missing, 'OPTION_COUNT');
  assert.match(partial.note, /defaults to a claim/);
});

test('more options with a flat chooser is noise, not amplification', () => {
  const scored = cycle({ UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 36 });
  assert.equal(scored.status, 'NOISE_NOT_AMPLIFICATION');
  assert.equal(scored.amplified, false);
  assert.match(scored.note, /no better basis for choosing/);
  assert.match(scored.law, /NOT_A_LONGER_MENU/);
});

test('understanding moving is amplification even with no new options', () => {
  const scored = cycle({ UNDERSTANDING: 2, CAPABILITY: 0, OPTION_COUNT: 0 });
  assert.equal(scored.status, 'AMPLIFIED');
  assert.equal(scored.amplified, true);
});

test('capability moving is amplification too', () => {
  const scored = cycle({ UNDERSTANDING: 0, CAPABILITY: 1, OPTION_COUNT: -3 });
  assert.equal(scored.amplified, true);
});

test('nothing moving is no change, not noise', () => {
  const scored = cycle({ UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 0 });
  assert.equal(scored.status, 'NO_CHANGE');
  assert.equal(scored.amplified, false);
});

test('a cycle that did not close is not a cycle', () => {
  const scored = scoreCycle({
    subject: 'x', stagesCompleted: ['WILL', 'INTELLIGENCE', 'UNDERSTANDING'],
    realityContact: 'y', deltas: { UNDERSTANDING: 5, CAPABILITY: 5, OPTION_COUNT: 5 }
  });
  assert.equal(scored.status, 'CYCLE_INCOMPLETE');
  assert.equal(scored.amplified, false);
  assert.deepEqual(scored.missingStages, ['CAPABILITY', 'EXPERIENCE', 'TRANSFORMATION']);
  assert.match(scored.law, /IS_NOT_A_CYCLE/);
});

test('a cycle that never touched reality would be self-certifying', () => {
  const scored = scoreCycle({
    subject: 'x', stagesCompleted: LOOP_STAGES,
    deltas: { UNDERSTANDING: 9, CAPABILITY: 9, OPTION_COUNT: 9 }
  });
  assert.equal(scored.status, 'CYCLE_UNGROUNDED');
  assert.equal(scored.amplified, false);
  assert.deepEqual(scored.requiredStages, REALITY_STAGES);
  assert.match(scored.law, /SELF_CERTIFYING/);
});

test('a loop turning with no amplification is reported as spinning', () => {
  const trend = amplificationTrend([
    cycle({ UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 5 }),
    cycle({ UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 7 }),
    cycle({ UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 4 })
  ]);
  assert.equal(trend.spinning, true);
  assert.equal(trend.status, 'LOOP_SPINNING_WITHOUT_AMPLIFICATION');
  assert.equal(trend.noise, 3);
  assert.match(trend.law, /CONSUMING_THE_LIFE_IT_WAS_MEANT_TO_WIDEN/);
});

test('a growing menu with a flat chooser is named separately', () => {
  const trend = amplificationTrend([
    cycle({ UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 12 }),
    cycle({ UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 8 })
  ]);
  assert.equal(trend.menuGrowingWithoutChooser, true);
  assert.equal(trend.totalOptionGain, 20);
  assert.equal(trend.totalResolutionGain, 0);
});

test('genuine amplification is not reported as spinning', () => {
  const trend = amplificationTrend([
    cycle({ UNDERSTANDING: 1, CAPABILITY: 0, OPTION_COUNT: 0 }),
    cycle({ UNDERSTANDING: 0, CAPABILITY: 0, OPTION_COUNT: 3 }),
    cycle({ UNDERSTANDING: 2, CAPABILITY: 1, OPTION_COUNT: 0 })
  ]);
  assert.equal(trend.spinning, false);
  assert.equal(trend.amplifying, 2);
  assert.equal(trend.totalResolutionGain, 4);
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(LOOP_STAGES), true);
  assert.equal(Object.isFrozen(REALITY_STAGES), true);
  assert.equal(Object.isFrozen(RESOLUTION_DIMENSIONS), true);
  assert.equal(cycle({ UNDERSTANDING: 1, CAPABILITY: 0, OPTION_COUNT: 0 }).businessEffectAuthority, 'NONE');
});
