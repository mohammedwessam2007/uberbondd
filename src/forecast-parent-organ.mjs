// Where a forecast earns the right to carry a number.
//
// The forecast stack already knows that an unchecked method is unproven and
// that strength is a profile rather than a percentage. What it does not do is
// assemble the evidence a number would have to rest on. That assembly is where
// the interesting failures live, because each step has a cheap version that
// looks identical to the honest one from the outside.
//
// A reference class is the cheapest place to go wrong: ten cases drawn from one
// survivor-selected source produce a clean-looking rate that is really one
// source repeated ten times. So comparability criteria must be stated, sources
// are counted rather than cases, and the biases that were not corrected for are
// named in the output instead of quietly dropped.
//
// A distribution is the second: a point estimate is what a caller wants and a
// range is what the evidence supports, and there is no honest way to convert
// the second into the first. So nothing here returns a point estimate, and a
// probability carrying more precision than the evidence can hold is refused
// rather than rounded, because rounding it silently would hide that it was
// ever claimed.
//
// A hindcast is the third: a method with no track record and a method with a
// good one are indistinguishable in prose. That distinction is already made in
// forecast-stack, so this composes forecastMethod() rather than growing a
// second notion of what "validated" means.
//
// The ledger is the fourth and the one that decays quietly. A forecast rewritten
// after the outcome is known destroys the only record capable of showing whether
// forecasting is improving, and it destroys it in a way that leaves the ledger
// looking better than before. So the forecast half of an entry is frozen at
// record time and revision is refused once reality has answered.
//
// The parent composes all four and is allowed to return UNKNOWN. That is the
// point of it: a compiler that always emits a range would just be a slower way
// of manufacturing precision.
import { createHash } from 'node:crypto';
import {
  FORECAST_METHODS, forecastMethod, buildForecast, strengthProfile, predictionHalfLife
} from './forecast-stack.mjs';
import { recordForecast, scoreForecast, calibrationSummary } from './reality-calibration-ledger.mjs';

/**
 * Content hash over a banded forecast.
 *
 * Deliberately the same construction the categorical ledger uses on its own
 * records: hash the content, so an edit is detectable without trusting any
 * field inside the record to report it.
 */
const sealBand = (question, forecast) => createHash('sha256')
  .update(JSON.stringify([question, forecast.ranges, forecast.causalAssumptions, forecast.informationAvailable]))
  .digest('hex');

export const FORECAST_PARENT_ORGAN_VERSION = 'uberbond.forecast-parent-organ.v1';

/** Biases a reference class must be examined for. Silence about one is not correction. */
export const REFERENCE_CLASS_BIASES = Object.freeze([
  'SURVIVORSHIP', 'SELECTION', 'PUBLICATION', 'AVAILABILITY'
]);

/** How measurable the outcome is. Quantification is only offered for the first. */
export const MEASURABILITY_CLASSES = Object.freeze([
  'MEASURABLE', 'PARTIALLY_MEASURABLE', 'INHERENTLY_UNMEASURABLE'
]);

/** Fewer real cases than this cannot support a rate, whatever the arithmetic says. */
export const MIN_REFERENCE_CASES = 5;

/** One source repeated is one source. Two is the floor for calling anything independent. */
export const MIN_INDEPENDENT_SOURCES = 2;

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const list = (value, max = 500) =>
  (Array.isArray(value) ? value : []).map(item => text(item, max)).filter(Boolean);

const num = value => (Number.isFinite(Number(value)) ? Number(value) : null);

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

// Two decimals is roughly where a probability stops being a claim about the
// world and starts being a claim about the arithmetic that produced it.
const overPrecise = value => Math.round(value * 100) / 100 !== value;

/**
 * A base rate assembled from comparable cases, or an honest refusal to state one.
 *
 * Two guards carry this. Comparability criteria must be explicit, because
 * "comparable cases" without stated criteria is a claim nobody downstream can
 * check or contest. And independence is counted over sources rather than cases,
 * because the failure mode is not too few rows -- it is many rows that all trace
 * back to the same place, which looks like a large sample right up until it is
 * wrong in the same direction all at once.
 *
 * When either floor is missed the raw fraction is still reported, but it is not
 * promoted to a base rate. Hiding it would be its own dishonesty; calling it a
 * rate would be worse.
 */
export function referenceClass(input = {}) {
  const question = text(input?.question, 2000);
  if (!question) return fail('REFERENCE_CLASS_INVALID', ['question-required']);

  const criteria = list(input?.comparabilityCriteria);
  if (criteria.length === 0) {
    return fail('REFERENCE_CLASS_INVALID', ['comparability-criteria-required'], {
      question,
      note: 'Cases called comparable without stated criteria cannot be contested, so the comparison is unfalsifiable rather than strong.'
    });
  }

  const cases = (Array.isArray(input?.cases) ? input.cases : [])
    .map(row => ({
      id: text(row?.id, 200),
      source: text(row?.source, 200),
      hit: row?.hit === true
    }))
    .filter(row => row.id && row.source);
  if (cases.length === 0) return fail('REFERENCE_CLASS_INVALID', ['at-least-one-sourced-case-required'], { question });

  const sources = [...new Set(cases.map(row => row.source))];
  const hits = cases.filter(row => row.hit).length;
  const rawHitFraction = hits / cases.length;

  const corrections = (Array.isArray(input?.biasCorrections) ? input.biasCorrections : [])
    .map(row => ({ bias: REFERENCE_CLASS_BIASES.includes(row?.bias) ? row.bias : null, applied: row?.applied === true, note: text(row?.note, 500) }))
    .filter(row => row.bias);
  const corrected = corrections.filter(row => row.applied).map(row => row.bias);
  const uncorrectedBiases = REFERENCE_CLASS_BIASES.filter(bias => !corrected.includes(bias));

  const underpowered = cases.length < MIN_REFERENCE_CASES;
  const correlated = sources.length < MIN_INDEPENDENT_SOURCES;

  const shared = {
    question,
    comparabilityCriteria: criteria,
    sampleSize: cases.length,
    hits,
    independentSources: sources.length,
    sourceIndependence: correlated ? 'CORRELATED' : 'INDEPENDENT',
    biasCorrections: corrections,
    uncorrectedBiases,
    businessEffectAuthority: 'NONE'
  };

  if (underpowered || correlated) {
    return {
      ok: true,
      status: 'REFERENCE_CLASS_UNDERPOWERED',
      ...shared,
      baseRate: null,
      // Visible, but not dignified with the name. The reader can see the
      // arithmetic and can also see why it is not being called a rate.
      rawHitFraction,
      degradedBecause: [
        underpowered ? `fewer than ${MIN_REFERENCE_CASES} cases` : null,
        correlated ? 'all cases trace to a single source' : null
      ].filter(Boolean),
      why: 'A rate from too few or non-independent cases is confident in exactly the way it should not be. The fraction is shown; it is not a base rate.'
    };
  }

  return {
    ok: true,
    status: 'REFERENCE_CLASS_BUILT',
    ...shared,
    baseRate: rawHitFraction,
    // A base rate with uncorrected biases is usable and qualified, not clean.
    qualified: uncorrectedBiases.length > 0,
    law: 'INDEPENDENCE_IS_COUNTED_OVER_SOURCES_NOT_CASES'
  };
}

/**
 * A distribution over outcomes. Never a point estimate, under any input.
 *
 * The measurability class is the load-bearing field. Some outcomes -- whether a
 * life felt worthwhile, whether a relationship deepened -- do not have a P50,
 * and attaching one is not conservatism, it is invention. Those return null
 * percentiles and keep their narrative cases, which is the honest shape.
 *
 * A probability carrying more decimals than its evidence can hold is refused
 * rather than rounded down, because silently rounding it would conceal that
 * false precision was offered at all.
 */
export function scenarioDistribution(input = {}) {
  const question = text(input?.question, 2000);
  if (!question) return fail('DISTRIBUTION_INVALID', ['question-required']);

  const measurability = MEASURABILITY_CLASSES.includes(input?.measurability) ? input.measurability : null;
  if (!measurability) {
    return fail('DISTRIBUTION_INVALID', ['valid-measurability-required'], { question, classes: MEASURABILITY_CLASSES });
  }

  // Without this a forecast can never be checked, so the ledger can never learn.
  const timeToFeedback = text(input?.timeToFeedback, 240);
  if (!timeToFeedback) {
    return fail('DISTRIBUTION_INVALID', ['time-to-feedback-required'], {
      question,
      note: 'A forecast with no time to feedback can never be scored against reality, which quietly exempts it from ever being wrong.'
    });
  }

  const scenarios = (Array.isArray(input?.scenarios) ? input.scenarios : [])
    .map(row => ({ label: text(row?.label, 200), probability: num(row?.probability), description: text(row?.description, 1000) }))
    .filter(row => row.label);

  const probabilities = [
    ...scenarios.map(row => row.probability),
    num(input?.probabilityOfNoMeaningfulEffect)
  ].filter(value => value !== null);

  if (probabilities.some(value => value < 0 || value > 1)) {
    return fail('DISTRIBUTION_INVALID', ['probabilities-must-lie-in-zero-to-one'], { question });
  }
  if (probabilities.some(overPrecise)) {
    return fail('DISTRIBUTION_INVALID', ['fake-decimal-precision-refused'], {
      question,
      note: 'A probability quoted past two decimals is describing the arithmetic that produced it rather than the world it claims to be about.'
    });
  }
  const scenarioMass = scenarios.reduce((sum, row) => sum + (row.probability ?? 0), 0);
  if (scenarioMass > 1.0001) {
    return fail('DISTRIBUTION_INVALID', ['scenario-probabilities-exceed-one'], { question, scenarioMass });
  }

  const narrative = {
    bestPlausible: text(input?.bestPlausible, 1000),
    worstPlausible: text(input?.worstPlausible, 1000),
    // Kept even when its probability is tiny. Low probability is not a reason
    // to omit a consequence that cannot be recovered from.
    catastrophicTail: text(input?.catastrophicTail, 1000)
  };

  const shared = {
    question,
    measurability,
    scenarios,
    timeToFeedback,
    ...narrative,
    // Stated as a field so that nothing downstream has to infer its absence.
    pointEstimate: null,
    law: 'A_DISTRIBUTION_IS_THE_OUTPUT_A_POINT_ESTIMATE_IS_NEVER_OFFERED',
    businessEffectAuthority: 'NONE'
  };

  if (measurability === 'INHERENTLY_UNMEASURABLE') {
    return {
      ok: true,
      status: 'DISTRIBUTION_UNQUANTIFIED',
      ...shared,
      percentiles: null,
      probabilityOfNoMeaningfulEffect: null,
      why: 'This outcome has no measurable scale, so a percentile would be invented rather than estimated. The plausible cases are kept; the numbers are not.'
    };
  }

  const p10 = num(input?.percentiles?.p10);
  const p50 = num(input?.percentiles?.p50);
  const p90 = num(input?.percentiles?.p90);
  if (p10 === null || p50 === null || p90 === null) {
    return fail('DISTRIBUTION_INVALID', ['p10-p50-p90-required-for-measurable-outcomes'], { question });
  }
  if (!(p10 <= p50 && p50 <= p90)) {
    return fail('DISTRIBUTION_INVALID', ['percentiles-must-be-ordered'], { question, percentiles: { p10, p50, p90 } });
  }

  return {
    ok: true,
    status: 'DISTRIBUTION_BUILT',
    ...shared,
    percentiles: { p10, p50, p90 },
    probabilityOfNoMeaningfulEffect: num(input?.probabilityOfNoMeaningfulEffect),
    precision: measurability === 'PARTIALLY_MEASURABLE' ? 'RANGE_ONLY_ENDPOINTS_ARE_INDICATIVE' : 'RANGE'
  };
}

/**
 * A method run against outcomes that are already known, and scored on the result.
 *
 * The validated flag comes from forecastMethod() rather than being recomputed
 * here. A second definition of "proven" would drift from the first, and the
 * version that drifted upward is the one that would get quoted.
 *
 * A trial whose actual outcome is not supplied is not a hindcast -- it is a
 * pending forecast wearing the word. Those are counted separately and never
 * reach the accuracy figure.
 */
export function hindcastRecord(input = {}) {
  const method = FORECAST_METHODS.includes(input?.method) ? input.method : null;
  if (!method) return fail('HINDCAST_INVALID', ['valid-forecast-method-required'], { methods: FORECAST_METHODS });

  const rows = (Array.isArray(input?.trials) ? input.trials : [])
    .map(row => ({
      caseId: text(row?.caseId, 200),
      predicted: text(row?.predicted, 500),
      actual: text(row?.actual, 500),
      correct: row?.correct === true
    }))
    .filter(row => row.caseId && row.predicted);

  const scored = rows.filter(row => row.actual !== null);
  const unresolved = rows.filter(row => row.actual === null);

  if (scored.length === 0) {
    return fail('HINDCAST_INVALID', ['hindcast-requires-trials-with-known-outcomes'], {
      method,
      unresolvedTrials: unresolved.length,
      note: 'A trial with no known outcome cannot score a method. Counting it would let a method accumulate a record without ever having been checked.'
    });
  }

  const accuracy = scored.filter(row => row.correct).length / scored.length;
  const record = forecastMethod({ method, hindcastRuns: scored.length, hindcastAccuracy: accuracy });

  return {
    ok: true,
    status: 'HINDCAST_SCORED',
    method,
    scoredTrials: scored.length,
    unresolvedTrials: unresolved.length,
    accuracy,
    // The single source of truth for whether this has earned weight.
    methodRecord: record,
    trustedWeight: record.validated === true,
    weightBasis: record.validated === true ? 'MEASURED_HINDCAST_ACCURACY' : 'UNPROVEN_NO_TRUSTED_WEIGHT',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A percentile forecast written down so it can be scored later.
 *
 * The repository already has a calibration ledger in
 * `reality-calibration-ledger.mjs`, and it is the ledger. It takes a
 * categorical distribution -- named outcomes whose probabilities sum to one --
 * and seals it with a SHA-256 hash of its own content.
 *
 * This organ forecasts a different shape: a continuous band, P10/P50/P90 over
 * a scale. That shape does not fit a categorical ledger without distorting it,
 * so the entry lives here. What must NOT live here is a second answer to "has
 * this been edited". Two tamper mechanisms in one repository means the weaker
 * one is what an attacker, or a discouraged future self, actually uses.
 *
 * So the seal is imported, not reinvented. `sealForecast` hashes the content;
 * a boolean `scored` flag would have been set back to false by the same code
 * that wanted to edit, which is precisely the failure the existing ledger's
 * own comments call out.
 *
 * Use `recordForecast` for categorical questions. Use this for banded ones.
 * Both seal the same way, so the ledger stays one ledger.
 */
export function calibrationLedgerEntry(input = {}) {
  const question = text(input?.question, 2000);
  if (!question) return fail('LEDGER_ENTRY_INVALID', ['question-required']);

  const timestamp = text(input?.timestamp, 60);
  if (!timestamp) return fail('LEDGER_ENTRY_INVALID', ['timestamp-required']);

  // What was knowable then, recorded then. Reconstructing it afterwards is
  // hindsight wearing the clothes of a record.
  const informationAvailable = list(input?.informationAvailable, 2000);
  if (informationAvailable.length === 0) {
    return fail('LEDGER_ENTRY_INVALID', ['information-available-at-forecast-time-required'], { question });
  }

  const predictedUpdateTriggers = list(input?.predictedUpdateTriggers);
  if (predictedUpdateTriggers.length === 0) {
    return fail('LEDGER_ENTRY_INVALID', ['predicted-update-triggers-required'], { question });
  }

  const ranges = input?.ranges && typeof input.ranges === 'object'
    ? { p10: num(input.ranges.p10), p50: num(input.ranges.p50), p90: num(input.ranges.p90) }
    : null;

  const forecast = {
    ranges,
    methodVersions: list(input?.methodVersions, 200),
    causalAssumptions: list(input?.causalAssumptions, 1000),
    evidencePointers: list(input?.evidencePointers, 1000),
    informationAvailable,
    predictedUpdateTriggers
  };

  return {
    ok: true,
    status: 'LEDGER_ENTRY_RECORDED',
    id: text(input?.id, 200) || `${timestamp}::${question.slice(0, 60)}`,
    question,
    timestamp,
    forecast: Object.freeze(forecast),
    // The same primitive the categorical ledger uses. An edit changes the
    // content hash, and no flag inside the record can hide that.
    seal: sealBand(question, forecast),
    observedOutcome: null,
    calibrationError: null,
    postmortem: null,
    scored: false,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Scores an entry, and only when reality has actually answered.
 *
 * Three refusals, in the order they matter. A tampered entry is refused first:
 * scoring an edited forecast is how a ledger reports improvement it did not
 * earn. Scoring without an observed outcome is refused because entries that
 * look resolved read as evidence. Rescoring is refused for the same reason
 * editing is.
 */
export function scoreLedgerEntry(input = {}) {
  const entry = input?.entry;
  if (!entry || entry.ok !== true || entry.status !== 'LEDGER_ENTRY_RECORDED') {
    return fail('LEDGER_SCORE_INVALID', ['recorded-ledger-entry-required']);
  }

  // Checked before anything else. An entry whose content no longer matches its
  // seal was edited after recording, and the edit is only visible here.
  if (entry.seal !== sealBand(entry.question, entry.forecast)) {
    return fail('FORECAST_TAMPERED', ['forecast-edited-after-recording'], {
      id: entry.id,
      note: 'The recorded content no longer hashes to its seal. Scoring it would report accuracy that was edited into existence.'
    });
  }

  if (entry.scored === true) {
    return fail('LEDGER_SCORE_INVALID', ['entry-already-scored'], { id: entry.id });
  }

  const observedOutcome = text(input?.observedOutcome, 2000);
  if (!observedOutcome) {
    return fail('LEDGER_SCORE_INVALID', ['observed-outcome-required'], {
      id: entry.id,
      note: 'Scoring before reality has answered fills the ledger with entries that look resolved, which reads as evidence and is not.'
    });
  }

  const observedValue = num(input?.observedValue);
  const ranges = entry.forecast.ranges;
  const scorable = ranges && observedValue !== null
    && ranges.p10 !== null && ranges.p50 !== null && ranges.p90 !== null;

  return {
    ok: true,
    status: 'LEDGER_ENTRY_SCORED',
    id: entry.id,
    question: entry.question,
    timestamp: entry.timestamp,
    // Carried through untouched. The forecast is what it was.
    forecast: entry.forecast,
    seal: entry.seal,
    observedOutcome,
    observedValue,
    calibrationError: scorable ? Math.abs(observedValue - ranges.p50) : null,
    withinForecastBand: scorable ? observedValue >= ranges.p10 && observedValue <= ranges.p90 : null,
    calibrationNote: scorable ? null : 'NOT_NUMERICALLY_SCORABLE__NARRATIVE_OUTCOME_ONLY',
    postmortem: text(input?.postmortem, 4000),
    scored: true,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Revises a forecast, and only while the world has not yet answered.
 *
 * Updating on new evidence is the point of online updating. Updating after the
 * outcome is known is the one edit nobody reading the ledger later could
 * distinguish from having forecast well, so it is refused rather than logged.
 *
 * The prior forecast survives and the revision is re-sealed, so the chain of
 * what was believed when stays checkable.
 */
export function reviseLedgerForecast(input = {}) {
  const entry = input?.entry;
  if (!entry || entry.ok !== true) return fail('LEDGER_REVISION_INVALID', ['ledger-entry-required']);

  if (entry.scored === true || entry.observedOutcome) {
    return fail('LEDGER_REVISION_REFUSED', ['forecast-frozen-after-outcome-observed'], {
      id: entry.id,
      note: 'A forecast edited after its outcome is known is indistinguishable from a forecast that was right, which destroys the only record capable of showing otherwise.'
    });
  }

  const reason = text(input?.reason, 1000);
  if (!reason) return fail('LEDGER_REVISION_INVALID', ['revision-reason-required'], { id: entry.id });

  const ranges = input?.ranges && typeof input.ranges === 'object'
    ? { p10: num(input.ranges.p10), p50: num(input.ranges.p50), p90: num(input.ranges.p90) }
    : entry.forecast.ranges;

  const revised = {
    ...entry.forecast,
    ranges,
    causalAssumptions: list(input?.causalAssumptions, 1000).length
      ? list(input.causalAssumptions, 1000)
      : [...entry.forecast.causalAssumptions]
  };

  return {
    ...entry,
    status: 'LEDGER_ENTRY_RECORDED',
    forecast: Object.freeze(revised),
    seal: sealBand(entry.question, revised),
    // The prior forecast survives the revision. Superseded is not deleted.
    supersededForecasts: Object.freeze([...(entry.supersededForecasts ?? []), entry.forecast]),
    revisionReason: reason,
    businessEffectAuthority: 'NONE'
  };
}

/** Why a forecast may stop deserving trust before its outcome is observable. */
export const INVALIDATION_KINDS = Object.freeze([
  'ASSUMPTION_FALSIFIED', 'REGIME_CHANGE', 'EVIDENCE_STALE_PAST_HALF_LIFE', 'NAMED_EVENT_LANDED'
]);

/**
 * Whether a recorded forecast should be revalidated before reality answers.
 *
 * Scoring is retrospective by construction: it can only speak once the outcome
 * exists. That leaves a gap where the quiet failure lives -- a forecast whose
 * assumptions stopped holding months ago, still being acted on, still unscored
 * because the question has not resolved yet.
 *
 * This closes that gap. It reads the triggers the forecaster committed to at
 * record time and reports which have fired, so staleness surfaces while the
 * forecast is still being used rather than in the postmortem. It never edits
 * the forecast: it returns a verdict, and revision remains a separate,
 * reasoned, re-sealed act.
 */
export function forecastUpdateTriggers(input = {}) {
  const entry = input?.entry;
  if (!entry || entry.ok !== true || !entry.forecast) {
    return fail('UPDATE_TRIGGERS_INVALID', ['recorded-ledger-entry-required']);
  }

  const observed = Array.isArray(input?.observations) ? input.observations : [];
  const fired = [];
  for (const raw of observed) {
    const kind = INVALIDATION_KINDS.includes(raw?.kind) ? raw.kind : null;
    const detail = text(raw?.detail, 1000);
    if (!kind || !detail) continue;
    // An assumption only counts as falsified if it was actually one of the
    // assumptions recorded at forecast time. Otherwise any inconvenient fact
    // could be relabelled a trigger and used to justify a rewrite.
    if (kind === 'ASSUMPTION_FALSIFIED' && !entry.forecast.causalAssumptions.includes(detail)) {
      continue;
    }
    fired.push(Object.freeze({ kind, detail }));
  }

  const stale = fired.some(row => row.kind === 'EVIDENCE_STALE_PAST_HALF_LIFE');
  const structural = fired.some(row => row.kind === 'ASSUMPTION_FALSIFIED' || row.kind === 'REGIME_CHANGE');

  return {
    ok: true,
    status: fired.length === 0 ? 'FORECAST_STILL_CURRENT' : 'FORECAST_REVALIDATION_REQUIRED',
    id: entry.id,
    declaredTriggers: entry.forecast.predictedUpdateTriggers,
    firedTriggers: Object.freeze(fired),
    // A falsified assumption or a regime change breaks the causal story the
    // forecast was built on. Staleness alone only means it needs re-checking.
    severity: structural ? 'FORECAST_NO_LONGER_SUPPORTED' : (stale ? 'FORECAST_NEEDS_REFRESH' : 'NONE'),
    revisionPerformed: false,
    note: 'A verdict, not an edit. Revision stays a separate reasoned act so the ledger keeps showing what was believed when.',
    businessEffectAuthority: 'NONE'
  };
}

// The categorical half of the ledger, re-exported so a caller composing a full
// forecast reaches for the existing sealed ledger instead of writing a second,
// softer copy of these guarantees.
export { recordForecast, scoreForecast, calibrationSummary };


const widen = (percentiles, factor) => ({
  p10: percentiles.p50 - (percentiles.p50 - percentiles.p10) * factor,
  p50: percentiles.p50,
  p90: percentiles.p50 + (percentiles.p90 - percentiles.p50) * factor
});

/**
 * The parent: reference class, distribution, hindcast and ledger in one pass.
 *
 * Three outcomes, and the third is the one that justifies the organ. When the
 * reference class is underpowered or nothing in the method stack has a track
 * record, the range widens and says why. When both fail, or the outcome has no
 * measurable scale at all, the answer is UNKNOWN. A compiler that always
 * returned a range would be a slower route to manufactured precision, and the
 * slowness would make it more convincing rather than less.
 */
export function compileCalibratedForecast(input = {}) {
  const question = text(input?.question, 2000);
  if (!question) return fail('FORECAST_NOT_COMPILED', ['question-required']);

  const rc = referenceClass({ question, ...(input?.referenceClass ?? {}) });
  if (rc.ok !== true) return fail('FORECAST_NOT_COMPILED', ['reference-class-refused', ...rc.reasonCodes], { referenceClass: rc });

  const dist = scenarioDistribution({ question, ...(input?.distribution ?? {}) });
  if (dist.ok !== true) return fail('FORECAST_NOT_COMPILED', ['distribution-refused', ...dist.reasonCodes], { distribution: dist });

  const hindcasts = (Array.isArray(input?.hindcasts) ? input.hindcasts : []).map(row => hindcastRecord(row));
  const usable = hindcasts.filter(row => row.ok === true);
  if (usable.length === 0) {
    return fail('FORECAST_NOT_COMPILED', ['at-least-one-scored-hindcast-required'], {
      hindcasts,
      note: 'With no method scored against a known outcome there is nothing to weight, and weighting by argument instead is the failure this organ exists to prevent.'
    });
  }

  // The stack decides what is proven; this only reports it.
  const stack = buildForecast({
    claim: question,
    methods: usable.map(row => row.methodRecord),
    estimate: dist.percentiles ? dist.percentiles.p50 : null
  });
  const trusted = usable.filter(row => row.trustedWeight);

  const halfLife = predictionHalfLife({
    forecast: question,
    assumptions: list(input?.causalAssumptions, 1000),
    invalidationTriggers: list(input?.updateTriggers),
    expectedHalfLife: text(input?.expectedHalfLife, 120)
  });
  if (halfLife.ok !== true) {
    return fail('FORECAST_NOT_COMPILED', ['update-triggers-required', ...halfLife.reasonCodes], { question });
  }

  const strength = strengthProfile({
    reference_class_quality: rc.status === 'REFERENCE_CLASS_BUILT'
      ? 1 - rc.uncorrectedBiases.length / REFERENCE_CLASS_BIASES.length
      : 0,
    sample_size: Math.min(1, rc.sampleSize / 20),
    source_independence: rc.sourceIndependence === 'INDEPENDENT' ? Math.min(1, rc.independentSources / 5) : 0,
    hindcast_performance: trusted.length
      ? trusted.reduce((sum, row) => sum + row.accuracy, 0) / trusted.length
      : 0
  });

  const blockers = [
    rc.status === 'REFERENCE_CLASS_UNDERPOWERED' ? 'REFERENCE_CLASS_UNDERPOWERED' : null,
    dist.status === 'DISTRIBUTION_UNQUANTIFIED' ? 'OUTCOME_NOT_MEASURABLE' : null,
    trusted.length === 0 ? 'NO_METHOD_HAS_A_TRACK_RECORD' : null
  ].filter(Boolean);

  const unknown = blockers.includes('OUTCOME_NOT_MEASURABLE') || blockers.length >= 2;
  const widened = !unknown && blockers.length === 1;

  const ledger = calibrationLedgerEntry({
    question,
    timestamp: input?.timestamp,
    informationAvailable: input?.informationAvailable,
    predictedUpdateTriggers: input?.updateTriggers,
    methodVersions: [FORECAST_PARENT_ORGAN_VERSION, ...usable.map(row => `${row.method}@runs=${row.scoredTrials}`)],
    causalAssumptions: input?.causalAssumptions,
    evidencePointers: input?.evidencePointers,
    ranges: unknown ? null : (widened ? widen(dist.percentiles, 2) : dist.percentiles)
  });
  if (ledger.ok !== true) return fail('FORECAST_NOT_COMPILED', ['ledger-entry-refused', ...ledger.reasonCodes], { ledgerEntry: ledger });

  const shared = {
    question,
    referenceClass: rc,
    distribution: dist,
    hindcasts: usable,
    trustedMethods: trusted.map(row => row.method),
    stack,
    strength,
    weakestDimension: strength.weakestDimension,
    halfLife,
    ledgerEntry: ledger,
    blockers,
    pointEstimate: null,
    businessEffectAuthority: 'NONE'
  };

  if (unknown) {
    return {
      ok: true,
      status: 'FORECAST_UNKNOWN',
      ...shared,
      percentiles: null,
      why: 'The evidence does not support a range. Widening a number that was never earned would present the same absence of evidence as a cautious estimate.'
    };
  }

  if (widened) {
    return {
      ok: true,
      status: 'FORECAST_WIDENED',
      ...shared,
      percentiles: ledger.forecast.ranges,
      wideningFactor: 2,
      why: `The range is widened rather than reported as given because of: ${blockers.join(', ')}.`
    };
  }

  return {
    ok: true,
    status: 'FORECAST_COMPILED',
    ...shared,
    percentiles: dist.percentiles,
    law: 'PREDICTION_NEVER_CREATES_AUTHORITY__THE_CHOOSER_REMAINS_THE_CHOOSER'
  };
}
