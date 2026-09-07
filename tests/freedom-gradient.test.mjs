import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gateOption, freedomGradient, agencyGeometry,
  FREEDOM_GATES, DISQUALIFYING_GATES
} from '../src/freedom-gradient.mjs';

// A thousand options nobody can perceive, afford, reverse or endorse is not a
// thousand freedoms. It is a catalogue.

const allPass = Object.fromEntries(FREEDOM_GATES.map(gate => [gate, true]));
const opt = (name, overrides = {}) => gateOption({ name, gates: { ...allPass, ...overrides } }).option;

test('an unanswered gate is not a pass', () => {
  const partial = gateOption({ name: 'x', gates: { PERCEIVED: true, UNDERSTOOD: true } });
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.reasonCodes, ['every-gate-must-be-answered']);
  assert.ok(partial.unanswered.includes('SELF_ENDORSED'));
  assert.match(partial.note, /cheapest way to manufacture freedom/);
});

test('an option passing every gate is effectively free', () => {
  const gated = gateOption({ name: 'move city', gates: allPass });
  assert.equal(gated.option.effectivelyFree, true);
  assert.deepEqual(gated.option.failedAt, []);
});

test('coercion disqualifies however many other gates pass', () => {
  const coerced = gateOption({ name: 'take the job', gates: { ...allPass, UNCOERCED: false } });
  assert.equal(coerced.option.effectivelyFree, false);
  assert.deepEqual(coerced.option.disqualified, ['UNCOERCED']);
  assert.match(coerced.disqualifierLaw, /FIVE_PASSING_GATES_DO_NOT_OUTVOTE_THEM/);
});

test('an unendorsed option is not this person\'s freedom', () => {
  const unwanted = gateOption({ name: 'the sensible path', gates: { ...allPass, SELF_ENDORSED: false } });
  assert.equal(unwanted.option.effectivelyFree, false);
  assert.deepEqual(unwanted.option.disqualified, ['SELF_ENDORSED']);
  assert.deepEqual(DISQUALIFYING_GATES, ['UNCOERCED', 'SELF_ENDORSED']);
});

test('one fully passing option outranks a thousand nominal ones', () => {
  const thousand = Array.from({ length: 1000 }, (_, i) => opt(`nominal ${i}`, { PERCEIVED: false }));
  const one = opt('the real one');
  const gradient = freedomGradient([...thousand, one]);
  assert.equal(gradient.nominalOptions, 1001);
  assert.equal(gradient.effectivelyFree, 1);
  assert.deepEqual(gradient.effectivelyFreeOptions, ['the real one']);
  assert.match(gradient.law, /MORE_EFFECTIVE_FREEDOM_THAN_A_THOUSAND_NOMINAL_ONES/);
});

test('the finding is which gate narrows, not how many survived', () => {
  const gradient = freedomGradient([
    opt('a', { RESOURCED: false }),
    opt('b', { RESOURCED: false }),
    opt('c', { RESOURCED: false }),
    opt('d', { PERCEIVED: false })
  ]);
  assert.equal(gradient.narrowestGate.gate, 'RESOURCED');
  assert.equal(gradient.narrowestGate.optionsLost, 3);
  assert.match(gradient.reading, /WHICH_GATE_NARROWS__NOT_HOW_MANY_SURVIVED/);
});

test('an option is attributed to the first gate it failed', () => {
  // Something lost at perception was never really tested against the later
  // gates, so counting it against resourcing would misplace the constraint.
  const gradient = freedomGradient([opt('a', { PERCEIVED: false, RESOURCED: false })]);
  assert.equal(gradient.lostAt.PERCEIVED, 1);
  assert.equal(gradient.lostAt.RESOURCED, 0);
});

test('nominal and effective counts are returned together', () => {
  const gradient = freedomGradient([opt('a'), opt('b', { REVERSIBLE: false })]);
  assert.equal(gradient.nominalOptions, 2);
  assert.equal(gradient.effectivelyFree, 1);
});

test('more options while fewer are possible is caught as divergence', () => {
  const before = freedomGradient([opt('a'), opt('b')]);
  const after = freedomGradient([
    opt('a', { RESOURCED: false }), opt('b', { RESOURCED: false }),
    opt('c', { RESOURCED: false }), opt('d')
  ]);
  const geometry = agencyGeometry({ before, after });
  assert.equal(geometry.divergent, true);
  assert.equal(geometry.status, 'AGENCY_DIVERGENCE');
  assert.equal(geometry.nominalDelta, 2);
  assert.equal(geometry.effectiveDelta, -1);
  assert.match(geometry.reading, /FEWER_BECAME_GENUINELY_POSSIBLE/);
  assert.match(geometry.law, /A_RISING_OPTION_COUNT_IS_NOT_EVIDENCE_OF_RISING_FREEDOM/);
});

test('geometry reports which gate moved', () => {
  const before = freedomGradient([opt('a')]);
  const after = freedomGradient([opt('a', { UNDERSTOOD: false })]);
  const geometry = agencyGeometry({ before, after });
  assert.equal(geometry.lostAtDelta.UNDERSTOOD, 1);
  assert.equal(geometry.reading, 'EFFECTIVE_FREEDOM_FELL');
});

test('geometry needs two compiled gradients, not raw arrays', () => {
  assert.equal(agencyGeometry({ before: [], after: [] }).ok, false);
  assert.deepEqual(agencyGeometry({}).reasonCodes, ['two-compiled-gradients-required']);
});

test('rising effective freedom is reported plainly', () => {
  const before = freedomGradient([opt('a', { RESOURCED: false })]);
  const after = freedomGradient([opt('a')]);
  const geometry = agencyGeometry({ before, after });
  assert.equal(geometry.divergent, false);
  assert.equal(geometry.reading, 'EFFECTIVE_FREEDOM_ROSE');
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(FREEDOM_GATES), true);
  assert.equal(Object.isFrozen(DISQUALIFYING_GATES), true);
  assert.equal(FREEDOM_GATES.length, 7);
  assert.equal(freedomGradient([]).businessEffectAuthority, 'NONE');
  assert.equal(gateOption({ name: 'x', gates: allPass }).businessEffectAuthority, 'NONE');
});
