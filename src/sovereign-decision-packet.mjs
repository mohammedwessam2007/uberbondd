// The option universe, the forecasts over it, and the packet handed back.
//
// Two failure modes sit on either side of this module, and they look identical
// from outside because both produce a confident-looking answer:
//
//   collapse -- five options that are one option in five wordings, so the
//   "universe" was a formality and the decision was made before it ran;
//   theatre  -- a probability with no basis, which is worse than "unknown"
//   because a number gets acted on and an unknown gets investigated.
//
// The North Star's phrasing is the test: the target is the strongest calibrated
// prediction reality permits, not the most confident-sounding one. So a forecast
// here must name what it is built from, and a bare assertion cannot buy a
// number at any confidence.
//
// Nothing in this file recommends its way past the type ladder. The packet ends
// at RECOMMENDATION; the CHOICE rung is the founder's and is not reachable from
// here.
import { createHash } from 'node:crypto';

export const SOVEREIGN_DECISION_PACKET_VERSION = 'uberbond.sovereign-decision-packet.v1';

/** Families a real option universe should span, not a style guide for wording. */
export const OPTION_FAMILIES = Object.freeze([
  'STRONGEST_OBVIOUS', 'STRONGEST_NON_OBVIOUS', 'STATUS_QUO', 'DELAY_FOR_INFORMATION',
  'REVERSIBLE_TRIAL', 'STAGED_COMMITMENT', 'FULL_COMMITMENT', 'HYBRID', 'EXIT',
  'DELEGATION', 'CAPABILITY_FIRST', 'ENVIRONMENT_FIRST', 'RESOURCE_FIRST',
  'RELATIONSHIP_ROUTE', 'TOOL_ROUTE', 'PHYSICAL_ROUTE', 'UNCONVENTIONAL',
  'OPTIONALITY_PRESERVING', 'GENESIS_INVENTED'
]);

/**
 * Evidence kinds a forecast may rest on, and whether each can carry a number.
 *
 * `quantitative: false` does not mean weak. A causal model can be the strongest
 * thing in the room and still not license a probability on its own -- it says
 * how, not how often. Assertion is here because refusing to record it would
 * just push it into a comment field; recorded and marked, it can be counted as
 * the nothing it is.
 */
export const EVIDENCE_KINDS = Object.freeze({
  REFERENCE_CLASS: { quantitative: true },
  PERSONAL_LONGITUDINAL: { quantitative: true },
  CURRENT_WORLD_EVIDENCE: { quantitative: true },
  HINDCAST: { quantitative: true },
  CALIBRATION_HISTORY: { quantitative: true },
  CAUSAL_MODEL: { quantitative: false },
  SCENARIO_TREE: { quantitative: false },
  ADVERSARIAL_REVIEW: { quantitative: false },
  EXPERT_TESTIMONY: { quantitative: false },
  SIMULATION: { quantitative: false },
  ASSERTION: { quantitative: false }
});

/** The terminal epistemic states a forecast may honestly end in. */
export const FORECAST_STATES = Object.freeze([
  'QUANTIFIED', 'RANGE_ONLY', 'UNKNOWN__MORE_EVIDENCE_REQUIRED',
  'NO_MODEL_CURRENTLY_DESERVES_TRUST', 'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT'
]);

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * The causal signature of an option: what it actually changes.
 *
 * Deliberately not the option's prose. Two options worded differently that
 * change the same variables in the same direction are one option, and the whole
 * point of the universe is to contain more than one.
 */
export function optionSignature(option) {
  const changes = [...new Set((Array.isArray(option?.changes) ? option.changes : [])
    .map(change => text(change, 200)).filter(Boolean))].sort();
  const reversible = option?.reversible === true;
  return createHash('sha256').update(JSON.stringify([changes, reversible])).digest('hex').slice(0, 32);
}

/**
 * Builds the option universe, merging cosmetic variants.
 *
 * Merging rather than dropping: the second wording is kept as an alias, because
 * a founder who phrased it that way should find it, and because a "deduped 4 of
 * 9" count is the signal that the generator was producing variants of one idea.
 */
export function compileOptionUniverse(options = []) {
  const rows = [];
  const bySignature = new Map();
  const problems = [];

  for (const option of (Array.isArray(options) ? options : [])) {
    const name = text(option?.name, 240);
    const family = text(option?.family, 60);
    const changes = (Array.isArray(option?.changes) ? option.changes : []).map(c => text(c, 200)).filter(Boolean);
    if (!name) { problems.push({ option, reasonCodes: ['option-name-required'] }); continue; }
    if (!OPTION_FAMILIES.includes(family)) { problems.push({ name, reasonCodes: ['valid-option-family-required'] }); continue; }
    // An option that changes nothing is not an option; it is a restatement of
    // the status quo, which is itself already a family.
    if (changes.length === 0 && family !== 'STATUS_QUO') {
      problems.push({ name, reasonCodes: ['option-must-name-what-it-changes'] });
      continue;
    }

    const signature = optionSignature(option);
    const existing = bySignature.get(signature);
    if (existing) {
      if (!existing.aliases.includes(name)) existing.aliases.push(name);
      if (!existing.families.includes(family)) existing.families.push(family);
      continue;
    }
    const row = {
      name, aliases: [], family, families: [family], signature,
      changes: [...new Set(changes)].sort(),
      // Three states, not two. The signature below folds unstated in with
      // not-reversible, which is the conservative grouping -- but a caller
      // asking "which of these cannot be undone" must not be told that every
      // option nobody labelled is irreversible. "Do nothing" is not a
      // commitment.
      reversible: option?.reversible === true ? true : (option?.reversible === false ? false : null),
      requires: (Array.isArray(option?.requires) ? option.requires : []).map(r => text(r, 200)).filter(Boolean),
      closes: (Array.isArray(option?.closes) ? option.closes : []).map(r => text(r, 200)).filter(Boolean),
      timeToFirstEvidence: text(option?.timeToFirstEvidence, 120) || null
    };
    bySignature.set(signature, row);
    rows.push(row);
  }

  const merged = (Array.isArray(options) ? options : []).length - rows.length - problems.length;
  return {
    ok: rows.length > 0,
    status: rows.length > 0 ? 'OPTION_UNIVERSE_COMPILED' : 'OPTION_UNIVERSE_EMPTY',
    options: rows,
    distinctCount: rows.length,
    mergedVariants: merged,
    problems,
    // The number that says whether a universe was actually searched. One
    // distinct option from nine submitted is a decision already made.
    familiesRepresented: [...new Set(rows.flatMap(row => row.families))].sort(),
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A forecast for one option, at the strength its evidence actually supports.
 *
 * The rule that carries this: a probability requires at least one quantitative
 * evidence kind. Not because qualitative reasoning is inferior, but because a
 * number implies a frequency, and a causal story does not contain one. Without
 * that, the honest output is a range or UNKNOWN -- and UNKNOWN is a result, not
 * a failure to compute.
 */
export function forecastOption({ option = null, evidence = [], distribution = null, irreversible = false, now = new Date() } = {}) {
  const name = text(option?.name, 240);
  if (!name) return fail('FORECAST_INVALID', ['option-required']);

  const rows = (Array.isArray(evidence) ? evidence : [])
    .map(row => ({ kind: text(row?.kind, 60), detail: text(row?.detail, 2000), ref: text(row?.ref, 400) || null }))
    .filter(row => row.kind && EVIDENCE_KINDS[row.kind]);

  const quantitative = rows.filter(row => EVIDENCE_KINDS[row.kind].quantitative);
  const independentSources = new Set(rows.map(row => row.ref).filter(Boolean));

  let state;
  let probabilities = null;
  let range = null;

  if (rows.length === 0) {
    state = 'UNKNOWN__MORE_EVIDENCE_REQUIRED';
  } else if (quantitative.length === 0) {
    // Reasoning exists, frequency does not.
    state = distribution?.range ? 'RANGE_ONLY' : 'UNKNOWN__MORE_EVIDENCE_REQUIRED';
    range = distribution?.range ?? null;
  } else if (distribution?.probabilities && typeof distribution.probabilities === 'object') {
    state = 'QUANTIFIED';
    probabilities = distribution.probabilities;
    range = distribution.range ?? null;
  } else {
    state = 'RANGE_ONLY';
    range = distribution?.range ?? null;
  }

  return {
    ok: true,
    status: 'OPTION_FORECAST',
    option: name,
    state,
    probabilities,
    range,
    evidence: rows,
    // Correlated sources are not independent evidence, so the count that
    // matters is distinct refs, not row count. Five models trained on the same
    // corpus agreeing is one source agreeing with itself.
    strength: {
      evidenceRows: rows.length,
      quantitativeKinds: [...new Set(quantitative.map(row => row.kind))],
      independentSources: independentSources.size,
      irreversible: irreversible === true
    },
    forecastAt: new Date(now).toISOString(),
    truthBoundary: 'A FORECAST IS AN ESTIMATE UNDER STATED EVIDENCE. IT IS NOT AN OUTCOME, A VALUE JUDGMENT, OR A DECISION.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The packet handed back to the founder.
 *
 * It ends at a recommendation and says so. The refusal below is the load-bearing
 * line: when the remaining difference between the leading options is normative
 * rather than factual, more reasoning cannot settle it, and producing a winner
 * anyway is the system substituting its values for his.
 */
export function compileDecisionPacket({ decision = null, universe = null, forecasts = [], valueBoundary = false, now = new Date() } = {}) {
  const question = text(decision, 2000);
  if (!question) return fail('DECISION_PACKET_INVALID', ['decision-required']);
  if (!universe?.ok) return fail('DECISION_PACKET_INVALID', ['compiled-option-universe-required']);

  const rows = (Array.isArray(forecasts) ? forecasts : []).filter(row => row?.ok);
  const unforecast = universe.options.map(o => o.name).filter(name => !rows.some(row => row.option === name));

  // A packet whose options were never all forecast presents a partial search as
  // a complete one, which is exactly how the leading option wins by default.
  if (unforecast.length) {
    return fail('DECISION_PACKET_INCOMPLETE', ['every-option-requires-a-forecast'], { unforecast });
  }

  const quantified = rows.filter(row => row.state === 'QUANTIFIED');
  const irreversible = rows.filter(row => row.strength.irreversible).map(row => row.option);

  const recommendation = valueBoundary || quantified.length === 0
    ? {
      state: valueBoundary ? 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED' : 'NO_RECOMMENDATION__NO_QUANTIFIED_FORECAST',
      body: valueBoundary
        ? 'The remaining difference between these options is a value choice, not a factual one. More reasoning cannot settle it.'
        : 'No option has a forecast strong enough to rank on. The highest-value next step is evidence, not a decision.',
      option: null
    }
    : { state: 'RECOMMENDATION', body: `On current evidence, ${quantified[0].option} is the strongest option.`, option: quantified[0].option };

  return {
    ok: true,
    status: 'SOVEREIGN_DECISION_PACKET',
    decision: question,
    compiledAt: new Date(now).toISOString(),
    options: universe.options,
    distinctOptions: universe.distinctCount,
    mergedVariants: universe.mergedVariants,
    familiesRepresented: universe.familiesRepresented,
    forecasts: rows,
    unknowns: rows.filter(row => row.state !== 'QUANTIFIED').map(row => ({ option: row.option, state: row.state })),
    irreversibleOptions: irreversible,
    recommendation,
    // The rung this packet stops at. Stated on the object so a caller cannot
    // read the recommendation as a decision that has already been made.
    highestRung: 'RECOMMENDATION',
    founderAuthority: 'THE FOUNDER CHOOSES. THIS PACKET ENDS AT A RECOMMENDATION AND CANNOT REACH THE CHOICE RUNG.',
    businessEffectAuthority: 'NONE'
  };
}
