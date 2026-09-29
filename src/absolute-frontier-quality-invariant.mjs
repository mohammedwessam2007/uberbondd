import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ABSOLUTE_FRONTIER_QUALITY_POLICY_VERSION = 'uberbond.absolute-frontier-quality.v1';
export const ABSOLUTE_FRONTIER_QUALITY_DELTA = 0;
export const ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE = 0.95;
export const ABSOLUTE_FRONTIER_DEGRADED_COUNCIL_ALLOWED = false;

const OUTCOME_RANK = Object.freeze({
  INCORRECT: 0,
  ABSTAINED: 1,
  CORRECT: 2
});

const POLICY_PAYLOAD = Object.freeze({
  policyVersion: ABSOLUTE_FRONTIER_QUALITY_POLICY_VERSION,
  qualityDelta: ABSOLUTE_FRONTIER_QUALITY_DELTA,
  minimumEvidenceConfidence: ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE,
  degradedCouncilAllowed: ABSOLUTE_FRONTIER_DEGRADED_COUNCIL_ALLOWED,
  costMayLowerQuality: false,
  latencyMayLowerQuality: false,
  founderMinutesMayLowerQuality: false,
  cheaperModelMayLowerQuality: false,
  aggregateTieMayHidePairedRegression: false,
  uncertaintyDefaultsToFrontierBaseline: true,
  qualityOrder: [
    'paired-task-non-regression',
    'verified-success-rate',
    'process-score',
    'false-positive-rate',
    'reliability',
    'evidence-confidence'
  ],
  law: 'COST_OPTIMIZATION_MAY_ONLY_OPERATE_INSIDE_THE_SET_OF_ARCHITECTURES_PROVEN_NOT_TO_REGRESS_THE_STRONGEST_AVAILABLE_FRONTIER_BASELINE'
});

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function envelope(extra = {}) {
  return {
    policyVersion: ABSOLUTE_FRONTIER_QUALITY_POLICY_VERSION,
    policyDigest: ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function fail(status, reasonCodes, extra = {}) {
  return envelope({
    ok: false,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  });
}
function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

export const ABSOLUTE_FRONTIER_QUALITY_POLICY = POLICY_PAYLOAD;
export const ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST = digest(POLICY_PAYLOAD);

export function validateAbsoluteFrontierQualityPolicy({
  qualityDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA,
  minimumEvidenceConfidence = ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE,
  allowDegradedCouncil = false,
  qualityPolicyDigest = ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST
} = {}) {
  const reasons = [];
  const delta = finite(qualityDelta, 0, 1);
  const confidence = finite(minimumEvidenceConfidence, 0, 1);
  if (delta !== ABSOLUTE_FRONTIER_QUALITY_DELTA) reasons.push('absolute-frontier-quality-delta-must-be-zero');
  if (confidence == null || confidence < ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE) {
    reasons.push('absolute-frontier-minimum-evidence-confidence-not-met');
  }
  if (allowDegradedCouncil === true) reasons.push('absolute-frontier-degraded-council-prohibited');
  if (qualityPolicyDigest !== ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST) reasons.push('absolute-frontier-quality-policy-digest-mismatch');
  if (reasons.length) return fail('ABSOLUTE_FRONTIER_QUALITY_POLICY_REFUSED', reasons);
  return envelope({
    ok: true,
    status: 'ABSOLUTE_FRONTIER_QUALITY_POLICY_VALID',
    qualityDelta: 0,
    minimumEvidenceConfidence: confidence,
    allowDegradedCouncil: false,
    qualityPolicy: structuredClone(POLICY_PAYLOAD)
  });
}

function normalizedOutcomeVector(trial) {
  const rows = Array.isArray(trial?.pairedTaskOutcomes) ? trial.pairedTaskOutcomes : null;
  if (!rows?.length) return null;
  const out = [];
  const ids = new Set();
  for (const row of rows) {
    const taskId = text(row?.taskId, 300);
    const outcome = text(row?.outcome, 40)?.toUpperCase();
    if (!taskId || !(outcome in OUTCOME_RANK) || ids.has(taskId)) return null;
    ids.add(taskId);
    out.push({ taskId, outcome, rank: OUTCOME_RANK[outcome] });
  }
  out.sort((a, b) => a.taskId.localeCompare(b.taskId));
  return out;
}

export function certifyPairedZeroLoss({
  baselineTrial,
  candidateTrial,
  requireEconomicsImprovement = false
} = {}) {
  const reasons = [];
  if (!baselineTrial || !candidateTrial) return fail('ZERO_LOSS_CERTIFICATION_REFUSED', ['baseline-and-candidate-trials-required']);

  for (const key of ['suiteVersion', 'corpusDigest', 'manifestDigest', 'taskClass']) {
    if (!baselineTrial?.[key] || baselineTrial[key] !== candidateTrial?.[key]) reasons.push(`paired-${key}-mismatch`);
  }

  const baselineRows = normalizedOutcomeVector(baselineTrial);
  const candidateRows = normalizedOutcomeVector(candidateTrial);
  if (!baselineRows || !candidateRows) reasons.push('paired-task-outcome-vectors-required');
  else if (baselineRows.length !== candidateRows.length) reasons.push('paired-task-count-mismatch');

  const candidateByTask = new Map((candidateRows || []).map(row => [row.taskId, row]));
  const regressions = [];
  for (const baseline of baselineRows || []) {
    const candidate = candidateByTask.get(baseline.taskId);
    if (!candidate) {
      regressions.push({ taskId: baseline.taskId, baseline: baseline.outcome, candidate: 'MISSING' });
      continue;
    }
    if (candidate.rank < baseline.rank) {
      regressions.push({ taskId: baseline.taskId, baseline: baseline.outcome, candidate: candidate.outcome });
    }
  }
  if (regressions.length) reasons.push('paired-task-regression-detected');

  const bStats = baselineTrial.statistics || {};
  const cStats = candidateTrial.statistics || {};
  const bArena = baselineTrial.arenaTrial || {};
  const cArena = candidateTrial.arenaTrial || {};
  if (finite(cStats.verifiedSuccessRate, 0, 1) == null || finite(bStats.verifiedSuccessRate, 0, 1) == null ||
      cStats.verifiedSuccessRate < bStats.verifiedSuccessRate) reasons.push('verified-success-rate-regression');
  if (finite(cStats.falsePositiveRate, 0, 1) == null || finite(bStats.falsePositiveRate, 0, 1) == null ||
      cStats.falsePositiveRate > bStats.falsePositiveRate) reasons.push('false-positive-rate-regression');
  if (finite(cArena.processScore, 0, 1) == null || finite(bArena.processScore, 0, 1) == null ||
      cArena.processScore < bArena.processScore) reasons.push('process-score-regression');

  const bCost = finite(baselineTrial?.economics?.meanCostUsd, 0, 1_000_000);
  const cCost = finite(candidateTrial?.economics?.meanCostUsd, 0, 1_000_000);
  const economicsImproved = bCost != null && cCost != null && cCost < bCost;
  if (requireEconomicsImprovement && !economicsImproved) reasons.push('quality-compression-requires-strict-cost-improvement');

  if (reasons.length) {
    return fail('ZERO_LOSS_CERTIFICATION_REFUSED', reasons, {
      regressions,
      economicsImproved,
      baselineMeanCostUsd: bCost,
      candidateMeanCostUsd: cCost
    });
  }

  return envelope({
    ok: true,
    status: 'PAIRED_ZERO_LOSS_CERTIFIED',
    baselineArchitectureId: baselineTrial.architectureId,
    candidateArchitectureId: candidateTrial.architectureId,
    taskCount: baselineRows.length,
    regressions: [],
    economicsImproved,
    baselineMeanCostUsd: bCost,
    candidateMeanCostUsd: cCost,
    certificationDigest: digest({
      policyDigest: ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
      baselineArchitectureId: baselineTrial.architectureId,
      candidateArchitectureId: candidateTrial.architectureId,
      suiteVersion: baselineTrial.suiteVersion,
      corpusDigest: baselineTrial.corpusDigest,
      manifestDigest: baselineTrial.manifestDigest,
      taskClass: baselineTrial.taskClass,
      baselineTaskOutcomeDigest: baselineTrial.taskOutcomeDigest,
      candidateTaskOutcomeDigest: candidateTrial.taskOutcomeDigest,
      baselineMeanCostUsd: bCost,
      candidateMeanCostUsd: cCost
    }),
    truthBoundary: 'ZERO-LOSS HERE MEANS NO REGRESSION ON ANY PAIRED SEALED TASK PLUS NO REGRESSION IN VERIFIED SUCCESS, FALSE POSITIVES OR PROCESS SCORE ON THIS EXACT FRESH EVALUATION SET. UNKNOWN FUTURE DISTRIBUTIONS STILL FAIL CLOSED TO THE FRONTIER BASELINE.'
  });
}

export function qualityInvariantAttestation() {
  return Object.freeze({
    policyVersion: ABSOLUTE_FRONTIER_QUALITY_POLICY_VERSION,
    policyDigest: ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
    qualityDelta: 0,
    minimumEvidenceConfidence: ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE,
    degradedCouncilAllowed: false,
    uncertaintyFallback: 'STRONGEST_AVAILABLE_FRONTIER_BASELINE'
  });
}

export function validateQualityInvariantAttestation(attestation = {}) {
  const reasons = [];
  if (attestation?.policyVersion !== ABSOLUTE_FRONTIER_QUALITY_POLICY_VERSION) reasons.push('absolute-frontier-quality-policy-version-mismatch');
  if (attestation?.policyDigest !== ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST) reasons.push('absolute-frontier-quality-policy-digest-mismatch');
  if (attestation?.qualityDelta !== 0) reasons.push('absolute-frontier-quality-delta-must-be-zero');
  if (attestation?.minimumEvidenceConfidence !== ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE) reasons.push('absolute-frontier-evidence-confidence-attestation-mismatch');
  if (attestation?.degradedCouncilAllowed !== false) reasons.push('absolute-frontier-degraded-council-prohibited');
  if (attestation?.uncertaintyFallback !== 'STRONGEST_AVAILABLE_FRONTIER_BASELINE') reasons.push('absolute-frontier-uncertainty-fallback-required');
  return reasons.length
    ? fail('ABSOLUTE_FRONTIER_QUALITY_ATTESTATION_REFUSED', reasons)
    : envelope({ ok: true, status: 'ABSOLUTE_FRONTIER_QUALITY_ATTESTATION_VALID' });
}


export function validatePairedZeroLossCertificate(certificate = {}, {
  expectedCandidateArchitectureId = null,
  minimumTaskCount = 1
} = {}) {
  const reasons = [];
  if (certificate?.ok !== true || certificate?.status !== 'PAIRED_ZERO_LOSS_CERTIFIED') reasons.push('paired-zero-loss-certificate-required');
  if (certificate?.policyDigest !== ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST) reasons.push('paired-zero-loss-policy-digest-mismatch');
  if (!Array.isArray(certificate?.regressions) || certificate.regressions.length !== 0) reasons.push('paired-zero-loss-regressions-must-be-empty');
  const taskCount = Number(certificate?.taskCount);
  if (!Number.isSafeInteger(taskCount) || taskCount < minimumTaskCount) reasons.push('paired-zero-loss-minimum-task-count-not-met');
  if (expectedCandidateArchitectureId != null && certificate?.candidateArchitectureId !== expectedCandidateArchitectureId) {
    reasons.push('paired-zero-loss-candidate-binding-mismatch');
  }
  if (!text(certificate?.certificationDigest, 64) || !/^[a-f0-9]{64}$/.test(certificate.certificationDigest)) {
    reasons.push('paired-zero-loss-certification-digest-required');
  }
  return reasons.length
    ? fail('PAIRED_ZERO_LOSS_CERTIFICATE_REFUSED', reasons)
    : envelope({
        ok: true,
        status: 'PAIRED_ZERO_LOSS_CERTIFICATE_VALID',
        candidateArchitectureId: certificate.candidateArchitectureId,
        baselineArchitectureId: certificate.baselineArchitectureId,
        taskCount,
        certificationDigest: certificate.certificationDigest
      });
}
