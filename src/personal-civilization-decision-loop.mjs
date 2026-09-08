// The Sovereign Decision Packet, and the loop back to reality.
//
// Canon asks for one specific, uncomfortable shape: broaden the option space
// before narrowing it, forecast every serious option rather than the favorite,
// and refuse to manufacture a winner when the remaining difference is a value
// choice rather than a factual one. This module composes that shape from
// modules that already carry the load -- the forecast ledger, the private
// core, the forecast stack, and the life dimensions -- rather than building a
// second copy of any of them.
//
// Two failures are cheap to build and easy to miss in review, so they get
// named here instead of left implicit:
//
//   1. Collapsing a genuine value tradeoff into a recommendation. The tradeoff
//      module below (life-decision-dimensions) already refuses to produce a
//      total for exactly this reason -- an imposed exchange rate between, say,
//      money and meaning. A decision loop sitting on top of it must carry that
//      refusal forward rather than quietly picking a winner anyway once the
//      dimensions module hands back "founder decides".
//
//   2. A derived decision summary that survives the deletion of the private
//      record it was built from. The private core's `derivedClosure` already
//      solves this for the store; this module's job is to make sure every
//      summary it hands back cites its private-record provenance so that
//      closure actually reaches it, and to prove -- in the tests, not just in
//      prose -- that a deleted decision cannot be reconstructed from an export
//      taken before the deletion.
//
// A packet is a decision aid. It never becomes the decision, and it never
// acquires authority merely by being thorough. That line is restated on every
// packet this module produces, not assumed.
import {
  recordForecast, scoreForecast, decisionQuality
} from './reality-calibration-ledger.mjs';
import {
  deriveLivingModel, exportPrivateState, deletePrivateRecords, derivedClosure,
  founderAuthorized, normalizePrivateRecord
} from './personal-civilization-core.mjs';
import {
  valueOfInformation, regretGeometry, decisionShelfLife, predictionHalfLife,
  adversarialFutureSelves, strengthProfile, buildForecast
} from './forecast-stack.mjs';
import { scoreOption, compareLifeOptions, goodhartRisk } from './life-decision-dimensions.mjs';

export const PERSONAL_CIVILIZATION_DECISION_LOOP_VERSION = 'uberbond.personal-civilization-decision-loop.v1';

/** The exact string a packet may terminate in when no factual method resolves a value tradeoff. */
export const NO_RECOMMENDATION_VALUE_BOUNDARY = 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED';

/** The sentence a packet must carry every time. It is restated, never assumed by a caller. */
export const FOUNDER_REMAINS_CHOOSER = 'THE FOUNDER REMAINS THE CHOOSER. THIS PACKET IS A DECISION AID AND ACQUIRES NO AUTHORITY BY BEING THOROUGH.';

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
 * Builds the Sovereign Decision Packet for one decision.
 *
 * The load-bearing refusal lives here: when `compareLifeOptions` reports a
 * genuine tradeoff among the strongest options and no factual method breaks
 * the tie, the packet's `recommendation` field is the exact string
 * `NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED` rather than a plausible-sounding
 * pick. Two or more materially different options are never silently reduced
 * to one; the packet reports every serious option's forecast, not only the
 * winner's, even when a winner exists.
 */
export function composeDecisionPacket({
  decision = null,
  options = [],
  forecasts = {},
  keyAssumptions = [],
  whatCouldMakeThisWrong = [],
  irreversibleConsequences = [],
  unknownUnknowns = [],
  missingEvidence = [],
  highestValueExperiment = null,
  updateConditions = [],
  now = new Date()
} = {}) {
  const reasonCodes = [];
  const decisionStatement = text(decision, 2000);
  if (!decisionStatement) reasonCodes.push('decision-statement-required');

  const optionRows = Array.isArray(options) ? options : [];
  if (optionRows.length < 2) reasonCodes.push('at-least-two-materially-distinct-options-required');

  const at = iso(now);
  if (!at) reasonCodes.push('valid-clock-required');

  if (reasonCodes.length) return fail('DECISION_PACKET_INVALID', reasonCodes);

  // Compare on the life dimensions the founder actually cares about. This is
  // the module that already refuses to reduce the comparison to one number --
  // that refusal is why `founderDecides` below can be trusted rather than
  // recomputed.
  const comparison = compareLifeOptions(optionRows);
  if (!comparison.ok) return fail('DECISION_PACKET_INVALID', comparison.reasonCodes, { comparisonFailure: comparison });

  // Attach the strongest forecast available for each serious option, keyed by
  // option name. A caller can supply pre-built forecast-stack outputs; options
  // with no forecast are reported as such rather than silently dropped, so a
  // missing forecast is visible instead of quietly reducing the option set.
  const outcomeDistributions = comparison.options.map(row => {
    const supplied = forecasts && typeof forecasts === 'object' ? forecasts[row.name] : null;
    return {
      option: row.name,
      forecast: supplied && typeof supplied === 'object' ? supplied : null,
      forecastStatus: supplied && typeof supplied === 'object' ? (supplied.status || 'FORECAST_SUPPLIED') : 'NO_FORECAST_SUPPLIED'
    };
  });

  // The value-boundary refusal. `compareLifeOptions` already told us whether a
  // tradeoff exists among the compared options; a decision has a value
  // boundary when at least one such tradeoff exists AND no option dominates
  // every other option outright. Domination is a factual conclusion (better
  // everywhere compared, worse nowhere); a tradeoff with no dominating option
  // is, by definition, a question about which dimension matters more -- and
  // that is the founder's question, not this module's to answer.
  const dominatedNames = new Set(comparison.dominations.map(row => row.worse));
  const undominated = comparison.options.filter(row => !dominatedNames.has(row.name));
  const hasUnresolvedTradeoff = comparison.tradeoffs.some(
    row => row.between.every(name => undominated.some(u => u.name === name))
  );
  const singleUndominatedOption = undominated.length === 1 ? undominated[0].name : null;

  const recommendation = hasUnresolvedTradeoff
    ? NO_RECOMMENDATION_VALUE_BOUNDARY
    : (singleUndominatedOption
      ? singleUndominatedOption
      : (undominated.length ? undominated.map(row => row.name).join(' AND ') : NO_RECOMMENDATION_VALUE_BOUNDARY));

  const strength = strengthProfile(
    outcomeDistributions.reduce((acc, row) => {
      if (row.forecast && row.forecast.strength && typeof row.forecast.strength === 'object') {
        Object.assign(acc, row.forecast.strength);
      }
      return acc;
    }, {})
  );

  const packet = {
    decision: decisionStatement,
    composedAt: at,
    // Every materially different option, never narrowed to the winner alone.
    materiallyDistinctOptions: comparison.options.map(row => row.name),
    outcomeDistributions,
    forecastStrength: strength,
    dominations: comparison.dominations,
    tradeoffs: comparison.tradeoffs,
    recommendation,
    recommendationIsValueBoundary: recommendation === NO_RECOMMENDATION_VALUE_BOUNDARY,
    keyAssumptions: (Array.isArray(keyAssumptions) ? keyAssumptions : []).map(a => text(a, 1000)).filter(Boolean),
    whatCouldMakeThisWrong: (Array.isArray(whatCouldMakeThisWrong) ? whatCouldMakeThisWrong : []).map(a => text(a, 1000)).filter(Boolean),
    irreversibleConsequences: (Array.isArray(irreversibleConsequences) ? irreversibleConsequences : []).map(a => text(a, 1000)).filter(Boolean),
    unknownUnknowns: (Array.isArray(unknownUnknowns) ? unknownUnknowns : []).map(a => text(a, 1000)).filter(Boolean),
    missingEvidence: (Array.isArray(missingEvidence) ? missingEvidence : []).map(a => text(a, 1000)).filter(Boolean),
    highestValueExperiment: text(highestValueExperiment, 1000) || null,
    updateConditions: (Array.isArray(updateConditions) ? updateConditions : []).map(a => text(a, 1000)).filter(Boolean),
    // The line that must be present on every packet, restated rather than
    // implied by the absence of a widened-authority field.
    sovereigntyStatement: FOUNDER_REMAINS_CHOOSER,
    noTotal: comparison.noTotal,
    truthBoundary: 'A PACKET IS A DECISION AID. IT NEVER DECIDES, AND IT ACQUIRES NO AUTHORITY BY BEING THOROUGH.'
  };

  return {
    ok: true,
    status: 'DECISION_PACKET_COMPOSED',
    packet,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Regret and option value, per serious option, composed onto the packet.
 *
 * Kept as a separate call rather than folded silently into `composeDecisionPacket`
 * because regret geometry needs per-option inputs (expected value, worst case,
 * recovery time) a caller may not have ready when the packet itself is first
 * assembled, and forcing them together would pressure a caller into guessing
 * regret numbers just to get a packet out the door.
 */
export function attachRegretAndOptionValue(packet, regretInputs = []) {
  if (!packet || typeof packet !== 'object' || !Array.isArray(packet.materiallyDistinctOptions)) {
    return fail('REGRET_ATTACHMENT_INVALID', ['decision-packet-required']);
  }
  const rows = (Array.isArray(regretInputs) ? regretInputs : [])
    .filter(row => row && packet.materiallyDistinctOptions.includes(row.option))
    .map(row => regretGeometry(row));

  const failed = rows.filter(row => !row.ok);
  return {
    ok: true,
    status: 'REGRET_ATTACHED',
    packet: { ...packet, regretGeometryByOption: rows.filter(row => row.ok), regretGeometryRefused: failed },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Records the packet's chosen path as a sealed forecast in the reality
 * calibration ledger, so the loop back to reality can eventually close.
 *
 * This composes `recordForecast` rather than reimplementing sealing, because
 * the ledger already owns the one property that matters here: a forecast that
 * cannot be edited after the fact. Refusing to fork that logic is the point.
 */
export function recordPacketOutcomeForecast({ packet = null, chosenOption = null, probabilities = null, evidenceCutoff = null, method = null, assumptions = [], at = new Date() } = {}) {
  if (!packet || typeof packet !== 'object' || !Array.isArray(packet.materiallyDistinctOptions)) {
    return fail('PACKET_FORECAST_INVALID', ['decision-packet-required']);
  }
  const option = text(chosenOption, 240);
  if (!option) return fail('PACKET_FORECAST_INVALID', ['chosen-option-required']);
  if (!packet.materiallyDistinctOptions.includes(option)) {
    return fail('PACKET_FORECAST_INVALID', ['chosen-option-not-among-packet-options'], {
      chosenOption: option, packetOptions: packet.materiallyDistinctOptions
    });
  }
  if (packet.recommendationIsValueBoundary && packet.recommendation === NO_RECOMMENDATION_VALUE_BOUNDARY) {
    // A value-boundary packet can still be forecast once the founder has
    // chosen -- the boundary is about recommending, not about forecasting the
    // path actually taken. Nothing further is required here; this branch
    // exists to document that the two are deliberately independent.
  }

  const recorded = recordForecast({
    claim: `${packet.decision} -> chose "${option}"`,
    probabilities,
    evidenceCutoff,
    method,
    assumptions,
    at
  });
  if (!recorded.ok) return recorded;

  return {
    ok: true,
    status: 'PACKET_OUTCOME_FORECAST_RECORDED',
    decision: packet.decision,
    chosenOption: option,
    forecast: recorded.forecast,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Scores the packet's recorded forecast against what actually happened, and
 * separately assesses decision quality -- composing both from the ledger
 * rather than recomputing either.
 *
 * The separation is the entire point, restated from the ledger's own header:
 * a lucky bad decision must not become doctrine, and an unlucky good one must
 * not be mislearned as a mistake. `decisionQuality` is computed from what was
 * knowable at decision time (the packet's own assumptions and considered
 * options), never from `score.observed`.
 */
export function closePacketLoop({ packet = null, chosenForecast = null, outcome = null, observedAt = null, availableAtTime = [] } = {}) {
  if (!packet || typeof packet !== 'object') return fail('PACKET_CLOSE_INVALID', ['decision-packet-required']);
  if (!chosenForecast || typeof chosenForecast !== 'object') return fail('PACKET_CLOSE_INVALID', ['sealed-forecast-required']);

  const score = scoreForecast({ forecast: chosenForecast, outcome, observedAt });
  if (!score.ok) return { ok: false, status: 'PACKET_OUTCOME_NOT_SCORABLE', scoreFailure: score, businessEffectAuthority: 'NONE' };

  const quality = decisionQuality({
    forecast: chosenForecast,
    score,
    availableAtTime,
    // What was actually considered at decision time -- every option in the
    // packet, not only the one chosen. This is what lets a well-considered
    // decision that happened to turn out badly be told apart from a decision
    // that never weighed its alternatives.
    consideredAlternatives: Array.isArray(packet.materiallyDistinctOptions) ? packet.materiallyDistinctOptions : []
  });

  return {
    ok: true,
    status: 'PACKET_LOOP_CLOSED',
    decision: packet.decision,
    score,
    decisionQuality: quality,
    // Restated on the closing receipt for the same reason it is restated on
    // the packet: a caller reading only the receipt must not have to trust
    // that the separation held somewhere upstream.
    separation: quality.ok ? quality.separation : null,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Turns a decision packet into a private record, provenance-linked to the
 * private records it was built from, and derives a Living Model claim from
 * it -- composing `deriveLivingModel` rather than writing a second derived
 * store.
 *
 * This is the seam that makes the packet reachable by deletion. A packet that
 * is not written as a `DERIVED_MODEL` record citing its sources is invisible
 * to `derivedClosure`, and a decision summary invisible to closure is a
 * decision summary that survives the deletion of the private records it
 * describes -- the exact failure the private core's header names as
 * catastrophic rather than a bug to fix later.
 */
export function derivePacketAsPrivateRecord({ store = [], packet = null, sourceRecordIds = [], authorization = null, now = new Date() } = {}) {
  if (!founderAuthorized(authorization)) return fail('PACKET_PRIVATE_RECORD_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  if (!packet || typeof packet !== 'object' || !text(packet.decision, 2000)) {
    return fail('PACKET_PRIVATE_RECORD_INVALID', ['decision-packet-required']);
  }
  const sources = (Array.isArray(sourceRecordIds) ? sourceRecordIds : []).map(id => text(id, 80)).filter(Boolean);
  if (sources.length === 0) {
    // No provenance means no reachability by `derivedClosure`. Refused rather
    // than stored, for the same reason `deriveLivingModel` refuses a claim
    // with no `derivedFrom`.
    return fail('PACKET_PRIVATE_RECORD_INVALID', ['packet-must-cite-source-private-records']);
  }

  const summary = `Decision packet: ${packet.decision} -> ${packet.recommendation}`;
  const derivation = deriveLivingModel({
    store,
    claims: [{
      body: summary,
      derivedFrom: sources,
      interpretation: JSON.stringify({
        materiallyDistinctOptions: packet.materiallyDistinctOptions,
        recommendation: packet.recommendation,
        recommendationIsValueBoundary: Boolean(packet.recommendationIsValueBoundary)
      }),
      certainty: null
    }],
    authorization,
    now
  });
  if (!derivation.ok) return derivation;
  if (derivation.refusedCount > 0) {
    return fail('PACKET_PRIVATE_RECORD_INVALID', ['packet-derivation-refused'], { refused: derivation.refused });
  }

  return {
    ok: true,
    status: 'PACKET_PRIVATE_RECORD_DERIVED',
    record: derivation.derived[0],
    store: derivation.store,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Exports the private decision history, or deletes a decision and everything
 * derived from it -- composing the private core's export/delete primitives
 * rather than reimplementing either.
 *
 * `mode: 'DELETE'` is where memory sovereignty is actually enforced for this
 * module: the returned `remainingSummaries` (derived from the post-delete
 * store) must not contain a record whose id was in the deleted closure. That
 * is asserted by the caller against `deletePrivateRecords`'s own
 * `deletedIds`, not recomputed here, so there is exactly one place that
 * decides what "deleted" means.
 */
export function exportOrDeleteDecisionHistory({ mode = null, store = [], ids = [], authorization = null, destination = null, now = new Date() } = {}) {
  if (mode === 'EXPORT') {
    return exportPrivateState({ store, authorization, destination, now });
  }
  if (mode === 'DELETE') {
    return deletePrivateRecords({ store, ids, authorization, now });
  }
  return fail('DECISION_HISTORY_MODE_INVALID', ['mode-must-be-export-or-delete']);
}

/**
 * The full closure a given set of decision-packet record ids would pull in if
 * deleted -- exposed directly so a caller (and the tests) can verify, before
 * deleting, exactly which derived summaries would disappear with them.
 *
 * A thin pass-through to the private core's `derivedClosure`. It exists as a
 * named export here, rather than requiring every caller to import the private
 * core directly, because "what would this deletion actually reach" is a
 * question this module's own callers ask constantly.
 */
export function decisionClosure(store, rootIds) {
  return derivedClosure(store, rootIds);
}

/**
 * Value of information and shelf-life composed for one open decision, plus a
 * half-life on the packet's recommendation itself.
 *
 * Bundled together because canon treats "should we wait for more evidence"
 * and "is the window closing" as two views of the same open decision, and a
 * caller asking one is almost always about to ask the other.
 */
export function decisionTiming({ decision = null, wouldChangeChoice = false, acquisitionCost = 0, delayCost = 0, option = null, availability = null, expiresAround = null, forecastClaim = null, forecastAssumptions = [], invalidationTriggers = [], expectedHalfLife = null } = {}) {
  const voi = valueOfInformation({ decision, wouldChangeChoice, acquisitionCost, delayCost });
  const shelfLife = decisionShelfLife({ option, availability, expiresAround });
  const halfLife = forecastClaim
    ? predictionHalfLife({ forecast: forecastClaim, assumptions: forecastAssumptions, invalidationTriggers, expectedHalfLife })
    : null;

  return {
    ok: true,
    status: 'DECISION_TIMING_ASSESSED',
    valueOfInformation: voi,
    shelfLife: shelfLife.ok ? shelfLife : null,
    shelfLifeFailure: shelfLife.ok ? null : shelfLife,
    predictionHalfLife: halfLife,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Adversarial future selves attacking the packet's own recommendation, plus a
 * Goodhart check on whichever proxy metric the recommendation leaned on --
 * composed rather than reimplemented, and returned together because both are
 * attacks on the same claim from different directions.
 */
export function stressTestRecommendation({ packet = null, attacks = [], proxyMetric = null, standsFor = null, optimizedBy = [] } = {}) {
  if (!packet || typeof packet !== 'object' || !text(packet.decision, 2000)) {
    return fail('STRESS_TEST_INVALID', ['decision-packet-required']);
  }
  const adversarial = adversarialFutureSelves({ decision: packet.decision, attacks });
  const goodhart = proxyMetric ? goodhartRisk({ metric: proxyMetric, standsFor, optimizedBy }) : null;

  return {
    ok: true,
    status: 'RECOMMENDATION_STRESS_TESTED',
    adversarial,
    goodhart,
    businessEffectAuthority: 'NONE'
  };
}

// Re-exported so a caller composing a full loop from this module alone still
// has access to the raw building blocks (buildForecast, scoreOption, and the
// private-record normalizer) without a second import from three other files.
export { buildForecast, scoreOption, normalizePrivateRecord };
