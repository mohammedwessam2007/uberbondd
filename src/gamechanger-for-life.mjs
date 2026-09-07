// Watching the world for changes that move what this particular life can reach.
//
// The economic Gamechanger mesh already scores world signals: a model release,
// a price collapse, a new protocol. That machinery is real and this module does
// not repeat it. The question here is a different one and does not follow from
// a market score:
//
//   did the geometry of Mohamed's reachable futures just change?
//
// Almost always the honest answer is no. A capability got cheaper and nothing
// about a life moved. The failure this module exists to prevent is the one
// where novelty is read as geometry -- where a stream of genuinely interesting
// world changes becomes a standing instruction to reorganise a life around
// whatever shipped this week. The canon names it directly: detect
// discontinuities early enough to benefit without chasing every novelty.
//
// So a signal must earn the claim:
//
//   name the life dimension whose reachability changed, or it is novelty
//   state what would have to be true, or it stays a hypothesis
//   a market score is not life relevance and cannot be imported as one
//
// Urgency and importance are also kept apart, because a closing window and a
// large effect are different facts and the interesting signals are the ones
// that are only one of them.
import { LIFE_DIMENSIONS, REACHABILITY } from './life-possibility-engine.mjs';

export const GAMECHANGER_FOR_LIFE_VERSION = 'uberbond.gamechanger-for-life.v1';

export { LIFE_DIMENSIONS, REACHABILITY };

/** What a signal currently is with respect to this life. */
export const LIFE_SIGNAL_STATES = Object.freeze([
  'NOVELTY_NOT_GEOMETRY_CHANGE',  // interesting; changes nothing reachable
  'HYPOTHESIS',                   // claims a change; nothing has grounded it
  'GROUNDED_BY_OBSERVATION'       // personal evidence says the reach did change
]);

/** Evidence that can ground a claimed change. Ordered weakest to strongest. */
export const GROUNDING_EVIDENCE = Object.freeze([
  'VENDOR_CLAIM', 'THIRD_PARTY_REPORT', 'OBSERVED_BY_OTHERS', 'PERSONALLY_TESTED'
]);

/** Why a window may be closing. Urgency, which is not importance. */
export const WINDOW_CAUSES = Object.freeze(['AGE', 'FAMILY_CIRCUMSTANCE', 'GEOGRAPHY', 'HISTORICAL_MOMENT', 'RELATIONSHIP', 'TECHNOLOGY', 'POLICY', 'NONE_KNOWN']);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Classifies a world change against this life.
 *
 * The two required fields are the whole design. A signal that cannot name the
 * dimension it moves is novelty by construction, and a signal that cannot name
 * what would have to be true has not made a claim anyone can check.
 *
 * `economicScore` is accepted and deliberately not used. Callers hold one --
 * the mesh produces it -- and the refusal has to be visible at the boundary
 * rather than implied by its absence, or the next caller will pass it in and
 * assume it counted.
 */
export function classifySignal(input = {}) {
  const title = text(input?.title, 480);
  if (!title) return fail('LIFE_SIGNAL_INVALID', ['signal-title-required']);

  const observedAt = text(input?.observedAt, 64);
  if (!observedAt) return fail('LIFE_SIGNAL_INVALID', ['observed-at-required']);

  const changes = [...new Set((Array.isArray(input?.changesReachabilityOf) ? input.changesReachabilityOf : [])
    .map(item => text(item, 40)).filter(item => item && LIFE_DIMENSIONS.includes(item)))].sort();

  const economicScoreIgnored = input?.economicScore != null;

  if (changes.length === 0) {
    return {
      ok: true,
      status: 'LIFE_SIGNAL_CLASSIFIED',
      signal: { title, observedAt },
      state: 'NOVELTY_NOT_GEOMETRY_CHANGE',
      changesReachabilityOf: [],
      economicScoreIgnored,
      law: 'A_SIGNAL_THAT_NAMES_NO_DIMENSION_IT_MOVES_IS_NOVELTY__A_MARKET_SCORE_IS_NOT_LIFE_RELEVANCE',
      businessEffectAuthority: 'NONE'
    };
  }

  const wouldHaveToBeTrue = [...new Set((Array.isArray(input?.wouldHaveToBeTrue) ? input.wouldHaveToBeTrue : [])
    .map(item => text(item, 480)).filter(Boolean))];
  if (wouldHaveToBeTrue.length === 0) {
    return fail('LIFE_SIGNAL_INVALID', ['grounding-conditions-required'], {
      signal: title,
      note: 'A claimed change to reachable futures that states no condition has made a claim nobody can check or refute.'
    });
  }

  return {
    ok: true,
    status: 'LIFE_SIGNAL_CLASSIFIED',
    signal: { title, observedAt },
    state: 'HYPOTHESIS',
    changesReachabilityOf: changes,
    wouldHaveToBeTrue,
    economicScoreIgnored,
    law: 'A_CLAIMED_GEOMETRY_CHANGE_STAYS_A_HYPOTHESIS_UNTIL_PERSONAL_OBSERVATION_GROUNDS_IT',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Promotes a hypothesis only on evidence that is actually about this life.
 *
 * Vendor claims and press reports are how the world describes itself. They can
 * raise a hypothesis and they cannot settle one, because the question was never
 * whether the capability exists -- it was whether this person's reach changed.
 */
export function ground({ signal = null, evidence = null, conditionsMet = [] } = {}) {
  const title = text(signal?.signal?.title ?? signal?.title, 480);
  if (!title) return fail('GROUNDING_INVALID', ['classified-signal-required']);
  if (signal?.state === 'NOVELTY_NOT_GEOMETRY_CHANGE') {
    return fail('GROUNDING_INVALID', ['novelty-has-no-claim-to-ground'], { signal: title });
  }

  const kind = text(evidence, 40);
  if (!kind || !GROUNDING_EVIDENCE.includes(kind)) {
    return fail('GROUNDING_INVALID', ['known-grounding-evidence-required'], { known: GROUNDING_EVIDENCE });
  }

  const required = Array.isArray(signal?.wouldHaveToBeTrue) ? signal.wouldHaveToBeTrue : [];
  const met = [...new Set((Array.isArray(conditionsMet) ? conditionsMet : []).map(item => text(item, 480)).filter(Boolean))];
  const outstanding = required.filter(item => !met.includes(item)).sort();

  // Only direct personal testing can settle a question about personal reach.
  if (kind !== 'PERSONALLY_TESTED') {
    return {
      ok: true,
      status: 'GROUNDING_INSUFFICIENT',
      signal: title,
      state: 'HYPOTHESIS',
      evidence: kind,
      outstandingConditions: outstanding,
      law: 'THE_WORLD_DESCRIBING_ITSELF_CANNOT_SETTLE_WHETHER_THIS_PERSONS_REACH_CHANGED',
      businessEffectAuthority: 'NONE'
    };
  }

  if (outstanding.length > 0) {
    return {
      ok: true,
      status: 'GROUNDING_INCOMPLETE',
      signal: title,
      state: 'HYPOTHESIS',
      evidence: kind,
      outstandingConditions: outstanding,
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'GROUNDED',
    signal: title,
    state: 'GROUNDED_BY_OBSERVATION',
    evidence: kind,
    outstandingConditions: [],
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Separates a closing window from a large effect.
 *
 * Both get called "urgent" in ordinary speech and they behave nothing alike. A
 * large effect with no window can wait and should; a small effect behind a
 * window that shuts at thirty cannot. Returning one blended priority would
 * lose exactly the distinction worth having.
 */
export function windowVersusImportance({ signal = null, windowCause = 'NONE_KNOWN', closesAround = null, dimensionsMoved = [] } = {}) {
  const title = text(signal, 480);
  if (!title) return fail('WINDOW_INVALID', ['signal-title-required']);
  const cause = text(windowCause, 40);
  if (!cause || !WINDOW_CAUSES.includes(cause)) {
    return fail('WINDOW_INVALID', ['known-window-cause-required'], { known: WINDOW_CAUSES });
  }
  const moved = [...new Set((Array.isArray(dimensionsMoved) ? dimensionsMoved : [])
    .map(item => text(item, 40)).filter(item => item && LIFE_DIMENSIONS.includes(item)))].sort();

  const urgent = cause !== 'NONE_KNOWN';
  const important = moved.length >= 2;

  return {
    ok: true,
    status: 'WINDOW_AND_IMPORTANCE_SEPARATED',
    signal: title,
    urgent,
    important,
    windowCause: cause,
    closesAround: text(closesAround, 64) || null,
    dimensionsMoved: moved,
    // Reported as a pair, never blended. The interesting cases are the ones
    // that are only one of the two.
    reading: urgent && !important ? 'CLOSING_WINDOW_ON_A_NARROW_CHANGE'
      : important && !urgent ? 'LARGE_CHANGE_THAT_CAN_WAIT'
        : urgent && important ? 'CLOSING_WINDOW_ON_A_BROAD_CHANGE'
          : 'NEITHER_URGENT_NOR_BROAD',
    law: 'URGENCY_AND_IMPORTANCE_ARE_DIFFERENT_FACTS_AND_ARE_NOT_BLENDED_INTO_ONE_PRIORITY',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The attention budget, which is the point of the whole organ.
 *
 * Sensing more of the world is only an improvement if what is surfaced stays
 * small. Novelty is dropped before the budget is spent; the budget then bounds
 * what is left, and what did not fit is reported rather than silently cut, so
 * a full budget reads as a full budget and not as an empty world.
 */
export function attentionBudget(signals = [], { maxSurfaced = 5 } = {}) {
  const cap = Number(maxSurfaced);
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 50) {
    return fail('ATTENTION_BUDGET_INVALID', ['bounded-surfacing-cap-required'], {
      note: 'An unbounded budget is how a world sensor becomes a standing instruction to reorganise a life weekly.'
    });
  }

  const rows = (Array.isArray(signals) ? signals : []).filter(row => row?.signal?.title && row?.state);
  const novelty = rows.filter(row => row.state === 'NOVELTY_NOT_GEOMETRY_CHANGE');
  const candidates = rows.filter(row => row.state !== 'NOVELTY_NOT_GEOMETRY_CHANGE');

  const ranked = [...candidates].sort((a, b) => {
    const grounded = row => (row.state === 'GROUNDED_BY_OBSERVATION' ? 1 : 0);
    return grounded(b) - grounded(a)
      || (b.changesReachabilityOf?.length || 0) - (a.changesReachabilityOf?.length || 0)
      || String(a.signal.title).localeCompare(String(b.signal.title));
  });

  const surfaced = ranked.slice(0, cap);
  const deferred = ranked.slice(cap);

  return {
    ok: true,
    status: 'ATTENTION_BUDGET_APPLIED',
    surfaced: surfaced.map(row => ({ title: row.signal.title, state: row.state, dimensions: row.changesReachabilityOf || [] })),
    deferredCount: deferred.length,
    deferred: deferred.map(row => row.signal.title),
    droppedAsNovelty: novelty.map(row => row.signal.title),
    cap,
    law: 'SENSING_MORE_WORLD_IS_ONLY_AN_IMPROVEMENT_IF_WHAT_REACHES_ATTENTION_STAYS_SMALL',
    businessEffectAuthority: 'NONE'
  };
}
