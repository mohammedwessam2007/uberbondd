// Composing cognition, and knowing when the concepts themselves are wrong.
//
// The target is not a smarter model. It is the right assembly of substrates for
// the question at hand -- and, when no assembly works, the willingness to
// conclude that the vocabulary is the problem rather than the reasoning.
//
// That second half is what makes this more than a router. A system that can
// only get better at answering will keep answering questions its concepts
// cannot express, fluently and wrongly. So Ontogenesis is here: a loop that
// invents a primitive when the existing ones repeatedly fail, and an ontological
// crisis protocol that invalidates what was derived from a concept that broke.
//
// Nothing here self-promotes. A proposed concept is a candidate until reality
// falsifies its competitors, and a substrate is a supplier rather than an
// identity -- UberBond is not "an LLM system" any more than it is a spreadsheet.
export const WORLD_INTELLIGENCE_VERSION = 'uberbond.world-intelligence.v1';

/** Substrates a question may be routed to. None is the system's identity. */
export const SUBSTRATES = Object.freeze([
  'NEURAL_MODEL', 'SYMBOLIC_SOLVER', 'THEOREM_PROVER', 'STATISTICS',
  'SIMULATION', 'SEARCH', 'DATABASE', 'KNOWLEDGE_GRAPH', 'HUMAN_EXPERTISE',
  'SCIENTIFIC_INSTRUMENT', 'REAL_EXPERIMENT'
]);

/** Roles a temporary intellectual institution may need. */
export const COGNITIVE_ROLES = Object.freeze([
  'GENERATOR', 'DOMAIN_SPECIALIST', 'SKEPTIC', 'FALSIFIER',
  'COUNTEREXAMPLE_HUNTER', 'CAUSAL_ANALYST', 'FORECASTER', 'SYNTHESIZER'
]);

/** What a boundary actually is. Only the last two are permanent. */
export const BOUNDARY_KINDS = Object.freeze([
  'UNKNOWN', 'SOCIALLY_CONVENTIONAL', 'ECONOMICALLY_CONSTRAINED',
  'TECHNOLOGICALLY_BLOCKED', 'NO_MECHANISM_FOUND_YET',
  'LOGICALLY_INCONSISTENT', 'PHYSICALLY_IMPOSSIBLE'
]);

/** Boundaries that do not move, whatever the effort. */
export const PERMANENT_BOUNDARIES = Object.freeze(['LOGICALLY_INCONSISTENT', 'PHYSICALLY_IMPOSSIBLE']);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Assembles the smallest institution that can answer a question.
 *
 * Falsifying roles are required on consequential questions. A council of
 * generators and synthesizers produces a well-written answer with nothing
 * standing against it, which is the most confident kind of wrong.
 */
export function composeInstitution({ question = null, substrates = [], roles = [], consequential = false } = {}) {
  const asked = text(question, 2000);
  if (!asked) return fail('INSTITUTION_INVALID', ['question-required']);

  const chosen = [...new Set((Array.isArray(substrates) ? substrates : []).filter(s => SUBSTRATES.includes(s)))];
  const staffed = [...new Set((Array.isArray(roles) ? roles : []).filter(r => COGNITIVE_ROLES.includes(r)))];
  if (chosen.length === 0) return fail('INSTITUTION_INVALID', ['at-least-one-substrate-required']);

  const adversarial = staffed.filter(role => ['SKEPTIC', 'FALSIFIER', 'COUNTEREXAMPLE_HUNTER'].includes(role));
  if (consequential && adversarial.length === 0) {
    return fail('INSTITUTION_REFUSED', ['a-consequential-question-requires-a-falsifying-role'], {
      question: asked, roles: staffed,
      note: 'Generators and synthesizers alone produce a well-written answer with nothing standing against it.'
    });
  }

  return {
    ok: true,
    status: 'INSTITUTION_COMPOSED',
    question: asked,
    substrates: chosen,
    roles: staffed,
    adversarialRoles: adversarial,
    // Said because the count is a temptation: more agents is not more thinking.
    boundary: 'THE SMALLEST SUFFICIENT ASSEMBLY IS THE GOAL. AGENT COUNT IS NOT A MEASURE OF ANYTHING.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a substrate choice is a routing decision or an identity.
 *
 * Reported because the failure is gradual: a system that always routes to one
 * substrate has become that substrate, and will stop noticing the questions it
 * is bad at.
 */
export function substrateIndependence(routingHistory = []) {
  const rows = (Array.isArray(routingHistory) ? routingHistory : [])
    .map(row => text(row, 120)).filter(row => SUBSTRATES.includes(row));
  const used = new Set(rows);

  return {
    ok: true,
    status: used.size <= 1 && rows.length > 3 ? 'SUBSTRATE_MONOCULTURE' : 'SUBSTRATE_CHOICE_VARIES',
    routed: rows.length,
    substratesUsed: [...used],
    law: 'A_SYSTEM_THAT_ALWAYS_ROUTES_TO_ONE_SUBSTRATE_HAS_BECOME_IT_AND_WILL_STOP_NOTICING_WHAT_IT_IS_BAD_AT',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A candidate concept, proposed when existing ones keep failing.
 *
 * The bar is explanatory failure, not novelty. Inventing a primitive because
 * the current vocabulary is inelegant produces jargon; inventing one because
 * observations keep resisting explanation produces a concept.
 */
export function proposeConcept({ name = null, explanatoryFailures = [], predicts = null, wouldBeFalsifiedBy = null } = {}) {
  const proposed = text(name, 240);
  if (!proposed) return fail('CONCEPT_PROPOSAL_INVALID', ['concept-name-required']);

  const failures = (Array.isArray(explanatoryFailures) ? explanatoryFailures : [])
    .map(item => text(item, 500)).filter(Boolean);
  if (failures.length < 2) {
    return fail('CONCEPT_PROPOSAL_REFUSED', ['repeated-explanatory-failure-required'], {
      name: proposed, failures,
      note: 'Inventing a primitive because the vocabulary is inelegant produces jargon. The bar is observations that keep resisting explanation.'
    });
  }

  const falsifier = text(wouldBeFalsifiedBy, 1000);
  if (!falsifier) {
    return fail('CONCEPT_PROPOSAL_REFUSED', ['falsification-condition-required'], {
      name: proposed,
      note: 'A concept that nothing could falsify explains everything and constrains nothing.'
    });
  }

  return {
    ok: true,
    status: 'CONCEPT_CANDIDATE',
    name: proposed,
    explanatoryFailures: failures,
    predicts: text(predicts, 1000) || null,
    wouldBeFalsifiedBy: falsifier,
    // Candidate, not adopted. Adoption is earned against counterexamples.
    adopted: false,
    boundary: 'A CANDIDATE UNTIL IT SURVIVES COUNTEREXAMPLES. PROPOSING A CONCEPT IS NOT ADOPTING ONE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * When a foundational concept breaks, everything downstream is contaminated.
 *
 * The expensive half is not noticing the break -- it is the conclusions that
 * quietly keep their standing afterwards because nobody traced what depended
 * on them.
 */
export function ontologicalCrisis({ brokenConcept = null, derivedBeliefs = [], derivedForecasts = [], derivedDecisions = [] } = {}) {
  const broken = text(brokenConcept, 240);
  if (!broken) return fail('CRISIS_INVALID', ['broken-concept-required']);

  const contaminated = {
    beliefs: (Array.isArray(derivedBeliefs) ? derivedBeliefs : []).map(i => text(i, 500)).filter(Boolean),
    forecasts: (Array.isArray(derivedForecasts) ? derivedForecasts : []).map(i => text(i, 500)).filter(Boolean),
    decisions: (Array.isArray(derivedDecisions) ? derivedDecisions : []).map(i => text(i, 500)).filter(Boolean)
  };
  const total = contaminated.beliefs.length + contaminated.forecasts.length + contaminated.decisions.length;

  return {
    ok: true,
    status: 'ONTOLOGICAL_CRISIS',
    brokenConcept: broken,
    contaminated,
    invalidatedCount: total,
    // The instruction, not a suggestion. A conclusion whose foundation broke
    // does not keep its standing because it still sounds right.
    action: 'EVERY DERIVED CONCLUSION IS INVALIDATED AND MUST BE RECOMPUTED. IT DOES NOT KEEP ITS STANDING BECAUSE IT STILL SOUNDS RIGHT.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The compact explanation, with the exceptions it must not lose.
 *
 * Compression that drops a decisive exception is not understanding; it is a
 * shorter way of being wrong. So a theory carrying unexplained exceptions is
 * reported as incomplete rather than as elegant.
 */
export function compressReality({ observations = [], theory = null, unexplainedExceptions = [] } = {}) {
  const explanation = text(theory, 2000);
  if (!explanation) return fail('COMPRESSION_INVALID', ['theory-required']);

  const covered = (Array.isArray(observations) ? observations : []).map(i => text(i, 500)).filter(Boolean);
  const exceptions = (Array.isArray(unexplainedExceptions) ? unexplainedExceptions : []).map(i => text(i, 500)).filter(Boolean);

  return {
    ok: true,
    status: exceptions.length ? 'THEORY_INCOMPLETE' : 'THEORY_COVERS_SUPPLIED_OBSERVATIONS',
    theory: explanation,
    explains: covered.length,
    unexplainedExceptions: exceptions,
    compressionRatio: covered.length ? Number((covered.length / Math.max(1, exceptions.length + 1)).toFixed(2)) : null,
    law: 'COMPRESSION_THAT_DROPS_A_DECISIVE_EXCEPTION_IS_A_SHORTER_WAY_OF_BEING_WRONG',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Effects that change sign across scales.
 *
 * The failure this catches is real and common: something good for a day and
 * bad for a decade, or good for one person and bad for the institution. A
 * single-scale verdict misses it by construction.
 */
export function scaleBridge({ effect = null, byScale = {} } = {}) {
  const what = text(effect, 1000);
  if (!what) return fail('SCALE_INVALID', ['effect-required']);

  const scales = Object.entries(byScale || {})
    .map(([scale, sign]) => ({ scale: text(scale, 80), sign: ['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(sign) ? sign : null }))
    .filter(row => row.scale && row.sign);

  const signs = new Set(scales.map(row => row.sign).filter(sign => sign !== 'NEUTRAL'));
  return {
    ok: true,
    status: signs.size > 1 ? 'EFFECT_CHANGES_SIGN_ACROSS_SCALES' : 'EFFECT_CONSISTENT_ACROSS_SUPPLIED_SCALES',
    effect: what,
    byScale: scales,
    signChanges: signs.size > 1,
    note: signs.size > 1
      ? 'Good at one scale and bad at another. A single-scale verdict misses this by construction.'
      : 'No sign change across the scales supplied, which is not the same as none existing.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What kind of boundary this is, and whether it can move.
 *
 * "Impossible" and "no mechanism found yet" are different claims that behave
 * identically until someone finds the mechanism. Conflating them closes off
 * futures nobody established were closed.
 */
export function classifyBoundary({ goal = null, kind = null, evidence = null } = {}) {
  const what = text(goal, 1000);
  if (!what) return fail('BOUNDARY_INVALID', ['goal-required']);
  if (!BOUNDARY_KINDS.includes(kind)) return fail('BOUNDARY_INVALID', ['valid-boundary-kind-required']);

  const permanent = PERMANENT_BOUNDARIES.includes(kind);
  return {
    ok: true,
    status: permanent ? 'BOUNDARY_PERMANENT' : 'BOUNDARY_MAY_MOVE',
    goal: what,
    kind,
    evidence: text(evidence, 1000) || null,
    canMove: !permanent,
    distinction: kind === 'NO_MECHANISM_FOUND_YET'
      ? 'No mechanism has been found. That is not the same as there being none, and treating it as impossible closes a future nobody established was closed.'
      : permanent
        ? 'This does not move, whatever the effort.'
        : 'This is a constraint of the current world, not of the world.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A challenger built to be unlike the current architecture.
 *
 * The point is not that the challenger is better. It is that a system
 * optimizing against its own assumptions will never find the blind spot those
 * assumptions create, and no amount of effort inside them helps.
 */
export function selfAlienatingChallenger({ currentAssumptions = [], challengerAssumptions = [], noticed = [] } = {}) {
  const mine = new Set((Array.isArray(currentAssumptions) ? currentAssumptions : []).map(i => text(i, 240)).filter(Boolean));
  const theirs = new Set((Array.isArray(challengerAssumptions) ? challengerAssumptions : []).map(i => text(i, 240)).filter(Boolean));

  const shared = [...theirs].filter(item => mine.has(item));
  if (theirs.size > 0 && shared.length === theirs.size) {
    return fail('CHALLENGER_NOT_ALIEN', ['challenger-shares-every-assumption'], {
      note: 'A challenger holding all the same assumptions explores the same blind spot from a different chair.'
    });
  }

  return {
    ok: true,
    status: 'CHALLENGER_CONSTRUCTED',
    sharedAssumptions: shared,
    divergentAssumptions: [...theirs].filter(item => !mine.has(item)),
    noticed: (Array.isArray(noticed) ? noticed : []).map(i => text(i, 500)).filter(Boolean),
    question: 'What would an intelligence unlike this one notice here?',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Systems where effort produces nothing until it produces everything.
 *
 * Assuming linear returns on a threshold system is how a person concludes they
 * cannot learn a language six weeks before they could.
 */
export function thresholdDynamics({ effortApplied = 0, visibleProgress = 0, knownThresholdSystem = false } = {}) {
  const effort = Number(effortApplied) || 0;
  const progress = Number(visibleProgress) || 0;

  if (knownThresholdSystem && effort > 0 && progress === 0) {
    return {
      ok: true,
      status: 'BELOW_THRESHOLD_NOT_FAILING',
      effortApplied: effort,
      note: 'No visible progress in a known threshold system is what below-threshold looks like, not what failure looks like.',
      businessEffectAuthority: 'NONE'
    };
  }
  return {
    ok: true,
    status: 'PROGRESS_RECORDED',
    effortApplied: effort,
    visibleProgress: progress,
    caution: knownThresholdSystem ? null : 'Linear returns are assumed here. If this is a threshold system, that assumption is wrong.',
    businessEffectAuthority: 'NONE'
  };
}
