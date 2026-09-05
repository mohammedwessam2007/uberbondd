import { runUberBondSelfMaintenance } from './uberbond-self-maintainer.mjs';
import { issueVerifiedSelfMaintenanceReceipt } from './self-maintenance-receipt-provenance.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const TRUSTED_UBERBOND_SELF_MAINTAINER_RUNTIME_POLICY_VERSION = 'trusted-uberbond-self-maintainer-runtime-1.0.0';

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: TRUSTED_UBERBOND_SELF_MAINTAINER_RUNTIME_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

/**
 * Trusted two-phase runtime:
 *   1. zero-network apply/test/collect with NO repository credential;
 *   2. process-local receipt issuance;
 *   3. optional branch/PR promotion after the sandbox has been destroyed.
 *
 * Repository promotion never runs inside the write/test sandbox. This keeps the
 * tested candidate separated from the GitHub credential that can publish it.
 */
export async function runTrustedUberBondSelfMaintenance({
  promotionAdapter = null,
  repositoryAuthority = null,
  repository = '',
  ...coreInput
} = {}) {
  const verified = await runUberBondSelfMaintenance({
    ...coreInput,
    repository,
    promotionAdapter: null,
    repositoryAuthority: null
  });
  if (!verified?.ok || verified.status !== 'VERIFIED_CHANGESET_READY_FOR_PROMOTION') return verified;
  if (verified.cleanup?.ok !== true) return fail(['verified-sandbox-cleanup-required-before-promotion'], 'STOP_REVIEW_REQUIRED');

  const issued = issueVerifiedSelfMaintenanceReceipt(verified.verifiedReceipt);
  if (!issued?.ok || !issued.receipt) return fail(issued?.reasonCodes || ['verified-receipt-issuance-failed'], 'STOP_REVIEW_REQUIRED');

  if (typeof promotionAdapter !== 'function') {
    return {
      ...verified,
      policyVersion: TRUSTED_UBERBOND_SELF_MAINTAINER_RUNTIME_POLICY_VERSION,
      verifiedReceipt: issued.receipt,
      status: 'VERIFIED_CHANGESET_READY_FOR_TRUSTED_PROMOTION',
      externalEffectLedger: zeroEffects()
    };
  }

  const promotion = await promotionAdapter({
    task: coreInput.task,
    repository,
    authority: repositoryAuthority,
    changeSet: verified.observedChangeSet,
    verifiedReceipt: issued.receipt
  });
  if (!promotion?.ok) {
    return fail(promotion?.reasonCodes || ['trusted-repository-promotion-failed'], promotion?.status || 'PROMOTION_BLOCKED', {
      verifiedReceipt: issued.receipt,
      observedChangeSet: verified.observedChangeSet,
      cleanup: verified.cleanup
    });
  }

  return {
    ok: true,
    policyVersion: TRUSTED_UBERBOND_SELF_MAINTAINER_RUNTIME_POLICY_VERSION,
    status: 'VERIFIED_CHANGESET_PROMOTED_TO_REVIEW',
    verifiedReceipt: issued.receipt,
    observedChangeSet: verified.observedChangeSet,
    cleanup: verified.cleanup,
    promotion,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'CANONICAL_EXTERNAL_EFFECT_LEDGER_COVERS_PROVIDER_BUSINESS_SPEND_EFFECTS; REPOSITORY_BRANCH_AND_PR_EFFECTS_ARE_REPORTED_SEPARATELY_IN_PROMOTION'
  };
}
