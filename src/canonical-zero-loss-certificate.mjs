import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
  certifyPairedZeroLoss
} from './absolute-frontier-quality-invariant.mjs';
import { validateCompiledSealedArchitectureTrial } from './apex-sealed-tournament.mjs';

export const CANONICAL_ZERO_LOSS_CERTIFICATE_VERSION = 'uberbond.canonical-zero-loss-certificate.v1';

const liveCertificates = new WeakMap();

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
    policyVersion: CANONICAL_ZERO_LOSS_CERTIFICATE_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    promotionAuthority: 'NONE',
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

export function certifyCanonicalZeroLoss({
  baselineTrial,
  candidateTrial,
  requireEconomicsImprovement = false
} = {}) {
  const baselineOrigin = validateCompiledSealedArchitectureTrial(baselineTrial);
  const candidateOrigin = validateCompiledSealedArchitectureTrial(candidateTrial);
  const reasons = [];
  if (!baselineOrigin.ok) reasons.push('canonical-baseline-sealed-trial-required');
  if (!candidateOrigin.ok) reasons.push('canonical-candidate-sealed-trial-required');
  if (reasons.length) return fail('CANONICAL_ZERO_LOSS_CERTIFICATION_REFUSED', reasons);

  const comparison = certifyPairedZeroLoss({
    baselineTrial,
    candidateTrial,
    requireEconomicsImprovement,
    provenanceValidator: validateCompiledSealedArchitectureTrial
  });
  if (!comparison.ok) {
    return fail('CANONICAL_ZERO_LOSS_CERTIFICATION_REFUSED', comparison.reasonCodes, {
      comparison
    });
  }

  const body = {
    schemaVersion: CANONICAL_ZERO_LOSS_CERTIFICATE_VERSION,
    absoluteQualityPolicyDigest: ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
    baselineArchitectureId: comparison.baselineArchitectureId,
    candidateArchitectureId: comparison.candidateArchitectureId,
    taskCount: comparison.taskCount,
    baselineTrialDigest: baselineOrigin.trialDigest,
    candidateTrialDigest: candidateOrigin.trialDigest,
    baselineReceiptDigest: baselineTrial.receiptDigest,
    candidateReceiptDigest: candidateTrial.receiptDigest,
    baselineTaskOutcomeDigest: baselineTrial.taskOutcomeDigest,
    candidateTaskOutcomeDigest: candidateTrial.taskOutcomeDigest,
    regressions: [],
    economicsImproved: comparison.economicsImproved,
    baselineMeanCostUsd: comparison.baselineMeanCostUsd,
    candidateMeanCostUsd: comparison.candidateMeanCostUsd,
    evidenceAuthority: 'CANONICAL_UNTAMPERED_SEALED_TRIAL_PAIR'
  };
  const certificate = Object.freeze({
    ...body,
    certificationDigest: digest(body)
  });
  liveCertificates.set(certificate, certificate.certificationDigest);

  return envelope({
    ok: true,
    status: 'CANONICAL_PAIRED_ZERO_LOSS_CERTIFIED',
    certificate,
    certificationDigest: certificate.certificationDigest,
    truthBoundary: 'THIS CERTIFICATE CAN ONLY BE MINTED IN PROCESS FROM TWO CANONICAL UNTAMPERED SEALED TRIAL OBJECTS. COPYING, SERIALIZING, RECONSTRUCTING OR MUTATING THE CERTIFICATE REMOVES ITS LIVE PROMOTION EVIDENCE AUTHORITY.'
  });
}

export function validateCanonicalZeroLossCertificate(certificate, {
  expectedCandidateArchitectureId = null,
  minimumTaskCount = 1
} = {}) {
  const reasons = [];
  const expectedDigest = certificate && typeof certificate === 'object' ? liveCertificates.get(certificate) : null;
  const actualDigest = certificate && typeof certificate === 'object'
    ? digest(Object.fromEntries(Object.entries(certificate).filter(([key]) => key !== 'certificationDigest')))
    : null;

  if (!expectedDigest || expectedDigest !== certificate?.certificationDigest || actualDigest !== certificate?.certificationDigest) {
    reasons.push('canonical-zero-loss-certificate-producer-origin-required');
  }
  if (certificate?.schemaVersion !== CANONICAL_ZERO_LOSS_CERTIFICATE_VERSION) reasons.push('canonical-zero-loss-certificate-schema-required');
  if (certificate?.absoluteQualityPolicyDigest !== ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST) reasons.push('canonical-zero-loss-policy-digest-mismatch');
  if (certificate?.evidenceAuthority !== 'CANONICAL_UNTAMPERED_SEALED_TRIAL_PAIR') reasons.push('canonical-zero-loss-evidence-authority-required');
  if (!Array.isArray(certificate?.regressions) || certificate.regressions.length !== 0) reasons.push('canonical-zero-loss-regressions-must-be-empty');
  const taskCount = Number(certificate?.taskCount);
  if (!Number.isSafeInteger(taskCount) || taskCount < minimumTaskCount) reasons.push('canonical-zero-loss-minimum-task-count-not-met');
  if (expectedCandidateArchitectureId != null && certificate?.candidateArchitectureId !== expectedCandidateArchitectureId) {
    reasons.push('canonical-zero-loss-candidate-binding-mismatch');
  }

  return reasons.length
    ? fail('CANONICAL_ZERO_LOSS_CERTIFICATE_REFUSED', reasons)
    : envelope({
        ok: true,
        status: 'CANONICAL_ZERO_LOSS_CERTIFICATE_VALID',
        candidateArchitectureId: certificate.candidateArchitectureId,
        baselineArchitectureId: certificate.baselineArchitectureId,
        taskCount,
        certificationDigest: certificate.certificationDigest,
        evidenceAuthority: certificate.evidenceAuthority
      });
}
