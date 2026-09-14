// A forecast only touches reality when something other than the forecaster
// decides the outcome.
//
// The calibration ledger already refuses to score an outcome that predates the
// evidence cutoff, which stops a forecast being graded against something the
// forecaster already knew. That is necessary and not sufficient: a forecaster
// who both predicts and reports the outcome can still write down whatever
// makes the prediction look good.
//
// This module closes that. A forecast must be bound to a named observable
// whose outcome is produced by running a declared procedure, and an
// observation is only admissible if it carries the procedure's own output.
// The forecaster never supplies the outcome directly.
import { createHash } from 'node:crypto';
import { recordForecast, scoreForecast, calibrationSummary } from './reality-calibration-ledger.mjs';

export const NULLSTAR_OMEGA_REALITY_CONNECTION_VERSION = 'uberbond.nullstar-omega-reality-connection.v1';

// An observation is only as independent as the thing that produced it.
export const OBSERVER_CLASSES = Object.freeze({
  // A command the repository can run. Its stdout is the evidence.
  EXECUTED_PROCEDURE: 'EXECUTED_PROCEDURE',
  // A file the repository reads. Its digest is the evidence.
  MATERIALIZED_ARTIFACT: 'MATERIALIZED_ARTIFACT',
  // A human or model saying what happened. Never independent.
  REPORTED_BY_FORECASTER: 'REPORTED_BY_FORECASTER'
});

// The whole point. A forecaster-reported outcome can be recorded but can never
// be scored, because scoring it would measure honesty rather than calibration.
const INDEPENDENT_OBSERVERS = new Set([
  OBSERVER_CLASSES.EXECUTED_PROCEDURE,
  OBSERVER_CLASSES.MATERIALIZED_ARTIFACT
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const iso = value => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

const digest = value => createHash('sha256').update(String(value ?? '')).digest('hex');

/**
 * Declare what will be observed, and how, before any forecast is recorded.
 *
 * The outcome space is fixed here rather than at scoring time. If reality
 * returns something outside it, that is a finding about the model of the
 * world, not a scoring inconvenience to be papered over.
 */
export function declareObservable({
  id = null,
  question = null,
  observerClass = null,
  procedure = null,
  outcomeSpace = [],
  decidedBy = null,
  derivation = null
} = {}) {
  const reasonCodes = [];
  const observableId = text(id, 200);
  if (!observableId) reasonCodes.push('observable-id-required');

  const body = text(question, 1000);
  if (!body) reasonCodes.push('observable-question-required');

  if (!Object.hasOwn(OBSERVER_CLASSES, String(observerClass ?? ''))) {
    reasonCodes.push('known-observer-class-required');
  }

  // An executed procedure without a command is a claim, not a procedure.
  const command = text(procedure, 1000);
  if (observerClass === OBSERVER_CLASSES.EXECUTED_PROCEDURE && !command) {
    reasonCodes.push('executed-procedure-requires-a-runnable-command');
  }
  if (observerClass === OBSERVER_CLASSES.MATERIALIZED_ARTIFACT && !command) {
    reasonCodes.push('materialized-artifact-requires-a-path');
  }

  const space = (Array.isArray(outcomeSpace) ? outcomeSpace : [])
    .map(entry => text(entry, 200))
    .filter(Boolean);
  const uniqueSpace = [...new Set(space)];
  if (uniqueSpace.length < 2) reasonCodes.push('outcome-space-needs-at-least-two-distinguishable-outcomes');
  if (uniqueSpace.length !== space.length) reasonCodes.push('outcome-space-must-not-repeat-an-outcome');

  // Naming who decides is what makes the independence claim checkable later.
  const decider = text(decidedBy, 300);
  if (!decider) reasonCodes.push('observable-must-name-what-decides-the-outcome');

  // Some outcomes are not words the observer prints. "How many of these ten
  // modules reach production" is decided by a count, not a token. Those need a
  // derivation rule, and the rule has to be fixed here -- before the forecast
  // and long before the output exists -- or it can be chosen afterwards to
  // make whatever happened look predicted.
  let rule = null;
  if (derivation !== null && derivation !== undefined) {
    const ruleId = text(derivation?.ruleId, 200);
    const description = text(derivation?.description, 1000);
    if (!ruleId) reasonCodes.push('derivation-requires-a-rule-id');
    if (!description) reasonCodes.push('derivation-requires-a-description-of-the-rule');
    if (ruleId && description) rule = { ruleId, description };
  }

  if (reasonCodes.length) return fail('OBSERVABLE_DECLARATION_INVALID', reasonCodes);

  return {
    ok: true,
    status: 'OBSERVABLE_DECLARED',
    observable: {
      id: observableId,
      question: body,
      observerClass,
      procedure: command,
      outcomeSpace: uniqueSpace,
      decidedBy: decider,
      derivation: rule,
      independent: INDEPENDENT_OBSERVERS.has(observerClass)
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Record a forecast against a declared observable.
 *
 * The forecast's outcome keys must be exactly the declared outcome space. A
 * forecast that quietly narrows the space is easier to be right about and
 * tells us less.
 */
export function forecastObservable({
  observable = null,
  probabilities = null,
  evidenceCutoff = null,
  method = null,
  assumptions = [],
  at = new Date()
} = {}) {
  if (!observable?.id || !Array.isArray(observable.outcomeSpace)) {
    return fail('REALITY_FORECAST_INVALID', ['declared-observable-required']);
  }

  const keys = probabilities && typeof probabilities === 'object' && !Array.isArray(probabilities)
    ? Object.keys(probabilities)
    : [];
  const declared = [...observable.outcomeSpace].sort();
  const offered = [...new Set(keys)].sort();
  if (declared.length !== offered.length || declared.some((key, index) => key !== offered[index])) {
    return fail('REALITY_FORECAST_INVALID', ['forecast-must-cover-exactly-the-declared-outcome-space'], {
      declaredOutcomeSpace: declared,
      forecastOutcomes: offered
    });
  }

  // The derivation rule goes inside the forecast seal. A rule swapped after
  // the observation exists then breaks the seal instead of quietly rescuing
  // the forecast.
  const sealedAssumptions = observable.derivation
    ? [`outcome-derivation-rule:${observable.derivation.ruleId}`, ...(Array.isArray(assumptions) ? assumptions : [])]
    : assumptions;

  const recorded = recordForecast({
    claim: observable.question,
    probabilities,
    evidenceCutoff,
    method,
    assumptions: sealedAssumptions,
    at
  });
  if (!recorded.ok) return recorded;

  return {
    ok: true,
    status: 'REALITY_FORECAST_RECORDED',
    observableId: observable.id,
    forecast: recorded.forecast,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Admit an observation produced by the declared observer.
 *
 * `rawEvidence` is whatever the procedure actually emitted. The outcome must
 * be derivable from it: the caller supplies both, and this refuses when the
 * claimed outcome does not appear in the evidence. That is a weak check on its
 * own, which is why it is paired with the observer-class rule — a forecaster
 * who writes their own evidence is refused before the text check runs.
 */
export function admitObservation({
  observable = null,
  outcome = null,
  rawEvidence = null,
  observedAt = null,
  derivationRuleId = null
} = {}) {
  const reasonCodes = [];
  if (!observable?.id) return fail('OBSERVATION_INADMISSIBLE', ['declared-observable-required']);

  if (!observable.independent) {
    return fail('OBSERVATION_INADMISSIBLE', ['forecaster-reported-outcomes-cannot-be-scored'], {
      observerClass: observable.observerClass,
      note: 'Scoring this would measure the forecaster\'s honesty, not the forecast\'s calibration.'
    });
  }

  const observed = text(outcome, 200);
  if (!observed) reasonCodes.push('observed-outcome-required');
  if (observed && !observable.outcomeSpace.includes(observed)) {
    reasonCodes.push('observed-outcome-was-outside-the-declared-outcome-space');
  }

  const evidence = text(rawEvidence, 200000);
  if (!evidence) reasonCodes.push('raw-evidence-from-the-observer-required');

  const at = iso(observedAt);
  if (!at) reasonCodes.push('valid-observation-time-required');

  if (observable.derivation) {
    // A derived outcome is admissible only under the rule fixed at
    // declaration time, named again here so the two must agree.
    if (text(derivationRuleId, 200) !== observable.derivation.ruleId) {
      reasonCodes.push('derived-observation-must-name-the-rule-declared-with-the-observable');
    }
  } else if (observed && evidence && !evidence.includes(observed)) {
    // The outcome has to be readable out of what the observer emitted. An
    // outcome the evidence does not mention is an assertion wearing
    // evidence's clothes.
    reasonCodes.push('claimed-outcome-does-not-appear-in-the-observer-output');
  }

  if (reasonCodes.length) {
    return fail('OBSERVATION_INADMISSIBLE', reasonCodes, {
      declaredOutcomeSpace: observable.outcomeSpace
    });
  }

  return {
    ok: true,
    status: 'OBSERVATION_ADMITTED',
    observableId: observable.id,
    observed,
    observedAt: at,
    evidenceDigest: `sha256:${digest(evidence)}`,
    evidenceBytes: Buffer.byteLength(evidence, 'utf8'),
    derivationRuleId: observable.derivation?.ruleId ?? null,
    decidedBy: observable.decidedBy,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Close the loop: score an admitted observation against its sealed forecast.
 */
export function closeRealityLoop({ forecast = null, observation = null } = {}) {
  if (!forecast?.id) return fail('REALITY_LOOP_INVALID', ['sealed-forecast-required']);
  if (!observation?.ok) return fail('REALITY_LOOP_INVALID', ['admitted-observation-required']);

  const score = scoreForecast({
    forecast,
    outcome: observation.observed,
    observedAt: observation.observedAt
  });
  if (!score.ok) return score;

  // Being right is not the interesting part. Being surprised is.
  const surprise = score.assignedProbability < 0.5;

  return {
    ok: true,
    status: 'REALITY_LOOP_CLOSED',
    observableId: observation.observableId,
    forecastId: forecast.id,
    observed: observation.observed,
    assignedProbability: score.assignedProbability,
    brierScore: score.brierScore,
    surprised: surprise,
    score,
    evidenceDigest: observation.evidenceDigest,
    decidedBy: observation.decidedBy,
    truthBoundary: 'ONE CLOSED LOOP IS ONE DATA POINT. IT IS NOT A CALIBRATION CURVE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Void a loop whose derivation rule turned out to be wrong.
 *
 * This is deliberately not a rescore. When the rule misreads the observer, the
 * forecast was never actually tested, so counting it either way would be
 * fiction -- and quietly re-running with a fixed rule, now that the answer is
 * known, would measure memory. The void stays in the record because a failure
 * of the observation apparatus is a larger finding than a missed forecast.
 */
export function voidLoop({ loop = null, defect = null, correctedOutcome = null } = {}) {
  const reasonCodes = [];
  if (!loop?.ok) reasonCodes.push('closed-loop-required');
  const why = text(defect, 2000);
  if (!why) reasonCodes.push('void-requires-a-statement-of-the-defect');
  const corrected = text(correctedOutcome, 200);
  if (!corrected) reasonCodes.push('void-requires-the-outcome-the-defective-rule-should-have-produced');
  if (reasonCodes.length) return fail('LOOP_VOID_INVALID', reasonCodes);

  return {
    ok: false,
    status: 'REALITY_LOOP_VOID',
    voided: true,
    observableId: loop.observableId,
    forecastId: loop.forecastId,
    defect: why,
    recordedOutcome: loop.observed,
    correctedOutcome: corrected,
    ruleMisreadTheObserver: loop.observed !== corrected,
    evidenceDigest: loop.evidenceDigest,
    rescoreRefused: 'THE ANSWER IS NOW KNOWN, SO A REPLACEMENT FORECAST ON THIS QUESTION WOULD MEASURE MEMORY RATHER THAN PREDICTION.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A dimension earns REALITY_CALIBRATED only from closed loops, and only when
 * at least one of them was capable of embarrassing the forecaster.
 */
export function realityCalibrationVerdict(loops = []) {
  const all = Array.isArray(loops) ? loops : [];
  const closed = all.filter(loop => loop?.ok);
  const voided = all.filter(loop => loop?.status === 'REALITY_LOOP_VOID');
  if (closed.length === 0) {
    return {
      ok: true,
      status: 'NOT_REALITY_CALIBRATED',
      reason: voided.length ? 'every-loop-was-voided-for-a-defective-derivation-rule' : 'no-closed-loops',
      closedLoops: 0,
      voidedLoops: voided.length,
      businessEffectAuthority: 'NONE'
    };
  }

  // Pass the ledger's own scored rows through. Reconstructing a lookalike row
  // here would silently drop the status field the summary filters on, and the
  // summary would answer CALIBRATION_UNKNOWN for a set of real scores.
  const summary = calibrationSummary(closed.map(loop => loop.score));
  const surprises = closed.filter(loop => loop.surprised).length;

  // A run of forecasts that were all near-certain and all correct proves the
  // questions were easy, not that the forecaster is calibrated.
  const allNearCertain = closed.every(loop => loop.assignedProbability >= 0.9);

  return {
    ok: true,
    status: allNearCertain && surprises === 0 ? 'CALIBRATION_UNTESTED__ONLY_EASY_QUESTIONS_ASKED' : 'REALITY_CALIBRATED',
    closedLoops: closed.length,
    voidedLoops: voided.length,
    surprises,
    meanBrier: summary?.meanBrier ?? null,
    calibrationSummary: summary,
    truthBoundary: 'CALIBRATION ON THESE QUESTIONS DOES NOT TRANSFER TO QUESTIONS OF A DIFFERENT KIND.',
    businessEffectAuthority: 'NONE'
  };
}
