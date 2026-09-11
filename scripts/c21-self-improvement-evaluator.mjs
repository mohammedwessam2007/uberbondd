import crypto from 'node:crypto';

export const C21_SELF_IMPROVEMENT_EVALUATOR_VERSION = 'uberbond.c21-self-improvement-evaluator.v1';

const clamp = value => Math.max(0, Math.min(1, value));
const median = values => {
  const xs = [...values].sort((a, b) => a - b);
  const n = xs.length;
  return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
};
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function rng(seed) {
  let x = Number.parseInt(seed.slice(0, 8), 16) >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
function percentile(values, p) {
  const xs = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(xs.length - 1, Math.floor((xs.length - 1) * p)));
  return xs[index];
}
const score = speedup => clamp(1 - (0.5 / Math.max(speedup, 1e-12)));

export function evaluateWholeSystemSelfImprovement({
  contractDigest,
  expectedContractDigest,
  candidateId,
  candidateRevision,
  expectedCandidateId,
  taskPopulationHash,
  families = []
} = {}) {
  const reasons = [];
  if (!contractDigest || contractDigest !== expectedContractDigest) reasons.push('frozen-contract-digest-mismatch');
  if (!candidateId || candidateId !== expectedCandidateId) reasons.push('frozen-candidate-id-mismatch');
  if (!/^[0-9a-f]{40}$/.test(String(candidateRevision || ''))) reasons.push('exact-candidate-git-revision-required');
  if (!/^[0-9a-f]{64}$/.test(String(taskPopulationHash || ''))) reasons.push('fresh-task-population-hash-required');
  if (!Array.isArray(families) || families.length !== 3) reasons.push('exact-three-families-required');

  const rows = [];
  for (const family of Array.isArray(families) ? families : []) {
    const current = Array.isArray(family.currentLatenciesNs) ? family.currentLatenciesNs.map(Number) : [];
    const candidate = Array.isArray(family.candidateLatenciesNs) ? family.candidateLatenciesNs.map(Number) : [];
    const local = [];
    if (current.length !== 21 || candidate.length !== 21 ||
        current.some(value => !Number.isFinite(value) || value <= 0) ||
        candidate.some(value => !Number.isFinite(value) || value <= 0)) {
      local.push('twenty-one-matched-positive-latency-rounds-required');
    }
    if (!family.currentSemanticDigest || family.currentSemanticDigest !== family.candidateSemanticDigest) local.push('semantic-identity-required');
    if (!family.currentAuthorityDigest || family.currentAuthorityDigest !== family.candidateAuthorityDigest) local.push('authority-identity-required');
    if (!family.currentTruthBoundaryDigest || family.currentTruthBoundaryDigest !== family.candidateTruthBoundaryDigest) local.push('truth-boundary-identity-required');
    if (family.wallTimeBudgetMs !== 5000 || family.monetaryCostMicros !== 0 ||
        family.humanAssistanceMinutes !== 0 || family.externalTools !== 'NONE') {
      local.push('frozen-matched-budget-required');
    }

    let speedup = 0;
    let candidateScore = 0;
    let candidateLow = 0;
    let candidateHigh = 0;
    if (!local.length) {
      speedup = median(current) / median(candidate);
      candidateScore = score(speedup);
      const random = rng(hash({
        contractDigest,
        taskPopulationHash,
        familyId: family.familyId,
        version: C21_SELF_IMPROVEMENT_EVALUATOR_VERSION
      }));
      const bootstrap = [];
      for (let b = 0; b < 10000; b++) {
        const currentSample = [];
        const candidateSample = [];
        for (let i = 0; i < current.length; i++) {
          const j = Math.floor(random() * current.length);
          currentSample.push(current[j]);
          candidateSample.push(candidate[j]);
        }
        bootstrap.push(score(median(currentSample) / median(candidateSample)));
      }
      candidateLow = percentile(bootstrap, 0.025);
      candidateHigh = percentile(bootstrap, 0.975);
    }

    const robustGain = candidateLow - 0.5;
    const passes = !local.length && robustGain >= 0.05;
    if (local.length) reasons.push(...local.map(reason => `${family.familyId || 'UNKNOWN'}:${reason}`));
    rows.push({
      familyId: family.familyId,
      currentScore: 0.5,
      candidateScore,
      speedup,
      scoreInterval: { low: candidateLow, high: candidateHigh },
      robustGainVsCurrent: robustGain,
      passes
    });
  }

  const uniqueFamilies = new Set(rows.map(row => row.familyId));
  if (uniqueFamilies.size !== 3) reasons.push('three-unique-family-identities-required');
  const improved = rows.filter(row => row.passes).length;
  const supported = reasons.length === 0 && improved >= 2;

  return {
    ok: reasons.length === 0,
    status: supported ? 'C21_SELF_IMPROVEMENT_TRANSFER_SUPPORTED' : 'C21_SELF_IMPROVEMENT_TRANSFER_NOT_SUPPORTED',
    supported,
    candidateId,
    candidateRevision,
    taskPopulationHash,
    robustImprovedFamilies: improved,
    requiredRobustImprovedFamilies: 2,
    families: rows,
    reasonCodes: [...new Set(reasons)],
    promotionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    truthBoundary: 'PREDECLARED_SELF_IMPROVEMENT_EVALUATION_ONLY__NO_AUTOMATIC_PROMOTION__NO_ASI_CLAIM'
  };
}
