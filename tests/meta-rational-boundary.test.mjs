import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectMethod, shouldContinueReasoning, independentAgreement,
  TERMINAL_EPISTEMIC_STATES, REASONING_METHODS, IRREDUCIBLE_QUESTION_KINDS
} from '../src/meta-rational-boundary.mjs';

// Four of the five terminal states are refusals, which is the point: a system
// that can only produce answers will produce one when it has nothing, and that
// answer is shaped exactly like a good one.

test('all five terminal refusal states are reachable', () => {
  for (const state of [
    'NO_MODEL_CURRENTLY_DESERVES_TRUST',
    'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED',
    'UNKNOWN__MORE_EVIDENCE_REQUIRED',
    'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT',
    'ENOUGH__EXPECTED_VALUE_OF_MORE_REASONING_IS_LOWER_THAN_DELAY_AND_COGNITION_COST'
  ]) {
    assert.ok(TERMINAL_EPISTEMIC_STATES.includes(state), `${state} must exist as a reachable state`);
  }
});

test('a value question is not answered by more data, however much arrives', () => {
  // "Would this life be worth living" is not underdetermined by evidence. It is
  // not the kind of thing evidence answers, and piling on reference classes
  // yields a well-supported answer to "do people like it", about other people.
  const verdict = selectMethod({
    question: 'Is a quieter life worth the lost income',
    settles: 'WHAT_MATTERS',
    availableData: ['income-panel', 'life-satisfaction-survey', 'longitudinal-self-report']
  });
  assert.equal(verdict.state, 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED');
  assert.equal(verdict.method, null);
});

test('a subjective-response question routes to reality, not to a model', () => {
  const verdict = selectMethod({
    question: 'Would I like living in Lisbon',
    settles: 'SUBJECTIVE_RESPONSE',
    availableData: ['climate', 'cost-of-living', 'expat-forums']
  });
  assert.equal(verdict.state, 'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT');
});

test('the irreducible check runs before evidence, not after it', () => {
  // Otherwise abundant data silently converts a value question into a
  // statistical one and the boundary is crossed without anyone deciding to.
  const withData = selectMethod({ question: 'q', settles: 'WHAT_MATTERS', availableData: Array(50).fill('dataset') });
  const withoutData = selectMethod({ question: 'q', settles: 'WHAT_MATTERS', availableData: [] });
  assert.equal(withData.state, withoutData.state);
});

test('a method that needs data and has none yields UNKNOWN, not a guess', () => {
  const verdict = selectMethod({ question: 'How often does this work', settles: 'FREQUENCY', availableData: [] });
  assert.equal(verdict.state, 'UNKNOWN__MORE_EVIDENCE_REQUIRED');
  assert.equal(verdict.method, null);
});

test('a question no method settles says so rather than picking the nearest method', () => {
  const verdict = selectMethod({ question: 'x', settles: 'WHETHER_IT_IS_CONSCIOUS', availableData: ['a'] });
  assert.equal(verdict.state, 'NO_MODEL_CURRENTLY_DESERVES_TRUST');
});

test('an answerable question selects a method that settles that kind', () => {
  const verdict = selectMethod({ question: 'How often does this work', settles: 'FREQUENCY', availableData: ['panel'] });
  assert.equal(verdict.state, 'ANSWERABLE');
  assert.equal(REASONING_METHODS[verdict.method].settles, 'FREQUENCY');
});

test('every irreducible kind maps to a refusal, never to ANSWERABLE', () => {
  for (const [kind, state] of Object.entries(IRREDUCIBLE_QUESTION_KINDS)) {
    assert.notEqual(state, 'ANSWERABLE', `${kind} must not be answerable by cognition`);
    assert.ok(TERMINAL_EPISTEMIC_STATES.includes(state));
  }
});

// ---- Knowing when to stop ---------------------------------------------------

test('reasoning stops when it costs more than it improves', () => {
  // The state most often missing from systems like this, and its absence is
  // why they consume the life they were built to improve.
  const stop = shouldContinueReasoning({ expectedImprovement: 1, cognitionCost: 3, delayCost: 5, optionDecay: 2 });
  assert.equal(stop.status, 'STOP');
  assert.equal(stop.state, 'ENOUGH__EXPECTED_VALUE_OF_MORE_REASONING_IS_LOWER_THAN_DELAY_AND_COGNITION_COST');
});

test('reasoning continues when the improvement genuinely exceeds the cost', () => {
  assert.equal(shouldContinueReasoning({ expectedImprovement: 20, cognitionCost: 2, delayCost: 1 }).status, 'CONTINUE');
});

test('delay and option decay count as costs, not as free caution', () => {
  const free = shouldContinueReasoning({ expectedImprovement: 4, cognitionCost: 3 });
  const real = shouldContinueReasoning({ expectedImprovement: 4, cognitionCost: 3, delayCost: 4, optionDecay: 2 });
  assert.equal(free.status, 'CONTINUE');
  assert.equal(real.status, 'STOP', 'waiting is never free when the window is closing');
});

test('irreversibility lowers the bar for continuing, never for stopping', () => {
  const args = { expectedImprovement: 3, cognitionCost: 4, delayCost: 1 };
  assert.equal(shouldContinueReasoning(args).status, 'STOP');
  assert.equal(shouldContinueReasoning({ ...args, irreversible: true }).status, 'CONTINUE',
    'a choice that cannot be revisited deserves the extra thought');
});

// ---- Agreement --------------------------------------------------------------

test('sources sharing an ancestor are one observation repeated', () => {
  const verdict = independentAgreement([
    { id: 'model-a', ancestry: 'corpus-2026' },
    { id: 'model-b', ancestry: 'corpus-2026' },
    { id: 'model-c', ancestry: 'corpus-2026' },
    { id: 'field-study', ancestry: 'primary-observation' }
  ]);
  assert.equal(verdict.apparentAgreement, 4);
  assert.equal(verdict.actualIndependentAgreement, 2);
  assert.equal(verdict.inflated, true);
});

test('genuinely independent sources are not discounted', () => {
  const verdict = independentAgreement([
    { id: 'a', ancestry: 'x' }, { id: 'b', ancestry: 'y' }, { id: 'c', ancestry: 'z' }
  ]);
  assert.equal(verdict.actualIndependentAgreement, 3);
  assert.equal(verdict.inflated, false);
});

test('a source with no stated ancestry counts as its own lineage, not as free independence', () => {
  const verdict = independentAgreement([{ id: 'a' }, { id: 'b' }]);
  assert.equal(verdict.actualIndependentAgreement, 2);
});
