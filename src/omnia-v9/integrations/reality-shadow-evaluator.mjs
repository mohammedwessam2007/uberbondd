import { evaluateOutboundAdmission } from './outbound-admission.mjs';
import { resolveShadowAuthorityContext } from './shadow-approval.mjs';
import { classifyRealCedarFailure, RealCedarBindingError } from './reality-shadow-cedar.mjs';

/**
 * Builds the reality-shadow hook: for each candidate, resolves REAL authority
 * (shadow-approval registry + usage + revocation, all against real
 * PostgreSQL) and evaluates through the REAL, already-bound Cedar authority
 * -- no synthetic in-memory approvals, no stub policyAuthorizer. This
 * function itself never catches anything: any database or Cedar failure
 * propagates as a thrown exception. That is intentional. The caller must
 * pass this hook to observeOutboundFinalAdmission() (frozen
 * final-admission-shadow.mjs), which is the one place in this architecture
 * responsible for turning a thrown hook exception into a safe SHADOW_ERROR
 * observation that can never block or crash the real legacy send path. This
 * mirrors exactly how src/pipeline.mjs already uses
 * createOutboundAdmissionHook() -- this module only replaces where the
 * approvals/policyAuthorizer come from (real DB + real Cedar instead of
 * caller-supplied synthetic values), not the crash-safety contract.
 */
export function buildRealityShadowHook({ pool, proofStore, tenantId, cedarAuthority, keyResolver = () => null, mode = 'shadow' }) {
  if (!pool || typeof pool.query !== 'function') throw new Error('pool required');
  if (!proofStore || typeof proofStore.getApprovalUsage !== 'function') throw new Error('proofStore required');
  if (!tenantId) throw new Error('tenantId required');
  if (!cedarAuthority || typeof cedarAuthority.policyAuthorizer !== 'function') throw new Error('cedarAuthority required');

  return async function realityShadowHook(context) {
    const now = context?.observedAt ? new Date(context.observedAt) : new Date();
    const authority = await resolveShadowAuthorityContext({ pool, proofStore, tenantId, now });
    return evaluateOutboundAdmission({
      context, now,
      approvals: authority.approvals,
      keyResolver,
      usageResolver: authority.usageResolver,
      revokedApprovalIds: authority.revokedApprovalIds,
      policyAuthorizer: cedarAuthority.policyAuthorizer,
      policyVersion: 'omnia-v9-reality-shadow-v1',
      policyDigest: cedarAuthority.policyDigest,
      constitutionDigest: cedarAuthority.constitutionDigest
    });
  };
}

/**
 * Classifies a caught reality-shadow evaluation failure (from around
 * observeOutboundFinalAdmission's hook call, or from Cedar/authority binding
 * that happens before a hook can even be constructed) into V9_INCOMPLETE or
 * V9_ERROR -- the two categories this mission requires for a real failure,
 * never DENY (which would misleadingly imply a real, completed evaluation)
 * and never ALLOW under any circumstance.
 */
export function classifyRealityShadowFailure(error) {
  if (error instanceof RealCedarBindingError) return classifyRealCedarFailure(error);
  return 'V9_ERROR';
}
