// Sections 313 and 314. Move the reality-connection discipline out of the
// generation experiment and into the two workflows where a self-reported
// outcome does the most damage.
//
// The discipline is one rule: a forecast is only scorable when something other
// than the forecaster decides how it turned out. In the generation loop that
// was an epistemic nicety. In a founder decision it is the difference between
// a calibration record and a diary, and in an economic claim it is the
// difference between a provider receipt and a hopeful note in a CRM.
import {
  OBSERVER_CLASSES,
  declareObservable,
  forecastObservable
} from './nullstar-omega-reality-connection.mjs';

export const NULLSTAR_OMEGA_TRANSFER_BINDINGS_VERSION = 'uberbond.nullstar-omega-transfer-bindings.v1';

// Who is allowed to decide a founder-facing outcome. The founder is
// deliberately absent: a founder who forecasts and then reports the result is
// the forecaster, and the record would measure self-consistency.
export const FOUNDER_DECIDER_CLASSES = Object.freeze([
  'OBSERVED_EVENT',
  'THIRD_PARTY_RECORD',
  'ELAPSED_TIME',
  'EXECUTED_PROCEDURE'
]);

// Economic outcomes have a stricter list, because the repository already holds
// that CRM state, invoice status and internal ledgers are not commercial
// truth. Letting any of them decide a forecast would reintroduce through the
// calibration path exactly what the payment path refuses.
export const ECONOMIC_DECIDER_CLASSES = Object.freeze([
  'PROVIDER_ORIGIN_RECEIPT',
  'RECONCILED_SETTLEMENT',
  'COUNTERPARTY_ACTION'
]);

export const REFUSED_ECONOMIC_DECIDERS = Object.freeze([
  'CRM_STATE',
  'INVOICE_STATUS',
  'INTERNAL_LEDGER_ROW',
  'MODEL_OUTPUT',
  'OPERATOR_ASSERTION'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

function bind({
  kind,
  allowedDeciders,
  refusedDeciders = [],
  id = null,
  question = null,
  deciderClass = null,
  decidedBy = null,
  outcomeSpace = [],
  probabilities = null,
  evidenceCutoff = null,
  method = null,
  assumptions = [],
  at = new Date()
}) {
  const reasonCodes = [];
  const decider = String(deciderClass ?? '');

  if (refusedDeciders.includes(decider)) {
    return fail(`${kind}_FORECAST_REFUSED`, [`decider-class-is-not-commercial-truth:${decider.toLowerCase()}`], {
      refusedDeciders,
      note: 'This class can be edited by the same party that made the forecast, so scoring against it would measure bookkeeping rather than reality.'
    });
  }
  if (!allowedDeciders.includes(decider)) {
    reasonCodes.push('decider-class-must-be-one-that-the-forecaster-does-not-control');
  }

  const source = text(decidedBy, 500);
  if (!source) reasonCodes.push('forecast-must-name-the-specific-record-that-will-decide-it');

  if (reasonCodes.length) return fail(`${kind}_FORECAST_INVALID`, reasonCodes, { allowedDeciders });

  const declared = declareObservable({
    id,
    question,
    // An outcome someone else's record decides is a materialized artifact: the
    // record exists whether or not the forecaster looks at it.
    observerClass: OBSERVER_CLASSES.MATERIALIZED_ARTIFACT,
    procedure: source,
    outcomeSpace,
    decidedBy: `${decider}: ${source}`
  });
  if (!declared.ok) return declared;

  const recorded = forecastObservable({
    observable: declared.observable,
    probabilities,
    evidenceCutoff,
    method,
    assumptions,
    at
  });
  if (!recorded.ok) return recorded;

  return {
    ok: true,
    status: `${kind}_FORECAST_BOUND`,
    observable: declared.observable,
    forecast: recorded.forecast,
    deciderClass: decider,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Section 313. A founder-facing forecast.
 *
 * Binding one does not make it advice. The forecast records what the system
 * expects and names what will settle it; it creates no recommendation, no
 * commitment and no authority over the decision it is about.
 */
export function bindFounderDecisionForecast(input = {}) {
  const bound = bind({
    kind: 'FOUNDER',
    allowedDeciders: FOUNDER_DECIDER_CLASSES,
    ...input
  });
  if (!bound.ok) return bound;
  return {
    ...bound,
    sovereignty: {
      createsRecommendation: false,
      createsCommitment: false,
      createsAuthority: false,
      note: 'A forecast about a decision is not a position on it. The founder chooses, and a scored forecast never becomes a reason they should have chosen otherwise.'
    }
  };
}

/**
 * Section 314. An economic forecast.
 *
 * The decider must be something a counterparty or a provider produced. This is
 * the same boundary the payment path already enforces, applied to the
 * calibration path so a cleared-payment claim cannot enter through it.
 */
export function bindEconomicOutcomeForecast(input = {}) {
  const bound = bind({
    kind: 'ECONOMIC',
    allowedDeciders: ECONOMIC_DECIDER_CLASSES,
    refusedDeciders: REFUSED_ECONOMIC_DECIDERS,
    ...input
  });
  if (!bound.ok) return bound;
  return {
    ...bound,
    truthBoundary: 'A BOUND FORECAST IS NOT A PAYMENT, AN ACCEPTED DELIVERY, OR A CUSTOMER. IT IS A PREDICTION WAITING FOR ONE.'
  };
}
