// Stop a generation from measuring the same thing twice under two names.
//
// Coverage is the easiest number in this whole spine to inflate. Take the
// evidence already scoring one dimension, cut it a different way, give the
// slice a second dimension's name, and the measured count rises while nothing
// new has been observed. G1 did a version of this -- coverage 4 to 9 with the
// ceiling untouched -- and it cost two generations to notice.
//
// So a dimension declares the evidence set it is scored from, and a dimension
// whose evidence is already spoken for is refused rather than counted.

export const NULLSTAR_OMEGA_EVIDENCE_REUSE_VERSION = 'uberbond.nullstar-omega-evidence-reuse.v1';

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

const keySet = claim => new Set(
  (Array.isArray(claim?.evidenceKeys) ? claim.evidenceKeys : [])
    .map(key => String(key ?? '').trim())
    .filter(Boolean)
);

/**
 * @param claims [{ dimension, evidenceKeys: [string], rationale }]
 *
 * An evidence key names a specific observation -- a closed reality loop, a
 * meta-improvement episode, a generalization family, a git-derived module row.
 * Two dimensions sharing a key are reading the same observation.
 *
 * `maxOverlapRatio` is the share of a dimension's own evidence that may
 * already be spoken for. Zero would be too strict: a dimension can legitimately
 * touch one shared observation among many. Half is the point where the
 * dimension is mostly a re-slice.
 */
export function admitDimensionEvidence({ claims = [], maxOverlapRatio = 0.5 } = {}) {
  const rows = (Array.isArray(claims) ? claims : []).map(claim => ({
    dimension: String(claim?.dimension ?? '').trim(),
    keys: keySet(claim),
    rationale: String(claim?.rationale ?? '').trim()
  })).filter(row => row.dimension);

  if (rows.length === 0) return fail('EVIDENCE_ADMISSION_INVALID', ['at-least-one-dimension-claim-required']);

  const missingKeys = rows.filter(row => row.keys.size === 0).map(row => row.dimension);
  if (missingKeys.length) {
    return fail('EVIDENCE_ADMISSION_INVALID', ['every-dimension-must-name-the-observations-it-is-scored-from'], { missingKeys });
  }

  const duplicateDimensions = rows.map(row => row.dimension)
    .filter((name, index, all) => all.indexOf(name) !== index);
  if (duplicateDimensions.length) {
    return fail('EVIDENCE_ADMISSION_INVALID', ['a-dimension-may-be-claimed-once'], { duplicateDimensions });
  }

  // Claims are settled in the order given: the first dimension to claim an
  // observation keeps it. Order therefore matters and is the caller's
  // responsibility, which is why it is stated in the result.
  const spokenFor = new Map();
  const admitted = [];
  const refused = [];

  for (const row of rows) {
    const overlapping = [...row.keys].filter(key => spokenFor.has(key));
    const ratio = overlapping.length / row.keys.size;
    if (ratio > maxOverlapRatio) {
      refused.push({
        dimension: row.dimension,
        evidenceCount: row.keys.size,
        overlappingCount: overlapping.length,
        overlapRatio: Number(ratio.toFixed(4)),
        alreadyScoring: [...new Set(overlapping.map(key => spokenFor.get(key)))],
        why: `${overlapping.length} of ${row.keys.size} observations are already scoring another dimension. Counting this would raise coverage without observing anything new.`
      });
      continue;
    }
    for (const key of row.keys) if (!spokenFor.has(key)) spokenFor.set(key, row.dimension);
    admitted.push({
      dimension: row.dimension,
      evidenceCount: row.keys.size,
      overlappingCount: overlapping.length,
      overlapRatio: Number(ratio.toFixed(4))
    });
  }

  return {
    ok: true,
    status: refused.length ? 'SOME_DIMENSIONS_REFUSED_AS_EVIDENCE_REUSE' : 'ALL_DIMENSIONS_ADMITTED',
    version: NULLSTAR_OMEGA_EVIDENCE_REUSE_VERSION,
    maxOverlapRatio,
    admitted,
    refused,
    admittedDimensions: admitted.map(row => row.dimension),
    refusedDimensions: refused.map(row => row.dimension),
    distinctObservations: spokenFor.size,
    settlementOrder: rows.map(row => row.dimension),
    truthBoundary: 'THIS CHECKS THAT TWO DIMENSIONS ARE NOT READING THE SAME OBSERVATION. IT DOES NOT CHECK THAT EITHER DIMENSION IS MEASURING WHAT ITS NAME SAYS.',
    businessEffectAuthority: 'NONE'
  };
}
