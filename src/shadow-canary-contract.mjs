// Generic shadow-comparison primitive and the promotion gate from verified
// software to a real-world canary. Shadow comparison never affects
// production -- it only records agreement/disagreement. The canary gate
// never auto-promotes: it requires an explicit owner approval AND real
// (non-synthetic) economic proof. No synthetic test can ever produce
// ECONOMICALLY_PROVEN through this gate.
export const SHADOW_CANARY_CONTRACT_POLICY_VERSION = 'shadow-canary-contract-1.0.0';

// currentFn/candidateFn: functions of the same input shape returning a
// decision-like value. Both are invoked with the SAME input; neither
// result is applied anywhere by this function -- it only observes.
export function shadowCompare(currentFn, candidateFn, input) {
  let currentResult; let currentError = null;
  let candidateResult; let candidateError = null;
  try { currentResult = currentFn(input); } catch (error) { currentError = String(error?.message || error); }
  try { candidateResult = candidateFn(input); } catch (error) { candidateError = String(error?.message || error); }

  const agree = !currentError && !candidateError && JSON.stringify(currentResult) === JSON.stringify(candidateResult);
  return {
    policyVersion: SHADOW_CANARY_CONTRACT_POLICY_VERSION,
    agree, currentResult, candidateResult, currentError, candidateError,
    affectsProduction: false // structural invariant of this function, not a caller-set flag
  };
}

// Requires BOTH an explicit owner approval AND real economic proof (a
// non-synthetic RealOutcome, not a SimulatedOutcome) before allowing a
// promotion past CANARY. Missing either input denies promotion --
// this function has no path that returns true by default.
export function canaryPromotionGate({ ownerApproved = false, economicProof = null } = {}) {
  const reasons = [];
  if (ownerApproved !== true) reasons.push('owner-approval-missing');
  if (!economicProof) reasons.push('economic-proof-missing');
  else {
    if (economicProof.isSynthetic) reasons.push('economic-proof-is-synthetic-not-real');
    if (!Number.isFinite(economicProof.realClearedAmountUsd) || economicProof.realClearedAmountUsd <= 0) reasons.push('economic-proof-has-no-positive-real-cleared-amount');
  }
  return {
    policyVersion: SHADOW_CANARY_CONTRACT_POLICY_VERSION,
    canPromote: reasons.length === 0,
    reasons,
    resultingStage: reasons.length === 0 ? 'ECONOMICALLY_PROVEN' : 'CANARY'
  };
}
