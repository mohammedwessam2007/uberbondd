// What the system shows, what it leaves out, and whether that shaped the choice.
//
// Freedom is bounded by what enters awareness, which makes the presentation
// layer an authority nobody voted for. A system can be scrupulously honest in
// every individual claim and still decide an outcome by ordering, emphasis,
// omission, or by which option it never surfaced.
//
// That failure is invisible from inside: the recommendation was true, the
// reasoning was sound, and the option that would have won was never on the page.
// So this module records the shape of what was shown rather than the content --
// and the one thing it insists on is that an omission is logged with a reason,
// because an unlogged omission is indistinguishable from a decision nobody made.
export const SALIENCE_SOVEREIGNTY_VERSION = 'uberbond.salience-sovereignty.v1';

/** Why something was left out. NONE_GIVEN is a real value and is meant to sting. */
export const OMISSION_REASONS = Object.freeze([
  'BELOW_RELEVANCE_THRESHOLD', 'DUPLICATE_OF_SHOWN', 'FOUNDER_ASKED_NOT_TO_SEE',
  'INSUFFICIENT_EVIDENCE', 'SPACE_CONSTRAINT', 'NONE_GIVEN'
]);

/** How the system may address the founder, cheapest attention first. */
export const ATTENTION_LEVELS = Object.freeze([
  'STAY_SILENT', 'SUMMARIZE_LATER', 'SURFACE_ON_NEXT_VISIT', 'INTERRUPT', 'REQUIRE_CONFIRMATION'
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
 * The ledger of one presentation.
 *
 * An omission with no reason is recorded as NONE_GIVEN rather than dropped.
 * Dropping it would make the ledger a record of what the system chose to admit,
 * which is the opposite of the point.
 */
export function salienceLedger({ decision = null, shown = [], omitted = [], emphasis = [] } = {}) {
  const question = text(decision, 1000);
  if (!question) return fail('SALIENCE_LEDGER_INVALID', ['decision-required']);

  const shownRows = (Array.isArray(shown) ? shown : [])
    .map((item, index) => ({ item: text(item, 500), position: index + 1 }))
    .filter(row => row.item);

  const omittedRows = (Array.isArray(omitted) ? omitted : [])
    .map(row => ({
      item: text(row?.item ?? row, 500),
      reason: OMISSION_REASONS.includes(row?.reason) ? row.reason : 'NONE_GIVEN'
    }))
    .filter(row => row.item);

  const unexplained = omittedRows.filter(row => row.reason === 'NONE_GIVEN');

  return {
    ok: true,
    status: 'SALIENCE_RECORDED',
    decision: question,
    shown: shownRows,
    omitted: omittedRows,
    emphasised: (Array.isArray(emphasis) ? emphasis : []).map(item => text(item, 500)).filter(Boolean),
    unexplainedOmissions: unexplained.map(row => row.item),
    // The number worth looking at. An unexplained omission is not a bug in the
    // ledger; it is a choice the system made and could not account for.
    accountable: unexplained.length === 0,
    law: 'AN_UNLOGGED_OMISSION_IS_INDISTINGUISHABLE_FROM_A_DECISION_NOBODY_MADE',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether the ordering did the deciding.
 *
 * The test is the only honest one available: show the same options in a
 * different order and see whether the choice moves. If it does, the ordering
 * was the argument.
 */
export function frameDependence({ options = [], chosenFirstOrder = null, chosenReordered = null } = {}) {
  const names = (Array.isArray(options) ? options : []).map(item => text(item, 240)).filter(Boolean);
  if (names.length < 2) return fail('FRAME_TEST_INVALID', ['at-least-two-options-required']);

  const first = text(chosenFirstOrder, 240);
  const second = text(chosenReordered, 240);
  if (!first || !second) {
    return fail('FRAME_TEST_NOT_RUN', ['both-orderings-required'], {
      note: 'Frame dependence cannot be inferred from one presentation. Without the second the answer is unknown, not clean.'
    });
  }

  return {
    ok: true,
    status: first === second ? 'CHOICE_STABLE_UNDER_REORDERING' : 'CHOICE_MOVED_WITH_THE_ORDERING',
    frameDependent: first !== second,
    chosenFirstOrder: first,
    chosenReordered: second,
    note: first === second
      ? 'The choice survived reordering, which is evidence it was about the options.'
      : 'The choice moved when only the order changed, so the ordering was part of the argument.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The materially different option that never made the page.
 *
 * Asked as a question rather than answered, because a system cannot reliably
 * enumerate its own blind spots -- but it can record that nobody looked.
 */
export function unchosenUniverse({ surfaced = [], families = [] } = {}) {
  const shown = new Set((Array.isArray(surfaced) ? surfaced : []).map(item => text(item, 240)).filter(Boolean));
  const all = (Array.isArray(families) ? families : []).map(item => text(item, 240)).filter(Boolean);
  const absent = all.filter(family => !shown.has(family));

  return {
    ok: true,
    status: absent.length ? 'FAMILIES_NOT_SURFACED' : 'ALL_SUPPLIED_FAMILIES_SURFACED',
    notSurfaced: absent,
    question: 'Which materially different option failed to reach the page, and did anyone look?',
    truthBoundary: 'THIS COMPARES AGAINST THE FAMILIES SUPPLIED. IT CANNOT ENUMERATE OPTIONS NOBODY THOUGHT OF.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether an interruption is worth the attention it costs.
 *
 * Every interruption displaces a mental state, and the displaced state is never
 * on the ledger. Defaults to silence, because a system that resolves ties
 * toward speaking will speak constantly.
 */
export function attentionBudget({ value = 0, switchingCost = 0, currentStateValue = 0, irreversibleIfMissed = false } = {}) {
  const gain = Number(value) || 0;
  const cost = (Number(switchingCost) || 0) + (Number(currentStateValue) || 0);

  if (irreversibleIfMissed) {
    return {
      ok: true, status: 'INTERRUPT', level: 'INTERRUPT', gain, cost,
      why: 'Missing this cannot be undone, which outweighs the attention it costs.',
      businessEffectAuthority: 'NONE'
    };
  }
  if (gain > cost) {
    return { ok: true, status: 'SURFACE_LATER', level: 'SURFACE_ON_NEXT_VISIT', gain, cost, businessEffectAuthority: 'NONE' };
  }
  return {
    ok: true,
    status: 'STAY_SILENT',
    level: 'STAY_SILENT',
    gain,
    cost,
    why: 'The interruption costs more than it is worth, and the displaced state never appears on any ledger.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether the founder's stated preference has drifted toward the system's.
 *
 * Correlation, offered as a question rather than a finding: convergence is what
 * agreement and capture look like from the outside, and this cannot tell them
 * apart. Saying which it is would be the system assessing its own influence.
 */
export function preferenceDrift({ founderPositions = [], systemRecommendations = [] } = {}) {
  const founder = (Array.isArray(founderPositions) ? founderPositions : []).map(item => text(item, 240)).filter(Boolean);
  const system = (Array.isArray(systemRecommendations) ? systemRecommendations : []).map(item => text(item, 240)).filter(Boolean);
  const paired = Math.min(founder.length, system.length);
  if (paired < 2) return fail('DRIFT_CHECK_INVALID', ['at-least-two-paired-positions-required']);

  let agreements = 0;
  for (let i = 0; i < paired; i += 1) if (founder[i] === system[i]) agreements += 1;
  const rate = agreements / paired;

  return {
    ok: true,
    status: 'DRIFT_OBSERVED',
    paired,
    agreementRate: Number(rate.toFixed(4)),
    // Deliberately not a verdict. A high rate is equally consistent with the
    // system being right and with the founder having stopped disagreeing.
    question: rate > 0.9
      ? 'Positions have converged almost completely. Is that agreement, or has disagreement stopped happening?'
      : 'Positions still diverge, which is what independent judgement looks like.',
    boundary: 'CONVERGENCE_CANNOT_DISTINGUISH_AGREEMENT_FROM_CAPTURE_AND_THIS_DOES_NOT_TRY',
    businessEffectAuthority: 'NONE'
  };
}
