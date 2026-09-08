// Where reasoning stops, and the several different reasons it stops there.
//
// A decision organ that always returns a winner is not more useful than one
// that sometimes refuses; it is less honest, and the dishonesty is invisible
// because a confident answer and a warranted answer look identical on the way
// out. So this module is built around the cases where the correct output is
// not a choice.
//
// Three of them matter enough to be structural.
//
// The first is fragility. A recommendation nobody can say how to overturn has
// not been reasoned to, it has been arrived at, and the difference only shows
// up later when the world moves and nothing registers. So every recommendation
// carries the evidence that would reverse it, and one that cannot name such
// evidence is reported fragile rather than presented as settled.
//
// The second is ruin. Expected value is an average over futures, and averaging
// is exactly the operation that hides an absorbing state -- the branch where
// the chooser stops being able to choose again. A high average across futures
// that include one you never come back from is not a good bet, so an option
// carrying irreversible ruin is removed from candidacy here rather than
// discounted, and no expected value is permitted to buy it back.
//
// The third is the value boundary. When two options remain and neither is
// better on every dimension, what is left is not a calculation anyone has
// failed to run; it is a question about what matters, and that question is
// not this system's to answer. The organ returns the incomparability intact.
//
// Everything here ends at a recommendation. Nothing in this file chooses.
import {
  regretGeometry, valueOfInformation, decisionShelfLife,
  predictionHalfLife, adversarialFutureSelves
} from './forecast-stack.mjs';

export const VERSION = 'uberbond.forecast-decision-boundary.v1';

/**
 * The states reasoning is allowed to terminate in instead of producing an answer.
 *
 * These are canon's exact strings, not paraphrases, because the whole value of
 * a refusal is that a caller can match on it. A refusal phrased freshly each
 * time is prose, and prose gets summarised into a recommendation downstream.
 */
export const TERMINAL_EPISTEMIC_STATES = Object.freeze([
  'NO_MODEL_CURRENTLY_DESERVES_TRUST',
  'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED',
  'UNKNOWN__MORE_EVIDENCE_REQUIRED',
  'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT',
  'ENOUGH__EXPECTED_VALUE_OF_MORE_REASONING_IS_LOWER_THAN_DELAY_AND_COGNITION_COST'
]);

/** Knight's classes. They are not degrees of the same thing. */
export const UNCERTAINTY_CLASSES = Object.freeze([
  'RISK',            // probabilities are reasonably estimable
  'UNCERTAINTY',     // the outcomes are known, the probabilities are weak
  'DEEP_UNCERTAINTY',// the state space itself is unclear
  'IGNORANCE'        // important variables may be missing entirely
]);

/**
 * The strategy changes with the class, which is the point of classifying.
 *
 * Optimising expected value under deep uncertainty is the standard error: the
 * expectation is taken over a state space that was never established, so the
 * number is precise about the wrong world.
 */
export const STRATEGY_BY_UNCERTAINTY_CLASS = Object.freeze({
  RISK: 'BY_EXPECTED_VALUE',
  UNCERTAINTY: 'BY_LOWEST_COST_OF_BEING_WRONG',
  DEEP_UNCERTAINTY: 'BY_REVERSIBILITY_AND_OPTION_VALUE',
  IGNORANCE: 'REVERSIBLE_PROBES_ONLY__THE_STATE_SPACE_IS_NOT_KNOWN'
});

/** The irreversibility continuum, from recoverable to not. */
export const REVERSIBILITY_CLASSES = Object.freeze([
  'REVERSIBLE', 'COSTLY_TO_REVERSE', 'PATH_DEPENDENT',
  'PRACTICALLY_IRREVERSIBLE', 'PHYSICALLY_IRREVERSIBLE'
]);

/** The two classes from which there is no way back, whatever the average says. */
export const IRREVERSIBLE_CLASSES = Object.freeze(['PRACTICALLY_IRREVERSIBLE', 'PHYSICALLY_IRREVERSIBLE']);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const num = value => (Number.isFinite(Number(value)) ? Number(value) : null);

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

// ---------------------------------------------------------------------------
// FORECAST-05 -- what would have to change for this to be wrong
// ---------------------------------------------------------------------------

/**
 * The sensitivity of a conclusion to each assumption, and the evidence that reverses it.
 *
 * An assumption is only part of a flip threshold if someone named the specific
 * observation that would overturn it. "This depends on the market holding" is
 * a caveat; "this reverses if two consecutive quarters contract" is a trigger,
 * and only the second can ever fire.
 *
 * A recommendation where nothing was named is not thereby wrong. It is
 * unfalsifiable in practice, which is a different and quieter defect, so it is
 * returned as fragile rather than refused -- refusing it would just teach
 * callers to invent a trigger.
 */
export function flipThreshold({ recommendation = null, assumptions = [] } = {}) {
  const claim = text(recommendation, 2000);
  if (!claim) return fail('FLIP_THRESHOLD_INVALID', ['recommendation-required']);

  const rows = (Array.isArray(assumptions) ? assumptions : [])
    .map(row => ({
      assumption: text(row?.assumption, 500),
      // How much of the conclusion rests on this one. Absent is not zero.
      sensitivity: num(row?.sensitivity),
      flipsIf: text(row?.flipsIf, 500)
    }))
    .filter(row => row.assumption);

  if (rows.length === 0) {
    return fail('FLIP_THRESHOLD_INVALID', ['at-least-one-assumption-required'], {
      recommendation: claim,
      note: 'A recommendation resting on no stated assumption cannot be checked against anything.'
    });
  }

  const flipConditions = rows.filter(row => row.flipsIf);
  const ranked = rows
    .filter(row => row.sensitivity !== null)
    .sort((a, b) => b.sensitivity - a.sensitivity);

  if (flipConditions.length === 0) {
    return {
      ok: true,
      status: 'RECOMMENDATION_FRAGILE',
      recommendation: claim,
      assumptions: rows,
      flipConditions: [],
      fragile: true,
      mostSensitiveAssumption: ranked[0]?.assumption ?? null,
      why: 'No assumption names evidence that would reverse this. Nothing can fire, so the recommendation cannot be noticed becoming wrong.',
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'FLIP_THRESHOLD_IDENTIFIED',
    recommendation: claim,
    assumptions: rows,
    // The answer to canon's required question: what evidence changes the recommendation.
    flipConditions: flipConditions.map(row => ({
      assumption: row.assumption, sensitivity: row.sensitivity, reversedBy: row.flipsIf
    })),
    fragile: false,
    mostSensitiveAssumption: ranked[0]?.assumption ?? null,
    businessEffectAuthority: 'NONE'
  };
}

// ---------------------------------------------------------------------------
// FORECAST-06 -- regret, option value, and the tail that outranks the average
// ---------------------------------------------------------------------------

/**
 * One option's robustness, composed from the stack rather than recomputed here.
 *
 * `regretGeometry` already refuses to combine expected value with the tail into
 * a score, and `valueOfInformation` already refuses to price research that
 * cannot change the choice. Both are imported for that reason: reimplementing
 * them would eventually produce a second, softer version of the same rules.
 *
 * The rule this function adds is the ruin firewall. Declaring ruin on an option
 * that is also marked reversible is contradictory input rather than a cautious
 * one, and is refused, because the whole meaning of ruin is that recovery is
 * not available. An irreversible option that simply omits the ruin question is
 * refused too -- silence there is how a catastrophic branch gets carried
 * forward as though it had been considered.
 */
export function decisionRobustness({
  option = null, decision = null,
  expectedValue = null, worstCase = null, recoveryTime = null,
  anticipatedRegret = null, maximumPlausibleRegret = null,
  reversibility = null, ruinRisk = null,
  costOfBeingWrong = null, costOfWaiting = null, optionValue = null,
  asymmetricUpside = null, asymmetricDownside = null,
  informationWouldChangeChoice = false, acquisitionCost = 0, delayCost = 0,
  values = null
} = {}) {
  const what = text(option, 500);
  if (!what) return fail('ROBUSTNESS_INVALID', ['option-required']);

  const reversibilityClass = REVERSIBILITY_CLASSES.includes(reversibility) ? reversibility : null;
  if (!reversibilityClass) {
    return fail('ROBUSTNESS_INVALID', ['valid-reversibility-class-required'], {
      option: what, classes: REVERSIBILITY_CLASSES
    });
  }

  const irreversible = IRREVERSIBLE_CLASSES.includes(reversibilityClass);
  if (irreversible && typeof ruinRisk !== 'boolean') {
    return fail('ROBUSTNESS_INVALID', ['ruin-risk-must-be-declared-for-irreversible-options'], {
      option: what, reversibility: reversibilityClass,
      note: 'An option you cannot come back from must answer the ruin question explicitly. Omission is not a negative answer.'
    });
  }
  if (ruinRisk === true && reversibilityClass === 'REVERSIBLE') {
    return fail('ROBUSTNESS_INVALID', ['ruin-risk-contradicts-reversible-class'], {
      option: what,
      note: 'Ruin means recovery is unavailable. An option marked reversible cannot also be an absorbing state.'
    });
  }

  const regret = regretGeometry({ option: what, expectedValue, worstCase, recoveryTime, anticipatedRegret });
  if (!regret.ok) return fail('ROBUSTNESS_INVALID', regret.reasonCodes, { option: what });

  const information = valueOfInformation({
    decision: text(decision, 1000) || what,
    wouldChangeChoice: informationWouldChangeChoice === true,
    acquisitionCost, delayCost
  });

  const up = num(asymmetricUpside);
  const down = num(asymmetricDownside);
  const asymmetry = up === null || down === null
    ? 'UNKNOWN'
    : (up > down ? 'UPSIDE_DOMINANT' : (down > up ? 'DOWNSIDE_DOMINANT' : 'SYMMETRIC'));

  const profile = {
    ok: true,
    option: what,
    // Kept as separate numbers, exactly as regretGeometry insists.
    expectedValue: regret.expectedValue,
    expectedRegret: regret.anticipatedRegret,
    maximumPlausibleRegret: text(maximumPlausibleRegret, 1000) || null,
    worstCase: regret.worstCase,
    recoveryTime: regret.recoveryTime,
    reversibility: reversibilityClass,
    costOfBeingWrong: num(costOfBeingWrong),
    costOfWaiting: num(costOfWaiting),
    optionValue: num(optionValue),
    asymmetricUpside: up,
    asymmetricDownside: down,
    asymmetry,
    ruinRisk: ruinRisk === true,
    valueOfInformation: information.status,
    informationCost: information.totalCost ?? null,
    values: values && typeof values === 'object' ? { ...values } : null,
    // Never collapsed. The stack refuses it upstream and it is not reintroduced here.
    combinedScore: null,
    businessEffectAuthority: 'NONE'
  };

  if (profile.ruinRisk) {
    return {
      ...profile,
      status: 'NOT_RECOMMENDABLE__IRREVERSIBLE_RUIN',
      recommendable: false,
      // The expected value survives in the record and loses anyway. Deleting it
      // would hide what was traded; honouring it would trade a life for an average.
      expectedValueOverridden: true,
      law: 'A_POSITIVE_EXPECTED_VALUE_NEVER_OUTRANKS_AN_IRREVERSIBLE_CATASTROPHIC_DOWNSIDE',
      why: 'This option contains a branch the chooser does not return from. An average over futures cannot price a future in which there is no chooser left to collect.'
    };
  }

  return { ...profile, status: 'ROBUSTNESS_PROFILED', recommendable: true, expectedValueOverridden: false };
}

// ---------------------------------------------------------------------------
// FORECAST-07 -- uncertainty class, incomparability, and the right to refuse
// ---------------------------------------------------------------------------

/**
 * Which of Knight's classes this decision is actually in.
 *
 * The classification is deliberately pessimistic in one direction: a missing
 * answer never upgrades the class. Not knowing whether the state space is
 * known is itself evidence that it is not.
 */
export function knightianClass({
  probabilitiesEstimable = null, stateSpaceKnown = null, importantVariablesKnown = null
} = {}) {
  let uncertaintyClass;
  if (importantVariablesKnown === false) uncertaintyClass = 'IGNORANCE';
  else if (stateSpaceKnown === false) uncertaintyClass = 'DEEP_UNCERTAINTY';
  else if (probabilitiesEstimable === true) uncertaintyClass = 'RISK';
  else uncertaintyClass = 'UNCERTAINTY';

  return {
    ok: true,
    status: 'UNCERTAINTY_CLASSIFIED',
    uncertaintyClass,
    strategy: STRATEGY_BY_UNCERTAINTY_CLASS[uncertaintyClass],
    note: uncertaintyClass === 'RISK'
      ? null
      : 'Expected-value maximisation assumes estimable probabilities over a known state space. Neither is granted here.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether the options left are genuinely incomparable, or merely unranked.
 *
 * The test is Pareto: if some pair is such that each option beats the other on
 * a value the other loses, no ordering exists that does not first decide which
 * value matters more. That decision is normative and the system does not hold
 * it.
 *
 * Options with no declared value profile are not incomparable, they are simply
 * undescribed. Treating every unlabelled difference as a value boundary would
 * make refusal cheap, and a refusal that costs nothing means nothing.
 */
export function valueIncomparability({ decision = null, options = [] } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('INCOMPARABILITY_INVALID', ['decision-required']);

  const rows = (Array.isArray(options) ? options : [])
    .map(row => ({
      option: text(row?.option, 500),
      values: row?.values && typeof row.values === 'object' ? row.values : null
    }))
    .filter(row => row.option && row.values);

  const conflicts = [];
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      const shared = Object.keys(a.values).filter(key => Object.hasOwn(b.values, key));
      let aWins = null;
      let bWins = null;
      for (const key of shared) {
        const left = num(a.values[key]);
        const right = num(b.values[key]);
        if (left === null || right === null) continue;
        if (left > right) aWins = key;
        if (right > left) bWins = key;
      }
      // Each better somewhere the other is worse: no dominance, so no ordering.
      if (aWins && bWins) {
        conflicts.push({ between: [a.option, b.option], aBetterOn: aWins, bBetterOn: bWins });
      }
    }
  }

  if (conflicts.length === 0) {
    return {
      ok: true, status: 'COMPARABLE', decision: what, incomparable: false,
      conflicts: [], businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'VALUE_INCOMPARABLE',
    decision: what,
    incomparable: true,
    conflicts,
    // No common currency is produced, because producing one is the failure.
    aggregateScore: null,
    law: 'PLURAL_VALUES_ARE_NOT_CONVERTED_INTO_ONE_CURRENCY_TO_MANUFACTURE_A_WINNER',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether reasoning should stop, and in which canonical state.
 *
 * Precedence is not arbitrary. If no model deserves trust there is nothing to
 * reason with; if the question is computationally irreducible there is no
 * shortcut to reason toward; if the remainder is a value choice, reasoning has
 * finished and the rest belongs to whoever is living with it. Only then do the
 * two economising states apply -- more evidence, or no more of either.
 */
export function epistemicTermination({
  question = null,
  models = [],
  computationallyIrreducible = false,
  valueBoundaryReached = false,
  evidenceSufficient = true,
  moreReasoningExpectedGain = null,
  cognitionCost = null,
  delayCost = null
} = {}) {
  const what = text(question, 1000);
  if (!what) return fail('TERMINATION_INVALID', ['question-required']);

  const rows = (Array.isArray(models) ? models : [])
    .map(row => ({ model: text(row?.model, 200), trusted: row?.trusted === true }))
    .filter(row => row.model);

  const terminate = (terminalState, why) => ({
    ok: true, status: 'TERMINAL_STATE_REACHED', question: what,
    terminalState, why, businessEffectAuthority: 'NONE'
  });

  if (rows.length > 0 && rows.every(row => !row.trusted)) {
    return terminate(
      'NO_MODEL_CURRENTLY_DESERVES_TRUST',
      'Every model offered here is untrusted. Averaging them produces a number with the confidence of many models and the accuracy of none.'
    );
  }

  if (computationallyIrreducible === true) {
    return terminate(
      'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT',
      'No predictive shortcut is available for this system. The cheapest correct route is to run it and watch, not to model it harder.'
    );
  }

  if (valueBoundaryReached === true) {
    return terminate(
      'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED',
      'What remains is not a calculation anyone failed to run. It is a question about what matters, and that is not this system to answer.'
    );
  }

  if (evidenceSufficient === false) {
    return terminate(
      'UNKNOWN__MORE_EVIDENCE_REQUIRED',
      'The evidence does not reach the question. A wide range stated honestly is stronger than a narrow one produced by assumption.'
    );
  }

  const gain = num(moreReasoningExpectedGain);
  const cost = (num(cognitionCost) ?? 0) + (num(delayCost) ?? 0);
  if (gain !== null && gain < cost) {
    return terminate(
      'ENOUGH__EXPECTED_VALUE_OF_MORE_REASONING_IS_LOWER_THAN_DELAY_AND_COGNITION_COST',
      'More thinking now costs more than it can return. Endless analysis is a failure mode with a respectable appearance.'
    );
  }

  return {
    ok: true, status: 'REASONING_MAY_CONTINUE', question: what,
    terminalState: null, businessEffectAuthority: 'NONE'
  };
}

/** Selection actually changes with the uncertainty class, rather than being annotated by it. */
function selectByStrategy(profiles, uncertaintyClass) {
  const best = (rows, better) => rows.reduce((top, row) => (top === null || better(row, top) ? row : top), null);

  if (uncertaintyClass === 'RISK') {
    const scored = profiles.filter(row => row.expectedValue !== null);
    return best(scored, (row, top) => row.expectedValue > top.expectedValue);
  }
  if (uncertaintyClass === 'UNCERTAINTY') {
    const scored = profiles.filter(row => row.costOfBeingWrong !== null);
    return best(scored, (row, top) => row.costOfBeingWrong < top.costOfBeingWrong);
  }
  if (uncertaintyClass === 'DEEP_UNCERTAINTY') {
    const rank = row => REVERSIBILITY_CLASSES.indexOf(row.reversibility);
    const scored = profiles.filter(row => row.optionValue !== null || rank(row) >= 0);
    return best(scored, (row, top) => {
      if (rank(row) !== rank(top)) return rank(row) < rank(top);
      return (row.optionValue ?? 0) > (top.optionValue ?? 0);
    });
  }
  // IGNORANCE: only a reversible probe is defensible when the variables that
  // matter may not be on the list at all.
  const probes = profiles.filter(row => row.reversibility === 'REVERSIBLE');
  return best(probes, (row, top) => (row.optionValue ?? 0) > (top.optionValue ?? 0));
}

/**
 * The organ: flip thresholds, ruin-aware robustness, and the right to refuse.
 *
 * The order of operations carries the argument. Epistemic termination runs
 * first because a decision you cannot reason about should not receive a
 * robustness table. Ruin is removed before anything is compared, so a
 * catastrophic option never has the chance to win on average. Incomparability
 * is tested only among survivors, so a ruinous option cannot manufacture a
 * value boundary. Selection happens last and is always the least interesting
 * step.
 */
export function decisionBoundary({
  decision = null,
  options = [],
  assumptions = [],
  models = [],
  computationallyIrreducible = false,
  evidenceSufficient = true,
  moreReasoningExpectedGain = null,
  cognitionCost = null,
  delayCost = null,
  probabilitiesEstimable = null,
  stateSpaceKnown = null,
  importantVariablesKnown = null
} = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('DECISION_BOUNDARY_INVALID', ['decision-required']);

  const rawOptions = Array.isArray(options) ? options : [];
  if (rawOptions.length === 0) return fail('DECISION_BOUNDARY_INVALID', ['at-least-one-option-required'], { decision: what });

  const uncertainty = knightianClass({ probabilitiesEstimable, stateSpaceKnown, importantVariablesKnown });

  const stop = epistemicTermination({
    question: what, models, computationallyIrreducible, evidenceSufficient,
    moreReasoningExpectedGain, cognitionCost, delayCost
  });
  if (stop.ok && stop.terminalState) {
    return {
      ok: true, status: stop.terminalState, decision: what,
      terminalState: stop.terminalState, why: stop.why,
      recommendation: null, uncertainty: uncertainty.uncertaintyClass,
      strategy: uncertainty.strategy, businessEffectAuthority: 'NONE'
    };
  }

  const profiles = [];
  for (const candidate of rawOptions) {
    const profile = decisionRobustness({ decision: what, ...candidate });
    if (!profile.ok) return fail('DECISION_BOUNDARY_INVALID', profile.reasonCodes, { decision: what, option: candidate?.option ?? null });
    profiles.push(profile);
  }

  const refused = profiles.filter(row => !row.recommendable);
  const survivors = profiles.filter(row => row.recommendable);

  if (survivors.length === 0) {
    return {
      ok: true,
      status: 'NO_RECOMMENDATION__EVERY_OPTION_CARRIES_IRREVERSIBLE_RUIN',
      decision: what,
      terminalState: null,
      recommendation: null,
      profiles,
      excludedForRuin: refused.map(row => row.option),
      why: 'Every option here contains a branch the chooser does not return from. The correct output is that none of them is recommendable, not the least bad of them.',
      uncertainty: uncertainty.uncertaintyClass,
      strategy: uncertainty.strategy,
      businessEffectAuthority: 'NONE'
    };
  }

  const incomparability = valueIncomparability({ decision: what, options: survivors });
  if (incomparability.incomparable) {
    return {
      ok: true,
      status: 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED',
      decision: what,
      terminalState: 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED',
      recommendation: null,
      profiles,
      excludedForRuin: refused.map(row => row.option),
      conflicts: incomparability.conflicts,
      why: epistemicTermination({ question: what, valueBoundaryReached: true }).why,
      law: incomparability.law,
      uncertainty: uncertainty.uncertaintyClass,
      strategy: uncertainty.strategy,
      businessEffectAuthority: 'NONE'
    };
  }

  const chosen = selectByStrategy(survivors, uncertainty.uncertaintyClass);
  if (!chosen) {
    return {
      ok: true,
      status: 'UNKNOWN__MORE_EVIDENCE_REQUIRED',
      decision: what,
      terminalState: 'UNKNOWN__MORE_EVIDENCE_REQUIRED',
      recommendation: null,
      profiles,
      excludedForRuin: refused.map(row => row.option),
      why: `No surviving option can be selected under ${uncertainty.strategy}. Under ${uncertainty.uncertaintyClass} the missing field is the decision, not a formatting gap.`,
      uncertainty: uncertainty.uncertaintyClass,
      strategy: uncertainty.strategy,
      businessEffectAuthority: 'NONE'
    };
  }

  const flip = flipThreshold({ recommendation: chosen.option, assumptions });

  return {
    ok: true,
    status: 'RECOMMENDATION_WITH_FLIP_THRESHOLD',
    decision: what,
    terminalState: null,
    recommendation: chosen.option,
    profiles,
    excludedForRuin: refused.map(row => row.option),
    uncertainty: uncertainty.uncertaintyClass,
    strategy: uncertainty.strategy,
    // Fragility travels with the recommendation rather than beside it, because
    // a caveat in a sibling field is a caveat that gets dropped.
    fragile: flip.ok ? flip.fragile === true : true,
    flipConditions: flip.ok ? flip.flipConditions ?? [] : [],
    flipThresholdStatus: flip.ok ? flip.status : 'FLIP_THRESHOLD_INVALID',
    boundary: 'REASONING ENDS AT A RECOMMENDATION. THE CHOICE, AND THE AUTHORITY TO ACT ON IT, REMAIN ELSEWHERE.',
    businessEffectAuthority: 'NONE'
  };
}

// Re-exported so a caller composing a full decision packet does not have to
// import two modules and risk assembling a second, softer copy of these rules.
export { regretGeometry, valueOfInformation, decisionShelfLife, predictionHalfLife, adversarialFutureSelves };
