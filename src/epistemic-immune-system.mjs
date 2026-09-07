// What is known, what is not, and which of those the system can tell apart.
//
// A reasoning system's most dangerous output is not a wrong answer. It is a
// confident answer whose confidence came from somewhere other than evidence --
// from model agreement, from a compression that dropped the decisive exception,
// from a correlation nobody tested against an intervention. Each of those
// produces a claim shaped exactly like a good one.
//
// So this module's job is to keep the failure modes nameable. Ignorance gets a
// type. Agreement gets an ancestry. Causal claims get a rung. And the whole
// thing is subordinate to one rule that outranks every internal signal:
//
//   MODEL < REALITY
//
// No amount of coherence, elegance, consensus or desire makes a claim true, and
// repeated contradiction by the world forces revision rather than explanation.
export const EPISTEMIC_IMMUNE_SYSTEM_VERSION = 'uberbond.epistemic-immune-system.v1';

/** What is known about a claim, weakest first. Everything below is not knowledge. */
export const KNOWLEDGE_STATES = Object.freeze([
  'UNKNOWABLE_FROM_AVAILABLE_EVIDENCE', 'CURRENTLY_UNMEASURABLE', 'UNKNOWN',
  'STALE', 'SIMULATED', 'HYPOTHETICAL', 'WEAK_SIGNAL', 'CONTESTED',
  'SUPPORTED_INFERENCE', 'STRONGLY_SUPPORTED', 'REPLICATED', 'DIRECTLY_OBSERVED'
]);

/** Uncertainty is not one thing, and the right response differs for each. */
export const UNCERTAINTY_CLASSES = Object.freeze({
  RISK: 'Probabilities are reasonably estimable. Expected-value reasoning applies.',
  UNCERTAINTY: 'Probabilities are weak. Prefer robustness over optimization.',
  DEEP_UNCERTAINTY: 'The state space itself is unclear. Prefer reversibility and information.',
  IGNORANCE: 'Important variables may be unknown. Prefer small bets and surprise-seeking.'
});

/**
 * Pearl's rungs, as evidence strength.
 *
 * Ordered so that "we noticed X and Y together" cannot be silently reported at
 * the same strength as "we changed X and Y moved".
 */
export const CAUSAL_RUNGS = Object.freeze([
  'CORRELATION', 'TEMPORAL_ASSOCIATION', 'MECHANISTIC_PLAUSIBILITY',
  'NATURAL_EXPERIMENT', 'CONTROLLED_INTERVENTION', 'REPLICATION', 'PERSONAL_REPLICATION'
]);

/** Biases that manufacture confidence out of the shape of the evidence. */
export const BIAS_ATTACKS = Object.freeze([
  'CONFIRMATION', 'SURVIVORSHIP', 'SELECTION', 'PUBLICATION', 'MOTIVATED_REASONING',
  'BASE_RATE_NEGLECT', 'CORRELATED_SOURCES', 'DATA_LEAKAGE', 'HINDSIGHT',
  'NARRATIVE_FALLACY', 'BENCHMARK_GAMING', 'CONSENSUS_AS_EVIDENCE'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

export const isKnowledge = state => KNOWLEDGE_STATES.indexOf(state) >= KNOWLEDGE_STATES.indexOf('SUPPORTED_INFERENCE');

/**
 * A claim with its knowledge state, so ignorance is searchable rather than absent.
 *
 * An unstated state resolves to UNKNOWN rather than to anything more flattering.
 * The whole point of the map is that not-knowing has a shape; defaulting upward
 * would erase exactly the entries worth reading.
 */
export function mapClaim(input = {}) {
  const claim = text(input?.claim, 2000);
  if (!claim) return fail('CLAIM_INVALID', ['claim-required']);

  const state = KNOWLEDGE_STATES.includes(input?.state) ? input.state : 'UNKNOWN';
  return {
    ok: true,
    status: 'CLAIM_MAPPED',
    claim,
    state,
    isKnowledge: isKnowledge(state),
    // Recorded so a reader can tell "we looked and found nothing" from "nobody
    // looked" -- two states that read identically without it.
    searchedFor: input?.searchedFor === true,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Which class of uncertainty this is, because the right move differs.
 *
 * Treating deep uncertainty as risk is the most common expensive error: it
 * licenses optimization over a state space nobody has established.
 */
export function classifyUncertainty({ probabilitiesEstimable = false, stateSpaceKnown = false, variablesKnown = false } = {}) {
  const uncertaintyClass = !variablesKnown ? 'IGNORANCE'
    : !stateSpaceKnown ? 'DEEP_UNCERTAINTY'
      : !probabilitiesEstimable ? 'UNCERTAINTY'
        : 'RISK';

  return {
    ok: true,
    status: 'UNCERTAINTY_CLASSIFIED',
    uncertaintyClass,
    response: UNCERTAINTY_CLASSES[uncertaintyClass],
    law: 'TREATING_DEEP_UNCERTAINTY_AS_RISK_LICENSES_OPTIMIZATION_OVER_A_STATE_SPACE_NOBODY_ESTABLISHED',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A causal claim at the rung its evidence actually reaches.
 *
 * The refusal: an intervention claim cannot be made from observational rungs.
 * "Doing X causes Y" from correlation is the single most consequential silent
 * upgrade in applied reasoning.
 */
export function causalClaim({ claim = null, rung = null, interventionClaimed = false } = {}) {
  const body = text(claim, 2000);
  if (!body) return fail('CAUSAL_CLAIM_INVALID', ['claim-required']);
  if (!CAUSAL_RUNGS.includes(rung)) return fail('CAUSAL_CLAIM_INVALID', ['valid-causal-rung-required']);

  const observationalOnly = CAUSAL_RUNGS.indexOf(rung) < CAUSAL_RUNGS.indexOf('NATURAL_EXPERIMENT');
  if (interventionClaimed && observationalOnly) {
    return fail('CAUSAL_UPGRADE_REFUSED', ['intervention-claim-requires-an-intervention-rung'], {
      claim: body, rung,
      note: 'An association says what goes together. Only an intervention says what happens when you change it.'
    });
  }

  return {
    ok: true,
    status: 'CAUSAL_CLAIM_RECORDED',
    claim: body,
    rung,
    supportsIntervention: !observationalOnly,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Attacks a conclusion with the biases that could have produced it.
 *
 * Returns the attacks that were *run*, not a clean bill. A conclusion nobody
 * attacked is not a robust one, and reporting it as unchallenged rather than
 * as passing is the difference.
 */
export function attackConclusion({ conclusion = null, attacksRun = [], survived = [] } = {}) {
  const body = text(conclusion, 2000);
  if (!body) return fail('ATTACK_INVALID', ['conclusion-required']);

  const run = (Array.isArray(attacksRun) ? attacksRun : []).filter(attack => BIAS_ATTACKS.includes(attack));
  const held = (Array.isArray(survived) ? survived : []).filter(attack => run.includes(attack));
  const notRun = BIAS_ATTACKS.filter(attack => !run.includes(attack));

  return {
    ok: true,
    status: run.length === 0 ? 'UNCHALLENGED' : 'ATTACKED',
    conclusion: body,
    attacksRun: run,
    survived: held,
    failed: run.filter(attack => !held.includes(attack)),
    notRun,
    // Said plainly because the alternative reads as a pass.
    boundary: run.length === 0
      ? 'NOBODY ATTACKED THIS. THAT IS NOT THE SAME AS IT HAVING HELD UP.'
      : 'SURVIVING THE ATTACKS THAT WERE RUN SAYS NOTHING ABOUT THE ONES THAT WERE NOT.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a set of models is a genuine ecology or one model wearing hats.
 *
 * Method diversity, not count. Five statistical models trained on one dataset
 * are one epistemic position, and their agreement is the dataset agreeing with
 * itself.
 */
export function modelEcology(models = []) {
  const rows = (Array.isArray(models) ? models : [])
    .map(row => ({
      name: text(row?.name, 240),
      method: text(row?.method, 120),
      assumptions: text(row?.assumptions, 500) || null
    }))
    .filter(row => row.name && row.method);

  const methods = new Set(rows.map(row => row.method));
  const assumptionSets = new Set(rows.map(row => row.assumptions || row.method));

  return {
    ok: true,
    status: 'ECOLOGY_ASSESSED',
    modelCount: rows.length,
    distinctMethods: methods.size,
    distinctAssumptionSets: assumptionSets.size,
    // Monoculture is the failure this names: many models, one way of being wrong.
    monoculture: rows.length > 1 && methods.size === 1,
    law: 'AGREEMENT_AMONG_MODELS_SHARING_A_METHOD_IS_ONE_EPISTEMIC_POSITION_REPEATED',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The veto reality holds over every internal signal.
 *
 * Coherence, elegance, consensus and confidence are all listed as things that
 * do not survive contact with repeated contradiction. The list is explicit
 * because each of them has, at some point, been mistaken for evidence.
 */
export function realityVeto({ claim = null, internalSupport = [], contradictedByObservation = 0 } = {}) {
  const body = text(claim, 2000);
  if (!body) return fail('REALITY_VETO_INVALID', ['claim-required']);

  const contradictions = Number(contradictedByObservation) || 0;
  const support = (Array.isArray(internalSupport) ? internalSupport : []).map(item => text(item, 240)).filter(Boolean);

  return {
    ok: true,
    status: contradictions > 0 ? 'MODEL_MUST_BE_REVISED' : 'NO_CONTRADICTION_OBSERVED',
    claim: body,
    internalSupport: support,
    contradictedByObservation: contradictions,
    // The whole hierarchy in one field: internal support does not offset a
    // single observation, however much of it there is.
    verdict: contradictions > 0
      ? 'MODEL < REALITY. REPEATED CONTRADICTION FORCES REVISION, NOT EXPLANATION.'
      : 'NO CONTRADICTION YET, WHICH IS NOT CONFIRMATION.',
    internalSupportOffsetsObservation: false,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What a compression dropped, so the decision can go back for it.
 *
 * Every summary, embedding, score and ontology loses information. The debt is
 * not the loss -- it is losing it without recording that you did.
 */
export function abstractionDebt({ compressed = null, dropped = [], decisionDependsOn = [] } = {}) {
  const what = text(compressed, 500);
  if (!what) return fail('ABSTRACTION_DEBT_INVALID', ['compressed-thing-required']);

  const lost = (Array.isArray(dropped) ? dropped : []).map(item => text(item, 500)).filter(Boolean);
  const needed = (Array.isArray(decisionDependsOn) ? decisionDependsOn : []).map(item => text(item, 500)).filter(Boolean);
  const decisive = lost.filter(item => needed.includes(item));

  return {
    ok: true,
    status: decisive.length ? 'RETURN_TO_RAW_EVIDENCE' : 'COMPRESSION_ACCEPTABLE_FOR_THIS_DECISION',
    compressed: what,
    dropped: lost,
    decisiveOmissions: decisive,
    why: decisive.length
      ? 'The compression dropped something this decision turns on. Go back to the original.'
      : 'Nothing this decision turns on was dropped, as far as anyone recorded.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether stating a forecast changes what it forecasts.
 *
 * Reflexive systems are not edge cases in a life: telling someone their
 * probability of finishing changes it, and a system that ignores this is
 * measuring a world its own output has already left.
 */
export function reflexivity({ forecast = null, revealedTo = [], couldChangeBehaviour = false } = {}) {
  const body = text(forecast, 2000);
  if (!body) return fail('REFLEXIVITY_INVALID', ['forecast-required']);

  const audiences = (Array.isArray(revealedTo) ? revealedTo : []).map(item => text(item, 240)).filter(Boolean);
  const reflexive = couldChangeBehaviour === true && audiences.length > 0;

  return {
    ok: true,
    status: reflexive ? 'FORECAST_IS_REFLEXIVE' : 'NO_REFLEXIVE_PATH_IDENTIFIED',
    forecast: body,
    revealedTo: audiences,
    note: reflexive
      ? 'Stating this changes the system it describes, so the forecast and the act of making it are not separable.'
      : 'No route from stating this to changing it was identified, which is not proof there is none.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Where the model was wrong in a way nobody expected.
 *
 * Surprise is the cheapest signal a long-running system gets and the easiest to
 * explain away. Persistent surprise in one area is reported as a candidate
 * broken model rather than as noise.
 */
export function surpriseLedger(surprises = []) {
  const rows = (Array.isArray(surprises) ? surprises : [])
    .map(row => ({ area: text(row?.area, 240), expected: text(row?.expected, 500), observed: text(row?.observed, 500) }))
    .filter(row => row.area && row.observed);

  const byArea = new Map();
  for (const row of rows) byArea.set(row.area, (byArea.get(row.area) || 0) + 1);
  const persistent = [...byArea.entries()].filter(([, count]) => count >= 3).map(([area, count]) => ({ area, count }));

  return {
    ok: true,
    status: persistent.length ? 'PERSISTENT_SURPRISE' : 'SURPRISES_RECORDED',
    surprises: rows.length,
    byArea: [...byArea.entries()].map(([area, count]) => ({ area, count })),
    persistent,
    meaning: persistent.length
      ? 'Repeated surprise in one area is a broken model, a missing variable or a regime change -- not noise.'
      : 'No area has surprised repeatedly yet.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Questions where reasoning has no shortcut and reality must run.
 *
 * Naming this prevents the most confident kind of nonsense: a precise forecast
 * for a system that admits no predictive shortcut.
 */
export function computationalIrreducibility({ question = null, shortcutKnown = false, simulationValidated = false } = {}) {
  const asked = text(question, 2000);
  if (!asked) return fail('IRREDUCIBILITY_INVALID', ['question-required']);

  if (!shortcutKnown && !simulationValidated) {
    return {
      ok: true,
      status: 'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT',
      question: asked,
      why: 'No predictive shortcut is known and no simulation has been validated. A precise forecast here would be invented.',
      businessEffectAuthority: 'NONE'
    };
  }
  return {
    ok: true,
    status: 'SHORTCUT_AVAILABLE',
    question: asked,
    basis: shortcutKnown ? 'KNOWN_SHORTCUT' : 'VALIDATED_SIMULATION',
    businessEffectAuthority: 'NONE'
  };
}
