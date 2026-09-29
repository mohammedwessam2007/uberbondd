import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import {
  ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
  qualityInvariantAttestation
} from './absolute-frontier-quality-invariant.mjs';
import { validateCanonicalZeroLossCertificate } from './canonical-zero-loss-certificate.mjs';
import {
  validateSemanticProgramOrigin,
  validateCognitiveCompilationProposalOrigin,
  validateRealityDriftAssessmentOrigin
} from './noetic-autocompiler.mjs';

export const COGNITIVE_COMPILATION_PROMOTION_GATE_VERSION = 'uberbond.cognitive-compilation-promotion-gate.v1';

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: COGNITIVE_COMPILATION_PROMOTION_GATE_VERSION,
    status: 'COGNITIVE_COMPILATION_PROMOTION_BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    promotionAuthority: 'NONE',
    automaticPromotion: false,
    productionMutationAuthorized: false,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

export function assessCognitiveCompilationPromotion({
  semanticProgram,
  compilationProposal,
  canonicalZeroLossCertificate,
  driftAssessment
} = {}) {
  const reasons = [];
  const programOrigin = validateSemanticProgramOrigin(semanticProgram);
  if (!programOrigin.ok) reasons.push(...programOrigin.reasonCodes);
  const proposalOrigin = validateCognitiveCompilationProposalOrigin(compilationProposal);
  if (!proposalOrigin.ok) reasons.push(...proposalOrigin.reasonCodes);
  const driftOrigin = validateRealityDriftAssessmentOrigin(driftAssessment);
  if (!driftOrigin.ok) reasons.push(...driftOrigin.reasonCodes);
  const candidateId = String(compilationProposal?.candidateId || '').trim();
  if (
    compilationProposal?.ok !== true ||
    compilationProposal?.status !== 'DETERMINISTIC_COMPILATION_CANDIDATE' ||
    compilationProposal?.eligible !== true ||
    !candidateId
  ) reasons.push('eligible-noetic-compilation-proposal-required');

  if (compilationProposal?.automaticCodeMutationAuthorized !== false) reasons.push('automatic-code-mutation-must-remain-disabled');
  if (programOrigin.ok && compilationProposal?.canonicalProgramDigest !== semanticProgram.programDigest) reasons.push('proposal-canonical-program-binding-mismatch');
  if (programOrigin.ok && compilationProposal?.evidence?.programDigest !== semanticProgram.programDigest) reasons.push('proposal-evidence-program-binding-mismatch');
  if (compilationProposal?.actionAuthority !== 'NONE') reasons.push('proposal-action-authority-must-remain-none');
  if (compilationProposal?.evidence?.absoluteQualityPolicyDigest !== ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST) {
    reasons.push('proposal-absolute-quality-policy-digest-mismatch');
  }
  if (Number(compilationProposal?.evidence?.accuracy) !== 1) reasons.push('proposal-accuracy-must-be-one');
  if (Number(compilationProposal?.evidence?.calibrationError) !== 0) reasons.push('proposal-calibration-error-must-be-zero');
  if (compilationProposal?.evidence?.drift !== false) reasons.push('proposal-drift-must-be-false');

  if (driftAssessment?.ok !== true || driftAssessment?.drift !== false || driftAssessment?.status !== 'NO_MATERIAL_DRIFT_OBSERVED') {
    reasons.push('current-no-drift-evidence-required');
  }

  const cert = validateCanonicalZeroLossCertificate(canonicalZeroLossCertificate, {
    expectedCandidateArchitectureId: String(compilationProposal?.evidence?.programDigest || ''),
    minimumTaskCount: Number(compilationProposal?.evidence?.outcomeCount || 1)
  });
  if (!cert.ok) reasons.push(...cert.reasonCodes);

  if (reasons.length) return fail(reasons);

  return {
    ok: true,
    policyVersion: COGNITIVE_COMPILATION_PROMOTION_GATE_VERSION,
    status: 'COGNITIVE_COMPILATION_ELIGIBLE_FOR_MANUAL_ACTIVATION_REVIEW',
    candidateId,
    canonicalZeroLossCertificationDigest: cert.certificationDigest,
    absoluteQualityInvariant: qualityInvariantAttestation(),
    promotionAuthority: 'NONE',
    automaticPromotion: false,
    productionMutationAuthorized: false,
    ownerOrGovernedActivationStillRequired: true,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'THIS GATE CAN ONLY ADVANCE A NOETIC COMPILATION TO MANUAL ACTIVATION REVIEW WHEN THE PROPOSAL IS PERFECT ON ITS DECLARED REALITY METRICS, CURRENT DRIFT IS ZERO, AND A LIVE PROCESS-BOUND CANONICAL SEALED-TRIAL ZERO-LOSS CERTIFICATE BINDS THE SAME PROGRAM. IT NEVER ACTIVATES PRODUCTION ITSELF.'
  };
}
