// One life across decades, held as Mohamed(t) rather than as Mohamed.
//
// Two failures, and a system avoiding one usually falls into the other.
//
// Collapse: an observation from age 22 gets quoted as a fact about the person
// today. It was true, it was well evidenced, and it is now a claim about
// someone who no longer exists in that form. This is how a personalisation
// layer becomes an identity prison -- not by being wrong, but by being right
// about a previous person and never noticing the tense.
//
// Severance: the fix that overcorrects. Treat each era as unrelated and the
// long-range structure disappears, which is the one thing an external memory
// spanning decades could have offered that no human memory can. A theme that
// surfaces at 18, again at 27 and again at 41 is the most interesting object
// in the archive, and only a system holding all three can see it.
//
// So eras are separate and connected. A claim carries the era it came from and
// cannot be applied to the present without either persistence across eras or an
// explicit staleness flag; and a pattern needs at least two eras before it is a
// pattern rather than a moment.
export const TEMPORAL_CIVILIZATION_VERSION = 'uberbond.temporal-civilization.v1';

/** How a claim from one era relates to the present. */
export const CLAIM_TENSES = Object.freeze([
  'ABOUT_THAT_ERA',        // true then, no claim about now
  'PERSISTS_ACROSS_ERAS',  // observed in more than one era
  'STALE_UNTESTED'         // from a past era, never re-observed, applied anyway
]);

/** Why a person may have changed between eras. */
export const TRANSFORMATION_KINDS = Object.freeze([
  'CAPABILITY_GAINED', 'CAPABILITY_LOST', 'VALUE_CHANGED', 'ENVIRONMENT_CHANGED',
  'RELATIONSHIP_CHANGED', 'HEALTH_CHANGED', 'BELIEF_REVISED', 'UNEXPLAINED'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const era = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 130 ? parsed : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * An observation, stamped with the era that produced it.
 *
 * The era is mandatory and is the whole design. An undated observation cannot
 * be told apart from a present one, which is the collapse this module exists
 * to prevent, and it also cannot contribute to a cross-era pattern.
 */
export function observe(input = {}) {
  const statement = text(input?.statement, 2000);
  const atAge = era(input?.atAge);
  if (!statement) return fail('OBSERVATION_INVALID', ['statement-required']);
  if (atAge === null) return fail('OBSERVATION_INVALID', ['era-required'], {
    note: 'An undated observation cannot be told apart from a present one, which is the collapse this exists to prevent.'
  });
  return {
    ok: true,
    status: 'OBSERVATION_RECORDED',
    observation: {
      statement,
      atAge,
      theme: text(input?.theme, 240) || null,
      ref: text(input?.ref, 480) || null
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a past observation may be spoken in the present tense.
 *
 * Persistence is the only thing that earns it. Strength of the original
 * evidence does not, because the question is not whether it was true — it is
 * whether the person it was true about is still this one.
 */
export function applyToPresent({ statement = null, observations = [], presentAge = null } = {}) {
  const claim = text(statement, 2000);
  const now = era(presentAge);
  if (!claim) return fail('APPLY_INVALID', ['statement-required']);
  if (now === null) return fail('APPLY_INVALID', ['present-age-required']);

  const matching = (Array.isArray(observations) ? observations : [])
    .filter(row => row?.statement === claim && era(row?.atAge) !== null)
    .map(row => ({ ...row, atAge: era(row.atAge) }))
    .sort((a, b) => a.atAge - b.atAge);

  if (matching.length === 0) {
    return fail('APPLY_INVALID', ['no-observation-supports-this-statement'], { statement: claim });
  }

  const eras = [...new Set(matching.map(row => row.atAge))];
  const mostRecent = eras[eras.length - 1];
  const persists = eras.length >= 2;

  if (persists) {
    return {
      ok: true,
      status: 'MAY_BE_APPLIED_TO_PRESENT',
      statement: claim,
      tense: 'PERSISTS_ACROSS_ERAS',
      observedAtAges: eras,
      erasSpanned: eras.length,
      yearsSinceLastObserved: now - mostRecent,
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'CLAIM_IS_ABOUT_THAT_ERA',
    statement: claim,
    tense: now - mostRecent > 0 ? 'STALE_UNTESTED' : 'ABOUT_THAT_ERA',
    observedAtAges: eras,
    erasSpanned: 1,
    yearsSinceLastObserved: now - mostRecent,
    // The sentence a collapse would have skipped.
    law: 'OBSERVED_ONCE_AT_ONE_AGE_IS_A_FACT_ABOUT_THAT_AGE__STRENGTH_OF_EVIDENCE_DOES_NOT_MAKE_IT_PRESENT_TENSE',
    requiredToApply: 'RE_OBSERVE_IN_THE_CURRENT_ERA',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Themes that surface across decades -- the reason to keep the archive at all.
 *
 * A theme inside one era is a period of interest. The same theme at 18, 27 and
 * 41 is the object no human memory holds, and it needs at least two eras before
 * it is a pattern rather than a moment.
 */
export function longRangeThemes(observations = [], { minimumEras = 2 } = {}) {
  const min = Number(minimumEras);
  if (!Number.isSafeInteger(min) || min < 2 || min > 20) {
    return fail('THEMES_INVALID', ['minimum-eras-between-2-and-20-required']);
  }

  const rows = (Array.isArray(observations) ? observations : [])
    .filter(row => row?.theme && era(row?.atAge) !== null)
    .map(row => ({ ...row, atAge: era(row.atAge) }));

  const byTheme = new Map();
  for (const row of rows) {
    if (!byTheme.has(row.theme)) byTheme.set(row.theme, { ages: new Set(), statements: [] });
    const entry = byTheme.get(row.theme);
    entry.ages.add(row.atAge);
    entry.statements.push(row.statement);
  }

  const recurring = [];
  const singleEraOnly = [];
  for (const [theme, entry] of [...byTheme.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ages = [...entry.ages].sort((a, b) => a - b);
    const record = {
      theme,
      erasSpanned: ages.length,
      ages,
      span: ages.length > 1 ? ages[ages.length - 1] - ages[0] : 0,
      statements: [...new Set(entry.statements)].sort()
    };
    if (ages.length >= min) recurring.push(record);
    else singleEraOnly.push(record);
  }

  recurring.sort((a, b) => b.span - a.span || b.erasSpanned - a.erasSpanned || a.theme.localeCompare(b.theme));

  return {
    ok: true,
    status: 'LONG_RANGE_THEMES_COMPILED',
    recurring,
    singleEraOnly,
    law: 'A_THEME_INSIDE_ONE_ERA_IS_A_PERIOD_OF_INTEREST__NOT_A_THREAD_THROUGH_A_LIFE',
    // Stated because recurrence is suggestive and nothing more.
    interpretationBoundary: 'RECURRENCE_IS_A_PATTERN_IN_THE_RECORD__NOT_EVIDENCE_OF_A_FIXED_TRAIT_OR_A_DESTINY',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The transformation record between two eras.
 *
 * Kept because continuity is the point and identity collapse is the failure.
 * Knowing the person changed, and being able to say between which eras and how,
 * is what lets an era boundary be respected instead of smoothed over.
 */
export function recordTransformation({ fromAge = null, toAge = null, kind = null, description = null } = {}) {
  const from = era(fromAge);
  const to = era(toAge);
  const how = text(kind, 40);
  const what = text(description, 2000);

  if (from === null || to === null) return fail('TRANSFORMATION_INVALID', ['both-eras-required']);
  if (to <= from) return fail('TRANSFORMATION_INVALID', ['later-era-must-follow-earlier']);
  if (!how || !TRANSFORMATION_KINDS.includes(how)) {
    return fail('TRANSFORMATION_INVALID', ['known-transformation-kind-required'], { known: TRANSFORMATION_KINDS });
  }
  if (!what) return fail('TRANSFORMATION_INVALID', ['description-required']);

  return {
    ok: true,
    status: 'TRANSFORMATION_RECORDED',
    transformation: { fromAge: from, toAge: to, kind: how, description: what, years: to - from },
    // UNEXPLAINED is a legitimate kind and stays that way; forcing a cause onto
    // a change nobody understands is how a tidy story replaces a real one.
    law: 'A_CHANGE_NOBODY_UNDERSTANDS_IS_RECORDED_AS_UNEXPLAINED__NOT_FITTED_TO_THE_NEAREST_CAUSE',
    businessEffectAuthority: 'NONE'
  };
}
