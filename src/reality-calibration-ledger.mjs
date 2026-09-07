// Forecasts scored against what actually happened.
//
// A forecasting system with no ledger is not a forecasting system; it is a
// generator of confident sentences. The ledger is what makes the difference
// observable, and it only works if three things are impossible:
//
//   1. Editing a forecast after the outcome is known. Retroactive accuracy is
//      the easiest lie in the building and leaves no trace without this.
//   2. Scoring a forecast against evidence it already had. That measures
//      memory, not prediction.
//   3. Reading an outcome as proof the decision was good. A lucky bad decision
//      that becomes doctrine costs more than the loss it hid.
//
// The third is why `decisionQuality` exists separately from `calibrationError`
// and why it refuses to compute from the outcome alone.
import { createHash } from 'node:crypto';

export const REALITY_CALIBRATION_LEDGER_VERSION = 'uberbond.reality-calibration-ledger.v1';

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const iso = value => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Records a forecast, sealed against later editing.
 *
 * The seal covers the claim, the probabilities and the evidence cutoff -- the
 * three things a later self would want to adjust. It is a hash rather than a
 * flag because a flag can be set to false by the same code that wants to edit.
 */
export function recordForecast({ claim = null, probabilities = null, evidenceCutoff = null, method = null, assumptions = [], at = new Date() } = {}) {
  const reasonCodes = [];
  const body = text(claim, 2000);
  if (!body) reasonCodes.push('forecast-claim-required');

  const cutoff = iso(evidenceCutoff);
  if (!cutoff) reasonCodes.push('evidence-cutoff-required');

  const forecastAt = iso(at);
  if (!forecastAt) reasonCodes.push('valid-clock-required');

  const outcomes = probabilities && typeof probabilities === 'object' && !Array.isArray(probabilities)
    ? Object.entries(probabilities).filter(([, p]) => Number.isFinite(Number(p)) && Number(p) >= 0 && Number(p) <= 1)
    : [];
  if (outcomes.length === 0) reasonCodes.push('probabilities-required');

  const total = outcomes.reduce((sum, [, p]) => sum + Number(p), 0);
  // A distribution that does not sum to one is not a distribution, and the
  // slack is where an unstated "something else" outcome hides.
  if (outcomes.length && Math.abs(total - 1) > 0.001) reasonCodes.push('probabilities-must-sum-to-one');

  if (reasonCodes.length) return fail('FORECAST_RECORD_INVALID', reasonCodes);

  const sealed = {
    claim: body,
    probabilities: Object.fromEntries(outcomes.map(([k, p]) => [k, Number(p)])),
    evidenceCutoff: cutoff,
    forecastAt,
    method: text(method, 200) || null,
    assumptions: (Array.isArray(assumptions) ? assumptions : []).map(a => text(a, 500)).filter(Boolean)
  };
  return {
    ok: true,
    status: 'FORECAST_RECORDED',
    forecast: { id: `fc_${createHash('sha256').update(JSON.stringify(sealed)).digest('hex').slice(0, 32)}`, ...sealed, seal: sealForecast(sealed) },
    businessEffectAuthority: 'NONE'
  };
}

export function sealForecast(forecast) {
  return createHash('sha256').update(JSON.stringify([
    forecast.claim, forecast.probabilities, forecast.evidenceCutoff
  ])).digest('hex');
}

/**
 * Scores a forecast against an observed outcome.
 *
 * Brier score, because it is proper: it cannot be improved by stating a
 * confidence you do not hold. The two refusals below matter more than the
 * arithmetic.
 */
export function scoreForecast({ forecast = null, outcome = null, observedAt = null } = {}) {
  if (!forecast || typeof forecast !== 'object') return fail('FORECAST_SCORE_INVALID', ['forecast-required']);

  // A forecast whose seal no longer matches its content was edited after the
  // fact. Refusing to score it is the only way the edit becomes visible.
  if (forecast.seal !== sealForecast(forecast)) {
    return fail('FORECAST_TAMPERED', ['forecast-edited-after-recording'], {
      note: 'The recorded claim, probabilities or evidence cutoff no longer match the seal.'
    });
  }

  const observed = text(outcome, 240);
  if (!observed) return fail('FORECAST_SCORE_INVALID', ['observed-outcome-required']);
  const at = iso(observedAt);
  if (!at) return fail('FORECAST_SCORE_INVALID', ['valid-observation-time-required']);

  // Scoring against something already known at forecast time measures recall,
  // not prediction, and would let a ledger fill with perfect scores.
  if (Date.parse(at) <= Date.parse(forecast.evidenceCutoff)) {
    return fail('FORECAST_NOT_SCORABLE', ['outcome-predates-evidence-cutoff'], {
      evidenceCutoff: forecast.evidenceCutoff, observedAt: at,
      note: 'This measures memory rather than prediction.'
    });
  }

  if (!Object.hasOwn(forecast.probabilities, observed)) {
    return fail('FORECAST_NOT_SCORABLE', ['observed-outcome-was-not-among-the-forecast-outcomes'], {
      observed, forecastOutcomes: Object.keys(forecast.probabilities),
      // The most informative failure a forecaster can have, so it is recorded
      // as a result rather than discarded as unscorable noise.
      note: 'The state space was wrong, which is a stronger finding than a bad probability.'
    });
  }

  const brier = Object.entries(forecast.probabilities)
    .reduce((sum, [name, p]) => sum + ((p - (name === observed ? 1 : 0)) ** 2), 0);

  return {
    ok: true,
    status: 'FORECAST_SCORED',
    forecastId: forecast.id,
    observed,
    observedAt: at,
    assignedProbability: forecast.probabilities[observed],
    brierScore: Number(brier.toFixed(6)),
    truthBoundary: 'A SCORE MEASURES THIS FORECAST AGAINST THIS OUTCOME. IT IS NOT PROOF THE DECISION WAS GOOD OR BAD.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Decision quality, which is not the outcome.
 *
 * Judged on what was knowable at the time. Without this separation a ledger
 * teaches the wrong lesson twice over: lucky bad decisions become doctrine, and
 * unlucky good ones get abandoned.
 */
export function decisionQuality({ forecast = null, score = null, availableAtTime = [], consideredAlternatives = [] } = {}) {
  if (!forecast || !score?.ok) return fail('DECISION_QUALITY_INVALID', ['scored-forecast-required']);

  const available = (Array.isArray(availableAtTime) ? availableAtTime : []).map(e => text(e, 400)).filter(Boolean);
  const alternatives = (Array.isArray(consideredAlternatives) ? consideredAlternatives : []).map(a => text(a, 240)).filter(Boolean);

  const missed = available.filter(evidence => !(forecast.assumptions || []).some(a => a.includes(evidence)));

  return {
    ok: true,
    status: 'DECISION_QUALITY_ASSESSED',
    forecastId: forecast.id,
    usedAvailableEvidence: available.length - missed.length,
    ignoredAvailableEvidence: missed,
    alternativesConsidered: alternatives.length,
    // Stated rather than computed from the outcome, which is the whole point.
    quality: missed.length === 0 && alternatives.length > 1 ? 'WELL_MADE' : 'IMPROVABLE',
    separation: 'DECISION_QUALITY_IS_JUDGED_ON_WHAT_WAS_KNOWABLE_AT_THE_TIME_NOT_ON_THE_OUTCOME',
    outcomeWas: score.observed,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Calibration across a set of scored forecasts.
 *
 * Reported per confidence band, because a single mean average hides the failure
 * that matters: a forecaster can look well-calibrated overall while being
 * systematically overconfident everywhere it said 90%.
 */
export function calibrationSummary(scores = []) {
  const rows = (Array.isArray(scores) ? scores : []).filter(row => row?.ok && row.status === 'FORECAST_SCORED');
  if (rows.length === 0) {
    return {
      ok: true, status: 'CALIBRATION_UNKNOWN', scored: 0,
      why: 'No scored forecasts. Calibration is unknown, not good.',
      businessEffectAuthority: 'NONE'
    };
  }

  const bands = new Map();
  for (const row of rows) {
    const band = Math.min(9, Math.floor(row.assignedProbability * 10)) / 10;
    const entry = bands.get(band) || { band, forecasts: 0, hits: 0 };
    entry.forecasts += 1;
    if (row.assignedProbability > 0 && row.brierScore < 0.5) entry.hits += 1;
    bands.set(band, entry);
  }

  return {
    ok: true,
    status: 'CALIBRATION_SUMMARY',
    scored: rows.length,
    meanBrier: Number((rows.reduce((sum, row) => sum + row.brierScore, 0) / rows.length).toFixed(6)),
    bands: [...bands.values()].sort((a, b) => a.band - b.band)
      .map(entry => ({ ...entry, observedRate: Number((entry.hits / entry.forecasts).toFixed(4)) })),
    truthBoundary: 'CALIBRATION OVER A SMALL SAMPLE IS ITSELF UNCERTAIN. A GOOD MEAN DOES NOT PROVE A CALIBRATED BAND.',
    businessEffectAuthority: 'NONE'
  };
}
