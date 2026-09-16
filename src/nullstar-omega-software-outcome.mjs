// Score the `software` capability dimension from what happened to the code,
// not from what the code says about itself.
//
// Every other attempt at this dimension in the repository reads a file and
// reports what it finds, which is why the instrument sat at 1.0 for three
// generations. The question here is different and the repository cannot
// flatter itself on it: of the modules introduced on this branch, how many
// were still untouched afterwards?
//
// A module edited by a later commit was not right the first time. That is a
// harsh reading -- a later commit might add a feature rather than fix a
// defect -- so the result is reported with the reason each module was touched
// rather than as a bare number, and the score is explicitly a floor on
// first-attempt correctness rather than a measure of code quality.

export const NULLSTAR_OMEGA_SOFTWARE_OUTCOME_VERSION = 'uberbond.nullstar-omega-software-outcome.v1';

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

/**
 * @param introduced  [{ path, introducedIn, touchedByLater: [sha, ...] }]
 *
 * The caller supplies what git says. This function does not read git, so the
 * denominator cannot be quietly narrowed inside it: every module handed in is
 * counted, and handing in fewer is visible in the count it reports back.
 */
export function scoreSoftwareOutcome({ introduced = [], branchBase = null, head = null } = {}) {
  const reasonCodes = [];
  if (!branchBase) reasonCodes.push('branch-base-required');
  if (!head) reasonCodes.push('head-required');

  const rows = (Array.isArray(introduced) ? introduced : []).map(row => ({
    path: String(row?.path ?? ''),
    introducedIn: String(row?.introducedIn ?? ''),
    touchedByLater: Array.isArray(row?.touchedByLater) ? row.touchedByLater.filter(Boolean) : []
  })).filter(row => row.path && row.introducedIn);

  if (rows.length === 0) reasonCodes.push('at-least-one-introduced-module-required');

  // A denominator of one or two makes the score meaningless. Say so rather
  // than reporting 0 or 1 as if it meant something.
  if (rows.length > 0 && rows.length < 5) reasonCodes.push('denominator-too-small-to-score:need-at-least-five-modules');

  if (reasonCodes.length) return fail('SOFTWARE_OUTCOME_NOT_SCORABLE', reasonCodes, { modulesSupplied: rows.length });

  const untouched = rows.filter(row => row.touchedByLater.length === 0);
  const touched = rows.filter(row => row.touchedByLater.length > 0);
  const score = Number((untouched.length / rows.length).toFixed(4));

  return {
    ok: true,
    status: 'SOFTWARE_OUTCOME_SCORED',
    version: NULLSTAR_OMEGA_SOFTWARE_OUTCOME_VERSION,
    branchBase,
    head,
    modules: rows.length,
    untouchedAfterIntroduction: untouched.length,
    touchedAfterIntroduction: touched.length,
    score,
    touchedModules: touched.map(row => ({ path: row.path, laterCommits: row.touchedByLater.length })),
    interpretation: 'A module edited after the commit that introduced it was not right the first time.',
    truthBoundary: 'THIS IS A FLOOR ON FIRST-ATTEMPT CORRECTNESS, NOT A MEASURE OF CODE QUALITY. A LATER COMMIT MAY HAVE ADDED SOMETHING RATHER THAN FIXED SOMETHING, WHICH MAKES THE REAL FIRST-ATTEMPT RATE AT LEAST THIS HIGH AND POSSIBLY HIGHER.',
    providerRequired: false,
    businessEffectAuthority: 'NONE'
  };
}
