// Other people, who are not optimization objects.
//
// Every other module here reasons about one life. This one is where that
// reasoning meets people who have their own, and the failure mode is specific
// and quiet: a system built to serve one person will model everyone else as
// terrain. Their preferences become parameters, their reactions become
// predictions, and nothing in the arithmetic notices the category error.
//
// Three refusals hold the line. Another mind is modelled with explicit
// uncertainty, never as a solved variable. A benefit to Mohamed that requires
// the other party not to understand the arrangement is refused rather than
// scored. And influence over someone else is bounded by whether they could
// consent to being influenced that way, which is not a term you can trade off.
export const INTER_SOVEREIGN_VERSION = 'uberbond.inter-sovereign.v1';

/** How a claim about another person's inner state was arrived at. */
export const OTHER_MIND_BASIS = Object.freeze([
  'THEY_SAID_SO', 'REPEATED_BEHAVIOUR', 'SINGLE_BEHAVIOUR', 'INFERRED_FROM_TYPE', 'ASSUMED'
]);

/** Bases weak enough that acting on them alone is acting on a guess about a person. */
export const WEAK_MIND_BASIS = Object.freeze(['SINGLE_BEHAVIOUR', 'INFERRED_FROM_TYPE', 'ASSUMED']);

/** How an interaction is structured. */
export const INTERACTION_SHAPES = Object.freeze([
  'MUTUAL_BENEFIT', 'FAIR_EXCHANGE', 'GIFT', 'ONE_SIDED_EXTRACTION', 'REQUIRES_THEIR_IGNORANCE'
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
 * A claim about what another person wants, with how weakly it is held.
 *
 * `confidence` is capped rather than refused, because some claim has to be
 * possible or the system cannot reason about relationships at all. What it
 * cannot do is present a guess about a person at the same strength as
 * something they said.
 */
export function modelOtherMind({ person = null, claim = null, basis = null, theyConfirmed = false } = {}) {
  const who = text(person, 240);
  const what = text(claim, 1000);
  if (!who || !what) return fail('OTHER_MIND_INVALID', ['person-and-claim-required']);
  if (!OTHER_MIND_BASIS.includes(basis)) return fail('OTHER_MIND_INVALID', ['valid-basis-required']);

  const weak = WEAK_MIND_BASIS.includes(basis);
  return {
    ok: true,
    status: 'OTHER_MIND_MODELLED',
    person: who,
    claim: what,
    basis,
    theyConfirmed: theyConfirmed === true,
    // Never resolved to certainty, whatever the evidence. Another mind stays
    // partly unknowable, and a system that forgot that would act on a person
    // as though it had read them.
    certainty: theyConfirmed ? 'THEY_CONFIRMED_IT' : weak ? 'A_GUESS_ABOUT_A_PERSON' : 'INFERRED_AND_UNCONFIRMED',
    actionableAlone: !weak,
    boundary: 'ANOTHER MIND IS NEVER A SOLVED VARIABLE. THIS IS A HYPOTHESIS ABOUT SOMEONE WHO CAN CORRECT IT.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether an arrangement survives the other party understanding it.
 *
 * This is the cleanest available test for extraction, and it is a refusal
 * rather than a penalty: an arrangement that needs someone not to understand it
 * does not become acceptable at a high enough benefit.
 */
export function mutuality({ arrangement = null, shape = null, benefitToFounder = null, benefitToOther = null } = {}) {
  const what = text(arrangement, 1000);
  if (!what) return fail('MUTUALITY_INVALID', ['arrangement-required']);
  if (!INTERACTION_SHAPES.includes(shape)) return fail('MUTUALITY_INVALID', ['valid-interaction-shape-required']);

  if (shape === 'REQUIRES_THEIR_IGNORANCE') {
    return fail('ARRANGEMENT_REFUSED', ['an-arrangement-requiring-the-other-party-not-to-understand-it'], {
      arrangement: what,
      note: 'This does not become acceptable at a higher benefit. Survives-being-understood is the test.'
    });
  }

  return {
    ok: true,
    status: shape === 'ONE_SIDED_EXTRACTION' ? 'ONE_SIDED_BUT_UNDERSTOOD' : 'MUTUAL_OR_FAIR',
    arrangement: what,
    shape,
    benefitToFounder: text(benefitToFounder, 500) || null,
    benefitToOther: text(benefitToOther, 500) || null,
    survivesBeingUnderstood: true,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Influence bounded by whether the person could consent to it.
 *
 * Not a score. Persuasion someone would object to on learning of it is
 * manipulation regardless of how good the outcome is, and making it tradeable
 * against outcome is precisely how it stops being a bound.
 */
export function influenceBoundary({ method = null, wouldTheyObjectOnLearning = null, outcomeGoodForThem = false } = {}) {
  const how = text(method, 1000);
  if (!how) return fail('INFLUENCE_INVALID', ['method-required']);

  if (wouldTheyObjectOnLearning === true) {
    return {
      ok: true,
      status: 'MANIPULATION',
      method: how,
      // Recorded and explicitly not weighed against the verdict.
      outcomeGoodForThem,
      outcomeChangesVerdict: false,
      law: 'PERSUASION_SOMEONE_WOULD_OBJECT_TO_ON_LEARNING_OF_IT_IS_MANIPULATION_WHATEVER_THE_OUTCOME',
      businessEffectAuthority: 'NONE'
    };
  }
  if (wouldTheyObjectOnLearning === null) {
    return {
      ok: true,
      status: 'UNKNOWN_WHETHER_THEY_WOULD_OBJECT',
      method: how,
      note: 'Nobody has established how they would react to learning of this, which is not the same as them being fine with it.',
      businessEffectAuthority: 'NONE'
    };
  }
  return { ok: true, status: 'INFLUENCE_ACCEPTABLE', method: how, businessEffectAuthority: 'NONE' };
}

/**
 * Models of people, checked against what people actually did.
 *
 * Human behaviour is empirical. A theory of how friendship or negotiation works
 * that has never been checked against observation is a theory about how it
 * should work, which is a different subject.
 */
export function socialCalibration(predictions = []) {
  const rows = (Array.isArray(predictions) ? predictions : [])
    .map(row => ({
      predicted: text(row?.predicted, 500),
      observed: text(row?.observed, 500),
      domain: text(row?.domain, 120)
    }))
    .filter(row => row.predicted && row.observed);

  const wrong = rows.filter(row => row.predicted !== row.observed);
  const byDomain = new Map();
  for (const row of wrong) if (row.domain) byDomain.set(row.domain, (byDomain.get(row.domain) || 0) + 1);

  return {
    ok: true,
    status: rows.length === 0 ? 'NO_PREDICTIONS_CHECKED' : 'CALIBRATION_MEASURED',
    checked: rows.length,
    wrong: wrong.length,
    weakestDomains: [...byDomain.entries()].sort((a, b) => b[1] - a[1]).map(([domain, count]) => ({ domain, count })),
    boundary: rows.length === 0
      ? 'NO MODEL HERE HAS BEEN CHECKED AGAINST WHAT PEOPLE ACTUALLY DID.'
      : 'MEASURED AGAINST OBSERVED BEHAVIOUR, NOT AGAINST A THEORY OF HOW PEOPLE SHOULD BEHAVE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Reactions the world will have to a decision, including to knowing about it.
 *
 * Strategic settings contain agents who adapt, so a plan evaluated against a
 * static world is evaluated against a world that will not exist once the plan
 * runs.
 */
export function strategicReality({ decision = null, otherAgents = [], theyCanObserve = false } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('STRATEGIC_INVALID', ['decision-required']);

  const agents = (Array.isArray(otherAgents) ? otherAgents : [])
    .map(row => ({ agent: text(row?.agent, 240), likelyResponse: text(row?.likelyResponse, 500) }))
    .filter(row => row.agent);

  return {
    ok: true,
    status: agents.length ? 'ADAPTIVE_AGENTS_PRESENT' : 'NO_ADAPTIVE_AGENTS_SUPPLIED',
    decision: what,
    otherAgents: agents,
    theyCanObserve: theyCanObserve === true,
    note: agents.length && theyCanObserve
      ? 'They can see this and will adapt. A plan evaluated against a static world is evaluated against one that will not exist once it runs.'
      : agents.length
        ? 'Agents are present but cannot observe the decision, so their adaptation is to its effects rather than to it.'
        : 'No adaptive agents supplied, which is not the same as none existing.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * How an environment may have shaped a preference before it reached the person.
 *
 * The firewall shows provenance and refuses to rule. Declaring a preference
 * inauthentic because an algorithm touched it would be the system deciding
 * which of someone's wants are really theirs.
 */
export function realityToSelfFirewall({ preference = null, environmentalSources = [] } = {}) {
  const held = text(preference, 500);
  if (!held) return fail('FIREWALL_INVALID', ['preference-required']);

  const sources = (Array.isArray(environmentalSources) ? environmentalSources : [])
    .map(i => text(i, 240)).filter(Boolean);

  return {
    ok: true,
    status: sources.length ? 'ENVIRONMENTAL_INFLUENCE_VISIBLE' : 'NO_ENVIRONMENTAL_SOURCE_IDENTIFIED',
    preference: held,
    environmentalSources: sources,
    ruling: 'NONE',
    boundary: 'INFLUENCE IS SHOWN, NOT JUDGED. A PREFERENCE AN ALGORITHM TOUCHED IS STILL HIS TO ENDORSE OR REJECT.',
    businessEffectAuthority: 'NONE'
  };
}
