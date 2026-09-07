// Experiences as first-class architecture, and the limits on optimizing them.
//
// The obvious version of this module is a scoring function over experiences,
// and the obvious version is the failure. A system that ranks a life by
// expected value will reliably recommend against rest, against play, against
// the unrepeatable thing that produces no measurable gain -- and it will be
// internally correct every time. The North Star names that outcome directly: a
// perfectly optimized life could become sterile, and the system must know when
// intelligence should leave something untouched.
//
// So three refusals live here alongside the scoring:
//
//   presentness    -- an experience needs no future return to be legitimate
//   uncopyable     -- a window that closes is not comparable to one that does not
//   non-totalization -- some of life is not the system's to model at all
//
// The scoring exists to surface options. The refusals exist so the scoring
// cannot quietly become the definition of a life worth living.
export const EXPERIENCE_COMPILER_VERSION = 'uberbond.experience-compiler.v1';

/**
 * Dimensions an experience may produce value on.
 *
 * Deliberately not weighted here. A weighting is a claim about what matters,
 * which is the founder's to make -- a default weight vector shipped in a module
 * would be exactly the imposed worldview the canon forbids.
 */
export const EXPERIENCE_DIMENSIONS = Object.freeze([
  'learning', 'capability', 'relationships', 'creativity', 'meaning', 'joy',
  'rest', 'health', 'novelty', 'memory', 'geographic_freedom', 'opportunity'
]);

/** Why an experience may be beyond comparison rather than merely expensive. */
export const UNCOPYABLE_REASONS = Object.freeze([
  'AGE_BOUND', 'PERSON_BOUND', 'PLACE_BOUND', 'RELATIONSHIP_BOUND',
  'HISTORICAL_MOMENT', 'HEALTH_BOUND'
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
 * Normalizes an experience, preserving what a score would flatten.
 *
 * `uncopyable` and `presentValue` are kept as separate fields rather than
 * folded into the dimension totals, because folding them in is precisely how
 * they stop functioning: a large enough number elsewhere always outvotes them.
 */
export function normalizeExperience(input = {}) {
  const name = text(input?.name, 240);
  if (!name) return fail('EXPERIENCE_INVALID', ['experience-name-required']);

  const produces = {};
  for (const [dimension, value] of Object.entries(input?.produces || {})) {
    if (!EXPERIENCE_DIMENSIONS.includes(dimension)) continue;
    const magnitude = Number(value);
    if (Number.isFinite(magnitude) && magnitude >= 0 && magnitude <= 1) produces[dimension] = magnitude;
  }

  const uncopyable = UNCOPYABLE_REASONS.includes(input?.uncopyable) ? input.uncopyable : null;

  return {
    ok: true,
    status: 'EXPERIENCE_NORMALIZED',
    experience: {
      name,
      produces,
      dimensionsTouched: Object.keys(produces).sort(),
      // An experience whose whole value is being had. Not a score of zero --
      // a statement that the scoring question does not apply.
      presentValue: input?.presentValue === true,
      uncopyable,
      windowCloses: text(input?.windowCloses, 240) || null,
      reversible: input?.reversible !== false,
      costHours: Number.isFinite(Number(input?.costHours)) ? Number(input.costHours) : null
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Compares experiences without pretending the comparison is complete.
 *
 * `compound` counts dimensions rather than summing magnitudes: an experience
 * producing a little of six things is genuinely different from one producing a
 * lot of one, and a sum erases that difference by construction.
 */
export function compileExperiences(experiences = []) {
  const rows = [];
  const refused = [];
  for (const input of (Array.isArray(experiences) ? experiences : [])) {
    const normalized = normalizeExperience(input);
    if (!normalized.ok) { refused.push({ input, reasonCodes: normalized.reasonCodes }); continue; }
    rows.push(normalized.experience);
  }

  const scored = rows.map(experience => ({
    name: experience.name,
    compound: experience.dimensionsTouched.length,
    magnitude: Number(Object.values(experience.produces).reduce((sum, v) => sum + v, 0).toFixed(4)),
    presentValue: experience.presentValue,
    uncopyable: experience.uncopyable,
    // Ranked separately and never merged into the number, so a high-scoring
    // repeatable experience cannot outrank a closing window on arithmetic.
    comparable: experience.uncopyable === null && experience.presentValue === false
  }));

  const comparable = scored.filter(row => row.comparable);
  const beyondComparison = scored.filter(row => !row.comparable);

  return {
    ok: rows.length > 0,
    status: rows.length > 0 ? 'EXPERIENCES_COMPILED' : 'NO_EXPERIENCES',
    ranked: [...comparable].sort((a, b) => b.compound - a.compound || b.magnitude - a.magnitude),
    beyondComparison,
    refused,
    // Said on the object because a caller reading only `ranked` would other-
    // wise be looking at a list that silently excluded the irreplaceable ones.
    boundary: beyondComparison.length
      ? 'SOME EXPERIENCES ARE NOT RANKED BECAUSE RANKING THEM WOULD BE A CATEGORY ERROR. SEE beyondComparison.'
      : 'NO UNRANKABLE EXPERIENCES IN THIS SET.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a question should be answered by reasoning or by going and finding out.
 *
 * The canonical pattern is uncertainty -> smallest authentic reversible
 * experience -> actual response. A system with unlimited reasoning capacity
 * will always prefer to reason, which is how it ends up with a confident model
 * of a life nobody has lived.
 */
export function realityContact({ question = null, modelled = false, reversibleProbeAvailable = false, probeCostHours = null } = {}) {
  const asked = text(question, 1000);
  if (!asked) return fail('REALITY_CONTACT_INVALID', ['question-required']);

  if (reversibleProbeAvailable) {
    return {
      ok: true,
      status: 'GO_AND_FIND_OUT',
      question: asked,
      probeCostHours: Number.isFinite(Number(probeCostHours)) ? Number(probeCostHours) : null,
      why: 'A reversible probe answers this better than more modelling, whatever the model already says.',
      businessEffectAuthority: 'NONE'
    };
  }
  return {
    ok: true,
    status: modelled ? 'MODEL_IS_WHAT_IS_AVAILABLE' : 'INSUFFICIENT_BASIS',
    question: asked,
    why: modelled
      ? 'No reversible probe exists, so the model stands -- as a model, not as the answer.'
      : 'Neither a probe nor a model. This is unknown.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Territory the system does not model.
 *
 * Not a privacy setting on stored data -- that is the private core's job. This
 * is the prior question: whether a part of life should be represented at all.
 * A system that surrounds a life without consuming it needs somewhere to put
 * "no", and needs that answer to survive the observation that modelling it
 * would be useful.
 */
export function nonTotalization({ domain = null, declaredOffLimits = false, usefulnessOfModelling = 0 } = {}) {
  const named = text(domain, 240);
  if (!named) return fail('NON_TOTALIZATION_INVALID', ['domain-required']);

  if (declaredOffLimits) {
    return {
      ok: true,
      status: 'NOT_MODELLED',
      domain: named,
      // The whole point: usefulness is recorded and does not override. A rule
      // that yields once the payoff is high enough is not a rule.
      usefulnessOfModelling: Number(usefulnessOfModelling) || 0,
      law: 'A_DECLARED_OFF_LIMITS_DOMAIN_STAYS_UNMODELLED_HOWEVER_USEFUL_MODELLING_IT_WOULD_BE',
      businessEffectAuthority: 'NONE'
    };
  }
  return { ok: true, status: 'MODELLABLE', domain: named, businessEffectAuthority: 'NONE' };
}
