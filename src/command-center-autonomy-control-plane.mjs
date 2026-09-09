export const COMMAND_CENTER_AUTONOMY_CONTROL_PLANE_VERSION = 'uberbond.command-center-autonomy-control-plane.v1';

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

export function compileCommandCenterAutonomyControlPlane({ selfMaintainerReceipt = null } = {}) {
  const receiptState = text(selfMaintainerReceipt?.state, 80) || 'UNAVAILABLE';
  const freshness = text(selfMaintainerReceipt?.freshness, 80) || 'UNKNOWN';
  const maintainerStatus = text(selfMaintainerReceipt?.summary?.status, 160) || null;

  let status = 'AUTONOMY_ARMED_AWAITING_EXECUTED_RECEIPT';
  if (receiptState === 'AVAILABLE' && freshness === 'STALE') status = 'AUTONOMY_ARMED_LAST_RECEIPT_STALE';
  else if (receiptState === 'AVAILABLE' && /PROMOTED_TO_REVIEW/i.test(maintainerStatus || '')) status = 'AUTONOMY_WORK_PRODUCT_AWAITING_INDEPENDENT_VERIFICATION';
  else if (receiptState === 'AVAILABLE' && /(NO_SAFE_CHANGE|STOP|WAIT_FOR_NEW_EVIDENCE)/i.test(maintainerStatus || '')) status = 'AUTONOMY_QUIESCENT_UNTIL_NEW_EVIDENCE_OR_MAIN_CHANGE';
  else if (receiptState === 'AVAILABLE') status = 'AUTONOMY_ARMED_WITH_OBSERVED_SELF_MAINTAINER_RECEIPT';

  return {
    policyVersion: COMMAND_CENTER_AUTONOMY_CONTROL_PLANE_VERSION,
    status,
    sourceConfiguration: {
      scheduledWake: 'TWICE_HOURLY_NON_REPEATING_PULSE',
      wakeCron: '7,37 * * * *',
      proposalLane: 'OIDC_BOUND_ZERO_CENT_SOURCE_GROUNDED_PROPOSAL',
      sandboxVerification: 'CREDENTIAL_FREE',
      reviewPromotion: 'BRANCH_AND_PR_ONLY',
      independentVerification: 'READ_ONLY_NO_SECRETS',
      mergeGovernor: 'EXACT_HEAD_SEPARATE_WORKFLOW_RUN',
      mergeScope: 'LOCAL_PREPARATION_ONLY',
      postMergeContinuation: 'PUSH_TO_MAIN_RESTARTS_SELF_MAINTAINER'
    },
    observedSelfMaintainer: {
      state: receiptState,
      freshness,
      status: maintainerStatus
    },
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    founderPrivateAuthority: 'NONE',
    truthBoundary: 'SOURCE CONFIGURATION STATES WHAT THE CONTROL PLANE IS WIRED TO DO. ONLY SELF-MAINTAINER RECEIPTS AND WORKFLOW/RUNTIME EVIDENCE MAY ESTABLISH THAT A CYCLE ACTUALLY EXECUTED.'
  };
}
