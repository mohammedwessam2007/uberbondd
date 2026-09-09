import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS, isCanonicalZeroEffectLedger } from './effect-ledgers.mjs';

export const RECURSIVE_IMPROVEMENT_RETENTION_VERSION = 'uberbond.recursive-improvement-retention.v1';

const SHA256 = /^[0-9a-f]{64}$/;
const SHA40 = /^[0-9a-f]{40}$/;
const text = (value, max = 500) => {
  const out = typeof value === 'string' ? value.trim() : '';
  return out && out.length <= max ? out : null;
};
const instant = value => {
  const raw = text(value, 100);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? { raw: new Date(ms).toISOString(), ms } : null;
};
const unique = values => [...new Set(values.filter(Boolean))];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);

function fail(status, reasonCodes, extra = {}) {
  return {
    ok: false,
    version: RECURSIVE_IMPROVEMENT_RETENTION_VERSION,
    status,
    reasonCodes: unique(reasonCodes),
    retainAuthority: 'NONE',
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    externalEffectLedger: zero(),
    ...extra
  };
}

function sameIdentity(receipt, candidateId, candidateRevision, candidateDigest) {
  return text(receipt?.candidateId, 200) === candidateId
    && text(receipt?.candidateRevision, 100) === candidateRevision
    && text(receipt?.candidateDigest, 64)?.toLowerCase() === candidateDigest;
}

function observedRuntime(receipt, candidateId, candidateRevision, candidateDigest, promotedAt, nowMs) {
  const reasons = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['observed-runtime-receipt-required'];
  if (receipt.evidenceClass !== 'OBSERVED_RUNTIME') reasons.push('runtime-evidence-class-must-be-observed-runtime');
  if (!sameIdentity(receipt, candidateId, candidateRevision, candidateDigest)) reasons.push('runtime-candidate-identity-mismatch');
  const observed = instant(receipt.observedAt);
  if (!observed) reasons.push('valid-runtime-observation-time-required');
  else {
    if (observed.ms < promotedAt.ms) reasons.push('runtime-observation-must-follow-promotion');
    if (observed.ms > nowMs) reasons.push('runtime-observation-must-not-be-future-dated');
  }
  if (!text(receipt.evidenceRef, 500)) reasons.push('runtime-observation-evidence-ref-required');
  if (!text(receipt.observerId, 200) || !text(receipt.observerLineageRef, 500)) reasons.push('runtime-observer-identity-required');
  if (receipt.hiddenConversationStateUsed !== false) reasons.push('runtime-observation-must-not-depend-on-hidden-conversation-state');
  if (!isCanonicalZeroEffectLedger(receipt.unauthorizedEffectLedger)) reasons.push('runtime-unauthorized-effects-must-be-proven-zero');
  if (receipt.behaviorRetained !== true) reasons.push('runtime-behavior-retention-not-observed');
  return reasons;
}

function rollbackEvidence(receipt, candidateId, candidateRevision, candidateDigest, nowMs) {
  const reasons = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['rollback-rehearsal-receipt-required'];
  if (receipt.evidenceClass !== 'OBSERVED_RUNTIME') reasons.push('rollback-must-be-observed-runtime');
  if (!sameIdentity(receipt, candidateId, candidateRevision, candidateDigest)) reasons.push('rollback-candidate-identity-mismatch');
  if (!text(receipt.priorRevision, 100)) reasons.push('rollback-prior-revision-required');
  if (receipt.rollbackSucceeded !== true) reasons.push('rollback-must-have-succeeded');
  if (receipt.candidateReactivatableAfterRollback !== false) reasons.push('rollback-must-not-silently-reactivate-candidate');
  if (!isCanonicalZeroEffectLedger(receipt.duplicateEffectLedger)) reasons.push('rollback-duplicate-effects-must-be-proven-zero');
  const observed = instant(receipt.observedAt);
  if (!observed || observed.ms > nowMs) reasons.push('valid-nonfuture-rollback-observation-required');
  if (!text(receipt.verifierId, 200) || !text(receipt.verifierLineageRef, 500)) reasons.push('independent-rollback-verifier-required');
  return reasons;
}

function revocationEvidence(receipt, candidateId, candidateRevision, candidateDigest, nowMs) {
  const reasons = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['revocation-readiness-receipt-required'];
  if (!sameIdentity(receipt, candidateId, candidateRevision, candidateDigest)) reasons.push('revocation-candidate-identity-mismatch');
  if (receipt.revocationReady !== true) reasons.push('revocation-path-must-be-ready');
  if (!text(receipt.evidenceRef, 500)) reasons.push('revocation-evidence-ref-required');
  const verified = instant(receipt.verifiedAt);
  if (!verified || verified.ms > nowMs) reasons.push('valid-nonfuture-revocation-verification-required');
  if (!text(receipt.verifierId, 200) || !text(receipt.verifierLineageRef, 500)) reasons.push('independent-revocation-verifier-required');
  return reasons;
}

/**
 * C16 parent gate. It does not build, promote, deploy, retain, revoke or roll
 * anything back. It only decides whether the evidence for one exact candidate
 * is strong enough to support a RETAIN recommendation within the measured
 * scope, or whether repair/rollback/revocation remains required.
 */
export function evaluateRecursiveImprovementRetention({
  candidate = {},
  selfMaintenance = null,
  compoundEvaluation = null,
  securityAdmission = null,
  securityRehearsal = null,
  recursiveGovernance = null,
  runtimeObservation = null,
  rollbackRehearsal = null,
  revocationReadiness = null,
  actors = {},
  promotedAt = null,
  now = new Date()
} = {}) {
  const candidateId = text(candidate.candidateId, 200);
  const candidateRevision = text(candidate.candidateRevision, 100)?.toLowerCase();
  const candidateDigest = text(candidate.candidateDigest, 64)?.toLowerCase();
  const promoted = instant(promotedAt);
  const nowInstant = instant(now instanceof Date ? now.toISOString() : now);
  if (!candidateId || !candidateRevision || !SHA40.test(candidateRevision || '') || !candidateDigest || !SHA256.test(candidateDigest || '') || !promoted || !nowInstant) {
    return fail('C16_RETENTION_PROTOCOL_INVALID', ['exact-candidate-identity-promotion-time-and-clock-required']);
  }
  if (promoted.ms > nowInstant.ms) return fail('C16_RETENTION_PROTOCOL_INVALID', ['promotion-time-must-not-be-future-dated']);

  const reasons = [];

  if (!selfMaintenance?.ok || !['VERIFIED_CHANGESET_READY_FOR_PROMOTION', 'VERIFIED_CHANGESET_PROMOTED_TO_REVIEW'].includes(selfMaintenance.status)) {
    reasons.push('verified-self-maintenance-receipt-required');
  }
  const verified = selfMaintenance?.verifiedReceipt || {};
  if (text(verified.candidateRevision || verified.verifiedRevision || selfMaintenance?.candidateRevision, 100)?.toLowerCase() !== candidateRevision) reasons.push('self-maintenance-candidate-revision-mismatch');
  if (text(verified.candidateDigest || selfMaintenance?.candidateDigest, 64)?.toLowerCase() !== candidateDigest) reasons.push('self-maintenance-candidate-digest-mismatch');
  if (!text(verified.verifiedFingerprint, 64) || !SHA256.test(String(verified.verifiedFingerprint).toLowerCase())) reasons.push('exact-tested-change-fingerprint-required');
  if (selfMaintenance?.businessEffectAuthority !== 'NONE') reasons.push('self-maintenance-must-not-create-business-authority');

  if (!compoundEvaluation?.ok || compoundEvaluation.status !== 'COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE') reasons.push('independent-compound-gain-evidence-required');
  if (text(compoundEvaluation?.compositionRevision, 100)?.toLowerCase() !== candidateRevision) reasons.push('compound-evaluation-candidate-revision-mismatch');
  if (text(compoundEvaluation?.compositionDigest, 64)?.toLowerCase() !== candidateDigest) reasons.push('compound-evaluation-candidate-digest-mismatch');
  if (compoundEvaluation?.asiStatus !== 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED') reasons.push('compound-evaluation-must-not-mint-asi');
  if (compoundEvaluation?.promotionAuthority !== 'NONE') reasons.push('compound-evaluation-must-not-create-promotion-authority');

  if (!securityAdmission?.ok || securityAdmission.status !== 'C26_SECURITY_ADMISSION_READY_FOR_SEPARATE_EFFECT_GATE') reasons.push('c26-security-admission-required');
  if (text(securityAdmission?.candidateRevision || securityAdmission?.compositionRevision, 100)?.toLowerCase() !== candidateRevision) reasons.push('security-admission-candidate-revision-mismatch');
  if (String(securityAdmission?.subjectDigest || '').replace(/^sha256:/, '').toLowerCase() !== candidateDigest) reasons.push('security-admission-candidate-digest-mismatch');

  if (!securityRehearsal?.ok || securityRehearsal.status !== 'C26_SECURITY_REHEARSAL_VERIFIED_WITHIN_DECLARED_SCOPE') reasons.push('c26-security-rehearsal-required');
  if (String(securityRehearsal?.subjectDigest || '').replace(/^sha256:/, '').toLowerCase() !== candidateDigest) reasons.push('security-rehearsal-candidate-digest-mismatch');

  if (!recursiveGovernance?.ok || recursiveGovernance.status !== 'RECURSIVE_SECURITY_EVOLUTION_ADMISSIBLE_FOR_SEPARATE_EXECUTION_AUTHORITY') reasons.push('recursive-governance-evidence-required');
  if (recursiveGovernance?.businessEffectAuthority !== 'NONE') reasons.push('recursive-governance-must-not-create-business-authority');

  reasons.push(...observedRuntime(runtimeObservation, candidateId, candidateRevision, candidateDigest, promoted, nowInstant.ms));
  reasons.push(...rollbackEvidence(rollbackRehearsal, candidateId, candidateRevision, candidateDigest, nowInstant.ms));
  reasons.push(...revocationEvidence(revocationReadiness, candidateId, candidateRevision, candidateDigest, nowInstant.ms));

  const proposerId = text(actors.proposerId, 200);
  const deployerId = text(actors.deployerId, 200);
  const monitorId = text(runtimeObservation?.observerId, 200);
  const monitorLineage = text(runtimeObservation?.observerLineageRef, 500);
  const builderLineages = unique(Array.isArray(actors.builderLineages) ? actors.builderLineages.map(value => text(value, 500)) : []);
  if (!proposerId || !deployerId) reasons.push('proposer-and-deployer-identities-required');
  if (monitorId && [proposerId, deployerId].includes(monitorId)) reasons.push('runtime-monitor-must-be-independent-of-proposer-and-deployer');
  if (monitorLineage && builderLineages.includes(monitorLineage)) reasons.push('runtime-monitor-lineage-must-be-independent-of-builder-lineage');
  const rollbackVerifier = text(rollbackRehearsal?.verifierId, 200);
  const revocationVerifier = text(revocationReadiness?.verifierId, 200);
  if (rollbackVerifier && [proposerId, deployerId].includes(rollbackVerifier)) reasons.push('rollback-verifier-must-be-independent-of-proposer-and-deployer');
  if (revocationVerifier && [proposerId, deployerId].includes(revocationVerifier)) reasons.push('revocation-verifier-must-be-independent-of-proposer-and-deployer');

  if (reasons.length) {
    const securityReasons = reasons.filter(reason => reason.includes('security') || reason.includes('unauthorized') || reason.includes('revocation') || reason.includes('rollback'));
    const status = securityReasons.length ? 'C16_ROLLBACK_OR_REVOCATION_REQUIRED' : 'C16_REPAIR_OR_MORE_EVIDENCE_REQUIRED';
    return fail(status, reasons, { candidateId, candidateRevision, candidateDigest });
  }

  const receipt = {
    candidateId,
    candidateRevision,
    candidateDigest,
    promotedAt: promoted.raw,
    observedAt: runtimeObservation.observedAt,
    testedFingerprint: verified.verifiedFingerprint.toLowerCase(),
    compoundEvaluationReceiptHash: text(compoundEvaluation.receiptHash, 64) || null,
    securitySubjectDigest: securityAdmission.subjectDigest,
    runtimeEvidenceRef: runtimeObservation.evidenceRef,
    rollbackEvidenceRef: rollbackRehearsal.evidenceRef || null,
    revocationEvidenceRef: revocationReadiness.evidenceRef,
    decision: 'RETAIN_SUPPORTED_WITHIN_DECLARED_SCOPE',
    truthBoundary: 'RETAIN_IS_AN_EVIDENCE_VERDICT_FOR_THIS_EXACT_REVISION_AND_SCOPE;_IT_IS_NOT_AUTOMATIC_PROMOTION_NOT_PERMANENT_SAFETY_AND_NOT_ASI'
  };

  return {
    ok: true,
    version: RECURSIVE_IMPROVEMENT_RETENTION_VERSION,
    status: 'C16_RETAIN_SUPPORTED_WITHIN_DECLARED_SCOPE',
    receipt,
    receiptDigest: digest(receipt),
    retainAuthority: 'NONE',
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    externalEffectLedger: zero()
  };
}
