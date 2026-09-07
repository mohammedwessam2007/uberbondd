// Which kind of reasoning deserves trust for this question, and when to stop.
//
// The North Star asks for five terminal states an honest system must be able to
// reach. Four of them are refusals, and that is the point: a system that can
// only ever produce an answer will produce one when it has nothing, and the
// answer will be indistinguishable in shape from a good one.
//
//   NO_MODEL_CURRENTLY_DESERVES_TRUST
//   NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED
//   UNKNOWN__MORE_EVIDENCE_REQUIRED
//   REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT
//   ENOUGH__EXPECTED_VALUE_OF_MORE_REASONING_IS_LOWER_THAN_DELAY_AND_COGNITION_COST
//
// The fifth is the one that gets left out of systems like this, and its absence
// is why they consume the life they were built to improve.
export const META_RATIONAL_BOUNDARY_VERSION = 'uberbond.meta-rational-boundary.v1';

export const TERMINAL_EPISTEMIC_STATES = Object.freeze([
  'ANSWERABLE',
  'NO_MODEL_CURRENTLY_DESERVES_TRUST',
  'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED',
  'UNKNOWN__MORE_EVIDENCE_REQUIRED',
  'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT',
  'ENOUGH__EXPECTED_VALUE_OF_MORE_REASONING_IS_LOWER_THAN_DELAY_AND_COGNITION_COST'
]);

/**
 * Reasoning methods, and what each is actually good for.
 *
 * `settles` is the kind of question the method can close. A method applied to a
 * question it cannot settle does not produce a weak answer -- it produces a
 * confident answer to a different question, which is worse.
 */
export const REASONING_METHODS = Object.freeze({
  DEDUCTION: { settles: 'ENTAILMENT', needsData: false },
  STATISTICS: { settles: 'FREQUENCY', needsData: true },
  CAUSAL_INFERENCE: { settles: 'MECHANISM', needsData: true },
  SIMULATION: { settles: 'DYNAMICS', needsData: true },
  SEARCH: { settles: 'EXISTENCE', needsData: false },
  EXPERIMENT: { settles: 'INTERVENTION_EFFECT', needsData: false },
  DIRECT_EXPERIENCE: { settles: 'SUBJECTIVE_RESPONSE', needsData: false },
  HUMAN_TESTIMONY: { settles: 'OTHERS_REPORTS', needsData: false },
  HISTORICAL_ANALOGY: { settles: 'PRECEDENT', needsData: true },
  VALUE_REFLECTION: { settles: 'WHAT_MATTERS', needsData: false }
});

/** Questions whose answer no amount of cognition can supply. */
export const IRREDUCIBLE_QUESTION_KINDS = Object.freeze({
  WHAT_MATTERS: 'NO_RECOMMENDATION__VALUE_BOUNDARY_REACHED',
  SUBJECTIVE_RESPONSE: 'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT',
  INTERVENTION_EFFECT: 'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT'
});

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Picks the method that can actually settle this question, or names the state
 * in which no method can.
 *
 * The irreducible check runs first and is not overridable by evidence. "Would I
 * enjoy living there" is not underdetermined by data -- it is not the kind of
 * thing data answers, and piling on more reference classes produces a
 * well-supported answer to "do people like it there", which is a different
 * question about different people.
 */
export function selectMethod({ question = null, settles = null, availableData = [], methods = null } = {}) {
  const asked = text(question);
  if (!asked) return fail('METHOD_SELECTION_INVALID', ['question-required']);
  const kind = text(settles, 80);
  if (!kind) return fail('METHOD_SELECTION_INVALID', ['question-kind-required']);

  const irreducible = IRREDUCIBLE_QUESTION_KINDS[kind];
  if (irreducible) {
    return {
      ok: true, status: 'METHOD_SELECTED', question: asked, questionKind: kind,
      method: null, state: irreducible,
      why: 'No amount of cognition settles this kind of question. Reasoning harder answers a different one.',
      businessEffectAuthority: 'NONE'
    };
  }

  const candidates = Object.entries(methods ?? REASONING_METHODS)
    .filter(([, spec]) => spec.settles === kind);
  if (candidates.length === 0) {
    return {
      ok: true, status: 'METHOD_SELECTED', question: asked, questionKind: kind,
      method: null, state: 'NO_MODEL_CURRENTLY_DESERVES_TRUST',
      why: 'No available method settles this kind of question.',
      businessEffectAuthority: 'NONE'
    };
  }

  const data = new Set((Array.isArray(availableData) ? availableData : []).map(row => text(row, 200)).filter(Boolean));
  const usable = candidates.filter(([, spec]) => !spec.needsData || data.size > 0);
  if (usable.length === 0) {
    return {
      ok: true, status: 'METHOD_SELECTED', question: asked, questionKind: kind,
      method: null, state: 'UNKNOWN__MORE_EVIDENCE_REQUIRED',
      why: 'The methods that could settle this need data that is not present.',
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true, status: 'METHOD_SELECTED', question: asked, questionKind: kind,
    method: usable[0][0], state: 'ANSWERABLE',
    alternatives: usable.slice(1).map(([name]) => name),
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether more reasoning is worth its own cost.
 *
 * The comparison is against delay and attention, not against zero. Endless
 * analysis is not caution; it is a decision to let the window close while
 * feeling responsible. A system built to think for a lifetime needs this or it
 * will spend the lifetime.
 */
export function shouldContinueReasoning({
  expectedImprovement = 0, cognitionCost = 0, delayCost = 0, optionDecay = 0, irreversible = false
} = {}) {
  const gain = Number(expectedImprovement) || 0;
  const cost = (Number(cognitionCost) || 0) + (Number(delayCost) || 0) + (Number(optionDecay) || 0);

  // Irreversibility raises the bar for stopping, never for continuing: the
  // asymmetry is that a wrong irreversible choice cannot be revisited, while
  // extra thought about a reversible one can always be cut short later.
  const threshold = irreversible === true ? cost * 0.5 : cost;

  if (gain > threshold) {
    return { ok: true, status: 'CONTINUE', state: 'ANSWERABLE', gain, cost, threshold, businessEffectAuthority: 'NONE' };
  }
  return {
    ok: true,
    status: 'STOP',
    state: 'ENOUGH__EXPECTED_VALUE_OF_MORE_REASONING_IS_LOWER_THAN_DELAY_AND_COGNITION_COST',
    gain, cost, threshold,
    why: 'More reasoning costs more than it is expected to improve the choice.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether apparently independent agreement actually is.
 *
 * Ancestry, not count. Ten models that agree because they read the same corpus
 * are one observation repeated, and the vote count is precisely the number that
 * makes it look like ten.
 */
export function independentAgreement(sources = []) {
  const rows = (Array.isArray(sources) ? sources : [])
    .map(row => ({ id: text(row?.id, 120), ancestry: text(row?.ancestry, 200) }))
    .filter(row => row.id);
  const lineages = new Set(rows.map(row => row.ancestry || row.id));

  return {
    ok: true,
    status: 'AGREEMENT_ASSESSED',
    sourceCount: rows.length,
    independentLineages: lineages.size,
    // The claim a naive count would license, and the one the evidence does.
    apparentAgreement: rows.length,
    actualIndependentAgreement: lineages.size,
    inflated: rows.length > lineages.size,
    law: 'AGREEMENT_AMONG_SOURCES_SHARING_AN_ANCESTOR_IS_ONE_OBSERVATION_REPEATED',
    businessEffectAuthority: 'NONE'
  };
}
