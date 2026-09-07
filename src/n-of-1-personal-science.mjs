// Learning from one person, who does not hold still.
//
// The tempting move is to treat a personal history as a dataset: n observations,
// run the statistic, report the effect. It fails for a reason that has nothing to
// do with sample size. The subject changed. If the sleep data spans the year
// someone moved country and changed job, the early rows and the late rows
// describe two different people, and pooling them measures neither.
//
// So the rules here are about *when the data is one subject*, not about how much
// of it there is:
//
//   a series crossing a declared regime change is split, never pooled
//   n=1 with no within-person baseline is anecdote, whatever its length
//   a population prior is a prior, and importing one states its transfer assumption
//   an unnamed confounder blocks a causal claim rather than weakening it
//
// The last one is the difference between this and a dashboard. A dashboard shows
// the correlation and lets the reader supply the causation. Personal evidence is
// exactly where that goes wrong, because the reader is also the subject and has a
// preferred answer.
export const N_OF_1_PERSONAL_SCIENCE_VERSION = 'uberbond.n-of-1-personal-science.v1';

/** Designs that can carry a within-person claim, weakest to strongest. */
export const DESIGNS = Object.freeze([
  'ANECDOTE',              // observed once, no comparison
  'BEFORE_AFTER',          // no washout, no repetition
  'BASELINE_CONTROLLED',   // a measured baseline to return to
  'REPEATED_REVERSAL',     // on, off, on -- the strongest available to one person
  'NATURAL_EXPERIMENT'     // an external change nobody chose
]);

/** Why a series may not be one subject. */
export const REGIME_CAUSES = Object.freeze([
  'RELOCATION', 'ROLE_CHANGE', 'HEALTH_CHANGE', 'RELATIONSHIP_CHANGE',
  'INSTRUMENT_CHANGE', 'SEASON', 'MEDICATION_CHANGE'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

// Number(null) is 0 and Number('') is 0, so a bare Number.isFinite check turns
// an unstated instrument error into a claimed zero-error instrument. Absence has
// to stay absent here; fabricating precision from a missing field is the exact
// failure this module exists to catch.
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Splits a series wherever the subject stopped being the same subject.
 *
 * Returning segments rather than a flag matters: the caller who wanted one
 * number now has to decide which period they meant, which is the question they
 * were avoiding.
 */
export function segmentSeries({ observations = [], regimeChanges = [] } = {}) {
  const rows = (Array.isArray(observations) ? observations : [])
    .map(row => ({ at: text(row?.at, 64), value: finite(row?.value) }))
    .filter(row => row.at && row.value !== null)
    .sort((a, b) => a.at.localeCompare(b.at));

  if (rows.length === 0) return fail('SERIES_INVALID', ['dated-observations-required']);

  const breaks = [];
  for (const change of (Array.isArray(regimeChanges) ? regimeChanges : [])) {
    const at = text(change?.at, 64);
    const cause = text(change?.cause, 40);
    if (!at) return fail('SERIES_INVALID', ['regime-change-date-required']);
    if (!cause || !REGIME_CAUSES.includes(cause)) {
      return fail('SERIES_INVALID', ['known-regime-cause-required'], { known: REGIME_CAUSES });
    }
    breaks.push({ at, cause });
  }
  breaks.sort((a, b) => a.at.localeCompare(b.at));

  const segments = [];
  let current = { from: rows[0].at, cause: 'SERIES_START', observations: [] };
  let pending = [...breaks];
  for (const row of rows) {
    while (pending.length && row.at >= pending[0].at) {
      const brk = pending.shift();
      segments.push({ ...current, to: brk.at });
      current = { from: brk.at, cause: brk.cause, observations: [] };
    }
    current.observations.push(row);
  }
  segments.push({ ...current, to: rows[rows.length - 1].at });

  const usable = segments.filter(segment => segment.observations.length > 0);

  return {
    ok: true,
    status: usable.length > 1 ? 'SERIES_SPLIT_BY_REGIME' : 'SERIES_SINGLE_REGIME',
    segments: usable.map(segment => ({
      from: segment.from, to: segment.to, cause: segment.cause, n: segment.observations.length
    })),
    pooledCount: rows.length,
    poolable: usable.length <= 1,
    law: 'A_SERIES_CROSSING_A_REGIME_CHANGE_DESCRIBES_MORE_THAN_ONE_SUBJECT_AND_IS_NOT_POOLED',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What a within-person design is entitled to claim.
 *
 * Length is deliberately not a promotion path. Two hundred observations of a
 * before-and-after with no washout is a long before-and-after; the confound it
 * carries is structural and does not dilute with n.
 */
export function claimStrength({ design = null, observations = 0, confoundersNamed = [], confoundersControlled = [], instrumentError = null } = {}) {
  const kind = text(design, 40);
  if (!kind || !DESIGNS.includes(kind)) {
    return fail('CLAIM_INVALID', ['known-design-required'], { known: DESIGNS });
  }
  const n = finite(observations);
  if (n === null || n < 0) return fail('CLAIM_INVALID', ['observation-count-required']);

  const named = [...new Set((Array.isArray(confoundersNamed) ? confoundersNamed : []).map(item => text(item, 240)).filter(Boolean))].sort();
  const controlled = [...new Set((Array.isArray(confoundersControlled) ? confoundersControlled : []).map(item => text(item, 240)).filter(Boolean))];
  const uncontrolled = named.filter(item => !controlled.includes(item));

  if (kind === 'ANECDOTE' || kind === 'BEFORE_AFTER') {
    return {
      ok: true,
      status: 'CLAIM_IS_DESCRIPTIVE',
      design: kind,
      observations: n,
      permittedClaim: 'DESCRIPTIVE_ONLY__NO_CAUSAL_CLAIM',
      uncontrolledConfounders: uncontrolled,
      law: 'LENGTH_DOES_NOT_PROMOTE_A_DESIGN__A_LONG_BEFORE_AFTER_IS_A_LONG_BEFORE_AFTER',
      businessEffectAuthority: 'NONE'
    };
  }

  // An unnamed confounder is the dangerous case and it cannot be detected from
  // here, so the honest output when none were named is a refusal to claim
  // causation rather than a causal claim with a caveat.
  if (named.length === 0) {
    return {
      ok: true,
      status: 'CLAIM_BLOCKED',
      design: kind,
      observations: n,
      permittedClaim: 'NO_CAUSAL_CLAIM__NO_CONFOUNDERS_WERE_NAMED',
      law: 'A_DESIGN_THAT_NAMED_NO_CONFOUNDERS_HAS_NOT_LOOKED_FOR_ANY',
      businessEffectAuthority: 'NONE'
    };
  }

  if (uncontrolled.length > 0) {
    return {
      ok: true,
      status: 'CLAIM_BLOCKED',
      design: kind,
      observations: n,
      uncontrolledConfounders: uncontrolled,
      permittedClaim: 'NO_CAUSAL_CLAIM__NAMED_CONFOUNDERS_REMAIN_UNCONTROLLED',
      businessEffectAuthority: 'NONE'
    };
  }

  const error = finite(instrumentError);
  return {
    ok: true,
    status: 'CLAIM_PERMITTED',
    design: kind,
    observations: n,
    confoundersControlled: named,
    permittedClaim: 'WITHIN_PERSON_CAUSAL_CLAIM_FOR_THIS_PERSON_IN_THIS_REGIME',
    // Stated because a within-person result is the least generalisable kind of
    // evidence and the most tempting to state as a general fact.
    generalisationBoundary: 'THIS_PERSON_IN_THIS_REGIME__NOT_A_POPULATION_CLAIM',
    effectFloor: error === null ? 'UNKNOWN__INSTRUMENT_ERROR_NOT_STATED' : error,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Importing a population result as a prior.
 *
 * The transfer assumption is the whole thing. A population effect applies to a
 * person only if that person resembles the population in the ways the mechanism
 * depends on, and stating which ways is what separates a prior from a wish.
 */
export function importPrior({ finding = null, population = null, transferAssumption = null, personDiffersIn = [] } = {}) {
  const claim = text(finding, 2000);
  const source = text(population, 480);
  const assumption = text(transferAssumption, 480);
  if (!claim) return fail('PRIOR_INVALID', ['finding-required']);
  if (!source) return fail('PRIOR_INVALID', ['population-required']);
  if (!assumption) return fail('PRIOR_INVALID', ['transfer-assumption-required'], {
    note: 'A population result with no stated transfer assumption is a wish, not a prior.'
  });

  const differences = [...new Set((Array.isArray(personDiffersIn) ? personDiffersIn : [])
    .map(item => text(item, 240)).filter(Boolean))].sort();

  return {
    ok: true,
    status: differences.length ? 'PRIOR_WEAKENED_BY_DIFFERENCE' : 'PRIOR_IMPORTED',
    finding: claim,
    population: source,
    transferAssumption: assumption,
    personDiffersIn: differences,
    role: 'PRIOR_ONLY__NEVER_A_SUBSTITUTE_FOR_PERSONAL_EVIDENCE',
    law: 'A_POPULATION_EFFECT_IS_A_STARTING_BELIEF_ABOUT_THIS_PERSON__NOT_AN_OBSERVATION_OF_THEM',
    businessEffectAuthority: 'NONE'
  };
}
