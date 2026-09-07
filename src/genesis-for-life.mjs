// Generating lives that were never asked for, without any of them acquiring a vote.
//
// The economic GENESIS lineage invents companies, mechanisms and markets. This
// is the life-level organ and it fails differently. Two failures, both quiet:
//
// The first is the cage. A generator trained on what someone already is will
// propose more of what they already are, and the output looks like breadth
// because there are twelve of them. Twelve continuations of one identity is a
// well-decorated cage, and the canon's Unknown-Self Engine exists precisely
// because past behaviour cannot reveal the parts of a person reality has never
// exposed. So a batch where nothing departs is reported as a cage, not a result.
//
// The second is quieter still: a generated path drifting from imagination into
// evidence, and then into recommendation, because it was written down in a
// structured way and structure reads as authority. Every path here carries its
// status, and generation emits no ranking at all -- a ranked list of lives is a
// recommendation whatever the header says.
//
// Distance from the current identity is recorded and explicitly is not quality.
// A far path is not a better path. It is a differently-informative one, and
// confusing those is how a possibility engine starts telling someone that who
// they are is the problem.
import { LIFE_DIMENSIONS } from './life-possibility-engine.mjs';

export const GENESIS_FOR_LIFE_VERSION = 'uberbond.genesis-for-life.v1';

export { LIFE_DIMENSIONS };

/** How far a generated path sits from the identity that exists now. Not a quality scale. */
export const IDENTITY_DISTANCE = Object.freeze([
  'CONTINUATION',   // more of who this already is
  'ADJACENT',       // a step sideways from something already true
  'DEPARTURE',      // no current evidence that this person is this
  'UNKNOWN_SELF'    // aimed at a dimension reality has never tested
]);

/** What a generated path is. It never leaves this list on its own. */
export const PATH_EVIDENCE_STATUS = Object.freeze(['HYPOTHESIS']);

/** Constraints that refuse a path at construction rather than filtering it later. */
export const HARD_CONSTRAINTS = Object.freeze(['UNLAWFUL', 'REQUIRES_ANOTHER_PERSONS_CONSENT_NOT_GIVEN', 'IRREVERSIBLE_AND_UNTESTED', 'PHYSICALLY_IMPOSSIBLE']);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Generates one candidate life path.
 *
 * Hard constraints are checked here, at construction, and not applied as a
 * post-filter. A post-filter is a step a caller can forget; a refusal is not.
 * An irreversible path is admissible only when a reversible probe exists,
 * because "try it and see" is the only honest way to hold an untested claim
 * about what someone would want.
 */
export function generatePath(input = {}) {
  const name = text(input?.name, 240);
  if (!name) return fail('PATH_INVALID', ['path-name-required']);

  const distance = text(input?.identityDistance, 40);
  if (!distance || !IDENTITY_DISTANCE.includes(distance)) {
    return fail('PATH_INVALID', ['known-identity-distance-required'], { known: IDENTITY_DISTANCE });
  }

  const dimensions = [...new Set((Array.isArray(input?.dimensions) ? input.dimensions : [])
    .map(item => text(item, 40)).filter(item => item && LIFE_DIMENSIONS.includes(item)))].sort();
  if (dimensions.length === 0) {
    return fail('PATH_INVALID', ['known-life-dimension-required'], { known: LIFE_DIMENSIONS });
  }

  // Unknown constraint tokens are refused rather than filtered out. Silently
  // dropping something a caller passed as a hard constraint is the one failure
  // this list exists to prevent -- a typo would become permission.
  const declared = (Array.isArray(input?.violates) ? input.violates : []).map(item => text(item, 120));
  const unrecognised = declared.filter(item => !item || !HARD_CONSTRAINTS.includes(item));
  if (unrecognised.length > 0) {
    return fail('PATH_INVALID', ['unknown-hard-constraint'], {
      path: name,
      unrecognised,
      known: HARD_CONSTRAINTS,
      note: 'An unrecognised hard constraint is refused, never dropped. Silently discarding one turns a typo into permission.'
    });
  }
  const violated = [...new Set(declared)].sort();
  const reversibleProbe = text(input?.reversibleProbe, 480);

  const blocking = violated.filter(item => item !== 'IRREVERSIBLE_AND_UNTESTED' || !reversibleProbe);
  if (blocking.length > 0) {
    return fail('PATH_REFUSED', ['hard-constraint-violated'], {
      path: name,
      violates: blocking,
      note: 'Hard constraints refuse a path at construction. A post-generation filter is a step a caller can forget.'
    });
  }

  return {
    ok: true,
    status: 'PATH_GENERATED',
    path: {
      name,
      identityDistance: distance,
      dimensions,
      reversibleProbe: reversibleProbe || null,
      // Carried on the object itself so it survives being passed around.
      evidenceStatus: 'HYPOTHESIS'
    },
    distanceBoundary: 'IDENTITY_DISTANCE_IS_NOT_QUALITY__A_FAR_PATH_IS_NOT_A_BETTER_PATH',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A batch, checked for the cage.
 *
 * The test is whether anything departs, not how many were produced. Twelve
 * continuations is one identity with good imagination, and calling it a
 * generation result is how personalisation becomes a cage built from the past.
 *
 * No ranking is emitted. A ranked list of lives is a recommendation whatever
 * the header calls it, and this organ creates possibility, not authority.
 */
export function generateBatch(paths = []) {
  const rows = (Array.isArray(paths) ? paths : []).filter(row => row?.name && IDENTITY_DISTANCE.includes(row?.identityDistance));
  if (rows.length === 0) return fail('BATCH_INVALID', ['generated-paths-required']);

  const byDistance = {};
  for (const key of IDENTITY_DISTANCE) byDistance[key] = 0;
  for (const row of rows) byDistance[row.identityDistance] += 1;

  const departures = rows.filter(row => row.identityDistance === 'DEPARTURE' || row.identityDistance === 'UNKNOWN_SELF');
  const caged = departures.length === 0;

  // A path that lost its status somewhere between generation and here is a
  // hypothesis that has quietly stopped saying so.
  const unstatused = rows.filter(row => row.evidenceStatus !== 'HYPOTHESIS').map(row => row.name).sort();

  return {
    ok: true,
    status: caged ? 'CAGE_NOT_GENESIS' : 'BATCH_GENERATED',
    generatedCount: rows.length,
    byIdentityDistance: byDistance,
    departures: departures.map(row => row.name).sort(),
    caged,
    pathsMissingHypothesisStatus: unstatused,
    // Deliberately absent: any ordering of these paths. See the module header.
    rankingWithheld: 'A_RANKED_LIST_OF_LIVES_IS_A_RECOMMENDATION_WHATEVER_THE_HEADER_CALLS_IT',
    cageLaw: 'A_BATCH_WHERE_NOTHING_DEPARTS_IS_ONE_IDENTITY_WITH_GOOD_IMAGINATION',
    authorityBoundary: 'POSSIBILITY__NOT_RECOMMENDATION__NOT_CHOICE',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The Unknown-Self question, which is the only reason distance is tracked.
 *
 * Not "which path is best" but "which experience would tell us something about
 * this person that no amount of looking at their history can". A dimension
 * with no exposure at all is where the information is, and a low score in a
 * dimension nobody has ever tried is not evidence of anything.
 */
export function unknownSelfProbes({ testedDimensions = [], paths = [] } = {}) {
  const tested = new Set((Array.isArray(testedDimensions) ? testedDimensions : [])
    .map(item => text(item, 40)).filter(item => item && LIFE_DIMENSIONS.includes(item)));

  const untested = LIFE_DIMENSIONS.filter(item => !tested.has(item));

  const rows = (Array.isArray(paths) ? paths : []).filter(row => row?.name && Array.isArray(row?.dimensions));
  const informative = rows
    .map(row => ({
      path: row.name,
      untestedDimensions: row.dimensions.filter(item => !tested.has(item)).sort(),
      reversibleProbe: row.reversibleProbe || null
    }))
    .filter(row => row.untestedDimensions.length > 0)
    .sort((a, b) => b.untestedDimensions.length - a.untestedDimensions.length || a.path.localeCompare(b.path));

  return {
    ok: true,
    status: 'UNKNOWN_SELF_PROBES_COMPILED',
    untestedDimensions: untested,
    informativePaths: informative,
    // The pairing that matters: an untested dimension plus a cheap reversible
    // way to test it. Without the probe this is a list of things to feel bad about.
    probeReady: informative.filter(row => row.reversibleProbe).map(row => row.path),
    law: 'A_LOW_SCORE_IN_A_DIMENSION_NOBODY_EVER_TESTED_IS_NOT_EVIDENCE_OF_ANYTHING',
    orderingBoundary: 'ORDERED_BY_INFORMATION_ABOUT_THE_PERSON__NOT_BY_HOW_GOOD_THE_LIFE_WOULD_BE',
    businessEffectAuthority: 'NONE'
  };
}
