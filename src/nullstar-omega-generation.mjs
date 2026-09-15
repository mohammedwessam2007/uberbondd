// A generation record: what the system scored, against what, at which commit.
//
// The reason generations are a file rather than a number is that "we improved"
// is unfalsifiable without the anchor it improved from. A generation therefore
// pins the exact source commit, the suite version, the baselines it ran
// against, and the per-dimension vector -- so a later generation can be
// compared to it, and a regression in one dimension cannot hide inside an
// average of the others.
//
// Velocity is computed across generations, and deliberately refuses to call one
// positive sample acceleration. Two points are a line; three are the minimum
// that can distinguish rising from noisy, and even then this reports the class
// rather than a claim.
import { createHash } from 'node:crypto';
import { ZERO_CONSEQUENCE_EFFECTS } from './effect-ledgers.mjs';

export const NULLSTAR_OMEGA_GENERATION_VERSION = 'uberbond.nullstar-omega-generation.v1';

/** Capability dimensions a generation scores. Additive only. */
export const CAPABILITY_DIMENSIONS = Object.freeze([
  'reasoning', 'mathematics', 'science', 'software', 'research', 'forecasting',
  'causality', 'planning', 'toolUse', 'invention', 'crossDomain',
  'unknownUnknown', 'longHorizon', 'selfDiagnosis', 'calibration',
  'robustness', 'resourceEfficiency'
]);

/** Baselines a generation must name, per section 021. */
export const BASELINE_IDS = Object.freeze(['B0', 'B1', 'B2', 'B3', 'B4', 'B5']);

/** Improvement-trend classes. UNKNOWN is a legal and common answer. */
export const TREND_CLASSES = Object.freeze(['UNKNOWN', 'INSUFFICIENT_DATA', 'RISING', 'FLAT', 'FALLING', 'NOISY']);

const text = (value, max = 500) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const SHA40 = /^[0-9a-f]{40}$/;

function refuse(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: NULLSTAR_OMEGA_GENERATION_VERSION,
    status: 'NULLSTAR_OMEGA_GENERATION_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS },
    ...extra
  };
}

/**
 * Records one generation.
 *
 * A measured dimension carries a score; an unmeasured one carries null and is
 * counted as unmeasured. Defaulting an unmeasured dimension to zero would make
 * the next generation look like an improvement for having run more tests, and
 * defaulting it to the mean would hide that it was never run at all.
 */
export function recordGeneration({
  generationId = null,
  sourceCommit = null,
  suiteVersion = null,
  corpusDigest = null,
  vector = {},
  baselines = {},
  cost = {},
  environment = {},
  failures = [],
  previousGeneration = null,
  carriedForward = [],
  generatedAt = new Date().toISOString()
} = {}) {
  const id = text(generationId, 40);
  const commit = text(sourceCommit, 60);
  const suite = text(suiteVersion, 120);

  const reasons = [];
  if (!id || !/^G\d+$/.test(id)) reasons.push('generation-id-must-be-G-followed-by-a-number');
  if (!commit || !SHA40.test(commit)) reasons.push('exact-40-character-source-commit-required');
  if (!suite) reasons.push('suite-version-required');
  if (!text(corpusDigest, 128)) reasons.push('corpus-digest-required');

  const measured = {};
  const unmeasured = [];
  for (const dimension of CAPABILITY_DIMENSIONS) {
    const raw = vector?.[dimension];
    if (raw === null || raw === undefined) { unmeasured.push(dimension); measured[dimension] = null; continue; }
    const score = Number(raw);
    if (!Number.isFinite(score) || score < 0 || score > 1) { reasons.push(`dimension-score-0-to-1-required:${dimension}`); continue; }
    measured[dimension] = score;
  }
  if (Object.keys(vector || {}).some(key => !CAPABILITY_DIMENSIONS.includes(key))) {
    reasons.push('unrecognized-capability-dimension');
  }
  // A generation that measured nothing is a file, not a measurement.
  if (unmeasured.length === CAPABILITY_DIMENSIONS.length) reasons.push('generation-must-measure-at-least-one-dimension');

  for (const baselineId of BASELINE_IDS) {
    const entry = baselines?.[baselineId];
    if (entry === undefined) continue;
    if (entry !== null && !text(entry?.description, 500)) reasons.push(`baseline-description-required:${baselineId}`);
  }
  if (reasons.length) return refuse(reasons);

  const measuredCount = CAPABILITY_DIMENSIONS.length - unmeasured.length;

  // A value taken on one suite and reported under another is stale, and it is
  // stale in the flattering direction: the dimensions nobody re-measures are
  // the ones that were already at the ceiling.
  //
  // compareGenerations refuses to subtract across a suite change. Without this,
  // a single vector could carry both instruments at once and average them
  // together, which is the same error hidden one level down. Detection is
  // automatic rather than declared, because a caller who forgets to declare it
  // is exactly the case that produced the defect.
  //
  // A dimension genuinely re-measured to an identical value is flagged too.
  // That understates the mean rather than inflating it, which is the direction
  // to be wrong in.
  const carriedSet = new Set(
    (Array.isArray(carriedForward) ? carriedForward : []).filter(d => CAPABILITY_DIMENSIONS.includes(d))
  );
  const previousSuite = text(previousGeneration?.suiteVersion, 120);
  if (previousGeneration?.ok && previousSuite && previousSuite !== suite) {
    for (const dimension of CAPABILITY_DIMENSIONS) {
      const now = measured[dimension];
      const before = previousGeneration.vector?.[dimension];
      if (now !== null && Number.isFinite(before) && now === before) carriedSet.add(dimension);
    }
  }

  const freshDimensions = CAPABILITY_DIMENSIONS.filter(d => measured[d] !== null && !carriedSet.has(d));
  const carriedDimensions = CAPABILITY_DIMENSIONS.filter(d => measured[d] !== null && carriedSet.has(d));

  // A generation whose every reading came from a different instrument measured
  // nothing of its own.
  if (measuredCount > 0 && freshDimensions.length === 0) {
    return refuse(['every-measured-dimension-was-carried-from-a-different-suite']);
  }

  const scores = freshDimensions.map(d => measured[d]);
  const allScores = CAPABILITY_DIMENSIONS.map(d => measured[d]).filter(v => v !== null);

  return {
    ok: true,
    version: NULLSTAR_OMEGA_GENERATION_VERSION,
    status: 'NULLSTAR_OMEGA_GENERATION_RECORDED',
    generationId: id,
    sourceCommit: commit,
    suiteVersion: suite,
    corpusDigest,
    generatedAt,
    vector: measured,
    // Reported so a later generation cannot be compared against this one
    // without noticing they measured different things.
    coverage: {
      measured: measuredCount,
      unmeasured: unmeasured.length,
      unmeasuredDimensions: unmeasured,
      measuredUnderThisSuite: freshDimensions.length,
      carriedFromAnotherSuite: carriedDimensions.length,
      carriedDimensions
    },
    // The headline mean covers only what this suite actually measured. The
    // mean over everything is kept beside it so the gap between them is
    // visible rather than a choice one reader made.
    meanMeasuredScore: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(6)) : null,
    meanIncludingCarriedReadings: allScores.length
      ? Number((allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(6))
      : null,
    baselines: Object.fromEntries(BASELINE_IDS.map(b => [b, baselines?.[b] ?? null])),
    declaredBaselines: BASELINE_IDS.filter(b => baselines?.[b]),
    cost: {
      usdCents: Number.isFinite(Number(cost?.usdCents)) ? Number(cost.usdCents) : null,
      wallClockMs: Number.isFinite(Number(cost?.wallClockMs)) ? Number(cost.wallClockMs) : null,
      founderMinutes: Number.isFinite(Number(cost?.founderMinutes)) ? Number(cost.founderMinutes) : null
    },
    environment,
    failures: Array.isArray(failures) ? failures.slice(0, 200) : [],
    generationDigest: createHash('sha256')
      .update(JSON.stringify([id, commit, suite, corpusDigest, measured]))
      .digest('hex'),
    truthBoundary:
      'A_GENERATION_RECORDS_WHAT_WAS_MEASURED_AT_ONE_COMMIT_AGAINST_ONE_SUITE. '
      + 'AN_UNMEASURED_DIMENSION_IS_NULL_AND_NEVER_ZERO. '
      + 'IT_DOES_NOT_PROVE_IMPROVEMENT_GENERALIZATION_SELF_IMPROVEMENT_OR_ASI.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS }
  };
}

/**
 * Compares two generations dimension by dimension.
 *
 * Only dimensions measured in *both* can be compared. A dimension measured in
 * one and not the other is reported as incomparable rather than counted as a
 * gain, which is the most available way to manufacture improvement.
 */
export function compareGenerations(previous, next) {
  if (!previous?.ok || !next?.ok) return refuse(['two-recorded-generations-required']);

  // A score from one instrument is not comparable to a score from another.
  // G2 scored 1.0 on a suite of direct reads; G3 scored 0.60 on observed
  // outcomes. Subtracting those and reporting -0.40 would name a capability
  // regression that did not happen, and would punish exactly the change that
  // made the measurement honest.
  const instrumentChanged = previous.suiteVersion !== next.suiteVersion;

  const deltas = {};
  const incomparable = [];
  let improved = 0;
  let regressed = 0;
  for (const dimension of CAPABILITY_DIMENSIONS) {
    const a = previous.vector?.[dimension];
    const b = next.vector?.[dimension];
    if (a === null || a === undefined || b === null || b === undefined) { incomparable.push(dimension); continue; }
    const delta = Number((b - a).toFixed(6));
    deltas[dimension] = delta;
    if (delta > 0) improved += 1;
    if (delta < 0) regressed += 1;
  }

  const comparable = Object.keys(deltas);

  if (instrumentChanged) {
    return {
      ok: true,
      version: NULLSTAR_OMEGA_GENERATION_VERSION,
      status: 'INSTRUMENT_CHANGED__DELTAS_ARE_NOT_A_CAPABILITY_CHANGE',
      from: previous.generationId,
      to: next.generationId,
      previousSuiteVersion: previous.suiteVersion,
      currentSuiteVersion: next.suiteVersion,
      deltas,
      incomparableDimensions: incomparable,
      counts: { comparable: comparable.length, improved: null, regressed: null, incomparable: incomparable.length },
      netDelta: null,
      regressedDimensions: [],
      note: 'The deltas are reported because they say what the new instrument reads, but neither improvement nor regression can be claimed across a suite change. Re-measuring the previous generation on the new suite is what would make them comparable.',
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    version: NULLSTAR_OMEGA_GENERATION_VERSION,
    status: 'NULLSTAR_OMEGA_GENERATIONS_COMPARED',
    from: previous.generationId,
    to: next.generationId,
    deltas,
    incomparableDimensions: incomparable,
    counts: { comparable: comparable.length, improved, regressed, incomparable: incomparable.length },
    netDelta: comparable.length ? Number(comparable.reduce((sum, d) => sum + deltas[d], 0).toFixed(6)) : null,
    // A regression anywhere is surfaced rather than netted away. Section 034
    // makes absence of critical regression a promotion condition, which cannot
    // be checked against a single averaged number.
    regressedDimensions: comparable.filter(d => deltas[d] < 0),
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The improvement-trend class across generations.
 *
 * Refuses to name a trend from fewer than three generations, and never returns
 * "accelerating": that word requires repeated evidence this function cannot see
 * on its own, and section 041 lists conditions beyond the score series.
 */
export function improvementTrend(generations = []) {
  const ordered = (Array.isArray(generations) ? generations : [])
    .filter(g => g?.ok && typeof g.meanMeasuredScore === 'number')
    .sort((a, b) => Number(a.generationId.slice(1)) - Number(b.generationId.slice(1)));

  if (ordered.length < 3) {
    return {
      ok: true,
      trend: 'INSUFFICIENT_DATA',
      generations: ordered.length,
      reason: 'Two points are a line. Three is the minimum that distinguishes a rising series from a noisy one.',
      businessEffectAuthority: 'NONE'
    };
  }

  // A trend across a suite change is a trend in the instrument, not in the
  // system. Saying "FALLING" because the measurement got harder would be the
  // same error as saying "RISING" because it got easier.
  const suiteChanges = ordered.slice(1)
    .map((g, i) => (g.suiteVersion !== ordered[i].suiteVersion
      ? { from: ordered[i].generationId, to: g.generationId, fromSuite: ordered[i].suiteVersion, toSuite: g.suiteVersion }
      : null))
    .filter(Boolean);
  if (suiteChanges.length) {
    return {
      ok: true,
      trend: 'INSTRUMENT_CHANGED',
      generations: ordered.length,
      suiteChanges,
      reason: 'The measuring suite changed inside this series, so the score movement describes the instrument rather than the system.',
      accelerationClaim: 'NOT_ESTABLISHED_BY_SCORE_SERIES_ALONE',
      businessEffectAuthority: 'NONE'
    };
  }

  const deltas = ordered.slice(1).map((g, i) => g.meanMeasuredScore - ordered[i].meanMeasuredScore);
  const positive = deltas.filter(d => d > 0).length;
  const negative = deltas.filter(d => d < 0).length;
  // FLAT means nothing moved. A series holding still and then dropping is not
  // flat, and calling it flat would hide the only movement in it.
  let trend = 'FLAT';
  if (positive && negative) trend = 'NOISY';
  else if (positive) trend = 'RISING';
  else if (negative) trend = 'FALLING';

  return {
    ok: true,
    trend,
    generations: ordered.length,
    deltas: deltas.map(d => Number(d.toFixed(6))),
    accelerationClaim: 'NOT_ESTABLISHED_BY_SCORE_SERIES_ALONE',
    businessEffectAuthority: 'NONE'
  };
}
