// Questions the current assumptions already answered, and how to get out.
//
// Some questions cannot be settled by thinking harder, because the answer was
// fixed before the thinking started. Ask "is this career worth it" inside an
// assumption set where worth means lifetime earnings, and the arithmetic will
// run correctly to a conclusion the assumptions chose. More reasoning inside a
// closed set produces more confidence and no more information, which is the
// worst combination available.
//
// Escaping means naming the set, proposing foundations that genuinely differ,
// and finding an observation that separates them. Each step has a way of going
// wrong:
//
//   an "alternative" that predicts identically is a notation change
//   a "distinguishing" observation both foundations expect distinguishes nothing
//   and when nothing separates them, the answer is undecidable, not a preference
//
// That last one is the whole discipline. Reaching the end of the evidence and
// picking anyway is how an assumption set gets replaced by a different one with
// the same status and more conviction, since the new one now feels chosen.
export const ASSUMPTION_ESCAPE_VERSION = 'uberbond.assumption-escape.v1';

/** What a question turned out to be, relative to its assumption set. */
export const QUESTION_STATES = Object.freeze([
  'ANSWERABLE_WITHIN_ASSUMPTIONS',   // evidence can settle it here
  'DETERMINED_BY_ASSUMPTIONS',       // the set already fixed the answer
  'UNDECIDABLE_WITHIN_AVAILABLE_EVIDENCE'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

const normalisePredictions = value => {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const [key, prediction] of Object.entries(value)) {
    const observable = text(key, 240);
    const expected = text(prediction, 480);
    if (observable && expected) out[observable] = expected;
  }
  return Object.keys(out).length ? out : null;
};

/**
 * Whether a question is decided by its assumptions rather than by evidence.
 *
 * The test is whether the answer changes when an assumption is dropped. A
 * question whose answer survives dropping every assumption was never
 * assumption-determined, and escaping it would be work for nothing.
 */
export function diagnose({ question = null, assumptions = [], answerChangesIfDropped = [] } = {}) {
  const asked = text(question, 2000);
  if (!asked) return fail('DIAGNOSIS_INVALID', ['question-required']);

  const set = [...new Set((Array.isArray(assumptions) ? assumptions : [])
    .map(item => text(item, 480)).filter(Boolean))].sort();
  if (set.length === 0) {
    return fail('DIAGNOSIS_INVALID', ['assumption-set-required'], {
      note: 'A question with no stated assumption set cannot be shown to be trapped inside one.'
    });
  }

  const load = [...new Set((Array.isArray(answerChangesIfDropped) ? answerChangesIfDropped : [])
    .map(item => text(item, 480)).filter(Boolean))];
  const unknownAssumptions = load.filter(item => !set.includes(item)).sort();
  if (unknownAssumptions.length > 0) {
    return fail('DIAGNOSIS_INVALID', ['load-bearing-assumption-not-in-set'], {
      unknownAssumptions,
      note: 'An assumption that decides the answer but is not in the stated set means the set is incomplete.'
    });
  }

  const determined = load.length > 0;
  return {
    ok: true,
    status: determined ? 'QUESTION_DETERMINED_BY_ASSUMPTIONS' : 'QUESTION_ANSWERABLE_WITHIN_ASSUMPTIONS',
    question: asked,
    assumptions: set,
    loadBearing: load.sort(),
    state: determined ? 'DETERMINED_BY_ASSUMPTIONS' : 'ANSWERABLE_WITHIN_ASSUMPTIONS',
    escapeWarranted: determined,
    law: 'MORE_REASONING_INSIDE_A_CLOSED_SET_PRODUCES_CONFIDENCE_NOT_INFORMATION',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Alternative foundations, filtered for the ones that are actually alternatives.
 *
 * Two foundations predicting the same thing about everything observable are the
 * same foundation described twice. Saying so is unpopular because the second
 * description usually feels like an insight.
 */
export function proposeFoundations({ current = null, candidates = [] } = {}) {
  const base = text(current?.name, 240);
  const basePredictions = normalisePredictions(current?.predicts);
  if (!base) return fail('FOUNDATIONS_INVALID', ['current-foundation-required']);
  if (!basePredictions) {
    return fail('FOUNDATIONS_INVALID', ['current-foundation-predictions-required'], {
      note: 'A foundation that predicts nothing observable cannot be distinguished from any other.'
    });
  }

  const genuine = [];
  const notationalVariants = [];
  for (const row of (Array.isArray(candidates) ? candidates : [])) {
    const name = text(row?.name, 240);
    const predicts = normalisePredictions(row?.predicts);
    if (!name || !predicts) continue;

    const disagreements = Object.keys(basePredictions)
      .filter(observable => predicts[observable] && predicts[observable] !== basePredictions[observable])
      .sort();

    if (disagreements.length > 0) genuine.push({ name, disagreesOn: disagreements, predicts });
    else notationalVariants.push({ name, reason: 'PREDICTS_IDENTICALLY_ON_EVERY_SHARED_OBSERVABLE' });
  }

  genuine.sort((a, b) => b.disagreesOn.length - a.disagreesOn.length || a.name.localeCompare(b.name));

  return {
    ok: true,
    status: genuine.length ? 'ALTERNATIVE_FOUNDATIONS_FOUND' : 'NO_GENUINE_ALTERNATIVE',
    current: base,
    alternatives: genuine.map(row => ({ name: row.name, disagreesOn: row.disagreesOn })),
    notationalVariants,
    law: 'TWO_FOUNDATIONS_THAT_PREDICT_THE_SAME_THING_EVERYWHERE_ARE_ONE_FOUNDATION_DESCRIBED_TWICE',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The observation that would separate them, or the admission that none does.
 *
 * `UNDECIDABLE_WITHIN_AVAILABLE_EVIDENCE` is a real answer and the module
 * returns it rather than ranking foundations by plausibility. A plausibility
 * ranking at this point is the assumption set voting on its own replacement.
 */
export function distinguishingObservation({ foundations = [], availableObservables = [] } = {}) {
  const rows = (Array.isArray(foundations) ? foundations : [])
    .map(row => ({ name: text(row?.name, 240), predicts: normalisePredictions(row?.predicts) }))
    .filter(row => row.name && row.predicts);

  if (rows.length < 2) {
    return fail('DISTINGUISH_INVALID', ['at-least-two-foundations-required']);
  }

  const available = new Set((Array.isArray(availableObservables) ? availableObservables : [])
    .map(item => text(item, 240)).filter(Boolean));

  const discriminating = [];
  const outOfReach = [];
  const allObservables = [...new Set(rows.flatMap(row => Object.keys(row.predicts)))].sort();
  for (const observable of allObservables) {
    const answers = rows.map(row => row.predicts[observable]).filter(Boolean);
    if (answers.length < 2) continue;
    if (new Set(answers).size < 2) continue; // every foundation expects the same thing
    const record = {
      observable,
      splits: rows
        .filter(row => row.predicts[observable])
        .map(row => ({ foundation: row.name, expects: row.predicts[observable] }))
    };
    if (available.has(observable)) discriminating.push(record);
    else outOfReach.push(record);
  }

  if (discriminating.length === 0) {
    return {
      ok: true,
      status: 'UNDECIDABLE',
      state: 'UNDECIDABLE_WITHIN_AVAILABLE_EVIDENCE',
      foundations: rows.map(row => row.name).sort(),
      discriminating: [],
      wouldDiscriminateIfObservable: outOfReach,
      // The refusal is the point.
      law: 'REACHING_THE_END_OF_THE_EVIDENCE_AND_PICKING_ANYWAY_REPLACES_ONE_ASSUMPTION_SET_WITH_ANOTHER',
      rankingWithheld: 'NO_PLAUSIBILITY_RANKING__THAT_IS_THE_ASSUMPTION_SET_VOTING_ON_ITS_OWN_REPLACEMENT',
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'DISTINGUISHING_OBSERVATION_FOUND',
    state: 'ANSWERABLE_WITHIN_ASSUMPTIONS',
    foundations: rows.map(row => row.name).sort(),
    discriminating,
    wouldDiscriminateIfObservable: outOfReach,
    businessEffectAuthority: 'NONE'
  };
}
