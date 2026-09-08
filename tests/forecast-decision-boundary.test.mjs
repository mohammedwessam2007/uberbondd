// What this suite protects.
//
// This organ's whole value is the set of answers it declines to give. Most of
// these tests therefore assert a refusal, and the load-bearing ones assert the
// specific refusal, so that deleting a guard fails a test that names the exact
// failure rather than merely reducing a count.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  VERSION, TERMINAL_EPISTEMIC_STATES, UNCERTAINTY_CLASSES,
  STRATEGY_BY_UNCERTAINTY_CLASS, REVERSIBILITY_CLASSES, IRREVERSIBLE_CLASSES,
  flipThreshold, decisionRobustness, knightianClass, valueIncomparability,
  epistemicTermination, decisionBoundary,
  regretGeometry, valueOfInformation, decisionShelfLife
} from '../src/forecast-decision-boundary.mjs';

const reversibleOption = (option, extra = {}) => ({
  option, reversibility: 'REVERSIBLE', expectedValue: 10, costOfBeingWrong: 5, optionValue: 1, ...extra
});

describe('flip thresholds', () => {
  test('identifies what evidence would reverse the recommendation', () => {
    const result = flipThreshold({
      recommendation: 'ship the narrow version',
      assumptions: [
        { assumption: 'demand holds', sensitivity: 0.8, flipsIf: 'two consecutive quarters contract' },
        { assumption: 'team stays', sensitivity: 0.3 }
      ]
    });
    assert.equal(result.status, 'FLIP_THRESHOLD_IDENTIFIED');
    assert.equal(result.fragile, false);
    assert.equal(result.flipConditions.length, 1);
    assert.equal(result.flipConditions[0].reversedBy, 'two consecutive quarters contract');
    assert.equal(result.mostSensitiveAssumption, 'demand holds');
  });

  // A caveat that can never fire is not a safeguard. Reported rather than
  // refused, because refusing would teach callers to invent a trigger.
  test('a recommendation whose assumptions name no reversing evidence is fragile', () => {
    const result = flipThreshold({
      recommendation: 'expand',
      assumptions: [{ assumption: 'the market holds', sensitivity: 0.9 }]
    });
    assert.equal(result.status, 'RECOMMENDATION_FRAGILE');
    assert.equal(result.fragile, true);
    assert.deepEqual(result.flipConditions, []);
  });

  test('a recommendation resting on no stated assumption is refused', () => {
    const result = flipThreshold({ recommendation: 'expand', assumptions: [] });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('at-least-one-assumption-required'));
  });
});

describe('decision robustness and the ruin firewall', () => {
  test('profiles an option without collapsing it into one score', () => {
    const result = decisionRobustness({
      option: 'run a paid pilot', reversibility: 'REVERSIBLE',
      expectedValue: 12, worstCase: 'lose the pilot fee', costOfBeingWrong: 3
    });
    assert.equal(result.status, 'ROBUSTNESS_PROFILED');
    assert.equal(result.recommendable, true);
    assert.equal(result.combinedScore, null, 'collapsing the tail into the average is the failure this shape prevents');
  });

  // LOAD-BEARING. An average over futures cannot price a future in which there
  // is no chooser left to collect.
  test('an option carrying irreversible ruin is not recommendable at any expected value', () => {
    const result = decisionRobustness({
      option: 'bet the runway', reversibility: 'PRACTICALLY_IRREVERSIBLE',
      expectedValue: 9_999_999, worstCase: 'insolvency', ruinRisk: true
    });
    assert.equal(result.status, 'NOT_RECOMMENDABLE__IRREVERSIBLE_RUIN');
    assert.equal(result.recommendable, false);
    assert.equal(result.expectedValueOverridden, true);
    assert.equal(result.expectedValue, 9_999_999, 'the traded-away value stays in the record rather than being hidden');
    assert.equal(result.law, 'A_POSITIVE_EXPECTED_VALUE_NEVER_OUTRANKS_AN_IRREVERSIBLE_CATASTROPHIC_DOWNSIDE');
  });

  // Silence is how a catastrophic branch gets carried forward as though it had
  // been considered.
  test('an irreversible option that never answers the ruin question is refused', () => {
    const result = decisionRobustness({
      option: 'sign the exclusive', reversibility: 'PHYSICALLY_IRREVERSIBLE', expectedValue: 5
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('ruin-risk-must-be-declared-for-irreversible-options'));
  });

  test('ruin declared on a reversible option is contradictory input, not caution', () => {
    const result = decisionRobustness({
      option: 'trial for a week', reversibility: 'REVERSIBLE', ruinRisk: true, expectedValue: 1
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('ruin-risk-contradicts-reversible-class'));
  });

  test('an unrecognised reversibility class is refused', () => {
    const result = decisionRobustness({ option: 'x', reversibility: 'MOSTLY_FINE' });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('valid-reversibility-class-required'));
    assert.deepEqual(result.classes, REVERSIBILITY_CLASSES);
  });

  test('asymmetry is reported rather than netted out', () => {
    const result = decisionRobustness({
      option: 'x', reversibility: 'REVERSIBLE', expectedValue: 1,
      asymmetricUpside: 2, asymmetricDownside: 40
    });
    assert.equal(result.asymmetry, 'DOWNSIDE_DOMINANT');
  });
});

describe('Knightian classification', () => {
  test('estimable probabilities over a known state space is RISK', () => {
    const result = knightianClass({ probabilitiesEstimable: true, stateSpaceKnown: true, importantVariablesKnown: true });
    assert.equal(result.uncertaintyClass, 'RISK');
    assert.equal(result.strategy, 'BY_EXPECTED_VALUE');
  });

  test('an unknown state space is DEEP_UNCERTAINTY and changes the strategy', () => {
    const result = knightianClass({ probabilitiesEstimable: true, stateSpaceKnown: false });
    assert.equal(result.uncertaintyClass, 'DEEP_UNCERTAINTY');
    assert.equal(result.strategy, 'BY_REVERSIBILITY_AND_OPTION_VALUE');
  });

  test('missing important variables is IGNORANCE and permits only reversible probes', () => {
    const result = knightianClass({ importantVariablesKnown: false });
    assert.equal(result.uncertaintyClass, 'IGNORANCE');
    assert.equal(result.strategy, 'REVERSIBLE_PROBES_ONLY__THE_STATE_SPACE_IS_NOT_KNOWN');
  });

  // Not knowing whether the state space is known is itself evidence it is not.
  test('an unanswered question never upgrades the class to RISK', () => {
    const result = knightianClass({});
    assert.equal(result.uncertaintyClass, 'UNCERTAINTY');
    assert.notEqual(result.uncertaintyClass, 'RISK');
    assert.ok(UNCERTAINTY_CLASSES.includes(result.uncertaintyClass));
  });

  test('every class has a declared strategy', () => {
    for (const cls of UNCERTAINTY_CLASSES) {
      assert.ok(STRATEGY_BY_UNCERTAINTY_CLASS[cls], `${cls} must map to a strategy`);
    }
  });
});

describe('value incomparability', () => {
  // LOAD-BEARING. Each option better somewhere the other is worse: no ordering
  // exists without first deciding which value matters more, and that decision
  // is not the system's to make.
  test('a genuine Pareto conflict is incomparable and produces no aggregate score', () => {
    const result = valueIncomparability({
      decision: 'take the role or keep the freedom',
      options: [
        { option: 'take the role', values: { income: 9, freedom: 2 } },
        { option: 'keep the freedom', values: { income: 3, freedom: 9 } }
      ]
    });
    assert.equal(result.status, 'VALUE_INCOMPARABLE');
    assert.equal(result.incomparable, true);
    assert.equal(result.aggregateScore, null, 'a common currency here is the failure, not the answer');
    assert.equal(result.law, 'PLURAL_VALUES_ARE_NOT_CONVERTED_INTO_ONE_CURRENCY_TO_MANUFACTURE_A_WINNER');
  });

  test('a dominating option is comparable', () => {
    const result = valueIncomparability({
      decision: 'd',
      options: [
        { option: 'better everywhere', values: { income: 9, freedom: 9 } },
        { option: 'worse everywhere', values: { income: 2, freedom: 2 } }
      ]
    });
    assert.equal(result.status, 'COMPARABLE');
    assert.equal(result.incomparable, false);
  });

  // A refusal that costs nothing means nothing.
  test('options with no declared values are undescribed, not incomparable', () => {
    const result = valueIncomparability({
      decision: 'd', options: [{ option: 'a' }, { option: 'b' }]
    });
    assert.equal(result.incomparable, false);
  });
});

describe('epistemic termination', () => {
  test('all-untrusted models terminate rather than averaging', () => {
    const result = epistemicTermination({
      question: 'q', models: [{ model: 'a', trusted: false }, { model: 'b', trusted: false }]
    });
    assert.equal(result.terminalState, 'NO_MODEL_CURRENTLY_DESERVES_TRUST');
  });

  test('an irreducible system asks reality to compute it', () => {
    const result = epistemicTermination({ question: 'q', computationallyIrreducible: true });
    assert.equal(result.terminalState, 'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT');
  });

  test('a value boundary yields no recommendation', () => {
    const result = epistemicTermination({ question: 'q', valueBoundaryReached: true });
    assert.equal(result.terminalState, 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED');
  });

  test('insufficient evidence yields UNKNOWN rather than a narrow guess', () => {
    const result = epistemicTermination({ question: 'q', evidenceSufficient: false });
    assert.equal(result.terminalState, 'UNKNOWN__MORE_EVIDENCE_REQUIRED');
  });

  test('reasoning that costs more than it returns yields ENOUGH', () => {
    const result = epistemicTermination({
      question: 'q', moreReasoningExpectedGain: 1, cognitionCost: 5, delayCost: 5
    });
    assert.equal(result.terminalState, 'ENOUGH__EXPECTED_VALUE_OF_MORE_REASONING_IS_LOWER_THAN_DELAY_AND_COGNITION_COST');
  });

  test('trusted models and sufficient evidence let reasoning continue', () => {
    const result = epistemicTermination({ question: 'q', models: [{ model: 'a', trusted: true }] });
    assert.equal(result.status, 'REASONING_MAY_CONTINUE');
    assert.equal(result.terminalState, null);
  });

  test('every terminal state it can emit is one of the canonical strings', () => {
    const emitted = [
      epistemicTermination({ question: 'q', models: [{ model: 'a', trusted: false }] }),
      epistemicTermination({ question: 'q', computationallyIrreducible: true }),
      epistemicTermination({ question: 'q', valueBoundaryReached: true }),
      epistemicTermination({ question: 'q', evidenceSufficient: false }),
      epistemicTermination({ question: 'q', moreReasoningExpectedGain: 0, cognitionCost: 1 })
    ].map(row => row.terminalState);
    for (const state of emitted) assert.ok(TERMINAL_EPISTEMIC_STATES.includes(state), `${state} must be canonical`);
    assert.equal(new Set(emitted).size, 5, 'all five canonical states must be reachable');
  });
});

describe('the decision boundary organ', () => {
  test('recommends under RISK and carries the flip threshold with it', () => {
    const result = decisionBoundary({
      decision: 'which pilot to run',
      probabilitiesEstimable: true, stateSpaceKnown: true, importantVariablesKnown: true,
      options: [reversibleOption('small pilot', { expectedValue: 20 }), reversibleOption('tiny pilot', { expectedValue: 5 })],
      assumptions: [{ assumption: 'demand holds', sensitivity: 0.7, flipsIf: 'two quarters contract' }]
    });
    assert.equal(result.status, 'RECOMMENDATION_WITH_FLIP_THRESHOLD');
    assert.equal(result.recommendation, 'small pilot');
    assert.equal(result.fragile, false);
    assert.equal(result.flipConditions.length, 1);
  });

  // LOAD-BEARING. Ruin is removed before comparison, so a catastrophic option
  // never gets the chance to win on average.
  test('a ruinous option is excluded even when its expected value dominates', () => {
    const result = decisionBoundary({
      decision: 'how to fund the quarter',
      probabilitiesEstimable: true, stateSpaceKnown: true, importantVariablesKnown: true,
      options: [
        { option: 'bet everything', reversibility: 'PRACTICALLY_IRREVERSIBLE', ruinRisk: true, expectedValue: 1_000_000 },
        reversibleOption('modest pilot', { expectedValue: 4 })
      ],
      assumptions: [{ assumption: 'a', sensitivity: 0.5, flipsIf: 'b' }]
    });
    assert.equal(result.recommendation, 'modest pilot');
    assert.ok(result.excludedForRuin.includes('bet everything'));
  });

  test('when every option is ruinous the answer is none, not the least bad', () => {
    const result = decisionBoundary({
      decision: 'd',
      options: [
        { option: 'a', reversibility: 'PRACTICALLY_IRREVERSIBLE', ruinRisk: true, expectedValue: 5 },
        { option: 'b', reversibility: 'PHYSICALLY_IRREVERSIBLE', ruinRisk: true, expectedValue: 50 }
      ]
    });
    assert.equal(result.status, 'NO_RECOMMENDATION__EVERY_OPTION_CARRIES_IRREVERSIBLE_RUIN');
    assert.equal(result.recommendation, null);
  });

  // LOAD-BEARING. The sovereignty boundary: what remains is not a calculation
  // anyone failed to run.
  test('a genuine value tradeoff returns no recommendation and picks no winner', () => {
    const result = decisionBoundary({
      decision: 'the role or the freedom',
      probabilitiesEstimable: true, stateSpaceKnown: true, importantVariablesKnown: true,
      options: [
        reversibleOption('take the role', { values: { income: 9, freedom: 2 }, expectedValue: 9 }),
        reversibleOption('keep the freedom', { values: { income: 3, freedom: 9 }, expectedValue: 3 })
      ]
    });
    assert.equal(result.status, 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED');
    assert.equal(result.recommendation, null, 'the higher expected value must not be used to break a value tie');
    assert.ok(result.conflicts.length > 0);
  });

  test('all-untrusted models stop the organ before any robustness table is built', () => {
    const result = decisionBoundary({
      decision: 'd',
      options: [reversibleOption('a')],
      models: [{ model: 'm1', trusted: false }]
    });
    assert.equal(result.status, 'NO_MODEL_CURRENTLY_DESERVES_TRUST');
    assert.equal(result.recommendation, null);
    assert.equal(result.profiles, undefined, 'a decision you cannot reason about should not receive a robustness table');
  });

  // LOAD-BEARING. Selection genuinely changes with the class rather than being
  // annotated by it.
  test('under IGNORANCE only a reversible probe can be selected', () => {
    const result = decisionBoundary({
      decision: 'd',
      importantVariablesKnown: false,
      options: [
        { option: 'big irreversible commitment', reversibility: 'PATH_DEPENDENT', expectedValue: 500, optionValue: 9 },
        reversibleOption('small reversible probe', { expectedValue: 1, optionValue: 2 })
      ],
      assumptions: [{ assumption: 'a', sensitivity: 0.1, flipsIf: 'b' }]
    });
    assert.equal(result.uncertainty, 'IGNORANCE');
    assert.equal(result.recommendation, 'small reversible probe',
      'the far higher expected value must not win when the variables that matter may be missing');
  });

  test('under UNCERTAINTY it selects by lowest cost of being wrong, not highest value', () => {
    const result = decisionBoundary({
      decision: 'd',
      probabilitiesEstimable: false, stateSpaceKnown: true, importantVariablesKnown: true,
      options: [
        reversibleOption('high value high cost', { expectedValue: 100, costOfBeingWrong: 90 }),
        reversibleOption('modest and cheap to be wrong about', { expectedValue: 5, costOfBeingWrong: 2 })
      ],
      assumptions: [{ assumption: 'a', sensitivity: 0.1, flipsIf: 'b' }]
    });
    assert.equal(result.uncertainty, 'UNCERTAINTY');
    assert.equal(result.recommendation, 'modest and cheap to be wrong about');
  });

  test('a recommendation states that the choice and the authority remain elsewhere', () => {
    const result = decisionBoundary({
      decision: 'd',
      probabilitiesEstimable: true, stateSpaceKnown: true, importantVariablesKnown: true,
      options: [reversibleOption('a')],
      assumptions: [{ assumption: 'x', sensitivity: 0.1, flipsIf: 'y' }]
    });
    assert.equal(result.businessEffectAuthority, 'NONE');
    assert.match(result.boundary, /REASONING ENDS AT A RECOMMENDATION/);
  });

  test('a decision with no options is refused', () => {
    const result = decisionBoundary({ decision: 'd', options: [] });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('at-least-one-option-required'));
  });

  test('the stack is re-exported rather than reimplemented', () => {
    for (const fn of [regretGeometry, valueOfInformation, decisionShelfLife]) {
      assert.equal(typeof fn, 'function');
    }
    assert.equal(regretGeometry({ option: 'a', expectedValue: 1 }).combinedScore, null);
  });

  test('every refusal path carries no authority', () => {
    for (const result of [
      flipThreshold({}), decisionRobustness({}), valueIncomparability({}),
      epistemicTermination({}), decisionBoundary({})
    ]) {
      assert.equal(result.ok, false);
      assert.equal(result.businessEffectAuthority, 'NONE');
      assert.ok(Array.isArray(result.reasonCodes) && result.reasonCodes.length > 0);
    }
    assert.equal(VERSION, 'uberbond.forecast-decision-boundary.v1');
    assert.deepEqual(IRREVERSIBLE_CLASSES, ['PRACTICALLY_IRREVERSIBLE', 'PHYSICALLY_IRREVERSIBLE']);
  });
});
