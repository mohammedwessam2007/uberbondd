import { createGithubSelfMaintainerPromotionAdapter } from './github-self-maintainer-promotion.mjs';
import { validateVerifiedSelfMaintenanceReceipt } from './self-maintenance-receipt-provenance.mjs';
import { validateGithubActionsSelfMaintainerAuthority } from './github-actions-self-maintainer-authority.mjs';

export const TRUSTED_SELF_MAINTAINER_PROMOTION_POLICY_VERSION = 'trusted-self-maintainer-promotion-1.0.0';

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: TRUSTED_SELF_MAINTAINER_PROMOTION_POLICY_VERSION,
    status: 'PROMOTION_BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

/**
 * Production wrapper around the low-level GitHub transport adapter.
 *
 * Two caller-created JSON objects are not enough to authorize a repository
 * write. The verification receipt must be the exact process-local object
 * issued by the successful self-maintenance verifier path, and repository
 * authority must be the exact process-local object minted by the dedicated
 * immutable workflow root. structuredClone/JSON round trips lose both powers.
 */
export function createTrustedGithubSelfMaintainerPromotionAdapter(options = {}) {
  const lowLevel = createGithubSelfMaintainerPromotionAdapter(options);
  const now = typeof options.date === 'function' ? options.date : () => new Date();

  return async function trustedPromotion(input = {}) {
    const changeSet = input.changeSet;
    const task = input.task;
    const receiptCheck = validateVerifiedSelfMaintenanceReceipt(input.verifiedReceipt, {
      changeSetId: changeSet?.changeSetId,
      baseRevision: changeSet?.baseRevision,
      taskId: task?.taskId
    });
    if (!receiptCheck.ok) return fail(receiptCheck.reasonCodes || ['trusted-self-maintenance-receipt-required']);

    const authorityCheck = validateGithubActionsSelfMaintainerAuthority(input.authority, {
      repository: input.repository,
      baseRevision: changeSet?.baseRevision,
      date: now()
    });
    if (!authorityCheck.ok) return fail(authorityCheck.reasonCodes || ['trusted-workflow-authority-required']);

    return lowLevel(input);
  };
}
