// The anti-amputation and anti-inflation laws, moved out of prose and into code.
//
// The canon states them clearly and prose does not enforce anything. Both
// failures have already happened in this repository's history, in both
// directions, and neither announced itself:
//
// Inflation. The Business Genome held 438 opportunity IDs, 2,000 scored
// combinations, 200 catalogued offers. OMNIA generated registries and test
// counts in the millions. Every one of those is inventory or synthetic scale,
// and every one reads like traction when quoted without its class. The number
// is real; what it counts is not customers.
//
// Amputation. A feature the current handoff does not mention reads as a feature
// that never existed, and a fresh session confidently rebuilds something that
// already shipped -- or worse, reports it as absent. Silence is not deletion,
// and the honest answer to "does this exist" is bounded by where you looked.
//
// So the rules are about *what a record is entitled to answer*:
//
//   only a commercial receipt answers a commercial question
//   absence is bounded by the sources searched, and names them
//   an unresolved name stays unresolved until a source ref resolves it
//   the active experiment is a row in the portfolio, never the portfolio
//   current truth outranks memory for now, and never deletes what it superseded
//
// That last pair is one rule, not two. Precedence without preservation is how a
// refactor eats a decade of context, and preservation without precedence is how
// a stale handoff outvotes the tree.
export const MEMORY_TRUTH_BOUNDARY_VERSION = 'uberbond.memory-truth-boundary.v1';

/** What a number counts. Only one of these is about the market. */
export const COUNT_CLASSES = Object.freeze([
  'INVENTORY',           // catalogue rows, opportunity IDs, offer combinations
  'SYNTHETIC_SCALE',     // generated registries, test counts, simulated spaces
  'RESEARCH_ASSET',      // studied things, breadth of investigation
  'INTERNAL_RECEIPT',    // the system's own record of its own action
  'COMMERCIAL_RECEIPT'   // provider-origin, externally verified
]);

/** Questions a count might be asked to answer. */
export const QUESTION_KINDS = Object.freeze([
  'HOW_MUCH_INVENTORY_EXISTS',
  'HOW_MUCH_RESEARCH_WAS_DONE',
  'HOW_MANY_CUSTOMERS',
  'HOW_MUCH_REVENUE',
  'HOW_MANY_ACTIVE_SKUS',
  'IS_THERE_DEMAND'
]);

/** Questions only a commercial receipt may answer. */
export const COMMERCIAL_QUESTIONS = Object.freeze([
  'HOW_MANY_CUSTOMERS', 'HOW_MUCH_REVENUE', 'HOW_MANY_ACTIVE_SKUS', 'IS_THERE_DEMAND'
]);

/** How a remembered thing currently stands. */
export const MEMORY_STATES = Object.freeze([
  'CURRENT', 'SUPERSEDED_DONATION_PRESERVED', 'UNRESOLVED_OWNER_RECALLED', 'NOT_FOUND_IN_SEARCHED_SOURCES'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const integer = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Asks a count a question, and refuses when the count is not that kind of thing.
 *
 * The refusal carries the number. Withholding it would be a different failure --
 * the count is real and useful for the question it can answer -- but it arrives
 * with its class attached so it cannot be quoted alone.
 *
 * Enforces: historical offer/combination counts are not customers, active SKUs,
 * revenue or demand; OMNIA synthetic scale is not production, economic or
 * market proof.
 */
export function answerFromCount({ count = null, countClass = null, describes = null, question = null } = {}) {
  const value = integer(count);
  if (value === null) return fail('COUNT_INVALID', ['non-negative-integer-count-required']);

  const kind = text(countClass, 40);
  if (!kind || !COUNT_CLASSES.includes(kind)) {
    return fail('COUNT_INVALID', ['known-count-class-required'], { known: COUNT_CLASSES });
  }
  const subject = text(describes, 480);
  if (!subject) return fail('COUNT_INVALID', ['count-subject-required'], {
    note: 'A number with no stated subject is the form every inflated claim already travels in.'
  });

  const asked = text(question, 60);
  if (!asked || !QUESTION_KINDS.includes(asked)) {
    return fail('COUNT_INVALID', ['known-question-required'], { known: QUESTION_KINDS });
  }

  if (COMMERCIAL_QUESTIONS.includes(asked) && kind !== 'COMMERCIAL_RECEIPT') {
    return {
      ok: true,
      status: 'COUNT_MAY_NOT_ANSWER_THIS',
      question: asked,
      count: value,
      countClass: kind,
      describes: subject,
      answer: null,
      // The number travels with its class so it cannot be quoted bare.
      refusal: `A ${kind} count describes ${subject}. It is not evidence about customers, revenue, active SKUs or demand.`,
      law: 'ONLY_A_COMMERCIAL_RECEIPT_ANSWERS_A_COMMERCIAL_QUESTION',
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'COUNT_ANSWERS_THIS',
    question: asked,
    count: value,
    countClass: kind,
    describes: subject,
    answer: value,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a thing exists, bounded by where the search actually looked.
 *
 * `NEVER_EXISTED` is not a reachable state. The strongest available answer is
 * NOT_FOUND_IN_SEARCHED_SOURCES with the sources named, because a fresh session
 * that has read one handoff has searched one handoff.
 *
 * Enforces: a new session may not infer that an unmentioned feature or program
 * never existed.
 */
export function resolveExistence({ name = null, sourcesSearched = [], foundIn = [], requiredSources = [] } = {}) {
  const subject = text(name, 480);
  if (!subject) return fail('EXISTENCE_INVALID', ['name-required']);

  const searched = [...new Set((Array.isArray(sourcesSearched) ? sourcesSearched : [])
    .map(item => text(item, 240)).filter(Boolean))].sort();
  if (searched.length === 0) {
    return fail('EXISTENCE_INVALID', ['sources-searched-required'], {
      note: 'An absence claim with no stated search is a claim about the speaker, not about the repository.'
    });
  }

  const found = [...new Set((Array.isArray(foundIn) ? foundIn : []).map(item => text(item, 240)).filter(Boolean))].sort();
  if (found.length > 0) {
    return {
      ok: true,
      status: 'FOUND',
      name: subject,
      state: 'CURRENT',
      foundIn: found,
      sourcesSearched: searched,
      businessEffectAuthority: 'NONE'
    };
  }

  const required = [...new Set((Array.isArray(requiredSources) ? requiredSources : [])
    .map(item => text(item, 240)).filter(Boolean))];
  const unsearched = required.filter(item => !searched.includes(item)).sort();

  return {
    ok: true,
    status: 'NOT_FOUND',
    name: subject,
    // The only absence state there is.
    state: 'NOT_FOUND_IN_SEARCHED_SOURCES',
    sourcesSearched: searched,
    requiredSourcesNotSearched: unsearched,
    searchComplete: unsearched.length === 0,
    law: 'SILENCE_IS_NOT_DELETION__NEVER_EXISTED_IS_NOT_A_REACHABLE_CONCLUSION',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * An owner-recalled name with no artifact behind it yet.
 *
 * It stays visible and unresolved. Guessing its meaning writes fiction into
 * canon; dropping it loses the only pointer to whatever it was. Resolution
 * requires a source ref, so a confident narrative cannot resolve it.
 *
 * Enforces: owner-recalled but unverified names remain visible as unresolved
 * memory rather than being guessed or silently dropped.
 */
export function resolveRecalledName({ name = null, sourceRef = null, proposedMeaning = null } = {}) {
  const subject = text(name, 480);
  if (!subject) return fail('RECALLED_NAME_INVALID', ['name-required']);

  const ref = text(sourceRef, 480);
  const meaning = text(proposedMeaning, 2000);

  if (!ref) {
    return {
      ok: true,
      status: 'NAME_REMAINS_UNRESOLVED',
      name: subject,
      state: 'UNRESOLVED_OWNER_RECALLED',
      // Kept, and kept separate. A proposal is not a resolution.
      proposedMeaning: meaning || null,
      resolved: false,
      law: 'A_NAME_WITHOUT_A_SOURCE_REF_STAYS_UNRESOLVED__GUESSING_WRITES_FICTION_INTO_CANON',
      droppingBoundary: 'AN_UNRESOLVED_NAME_IS_NEVER_DROPPED__IT_IS_THE_ONLY_POINTER_TO_WHATEVER_IT_WAS',
      businessEffectAuthority: 'NONE'
    };
  }

  if (!meaning) {
    return fail('RECALLED_NAME_INVALID', ['meaning-required-with-source'], { name: subject });
  }

  return {
    ok: true,
    status: 'NAME_RESOLVED',
    name: subject,
    state: 'CURRENT',
    sourceRef: ref,
    meaning,
    resolved: true,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What UberBond is, asked of a portfolio that has one active experiment.
 *
 * An answer naming only the active experiment is refused rather than returned
 * with a caveat, because the caveat is the part that gets dropped when the
 * sentence is quoted.
 *
 * Enforces: never reduce UberBond to the currently active commercial experiment.
 */
export function describePortfolio({ activeExperiment = null, portfolio = [], answerNames = [] } = {}) {
  const active = text(activeExperiment, 480);
  const rows = [...new Set((Array.isArray(portfolio) ? portfolio : [])
    .map(item => text(item, 480)).filter(Boolean))].sort();
  if (rows.length === 0) return fail('PORTFOLIO_INVALID', ['portfolio-required']);
  if (active && !rows.includes(active)) {
    return fail('PORTFOLIO_INVALID', ['active-experiment-must-be-in-portfolio'], {
      note: 'An active experiment outside the portfolio is a second registry, which is how the portfolio stops being the truth.'
    });
  }

  const named = [...new Set((Array.isArray(answerNames) ? answerNames : []).map(item => text(item, 480)).filter(Boolean))];
  const reducedToActive = Boolean(active) && named.length > 0 && named.every(item => item === active) && rows.length > 1;

  return {
    ok: true,
    status: reducedToActive ? 'ANSWER_REDUCES_PORTFOLIO_TO_ONE_EXPERIMENT' : 'PORTFOLIO_DESCRIBED',
    activeExperiment: active || null,
    portfolio: rows,
    portfolioSize: rows.length,
    reducedToActive,
    law: 'THE_ACTIVE_EXPERIMENT_IS_ONE_VALIDATION_PATH_INSIDE_THE_PORTFOLIO__NOT_THE_PORTFOLIO',
    allocationBoundary: 'RUNNING_ONE_EXPERIMENT_AT_A_TIME_IS_CAPITAL_ALLOCATION__NOT_A_DEFINITION_OF_THE_COMPANY',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Precedence and preservation, which are one rule.
 *
 * Current truth wins the present-tense claim. The superseded record is kept with
 * what it donated, because precedence without preservation is how a refactor
 * eats a decade of context.
 *
 * Enforces: current repository and durable external receipts outrank historical
 * memory when they conflict; and a superseded architecture is not resurrected
 * wholesale when current main already carries its useful semantics.
 */
export function reconcile({ claim = null, currentTruth = null, historicalMemory = null, donated = [] } = {}) {
  const subject = text(claim, 2000);
  if (!subject) return fail('RECONCILE_INVALID', ['claim-required']);

  const current = text(currentTruth, 2000);
  const historical = text(historicalMemory, 2000);
  if (!current && !historical) return fail('RECONCILE_INVALID', ['at-least-one-source-required']);

  const donations = [...new Set((Array.isArray(donated) ? donated : []).map(item => text(item, 480)).filter(Boolean))].sort();

  if (!current) {
    return {
      ok: true,
      status: 'HISTORICAL_ONLY',
      claim: subject,
      presentTenseAnswer: historical,
      answerClass: 'HISTORICAL_MEMORY__NOT_CURRENT_TRUTH',
      preserved: { historicalMemory: historical, donated: donations },
      businessEffectAuthority: 'NONE'
    };
  }

  const conflict = Boolean(historical) && historical !== current;

  return {
    ok: true,
    status: conflict ? 'SUPERSEDED_WITH_DONATION_PRESERVED' : 'CONSISTENT',
    claim: subject,
    presentTenseAnswer: current,
    answerClass: 'CURRENT_REPOSITORY_OR_EXTERNAL_RECEIPT',
    // Never dropped, even when it lost.
    preserved: conflict
      ? { historicalMemory: historical, state: 'SUPERSEDED_DONATION_PRESERVED', donated: donations }
      : null,
    resurrectionBoundary: conflict && donations.length
      ? 'THE_DONATION_IS_ALREADY_IN_CURRENT_TRUTH__REUSE_THE_SEMANTICS_NOT_THE_OLD_ARCHITECTURE'
      : 'NO_SUPERSEDED_ARCHITECTURE_TO_RESURRECT',
    law: 'CURRENT_TRUTH_WINS_THE_PRESENT_TENSE__AND_NEVER_DELETES_WHAT_IT_SUPERSEDED',
    businessEffectAuthority: 'NONE'
  };
}
