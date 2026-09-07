// The methods a forecast is built from, and the ones that earned their place.
//
// Canon asks for the strongest calibrated prediction reality permits, which is
// a harder target than the strongest-sounding one and points in a different
// direction. The gap between them is where forecasting systems go wrong: a
// method that has never been checked against a known outcome feels exactly as
// authoritative as one that has.
//
// So methods here compete. A method that has not been hindcast is unproven
// rather than trusted, its influence follows measured accuracy rather than
// argument, and a forecast built only from unproven methods says so instead of
// averaging them into confidence.
//
// The other half is decay. A forecast is a claim about a world that keeps
// moving, so it carries a half-life and the triggers that would invalidate it
// early -- because the quiet failure is a stale forecast still being acted on
// long after its assumptions stopped holding.
export const FORECAST_STACK_VERSION = 'uberbond.forecast-stack.v1';

/** Methods a forecast may draw on. Whether each has been validated is separate. */
export const FORECAST_METHODS = Object.freeze([
  'REFERENCE_CLASS', 'CAUSAL_MODEL', 'PERSONAL_LONGITUDINAL', 'CURRENT_WORLD_EVIDENCE',
  'INDEPENDENT_ENSEMBLE', 'ADVERSARIAL', 'SCENARIO_TREE', 'HINDCAST', 'BACKTEST',
  'CALIBRATION_HISTORY', 'ONLINE_UPDATE'
]);

/** Dimensions a forecast's strength decomposes into. None is a single score. */
export const STRENGTH_DIMENSIONS = Object.freeze([
  'reference_class_quality', 'causal_model_strength', 'personal_data_relevance',
  'freshness', 'sample_size', 'source_independence', 'measurement_quality',
  'historical_calibration', 'hindcast_performance', 'model_agreement',
  'assumption_sensitivity', 'unknown_unknown_exposure', 'regime_stability_confidence'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * A method with its validation record.
 *
 * `hindcastRuns` is the load-bearing field. A method that has never been asked
 * to predict something already known has no track record, and treating it as
 * though it does is how an untested approach acquires authority by sounding
 * reasonable.
 */
export function forecastMethod(input = {}) {
  const method = FORECAST_METHODS.includes(input?.method) ? input.method : null;
  if (!method) return fail('METHOD_INVALID', ['valid-forecast-method-required']);

  const hindcastRuns = Number.isFinite(Number(input?.hindcastRuns)) ? Number(input.hindcastRuns) : 0;
  const hindcastAccuracy = Number.isFinite(Number(input?.hindcastAccuracy)) ? Number(input.hindcastAccuracy) : null;
  const validated = hindcastRuns >= 5 && hindcastAccuracy !== null;

  return {
    ok: true,
    status: 'METHOD_RECORDED',
    method,
    hindcastRuns,
    hindcastAccuracy,
    // Unproven, not untrusted-by-default. The distinction matters: this says
    // nobody has checked, not that it is bad.
    validated,
    note: validated ? null : 'Never checked against a known outcome. Unproven, which is not the same as wrong.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Builds a forecast from methods, refusing to average unproven ones into confidence.
 *
 * If nothing in the stack has a track record, the honest output is that the
 * stack is unvalidated -- not a number produced by combining things nobody has
 * checked.
 */
export function buildForecast({ claim = null, methods = [], estimate = null } = {}) {
  const body = text(claim, 2000);
  if (!body) return fail('FORECAST_INVALID', ['claim-required']);

  const rows = (Array.isArray(methods) ? methods : []).filter(row => row?.method && FORECAST_METHODS.includes(row.method));
  if (rows.length === 0) return fail('FORECAST_INVALID', ['at-least-one-method-required']);

  const validated = rows.filter(row => row.validated === true);
  if (validated.length === 0) {
    return {
      ok: true,
      status: 'STACK_UNVALIDATED',
      claim: body,
      methods: rows.map(row => row.method),
      estimate: null,
      why: 'No method in this stack has been checked against a known outcome. Averaging unproven methods produces confidence, not accuracy.',
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'FORECAST_BUILT',
    claim: body,
    methods: rows.map(row => row.method),
    validatedMethods: validated.map(row => row.method),
    estimate,
    // Influence follows measured accuracy rather than argument.
    weighting: 'BY_MEASURED_HINDCAST_ACCURACY',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The strength profile, deliberately not collapsed into one number.
 *
 * A single confidence percentage is the most requested and least useful output
 * here: it hides which dimension is weak, and the weak dimension is the whole
 * finding.
 */
export function strengthProfile(dimensions = {}) {
  const scored = {};
  for (const [name, value] of Object.entries(dimensions || {})) {
    if (!STRENGTH_DIMENSIONS.includes(name)) continue;
    const magnitude = Number(value);
    if (Number.isFinite(magnitude) && magnitude >= 0 && magnitude <= 1) scored[name] = magnitude;
  }

  const assessed = Object.keys(scored);
  const weakest = assessed.length
    ? assessed.reduce((low, name) => (scored[name] < scored[low] ? name : low), assessed[0])
    : null;

  return {
    ok: true,
    status: 'STRENGTH_PROFILED',
    dimensions: scored,
    assessed,
    unassessed: STRENGTH_DIMENSIONS.filter(name => !assessed.includes(name)),
    // The one number worth having: which dimension is holding it back.
    weakestDimension: weakest,
    boundary: 'NO SINGLE CONFIDENCE FIGURE IS PRODUCED. IT WOULD HIDE THE WEAK DIMENSION, WHICH IS THE FINDING.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * How long a forecast stays worth acting on.
 *
 * The quiet failure is a stale forecast still driving decisions after its
 * assumptions stopped holding. A forecast with no invalidation trigger cannot
 * be noticed going stale, so it is refused.
 */
export function predictionHalfLife({ forecast = null, assumptions = [], invalidationTriggers = [], expectedHalfLife = null } = {}) {
  const body = text(forecast, 2000);
  if (!body) return fail('HALF_LIFE_INVALID', ['forecast-required']);

  const triggers = (Array.isArray(invalidationTriggers) ? invalidationTriggers : []).map(i => text(i, 500)).filter(Boolean);
  if (triggers.length === 0) {
    return fail('HALF_LIFE_INVALID', ['invalidation-triggers-required'], {
      forecast: body,
      note: 'A forecast nothing could invalidate cannot be noticed going stale, and a stale forecast still being acted on is the quiet failure.'
    });
  }

  return {
    ok: true,
    status: 'HALF_LIFE_RECORDED',
    forecast: body,
    assumptions: (Array.isArray(assumptions) ? assumptions : []).map(i => text(i, 500)).filter(Boolean),
    invalidationTriggers: triggers,
    expectedHalfLife: text(expectedHalfLife, 120) || null,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether an option is still open, and whether it is closing.
 *
 * Importance and urgency come apart, and the field that separates them is the
 * one most decision tools omit.
 */
export function decisionShelfLife({ option = null, availability = null, expiresAround = null } = {}) {
  const what = text(option, 500);
  if (!what) return fail('SHELF_LIFE_INVALID', ['option-required']);

  const states = ['AVAILABLE_NOW', 'AVAILABLE_LATER', 'EXPIRING', 'PREREQUISITE_BLOCKED', 'PERMANENTLY_CLOSED'];
  const state = states.includes(availability) ? availability : null;
  if (!state) return fail('SHELF_LIFE_INVALID', ['valid-availability-required'], { states });

  return {
    ok: true,
    status: 'SHELF_LIFE_RECORDED',
    option: what,
    availability: state,
    expiresAround: text(expiresAround, 120) || null,
    urgent: state === 'EXPIRING',
    // Stated because conflating them is the default failure of every planner.
    distinction: 'URGENCY IS ABOUT THE WINDOW. IMPORTANCE IS ABOUT THE VALUE. THEY ARE DIFFERENT FIELDS.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether new information would change the decision enough to be worth its cost.
 *
 * The refusal that matters: information which cannot change the choice is not
 * worth acquiring however interesting it is, and research that cannot flip the
 * decision is procrastination with a reading list.
 */
export function valueOfInformation({ decision = null, wouldChangeChoice = false, acquisitionCost = 0, delayCost = 0 } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('VOI_INVALID', ['decision-required']);

  if (!wouldChangeChoice) {
    return {
      ok: true,
      status: 'INFORMATION_NOT_WORTH_ACQUIRING',
      decision: what,
      why: 'This cannot change the choice. Research that cannot flip the decision is procrastination with a reading list.',
      businessEffectAuthority: 'NONE'
    };
  }

  const cost = (Number(acquisitionCost) || 0) + (Number(delayCost) || 0);
  return {
    ok: true,
    status: 'INFORMATION_WORTH_ACQUIRING',
    decision: what,
    totalCost: cost,
    couldChangeChoice: true,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Expected outcome, tail risk and regret, kept as separate numbers.
 *
 * A positive expected value does not erase a catastrophic tail, and a single
 * combined figure is exactly how it gets erased.
 */
export function regretGeometry({ option = null, expectedValue = null, worstCase = null, recoveryTime = null, anticipatedRegret = null } = {}) {
  const what = text(option, 500);
  if (!what) return fail('REGRET_INVALID', ['option-required']);

  const ev = Number.isFinite(Number(expectedValue)) ? Number(expectedValue) : null;
  const worst = text(worstCase, 1000);

  return {
    ok: true,
    status: 'REGRET_GEOMETRY',
    option: what,
    expectedValue: ev,
    worstCase: worst,
    recoveryTime: text(recoveryTime, 240) || null,
    anticipatedRegret: text(anticipatedRegret, 1000) || null,
    // No combined figure. That is the whole point of the shape.
    combinedScore: null,
    law: 'A_POSITIVE_EXPECTED_VALUE_DOES_NOT_ERASE_A_CATASTROPHIC_TAIL_AND_A_COMBINED_FIGURE_IS_HOW_IT_GETS_ERASED',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Counterfactual selves attacking each other's assumptions.
 *
 * The output is the invariant that survives every attack, not a vote. A future
 * self that agrees with every other one has told you about the generator; a
 * conclusion that survives hostile futures has told you about the decision.
 */
export function adversarialFutureSelves({ decision = null, attacks = [] } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('ADVERSARIAL_INVALID', ['decision-required']);

  const rows = (Array.isArray(attacks) ? attacks : [])
    .map(row => ({
      from: text(row?.from, 120),
      attacks: text(row?.attacks, 500),
      survived: row?.survived === true
    }))
    .filter(row => row.from && row.attacks);

  const survived = rows.filter(row => row.survived);
  return {
    ok: true,
    status: rows.length === 0 ? 'NO_ATTACKS_RUN' : 'ATTACKS_RUN',
    decision: what,
    attacks: rows,
    invariants: survived.map(row => row.attacks),
    // Never a count of who agreed.
    boundary: 'THE OUTPUT IS WHAT SURVIVED ATTACK, NOT WHAT A MAJORITY OF FUTURE SELVES PREFERRED.',
    businessEffectAuthority: 'NONE'
  };
}
