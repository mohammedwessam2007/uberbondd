import { issueShadowApproval } from './shadow-approval.mjs';

/**
 * A canary approval is a shadow approval (same real, signed, Postgres-
 * persisted OWNER_APPROVAL object, same registry-gated resolution) with two
 * ADDITIONAL structural locks that make it impossible to cover a real
 * outbound email intent, not merely inconvenient to reuse for one:
 *
 * 1. operation is always exactly CANARY_NULL_OPERATION ('outbound.null_execute'),
 *    never 'email.send'. approvalCoversIntent()'s scope:operation check
 *    (frozen kernel.mjs) requires intent.operation to appear in
 *    approval.operations -- a canary approval's operations array can never
 *    contain 'email.send', by construction: issueCanaryApproval() does not
 *    accept an `operations` parameter at all.
 * 2. effectClass is always exactly CANARY_NULL_EFFECT_CLASS ('WRITE_INTERNAL'),
 *    never 'COMMUNICATE_EXTERNAL' (the effect class every real outbound
 *    email intent uses). This is a second, independent lock: even if some
 *    future intent used a non-'email.send' operation name for a real send,
 *    it would still need effectClass COMMUNICATE_EXTERNAL to represent an
 *    external communication, which a canary approval can never authorize.
 *
 * Neither lock is a promise or a naming convention -- both are checked by
 * the frozen kernel's approvalCoversIntent() on every single admission
 * call, the same function that already gates every other V9 approval.
 */
export const CANARY_NULL_OPERATION = 'outbound.null_execute';
export const CANARY_NULL_EFFECT_CLASS = 'WRITE_INTERNAL';
export const CANARY_NULL_PURPOSE = 'zero-consequence-canary-validation';

const FORBIDDEN_WILDCARDS = new Set(['*']);

export async function issueCanaryApproval({
  proofStore, pool, signer, approvalId, issuerId, keyId, tenantId,
  actorIds, resourcePrefixes, maxBlastRadius, maxCostUsd, maxUses,
  notBefore, expiresAt, issuedAt
}) {
  if (Array.isArray(resourcePrefixes) && resourcePrefixes.some(prefix => FORBIDDEN_WILDCARDS.has(prefix))) {
    throw new Error('canary approvals must not use a wildcard resource prefix');
  }
  return issueShadowApproval({
    proofStore, pool, signer, approvalId, issuerId, keyId, tenantId, actorIds,
    operations: [CANARY_NULL_OPERATION],
    resourcePrefixes,
    purposes: [CANARY_NULL_PURPOSE],
    effectClasses: [CANARY_NULL_EFFECT_CLASS],
    maxBlastRadius, maxCostUsd, maxUses, notBefore, expiresAt, issuedAt
  });
}
