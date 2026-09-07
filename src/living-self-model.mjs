// A model of a person that is not allowed to become a cage.
//
// Personalization systems fail in a characteristic direction: they learn what
// someone did and then recommend more of it, until the model of the person has
// quietly replaced the person's ability to become someone else. Canon names the
// specific mechanism -- identity compression, where "inexperienced at X" is
// recorded as "bad at X" and the difference disappears.
//
// Three refusals hold the line here:
//
//   a state cannot become a trait without evidence that distinguishes them
//   a preference carries where it came from, so influence stays visible
//   a first-order want and a second-order endorsement are different objects
//
// The last one is why this module exists at all. A system that cannot tell
// "I want this" from "I want to want this" will optimize a person toward
// whatever they currently crave, which is not the same as toward what they
// would choose.
export const LIVING_SELF_MODEL_VERSION = 'uberbond.living-self-model.v1';

/** What an observation about a person can be. Only the last two are durable. */
export const OBSERVATION_KINDS = Object.freeze([
  'TEMPORARY_STATE', 'ENVIRONMENT_EFFECT', 'INSUFFICIENT_EXPOSURE',
  'HABIT', 'SELF_STORY', 'SKILL_LEVEL', 'DURABLE_PREFERENCE', 'CHOSEN_VALUE'
]);

/** Kinds that make a claim about who someone is, rather than what happened. */
export const DURABLE_KINDS = Object.freeze(['DURABLE_PREFERENCE', 'CHOSEN_VALUE']);

/** Where a preference appears to have come from. None is "authentic" by default. */
export const PREFERENCE_ORIGINS = Object.freeze([
  'REPEATED_REFLECTION', 'DIRECT_EXPERIENCE', 'SOCIAL_PRESSURE', 'ADVERTISING',
  'FEAR', 'HABIT', 'STATUS', 'RELIEF_SEEKING', 'INHERITED', 'UNKNOWN'
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
 * One observation about the person, at the strength its evidence supports.
 *
 * A durable kind needs observations across varied contexts. One context is a
 * situation, not a person -- and "he is not a morning person" derived from a
 * fortnight of bad sleep is exactly the claim this refuses.
 */
export function observe(input = {}) {
  const subject = text(input?.about, 500);
  if (!subject) return fail('OBSERVATION_INVALID', ['observation-subject-required']);

  const kind = OBSERVATION_KINDS.includes(input?.kind) ? input.kind : null;
  if (!kind) return fail('OBSERVATION_INVALID', ['valid-observation-kind-required']);

  const contexts = [...new Set((Array.isArray(input?.contexts) ? input.contexts : [])
    .map(item => text(item, 240)).filter(Boolean))].sort();

  if (DURABLE_KINDS.includes(kind) && contexts.length < 2) {
    return fail('IDENTITY_COMPRESSION_REFUSED', ['durable-claim-requires-varied-contexts'], {
      about: subject, kind, contexts,
      note: 'One context is a situation, not a person. Recording it as durable is the compression canon forbids.'
    });
  }

  return {
    ok: true,
    status: 'OBSERVED',
    observation: {
      about: subject,
      kind,
      contexts,
      // Competing readings are kept rather than resolved. The system does not
      // get to decide which explanation of a person is the true one.
      alternativeReadings: (Array.isArray(input?.alternativeReadings) ? input.alternativeReadings : [])
        .map(item => text(item, 500)).filter(Boolean),
      durable: DURABLE_KINDS.includes(kind),
      observedAt: text(input?.observedAt, 60) || null
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Where a preference came from, without ruling on whether it is really his.
 *
 * The temptation is to mark socially-pressured wants inauthentic and reflective
 * ones authentic. That is the system deciding which of a person's desires
 * count, which is the capture it exists to prevent. It shows provenance; he
 * decides what he endorses.
 */
export function preferenceProvenance({ preference = null, origins = [], persistsAcrossContexts = null, currentlyEndorsed = null } = {}) {
  const name = text(preference, 500);
  if (!name) return fail('PROVENANCE_INVALID', ['preference-required']);

  const traced = [...new Set((Array.isArray(origins) ? origins : [])
    .filter(origin => PREFERENCE_ORIGINS.includes(origin)))];

  return {
    ok: true,
    status: 'PROVENANCE_TRACED',
    preference: name,
    origins: traced.length ? traced : ['UNKNOWN'],
    persistsAcrossContexts,
    // Recorded from the founder, never inferred. A system that inferred
    // endorsement would be deciding what he really wants.
    currentlyEndorsed,
    ruling: 'NONE',
    boundary: 'ORIGIN IS SHOWN, NOT JUDGED. NO ORIGIN MAKES A PREFERENCE AUTHENTIC OR INAUTHENTIC; THE FOUNDER DECIDES WHAT HE ENDORSES.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A first-order want and a second-order endorsement, kept apart.
 *
 * Conflict between them is the interesting signal and is reported as conflict.
 * Resolving it -- picking the "real" desire -- is the move that turns a model
 * of a person into an authority over them.
 */
export function metaVolition({ wants = null, wantsToWant = null, note = null } = {}) {
  const first = text(wants, 500);
  if (!first) return fail('META_VOLITION_INVALID', ['first-order-want-required']);
  const second = text(wantsToWant, 500);

  return {
    ok: true,
    status: 'META_VOLITION_RECORDED',
    wants: first,
    wantsToWant: second,
    // Absent a second-order statement there is no conflict to report -- not a
    // conflict resolved in favour of the first.
    conflict: Boolean(second) && second !== first,
    note: text(note, 1000) || null,
    resolution: 'NONE',
    boundary: 'A FIRST-ORDER WANT AND A SECOND-ORDER ENDORSEMENT ARE DIFFERENT OBJECTS. THE SYSTEM DOES NOT PICK BETWEEN THEM.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The current model of the person, with its own expiry visible.
 *
 * A model with no staleness is one that will still be describing a person years
 * after they changed. Reported rather than enforced, because deleting a model
 * on a timer would lose the history that makes change legible.
 */
export function livingModel({ observations = [], asOf = new Date() } = {}) {
  const rows = (Array.isArray(observations) ? observations : []).filter(row => row?.about && row?.kind);
  const durable = rows.filter(row => row.durable);
  const provisional = rows.filter(row => !row.durable);

  const contested = rows.filter(row => (row.alternativeReadings || []).length > 0);

  return {
    ok: true,
    status: 'LIVING_MODEL',
    asOf: new Date(asOf).toISOString(),
    durableClaims: durable.map(row => ({ about: row.about, kind: row.kind, contexts: row.contexts })),
    provisionalObservations: provisional.map(row => ({ about: row.about, kind: row.kind })),
    // Kept visible so the model reads as a set of competing readings rather
    // than a settled description.
    contestedClaims: contested.map(row => ({ about: row.about, readings: row.alternativeReadings })),
    law: 'THIS IS MOHAMED(t), NOT MOHAMED. NO CLAIM HERE IS A PERMANENT FACT ABOUT A PERSON, AND NONE PREDICTS WHO HE MAY BECOME.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Experiences that would reveal something no past behaviour can.
 *
 * The antidote to personalization becoming a cage: recommending more of what
 * someone already likes cannot find the parts of them reality has never
 * exposed. Ranked by what is genuinely untested, not by predicted enjoyment --
 * predicted enjoyment is the cage.
 */
export function unknownSelfProbes({ untestedDomains = [], pastExposure = [] } = {}) {
  const exposed = new Set((Array.isArray(pastExposure) ? pastExposure : []).map(item => text(item, 240)).filter(Boolean));
  const candidates = (Array.isArray(untestedDomains) ? untestedDomains : [])
    .map(item => text(item, 240)).filter(Boolean)
    .filter(domain => !exposed.has(domain));

  return {
    ok: true,
    status: candidates.length ? 'UNTESTED_DOMAINS_FOUND' : 'NO_UNTESTED_DOMAINS_SUPPLIED',
    probes: candidates,
    alreadyExposed: [...exposed],
    law: 'RECOMMENDING_MORE_OF_WHAT_SOMEONE_ALREADY_LIKES_CANNOT_FIND_WHAT_REALITY_HAS_NEVER_EXPOSED',
    businessEffectAuthority: 'NONE'
  };
}
