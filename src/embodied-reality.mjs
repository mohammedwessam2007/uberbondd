// The body, the room, and the parts of experience that do not survive language.
//
// Every other module here treats reasoning as though it happens in a person
// shaped like a decision procedure. It does not. Sleep, illness, light, noise,
// the people in the room and how long since eating all move cognition more than
// most of what the rest of this system reasons about — and none of it appears in
// a decision packet unless something puts it there.
//
// The harder half is what cannot be represented at all. A system that models
// everything will quietly translate an experience into the nearest thing its
// ontology can hold, and the translation will read as the experience. So the
// untranslatable layer exists to mark that a thing was not captured, rather
// than storing an approximation that later gets reasoned over as though it were.
export const EMBODIED_REALITY_VERSION = 'uberbond.embodied-reality.v1';

/** Physical and environmental state that moves cognition. */
export const EMBODIED_FACTORS = Object.freeze([
  'SLEEP', 'MOVEMENT', 'NUTRITION', 'ILLNESS', 'STRESS', 'ENERGY',
  'LIGHT', 'NOISE', 'TEMPERATURE', 'SOCIAL_DENSITY', 'PHYSICAL_SPACE'
]);

/** How much of an experience language carried. */
export const REPRESENTABILITY = Object.freeze([
  'FULLY_REPRESENTED', 'PARTIALLY_REPRESENTED', 'MEANINGFUL_BUT_NOT_FULLY_REPRESENTABLE'
]);

/** What a life model is allowed to cost given what it decides. */
export const ERROR_BUDGET_TIERS = Object.freeze({
  TRIVIAL: { maxReasoningDepth: 'SHALLOW', why: 'A wrong answer costs nothing and is cheaply reversed.' },
  ORDINARY: { maxReasoningDepth: 'MODERATE', why: 'Wrong is recoverable within weeks.' },
  CONSEQUENTIAL: { maxReasoningDepth: 'DEEP', why: 'Wrong is recoverable but expensive.' },
  IRREVERSIBLE: { maxReasoningDepth: 'EXHAUSTIVE', why: 'Wrong cannot be undone, so cognition is cheap by comparison.' }
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
 * The physical state a decision was made in.
 *
 * Recorded beside the decision rather than folded into it, because the useful
 * question later is not "was this a good decision" but "was this a decision
 * made on four hours of sleep" — and the second is unanswerable if the state
 * was never captured.
 */
export function embodiedState({ decision = null, factors = {} } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('EMBODIED_STATE_INVALID', ['decision-required']);

  const recorded = {};
  for (const [factor, value] of Object.entries(factors || {})) {
    if (!EMBODIED_FACTORS.includes(factor)) continue;
    const magnitude = Number(value);
    if (Number.isFinite(magnitude) && magnitude >= 0 && magnitude <= 1) recorded[factor] = magnitude;
  }

  const depleted = Object.entries(recorded).filter(([, value]) => value < 0.3).map(([factor]) => factor);
  return {
    ok: true,
    status: depleted.length ? 'DECISION_MADE_IN_DEPLETED_STATE' : 'EMBODIED_STATE_RECORDED',
    decision: what,
    factors: recorded,
    unrecorded: EMBODIED_FACTORS.filter(factor => !Object.hasOwn(recorded, factor)),
    depleted,
    // Not a reason to discard the decision. A reason to know what it was made in.
    boundary: 'THIS DOES NOT INVALIDATE A DECISION. IT RECORDS THE STATE IT WAS MADE IN, WHICH IS UNANSWERABLE LATER IF NOBODY CAPTURED IT.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A subjective report, held as its own evidence class.
 *
 * What an experience meant to someone is not recoverable from external
 * measurement, and treating the measurement as the truth of it is the
 * characteristic mistake of quantified-self systems.
 */
export function phenomenology({ experience = null, reported = null, externalMeasurement = null } = {}) {
  const what = text(experience, 1000);
  const said = text(reported, 2000);
  if (!what || !said) return fail('PHENOMENOLOGY_INVALID', ['experience-and-report-required']);

  const measured = text(externalMeasurement, 1000);
  const disagree = Boolean(measured) && measured !== said;

  return {
    ok: true,
    status: disagree ? 'REPORT_AND_MEASUREMENT_DISAGREE' : 'REPORT_RECORDED',
    experience: what,
    reported: said,
    externalMeasurement: measured,
    // Both kept. The measurement does not settle what it was like.
    measurementOverridesReport: false,
    boundary: 'WHAT AN EXPERIENCE WAS LIKE IS NOT RECOVERABLE FROM MEASUREMENT. BOTH ARE KEPT; NEITHER SETTLES THE OTHER.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Marks what language did not carry.
 *
 * The alternative is worse than losing the experience: an approximation gets
 * stored, reads as the thing, and every later inference treats the paraphrase
 * as the data.
 */
export function untranslatable({ experience = null, representability = null, whatWasLost = null } = {}) {
  const what = text(experience, 1000);
  if (!what) return fail('UNTRANSLATABLE_INVALID', ['experience-required']);
  if (!REPRESENTABILITY.includes(representability)) return fail('UNTRANSLATABLE_INVALID', ['valid-representability-required']);

  const partial = representability !== 'FULLY_REPRESENTED';
  return {
    ok: true,
    status: representability,
    experience: what,
    whatWasLost: text(whatWasLost, 1000) || null,
    // The flag downstream reasoning must respect.
    safeToReasonOver: !partial,
    boundary: partial
      ? 'PART OF THIS WAS NOT CAPTURED. REASONING OVER THE RECORD IS REASONING OVER A PARAPHRASE.'
      : 'REPRESENTED AS FULLY AS LANGUAGE ALLOWS, WHICH IS STILL A CLAIM ABOUT THE RECORD RATHER THAN THE EXPERIENCE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * How much reasoning a decision is worth.
 *
 * Wrong in both directions is expensive: exhaustive analysis of a trivial choice
 * spends the attention an irreversible one needed, and shallow treatment of an
 * irreversible one is the failure that cannot be undone.
 */
export function errorBudget({ decision = null, tier = null } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('ERROR_BUDGET_INVALID', ['decision-required']);
  if (!ERROR_BUDGET_TIERS[tier]) return fail('ERROR_BUDGET_INVALID', ['valid-tier-required'], { tiers: Object.keys(ERROR_BUDGET_TIERS) });

  return {
    ok: true,
    status: 'BUDGET_SET',
    decision: what,
    tier,
    maxReasoningDepth: ERROR_BUDGET_TIERS[tier].maxReasoningDepth,
    why: ERROR_BUDGET_TIERS[tier].why,
    law: 'EXHAUSTIVE_ANALYSIS_OF_A_TRIVIAL_CHOICE_SPENDS_THE_ATTENTION_AN_IRREVERSIBLE_ONE_NEEDED',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Designing the environment instead of relying on willpower.
 *
 * A behaviour that requires sustained effort against its surroundings is a
 * behaviour with an expiry date, so the intervention that changes the
 * surroundings is structurally different from the one that asks for more
 * discipline.
 */
export function environmentCompiler({ behaviour = null, currentFriction = null, changes = [] } = {}) {
  const what = text(behaviour, 500);
  if (!what) return fail('ENVIRONMENT_INVALID', ['behaviour-required']);

  const interventions = (Array.isArray(changes) ? changes : [])
    .map(row => ({
      change: text(row?.change, 500),
      kind: ['DEFAULT', 'FRICTION', 'GEOGRAPHY', 'SCHEDULE', 'PEOPLE', 'DEVICE', 'WILLPOWER'].includes(row?.kind) ? row.kind : null
    }))
    .filter(row => row.change && row.kind);

  const structural = interventions.filter(row => row.kind !== 'WILLPOWER');
  return {
    ok: true,
    status: structural.length ? 'STRUCTURAL_CHANGES_AVAILABLE' : 'ONLY_WILLPOWER_PROPOSED',
    behaviour: what,
    currentFriction: text(currentFriction, 500) || null,
    structural,
    willpowerOnly: interventions.filter(row => row.kind === 'WILLPOWER'),
    law: 'A_BEHAVIOUR_REQUIRING_SUSTAINED_EFFORT_AGAINST_ITS_SURROUNDINGS_HAS_AN_EXPIRY_DATE',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The quality of the information environment, surfaced without censoring.
 *
 * The distinction that keeps this from becoming a filter: it describes what is
 * being consumed and never decides what should be. A system that curated the
 * inputs would be shaping the person through the salience channel it elsewhere
 * audits.
 */
export function cognitiveNutrition(diet = []) {
  const rows = (Array.isArray(diet) ? diet : [])
    .map(row => ({
      source: text(row?.source, 240),
      depth: ['SHALLOW', 'MODERATE', 'DEEP'].includes(row?.depth) ? row.depth : null,
      ideologicalCluster: text(row?.ideologicalCluster, 120) || null
    }))
    .filter(row => row.source && row.depth);

  const clusters = new Set(rows.map(row => row.ideologicalCluster).filter(Boolean));
  const deep = rows.filter(row => row.depth === 'DEEP');

  return {
    ok: true,
    status: 'DIET_DESCRIBED',
    sources: rows.length,
    deepSources: deep.length,
    distinctClusters: clusters.size,
    concentrated: rows.length > 3 && clusters.size === 1,
    // The line that keeps this a mirror rather than a filter.
    boundary: 'THIS DESCRIBES WHAT IS BEING CONSUMED AND NEVER DECIDES WHAT SHOULD BE. CURATING THE INPUTS WOULD BE SHAPING HIM THROUGH THE CHANNEL THIS SYSTEM ELSEWHERE AUDITS.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A simulated life path, which never becomes evidence about a life.
 *
 * Sandboxes are for generating questions cheaply. The moment a simulation
 * frequency is read as a probability about the world, the sandbox has become a
 * forecast nobody validated.
 */
export function existentialSandbox({ path = null, runs = 0, observedFrequency = null } = {}) {
  const what = text(path, 1000);
  if (!what) return fail('SANDBOX_INVALID', ['path-required']);

  return {
    ok: true,
    status: 'SANDBOX_RUN',
    path: what,
    runs: Number(runs) || 0,
    observedFrequency: Number.isFinite(Number(observedFrequency)) ? Number(observedFrequency) : null,
    // Never promoted. This is the field that stops a sandbox becoming a forecast.
    isRealWorldProbability: false,
    questionsGenerated: true,
    boundary: 'A SIMULATION FREQUENCY IS NOT A REAL-WORLD PROBABILITY. SANDBOXES GENERATE QUESTIONS; REALITY GENERATES EVIDENCE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Private human texture kept out of the analytics.
 *
 * The archive exists so that continuity of personhood does not depend on the
 * parts of a life that happen to be measurable. Anything in it is explicitly
 * excluded from optimization inputs.
 */
export function soulArchive(entries = []) {
  const rows = (Array.isArray(entries) ? entries : [])
    .map(row => ({
      kind: ['VOICE', 'WRITING', 'JOKE', 'STORY', 'PHOTOGRAPH', 'ART', 'SPONTANEOUS_THOUGHT', 'WORLDVIEW_SHIFT', 'PLACE'].includes(row?.kind) ? row.kind : null,
      about: text(row?.about, 500)
    }))
    .filter(row => row.kind && row.about);

  return {
    ok: true,
    status: 'ARCHIVED',
    entries: rows.length,
    kinds: [...new Set(rows.map(row => row.kind))],
    // The whole purpose, stated as a property rather than a promise.
    excludedFromOptimization: true,
    purpose: 'CONTINUITY OF PERSONHOOD, NOT ANALYTICS. NOTHING HERE IS AN INPUT TO ANY SCORE.',
    businessEffectAuthority: 'NONE'
  };
}
