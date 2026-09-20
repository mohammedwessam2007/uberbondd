import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SEMANTIC_NOVELTY_PREFLIGHT_VERSION = 'uberbond.semantic-novelty-preflight.v1';

const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

const fail = (status, reasonCodes, extra = {}) => envelope({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

const text = (value, max = 500) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

function scalar(value) {
  return value === null || ['boolean','number','string'].includes(typeof value);
}

function vector(value, maxLength = 100000) {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.every(scalar)
      ? value
      : null;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function mismatchRate(a, b) {
  let mismatches = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) mismatches += 1;
  }
  return mismatches / a.length;
}

export function compareBehavioralSignatures({
  targetId,
  targetOutputs,
  candidates = [],
  fixtureId,
  fixtureDescription
} = {}) {
  const id = text(targetId, 160);
  const fixture = text(fixtureId, 160);
  const description = text(fixtureDescription, 1600);
  const target = vector(targetOutputs);
  if (!id || !fixture || !description || !target || !Array.isArray(candidates) ||
      candidates.length === 0 || candidates.length > 50000) {
    return fail('SEMANTIC_NOVELTY_PREFLIGHT_INVALID', ['target-fixture-vector-and-candidates-required']);
  }

  const seen = new Set();
  const rows = [];
  for (const [index, raw] of candidates.entries()) {
    const candidateId = text(raw?.id, 240);
    const outputs = vector(raw?.outputs);
    if (!candidateId || !outputs || outputs.length !== target.length || seen.has(candidateId)) {
      return fail('SEMANTIC_NOVELTY_PREFLIGHT_INVALID', [`candidate-${index}-identity-or-vector-invalid`]);
    }
    seen.add(candidateId);
    const distance = mismatchRate(target, outputs);
    rows.push({
      id: candidateId,
      mismatchRate: Number(distance.toFixed(8)),
      exactEquivalent: distance === 0,
      outputDigest: digest(outputs)
    });
  }

  rows.sort((a,b) => a.mismatchRate - b.mismatchRate || a.id.localeCompare(b.id));
  const equivalents = rows.filter(row => row.exactEquivalent).map(row => row.id);
  const nearest = rows[0];

  return envelope({
    ok: true,
    status: equivalents.length ? 'SEMANTIC_EQUIVALENT_FOUND' : 'NO_EXACT_EQUIVALENT_ON_DECLARED_FIXTURE',
    targetId: id,
    fixtureId: fixture,
    fixtureDescription: description,
    fixtureSize: target.length,
    targetDigest: digest(target),
    exactEquivalentIds: equivalents,
    nearest,
    candidatesCompared: rows.length,
    noveltyOnFixture: equivalents.length === 0,
    claimBoundary: 'FINITE_FIXTURE_NON_EQUIVALENCE_IS_NOT_UNIVERSAL_ONTOLOGICAL_NOVELTY'
  });
}


export function compareBehavioralEvaluators({
  targetId,
  targetEvaluator,
  candidates = [],
  fixtures = [],
  fixtureId,
  fixtureDescription
} = {}) {
  const id = text(targetId, 160);
  const fixture = text(fixtureId, 160);
  const description = text(fixtureDescription, 1600);
  if (!id || typeof targetEvaluator !== 'function' || !fixture || !description ||
      !Array.isArray(candidates) || candidates.length === 0 || candidates.length > 50000 ||
      !Array.isArray(fixtures) || fixtures.length === 0 || fixtures.length > 100000) {
    return fail('SEMANTIC_NOVELTY_EVALUATOR_PREFLIGHT_INVALID', ['target-evaluator-candidates-and-fixtures-required']);
  }

  let targetOutputs;
  try {
    targetOutputs = fixtures.map(fixtureValue => targetEvaluator(fixtureValue));
  } catch {
    return fail('SEMANTIC_NOVELTY_EVALUATOR_PREFLIGHT_INVALID', ['target-evaluator-threw']);
  }
  if (!targetOutputs.every(scalar)) {
    return fail('SEMANTIC_NOVELTY_EVALUATOR_PREFLIGHT_INVALID', ['target-evaluator-must-return-scalars']);
  }

  const seen = new Set();
  const rows = [];
  for (const [index, candidate] of candidates.entries()) {
    const candidateId = text(candidate?.id, 240);
    if (!candidateId || typeof candidate?.evaluate !== 'function' || seen.has(candidateId)) {
      return fail('SEMANTIC_NOVELTY_EVALUATOR_PREFLIGHT_INVALID', [`candidate-${index}-identity-or-evaluator-invalid`]);
    }
    seen.add(candidateId);
    let mismatches = 0;
    let outputs;
    try {
      outputs = fixtures.map(fixtureValue => candidate.evaluate(fixtureValue));
    } catch {
      return fail('SEMANTIC_NOVELTY_EVALUATOR_PREFLIGHT_INVALID', [`candidate-${index}-evaluator-threw`]);
    }
    if (!outputs.every(scalar)) {
      return fail('SEMANTIC_NOVELTY_EVALUATOR_PREFLIGHT_INVALID', [`candidate-${index}-must-return-scalars`]);
    }
    for (let i = 0; i < targetOutputs.length; i += 1) {
      if (!Object.is(targetOutputs[i], outputs[i])) mismatches += 1;
    }
    const rate = mismatches / targetOutputs.length;
    rows.push({
      id: candidateId,
      mismatchRate: Number(rate.toFixed(8)),
      exactEquivalent: mismatches === 0,
      outputDigest: digest(outputs)
    });
  }

  rows.sort((a,b) => a.mismatchRate - b.mismatchRate || a.id.localeCompare(b.id));
  const equivalents = rows.filter(row => row.exactEquivalent).map(row => row.id);
  return envelope({
    ok: true,
    status: equivalents.length ? 'SEMANTIC_EQUIVALENT_FOUND' : 'NO_EXACT_EQUIVALENT_ON_DECLARED_FIXTURE',
    targetId: id,
    fixtureId: fixture,
    fixtureDescription: description,
    fixtureSize: fixtures.length,
    targetDigest: digest(targetOutputs),
    exactEquivalentIds: equivalents,
    nearest: rows[0],
    nearestCandidates: rows.slice(0, 10),
    candidatesCompared: rows.length,
    noveltyOnFixture: equivalents.length === 0,
    claimBoundary: 'FINITE_FIXTURE_EVALUATOR_NON_EQUIVALENCE_IS_NOT_UNIVERSAL_ONTOLOGICAL_NOVELTY'
  });
}

export function inspectSplitDegeneracy({
  splitId,
  labels,
  baselineScores = {},
  maximumClassShare = 0.90,
  maximumBaselineAccuracy = 0.98
} = {}) {
  const id = text(splitId, 160);
  const ys = vector(labels);
  const classLimit = Number(maximumClassShare);
  const baselineLimit = Number(maximumBaselineAccuracy);
  if (!id || !ys || !Number.isFinite(classLimit) || classLimit <= 0.5 || classLimit > 1 ||
      !Number.isFinite(baselineLimit) || baselineLimit < 0 || baselineLimit > 1 ||
      !baselineScores || typeof baselineScores !== 'object' || Array.isArray(baselineScores)) {
    return fail('SPLIT_DEGENERACY_INVALID', ['valid-split-labels-limits-and-baselines-required']);
  }

  const counts = new Map();
  for (const label of ys) {
    const key = JSON.stringify(label);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const classCounts = [...counts.entries()]
    .map(([label,count]) => ({ label: JSON.parse(label), count, share: Number((count / ys.length).toFixed(8)) }))
    .sort((a,b) => b.count - a.count);
  const largestClassShare = classCounts[0]?.share ?? 1;

  const baselines = Object.entries(baselineScores).map(([name,value]) => ({
    name,
    accuracy: Number(value)
  }));
  if (baselines.some(row => !Number.isFinite(row.accuracy) || row.accuracy < 0 || row.accuracy > 1)) {
    return fail('SPLIT_DEGENERACY_INVALID', ['baseline-accuracy-must-be-0-to-1']);
  }
  baselines.sort((a,b) => b.accuracy - a.accuracy || a.name.localeCompare(b.name));
  const suspiciousBaselines = baselines.filter(row => row.accuracy >= baselineLimit);

  const reasonCodes = [];
  if (largestClassShare >= classLimit) reasonCodes.push('class-imbalance-degeneracy');
  if (suspiciousBaselines.length) reasonCodes.push('baseline-ceiling-degeneracy');

  return envelope({
    ok: true,
    status: reasonCodes.length ? 'SPLIT_DEGENERACY_DETECTED' : 'SPLIT_PREFLIGHT_CLEAR',
    splitId: id,
    sampleCount: ys.length,
    classCounts,
    largestClassShare,
    baselines,
    suspiciousBaselines,
    reasonCodes,
    claimBoundary: 'PREFLIGHT_FLAGS_OBVIOUS_DEGENERACY__IT_DOES_NOT_CERTIFY_BENCHMARK_VALIDITY'
  });
}

export function admitNoveltyChallenge({
  semanticPreflight,
  splitPreflights = [],
  minimumNearestMismatchRate = 0.02
} = {}) {
  const threshold = Number(minimumNearestMismatchRate);
  if (!semanticPreflight?.ok || !Array.isArray(splitPreflights) ||
      !Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    return fail('NOVELTY_CHALLENGE_ADMISSION_INVALID', ['semantic-preflight-split-preflights-and-threshold-required']);
  }

  const reasons = [];
  if (!semanticPreflight.noveltyOnFixture) reasons.push('exact-semantic-equivalent-already-exists');
  if ((semanticPreflight.nearest?.mismatchRate ?? 0) < threshold) reasons.push('nearest-existing-behavior-too-close');
  for (const preflight of splitPreflights) {
    if (!preflight?.ok || preflight.status !== 'SPLIT_PREFLIGHT_CLEAR') {
      reasons.push(`split-not-clear:${preflight?.splitId || 'unknown'}`);
    }
  }

  return envelope({
    ok: true,
    status: reasons.length ? 'NOVELTY_CHALLENGE_DENIED' : 'NOVELTY_CHALLENGE_ADMISSIBLE',
    admitted: reasons.length === 0,
    reasonCodes: reasons,
    semanticPreflight: {
      targetId: semanticPreflight.targetId,
      fixtureId: semanticPreflight.fixtureId,
      nearest: semanticPreflight.nearest,
      exactEquivalentIds: semanticPreflight.exactEquivalentIds
    },
    splitCount: splitPreflights.length,
    minimumNearestMismatchRate: threshold,
    authority: 'RESEARCH_ADMISSION_ONLY__NO_EXTERNAL_EFFECT_AUTHORITY'
  });
}
