// A portfolio of genuinely different lives, the skeleton each would need, and
// the smallest honest way to test one against reality.
//
// Three failure modes motivate this module, and each has a name in canon:
//
// 1. A possibility engine that offers five cosmetic variants of the same idea
//    and calls it a portfolio. Materiality is decided by causal shape --
//    what must be true, what it opens, what it closes -- not by the words
//    used to describe it, so two possibilities with identical shape collapse
//    into one and two with different shape survive even inside one family.
//
// 2. Optionality treated as the one thing to maximize. A deliberate
//    commitment that closes branches for depth, mastery, love, or loyalty is
//    a chosen tradeoff, not a defect, and nothing here is allowed to invent a
//    numeric penalty from how many branches a commitment closed. Comparison
//    only ever sees the dimensions a caller actually scored -- via
//    `life-decision-dimensions.mjs`, reused rather than re-derived here --
//    so a commitment can never lose on an axis nobody scored it on.
//
// 3. Growth framed as repair. Osteogenesis composes the existing capability
//    genome (`growSkeleton`, `findBottleneck`) rather than re-deciding what a
//    gap means -- that module already carries the guard against turning
//    inexperience into a verdict about the person, and duplicating it here
//    would be the one way to lose it.
//
// The last piece, the experiment, exists because some questions about a life
// cannot be reasoned to an answer -- only lived, in the smallest reversible
// form that would actually reveal something. Reversibility is the point:
// this module never proposes to spend money, commit travel, or involve
// another person without the founder's explicit authority, because
// capability does not create authority even when the capability is a good
// idea.
import { LIFE_DIMENSIONS, compareLifeOptions } from './life-decision-dimensions.mjs';
import { growSkeleton, findBottleneck } from './human-capability-genome.mjs';

export const PERSONAL_CIVILIZATION_POSSIBILITY_VERSION = 'uberbond.personal-civilization-possibility.v1';

/**
 * Materially distinct possibility families.
 *
 * Not every family belongs in every portfolio, but a portfolio that only ever
 * produces the obvious/staged-commitment shape has not actually searched --
 * it has elaborated on one idea. Named exactly as canon names them.
 */
export const POSSIBILITY_FAMILIES = Object.freeze([
  'NON_OBVIOUS', 'STATUS_QUO', 'REVERSIBLE_TRIAL', 'STAGED_COMMITMENT',
  'EXIT', 'CAPABILITY_FIRST', 'ENVIRONMENT_FIRST'
]);

/** Legitimate reasons a deliberate commitment may close branches. */
export const COMMITMENT_REASONS = Object.freeze(['DEPTH', 'MASTERY', 'LOVE', 'LOYALTY']);

/** What can force a compiled experience to require explicit founder authority. */
export const AUTHORITY_TRIGGERING_FACTORS = Object.freeze([
  'SPEND', 'TRAVEL_COMMITMENT', 'THIRD_PARTY_INVOLVEMENT'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const arrayOfText = (input, max = 500) =>
  [...new Set((Array.isArray(input) ? input : []).map(v => text(v, max)).filter(Boolean))];

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * A fingerprint of causal shape, not of wording.
 *
 * Two possibilities with the same family, the same preconditions, and the
 * same opens/closes are the same possibility said two ways. This is the only
 * definition of "materially different" the portfolio uses.
 */
const materialitySignature = ({ family, whatMustBeTrue, opens, closes }) => {
  const norm = list => [...list].sort().join('~');
  return `${family}::${norm(whatMustBeTrue)}::${norm(opens)}::${norm(closes)}`;
};

/**
 * Filters caller-supplied dimension scores to the canonical, unweighted set.
 *
 * Deliberately the only source of a possibility's scores. Nothing in this
 * module ever derives a score from `closes.length`, `opens.length`, or any
 * other structural field -- that derivation is exactly how "closes options"
 * would quietly become "scores worse", which is the thing PCE-04 exists to
 * refuse. See `comparePossibilities` for where this boundary is enforced.
 */
const scoresFromInput = input => {
  const scores = {};
  for (const [dimension, value] of Object.entries(input?.scores || {})) {
    if (!LIFE_DIMENSIONS.includes(dimension)) continue;
    const magnitude = Number(value);
    if (Number.isFinite(magnitude) && magnitude >= 0 && magnitude <= 1) scores[dimension] = magnitude;
  }
  return scores;
};

// --- PCE-04: possibility portfolio -----------------------------------------

/**
 * Normalizes one candidate possibility, or refuses it.
 *
 * A deliberate commitment must name a legitimate reason from
 * `COMMITMENT_REASONS`. That is not a formality: it is the difference between
 * "I am closing this branch on purpose, for something that matters" and a
 * possibility that closes branches nobody chose to close.
 */
export function possibility(input = {}) {
  const name = text(input?.name, 240);
  if (!name) return fail('POSSIBILITY_INVALID', ['possibility-name-required']);

  const family = POSSIBILITY_FAMILIES.includes(input?.family) ? input.family : null;
  if (!family) return fail('POSSIBILITY_INVALID', ['valid-possibility-family-required']);

  const whatMustBeTrue = arrayOfText(input?.whatMustBeTrue);
  if (whatMustBeTrue.length === 0) return fail('POSSIBILITY_INVALID', ['reachability-preconditions-required']);

  const opens = arrayOfText(input?.opens);
  const closes = arrayOfText(input?.closes);

  const deliberateCommitment = input?.deliberateCommitment === true;
  const commitmentReason = COMMITMENT_REASONS.includes(input?.commitmentReason) ? input.commitmentReason : null;
  if (deliberateCommitment && !commitmentReason) {
    return fail('POSSIBILITY_INVALID', ['deliberate-commitment-requires-a-legitimate-reason'], {
      note: 'A commitment that closes branches needs a reason on the legitimate list, or it is indistinguishable from an accident.'
    });
  }

  const scores = scoresFromInput(input);

  const record = {
    name, family, whatMustBeTrue, opens, closes,
    deliberateCommitment, commitmentReason,
    scores,
    scored: Object.keys(scores).sort(),
    unscored: LIFE_DIMENSIONS.filter(dimension => !Object.hasOwn(scores, dimension))
  };

  return {
    ok: true,
    status: 'POSSIBILITY_RECORDED',
    possibility: { ...record, materialitySignature: materialitySignature(record) },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A portfolio of materially distinct possibilities for one decision.
 *
 * Cosmetic variants collapse; possibilities that differ only in wording are
 * not a search. Coverage across `POSSIBILITY_FAMILIES` is reported, not
 * enforced -- a real decision may not have a live exit or environment-first
 * variant, and refusing the portfolio for that would manufacture options
 * that are not actually there.
 */
export function generatePossibilityPortfolio({ decision = null, candidates = [] } = {}) {
  const decisionText = text(decision, 500);
  if (!decisionText) return fail('PORTFOLIO_INVALID', ['decision-required']);
  if (!Array.isArray(candidates) || candidates.length === 0) return fail('PORTFOLIO_INVALID', ['candidates-required']);

  const refused = [];
  const built = [];
  for (const candidate of candidates) {
    const result = possibility(candidate);
    if (result.ok) built.push(result.possibility);
    else refused.push({ candidate, reasonCodes: result.reasonCodes });
  }

  const seen = new Map();
  const duplicatesCollapsed = [];
  for (const row of built) {
    const existing = seen.get(row.materialitySignature);
    if (existing) { duplicatesCollapsed.push({ collapsedInto: existing.name, name: row.name }); continue; }
    seen.set(row.materialitySignature, row);
  }
  const portfolio = [...seen.values()];

  const familiesPresent = [...new Set(portfolio.map(row => row.family))].sort();
  const familiesAbsent = POSSIBILITY_FAMILIES.filter(family => !familiesPresent.includes(family));

  return {
    ok: true,
    status: portfolio.length ? 'PORTFOLIO_GENERATED' : 'PORTFOLIO_EMPTY',
    decision: decisionText,
    portfolio,
    count: portfolio.length,
    duplicatesCollapsed,
    refused,
    familiesPresent,
    familiesAbsent,
    // The property this function exists to keep true, stated on the object so
    // a caller cannot mistake its absence for an oversight.
    noSingleScalar: 'EACH POSSIBILITY IS DESCRIBED BY WHAT MUST BE TRUE, WHAT IT OPENS, AND WHAT IT CLOSES. NO PORTFOLIO-LEVEL SCORE IS PRODUCED.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Compares possibilities on the dimensions their scores actually cover.
 *
 * The load-bearing line is the map below: only `scores` crosses into the
 * comparison. `closes`, `opens`, and `whatMustBeTrue` describe causal shape
 * and are never turned into a number here -- if they were, every deliberate
 * commitment would be automatically penalized for the branches it was chosen
 * to close, which is exactly the scalar-optionality trap canon forbids.
 */
export function comparePossibilities(possibilities = []) {
  const rows = (Array.isArray(possibilities) ? possibilities : []).filter(row => row && row.name);
  return compareLifeOptions(rows.map(row => ({ name: row.name, scores: row.scores || {} })));
}

// --- PCE-06: Osteogenesis capability suggestion -----------------------------

/**
 * Orders capability gaps by how many other capabilities they are known to
 * unlock, using `unlocks` edges already recorded on the capability genome.
 * A gap with no known transfer edges ranks last, not zero -- "unknown" and
 * "unlocks nothing" are different claims, and this module makes neither one
 * up.
 */
const rankGapsByTransfer = (gaps, capabilities) => {
  const have = new Map((Array.isArray(capabilities) ? capabilities : []).filter(row => row?.name).map(row => [row.name, row]));
  return [...gaps]
    .map(gap => ({ ...gap, transferCount: have.get(gap.capability)?.unlocks?.length ?? null }))
    .sort((a, b) => {
      if (a.transferCount === b.transferCount) return 0;
      if (a.transferCount === null) return 1;
      if (b.transferCount === null) return -1;
      return b.transferCount - a.transferCount;
    });
};

/**
 * The minimum capability skeleton a possibility needs, and the one gap that
 * actually binds progress toward it.
 *
 * Composes `growSkeleton` and `findBottleneck` from the human capability
 * genome rather than re-deriving what a gap means: that module already
 * carries the refusal to call inexperience a durable limit, and duplicating
 * the logic here would be the one way to lose that guard silently.
 */
export function osteogenesisForPossibility({ possibility: forPossibility = null, requiredCapabilities = [], capabilities = [] } = {}) {
  const target = text(forPossibility, 500);
  if (!target) return fail('OSTEOGENESIS_INVALID', ['possibility-required']);

  const needed = arrayOfText(requiredCapabilities);
  if (needed.length === 0) return fail('OSTEOGENESIS_INVALID', ['required-capabilities-required']);

  const skeleton = growSkeleton({ future: target, required: needed, capabilities });
  if (!skeleton.ok) return skeleton;

  const bottleneckResult = findBottleneck({ goal: target, capabilities, required: needed });
  if (!bottleneckResult.ok) return bottleneckResult;

  return {
    ok: true,
    status: skeleton.gaps.length ? 'CAPABILITY_SKELETON_PROPOSED' : 'ALREADY_REACHABLE',
    possibility: target,
    // The bottleneck is surfaced on its own, singular, so effort has one
    // place to go rather than spreading across every gap equally -- polishing
    // a non-binding dimension feels productive and moves nothing.
    bindingConstraint: bottleneckResult.bottleneck,
    gaps: rankGapsByTransfer(skeleton.gaps, capabilities),
    preferHighTransfer: 'GAPS ARE ORDERED BY HOW MANY OTHER CAPABILITIES THEY ARE KNOWN TO UNLOCK, NOT BY HOW EASY THEY ARE TO POLISH.',
    boundary: 'A MISSING OR WEAK CAPABILITY IS SOMETHING TO GROW TOWARD, NOT A DEFECT IN THE PERSON. THIS NAMES A SKELETON; IT DOES NOT PROPOSE REWRITING WHO SOMEONE IS.',
    businessEffectAuthority: 'NONE'
  };
}

// --- PCE-07: experience / experiment plan -----------------------------------

/**
 * Whether an authorization object actually carries founder authority for a
 * life experience that would spend money, commit travel, or involve a third
 * party.
 *
 * A separate grant from `personal-civilization-core.mjs`'s `PRIVATE_LIFE_STATE`
 * authority on purpose: that grant authorizes reading/writing private
 * records, and reusing it here would let private-data access double as
 * permission to spend or travel, which is a different consequence class with
 * a different blast radius. Each authority domain resolves its own grant.
 */
const experienceAuthorized = authorization => {
  if (!authorization || typeof authorization !== 'object') return false;
  return authorization.subject === 'FOUNDER'
    && authorization.grant === 'LIFE_EXPERIENCE_COMMITMENT'
    && Boolean(text(authorization.issuedAt, 60));
};

/**
 * Compiles a possibility into the smallest authentic reversible experience
 * that would actually reveal whether it suits the person.
 *
 * `reversible` must be explicitly true: this generator's whole purpose is the
 * reversible case, and a plan for an irreversible commitment belongs to a
 * different, more deliberate process than "try it and see". Experiences that
 * would spend money, commit travel, or involve another person are recorded
 * but marked not runnable by default -- capability does not create authority
 * merely because the experiment is well designed.
 */
export function experiencePlan(input = {}) {
  const forPossibility = text(input?.forPossibility, 500);
  if (!forPossibility) return fail('EXPERIENCE_PLAN_INVALID', ['for-possibility-required']);

  const uncertainty = text(input?.uncertainty, 1000);
  if (!uncertainty) return fail('EXPERIENCE_PLAN_INVALID', ['uncertainty-required']);

  const smallestReversibleExperience = text(input?.smallestReversibleExperience, 1000);
  if (!smallestReversibleExperience) return fail('EXPERIENCE_PLAN_INVALID', ['smallest-reversible-experience-required']);

  const wouldReveal = text(input?.wouldReveal, 1000);
  if (!wouldReveal) return fail('EXPERIENCE_PLAN_INVALID', ['would-reveal-required']);

  const wouldFalsify = text(input?.wouldFalsify, 1000);
  if (!wouldFalsify) return fail('EXPERIENCE_PLAN_INVALID', ['would-falsify-required']);

  if (input?.reversible !== true) {
    return fail('EXPERIENCE_PLAN_INVALID', ['experience-must-be-explicitly-reversible'], {
      note: 'This compiles reversible experiences only. An irreversible commitment is a different, more deliberate decision.'
    });
  }

  const triggeringFactors = [];
  if (input?.involvesSpend === true) triggeringFactors.push('SPEND');
  if (input?.involvesTravelCommitment === true) triggeringFactors.push('TRAVEL_COMMITMENT');
  if (input?.involvesThirdParty === true) triggeringFactors.push('THIRD_PARTY_INVOLVEMENT');

  // The guard this function exists to hold: capability to design a good
  // experiment is not authority to run one that spends, travels, or involves
  // someone else. Only an explicit matching grant overrides the default.
  const requiresFounderAuthority = triggeringFactors.length > 0;
  const authorized = requiresFounderAuthority ? experienceAuthorized(input?.authorization) : false;
  const runnable = !requiresFounderAuthority || authorized;

  return {
    ok: true,
    status: requiresFounderAuthority
      ? (authorized ? 'EXPERIENCE_AUTHORIZED_BY_FOUNDER' : 'EXPERIENCE_REQUIRES_FOUNDER_AUTHORITY')
      : 'EXPERIENCE_RUNNABLE',
    experience: {
      forPossibility,
      uncertainty,
      smallestReversibleExperience,
      wouldReveal,
      wouldFalsify,
      reversible: true,
      cost: text(input?.cost, 240) || 'UNSTATED',
      time: text(input?.time, 240) || 'UNSTATED',
      triggeringFactors,
      requiresFounderAuthority,
      runnable
    },
    // Stated plainly because the natural failure mode is quietly demanding
    // one: a rest/joy experience with no ROI field to fill in is not an
    // incomplete plan.
    boundary: 'REST, JOY, AND BEAUTY ARE LEGITIMATE ENDS. THIS PLAN NEVER REQUIRES A PRODUCTIVITY JUSTIFICATION.',
    businessEffectAuthority: 'NONE'
  };
}
