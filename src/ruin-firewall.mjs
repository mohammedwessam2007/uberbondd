// Whether an option can destroy the chooser's ability to choose again.
//
// Expected value is the wrong instrument here and gets this wrong in a specific
// way: it averages over paths, and ruin is not a path you average over -- it is
// the path where there are no further paths. A bet with excellent expected
// value and a 3% chance of ending the game is not a good bet made 33 times; it
// is a game you lose.
//
// So this module does not score. It answers a different question, and answers
// it before the scoring runs:
//
//   can this end the ability to recover?
//
// If yes, no expected value clears it. That is the firewall, and it is a
// firewall rather than a penalty term precisely because a penalty term can
// always be outweighed by a large enough number somewhere else.
export const RUIN_FIREWALL_VERSION = 'uberbond.ruin-firewall.v1';

/** How far from recoverable an outcome sits. Ordered; the last two are absorbing. */
export const RECOVERABILITY = Object.freeze([
  'REVERSIBLE',            // undo it
  'COSTLY_TO_REVERSE',     // undo it, and pay
  'PATH_DEPENDENT',        // some futures are gone, most remain
  'PRACTICALLY_IRREVERSIBLE', // not coming back within a life
  'ABSORBING'              // no further choices from here
]);

/** Domains where an absorbing state means something different in kind. */
export const RUIN_DOMAINS = Object.freeze([
  'HEALTH', 'LIFE', 'LEGAL_STANDING', 'FINANCIAL_SOLVENCY',
  'RELATIONSHIPS', 'REPUTATION', 'CAPABILITY', 'FREEDOM_OF_MOVEMENT'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

export const absorbing = level => level === 'PRACTICALLY_IRREVERSIBLE' || level === 'ABSORBING';

/**
 * Screens an option for ruin before any expected value is computed.
 *
 * `probability` is recorded and deliberately does not gate the verdict. A 0.1%
 * chance of an absorbing outcome is still a chance of an absorbing outcome, and
 * a threshold here would be a number someone tunes downward under pressure.
 * What probability is for is telling the founder how likely the thing is -- not
 * for deciding whether he gets told.
 */
export function screenForRuin({ option = null, outcomes = [], correlatedWith = [] } = {}) {
  const name = text(option, 240);
  if (!name) return fail('RUIN_SCREEN_INVALID', ['option-required']);

  const rows = (Array.isArray(outcomes) ? outcomes : [])
    .map(row => ({
      outcome: text(row?.outcome, 500),
      domain: RUIN_DOMAINS.includes(row?.domain) ? row.domain : null,
      recoverability: RECOVERABILITY.includes(row?.recoverability) ? row.recoverability : null,
      probability: Number.isFinite(Number(row?.probability)) ? Number(row.probability) : null
    }))
    .filter(row => row.outcome);

  const unclassified = rows.filter(row => !row.recoverability);
  // An outcome nobody classified is not a safe one. Treating it as benign is
  // how the one that mattered gets through: it is usually the novel outcome,
  // and novel is exactly what has no recoverability label yet.
  if (unclassified.length) {
    return fail('RUIN_SCREEN_INCOMPLETE', ['every-outcome-requires-a-recoverability-class'], {
      option: name,
      unclassified: unclassified.map(row => row.outcome),
      note: 'An unclassified outcome is treated as unknown, never as recoverable.'
    });
  }

  const ruinous = rows.filter(row => absorbing(row.recoverability));

  // Correlation is the reason portfolios fail all at once. Three ventures with
  // separate small ruin risks that share one dependency are one venture with a
  // large one, and the arithmetic that treats them as independent is what makes
  // the total look survivable.
  const sharedExposure = [...new Set((Array.isArray(correlatedWith) ? correlatedWith : [])
    .map(row => text(row, 240)).filter(Boolean))];

  if (ruinous.length) {
    return {
      ok: true,
      status: 'RUIN_POSSIBLE',
      option: name,
      cleared: false,
      ruinousOutcomes: ruinous,
      domains: [...new Set(ruinous.map(row => row.domain).filter(Boolean))],
      sharedExposure,
      // The line that makes this a firewall rather than a penalty.
      law: 'NO_EXPECTED_VALUE_CLEARS_AN_ABSORBING_OUTCOME. THE QUESTION IS WHETHER THE CHOOSER CAN CHOOSE AGAIN.',
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'NO_ABSORBING_OUTCOME_IDENTIFIED',
    option: name,
    cleared: true,
    worstRecoverability: rows.reduce(
      (worst, row) => (RECOVERABILITY.indexOf(row.recoverability) > RECOVERABILITY.indexOf(worst) ? row.recoverability : worst),
      'REVERSIBLE'
    ),
    sharedExposure,
    truthBoundary: 'CLEARED MEANS NO ABSORBING OUTCOME WAS IDENTIFIED, NOT THAT NONE EXISTS.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The recovery path an undertaking needs before it starts.
 *
 * Risk is partly recoverability, so a plan with no detection step has an
 * unbounded one: you cannot begin recovering from something you have not
 * noticed. Detection is therefore required and the others are reported.
 */
export function compileRecovery({ undertaking = null, detection = null, containment = null, fallback = null, reentry = null } = {}) {
  const name = text(undertaking, 240);
  if (!name) return fail('RECOVERY_PLAN_INVALID', ['undertaking-required']);

  const steps = {
    detection: text(detection, 1000),
    containment: text(containment, 1000),
    fallback: text(fallback, 1000),
    reentry: text(reentry, 1000)
  };
  const missing = Object.entries(steps).filter(([, value]) => !value).map(([key]) => key);

  if (!steps.detection) {
    return fail('RECOVERY_PLAN_INVALID', ['detection-step-required'], {
      undertaking: name, missing,
      note: 'Without detection the time-to-recovery is unbounded, because nothing starts the clock.'
    });
  }

  return {
    ok: true,
    status: missing.length ? 'RECOVERY_PLAN_PARTIAL' : 'RECOVERY_PLAN_COMPLETE',
    undertaking: name,
    steps,
    missing,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a set of exposures is as diversified as its count suggests.
 *
 * The same shape as correlated forecasts, applied to consequences instead of
 * evidence: five positions sharing one dependency are one position, and the
 * count is exactly the number that makes it look like five.
 */
export function correlatedExposure(positions = []) {
  const rows = (Array.isArray(positions) ? positions : [])
    .map(row => ({ name: text(row?.name, 240), dependsOn: (Array.isArray(row?.dependsOn) ? row.dependsOn : []).map(d => text(d, 240)).filter(Boolean) }))
    .filter(row => row.name);

  const byDependency = new Map();
  for (const row of rows) {
    for (const dependency of row.dependsOn) {
      byDependency.set(dependency, [...(byDependency.get(dependency) || []), row.name]);
    }
  }
  const singlePoints = [...byDependency.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([dependency, names]) => ({ dependency, positions: names }));

  return {
    ok: true,
    status: 'EXPOSURE_ASSESSED',
    positionCount: rows.length,
    apparentDiversification: rows.length,
    singlePointsOfFailure: singlePoints,
    // A count that says what the positions actually are, rather than how many
    // names they have.
    effectiveIndependentPositions: rows.length - singlePoints.reduce((sum, row) => sum + row.positions.length - 1, 0),
    law: 'POSITIONS_SHARING_A_DEPENDENCY_FAIL_TOGETHER_AND_ARE_ONE_POSITION',
    businessEffectAuthority: 'NONE'
  };
}
