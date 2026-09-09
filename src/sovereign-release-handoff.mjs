import crypto from 'node:crypto';

export const SOVEREIGN_RELEASE_HANDOFF_VERSION = 'uberbond.sovereign-release-handoff.v1';
const SHA40 = /^[a-f0-9]{40}$/;
const CHANGE_SET = /^agent_changes_[a-f0-9]{24}$/i;
const RECEIPT = /^self_maint_[a-f0-9]{24}$/i;

function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function digest(value) { return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`; }
function fail(reasonCodes, status = 'SOVEREIGN_RELEASE_REQUEST_REFUSED', extra = {}) {
  return { ...extra, ok: false, version: SOVEREIGN_RELEASE_HANDOFF_VERSION, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], signingAuthority: 'NONE', deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' };
}
function coreOf(request = {}) {
  return {
    version: request.version,
    sourceCommit: request.sourceCommit,
    candidateHeadSha: request.candidateHeadSha,
    priorMainSha: request.priorMainSha,
    prNumber: request.prNumber,
    changeSetId: request.changeSetId,
    selfMaintenanceReceiptId: request.selfMaintenanceReceiptId,
    independentVerificationClass: request.independentVerificationClass,
    requestedAction: request.requestedAction,
    signerBoundary: request.signerBoundary,
    deploymentAuthority: request.deploymentAuthority,
    businessEffectAuthority: request.businessEffectAuthority,
    externalEffectAuthority: request.externalEffectAuthority
  };
}

export function compileSovereignReleaseRequest({ mergeReceipt } = {}) {
  const m = mergeReceipt || {};
  const reasons = [];
  const sourceCommit = text(m.mergeCommitSha, 80).toLowerCase();
  const candidateHeadSha = text(m.headSha, 80).toLowerCase();
  const priorMainSha = text(m.priorMainSha, 80).toLowerCase();
  const prNumber = Number(m.prNumber || 0);
  const changeSetId = text(m.changeSetId, 100);
  const selfMaintenanceReceiptId = text(m.receiptId, 100);
  if (m.ok !== true || m.status !== 'SELF_MAINTAINER_PR_MERGED_AFTER_INDEPENDENT_VERIFICATION') reasons.push('verified-autonomous-merge-receipt-required');
  if (!SHA40.test(sourceCommit)) reasons.push('exact-merge-commit-required');
  if (!SHA40.test(candidateHeadSha)) reasons.push('exact-candidate-head-required');
  if (!SHA40.test(priorMainSha)) reasons.push('exact-prior-main-required');
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) reasons.push('valid-pr-number-required');
  if (!CHANGE_SET.test(changeSetId)) reasons.push('canonical-change-set-id-required');
  if (!RECEIPT.test(selfMaintenanceReceiptId)) reasons.push('canonical-self-maintenance-receipt-id-required');
  if (String(m.deploymentAuthority || '').toUpperCase() !== 'NONE') reasons.push('merge-receipt-must-not-carry-deployment-authority');
  if (String(m.businessEffectAuthority || '').toUpperCase() !== 'NONE') reasons.push('merge-receipt-must-not-carry-business-effect-authority');
  if (String(m.externalEffectAuthority || '').toUpperCase() !== 'NONE') reasons.push('merge-receipt-must-not-carry-external-effect-authority');
  if (reasons.length) return fail(reasons);

  const core = {
    version: SOVEREIGN_RELEASE_HANDOFF_VERSION,
    sourceCommit,
    candidateHeadSha,
    priorMainSha,
    prNumber,
    changeSetId,
    selfMaintenanceReceiptId,
    independentVerificationClass: 'MERGE_GOVERNOR_CONFIRMED_EXACT_HEAD_SYNTAX_AND_DETERMINISTIC_TRIBUNAL',
    requestedAction: 'PACK_SIGNED_SOVEREIGN_RELEASE_OFFLINE',
    signerBoundary: 'OFFLINE_OWNER_CONTROLLED_AUTHORING_MACHINE_ONLY',
    deploymentAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  return {
    ok: true,
    status: 'SOVEREIGN_RELEASE_REQUEST_READY_FOR_OFFLINE_SIGNER',
    ...core,
    requestDigest: digest(core),
    requiredLocalChecks: [
      'local checkout HEAD equals sourceCommit',
      'local checkout is clean',
      'offline release signing key is a regular non-symlink file',
      'preseeded dependencies and required OCI images exist locally',
      'uberbondctl pack reruns syntax and deterministic verification before signing'
    ],
    signingAuthority: 'NOT_GRANTED_BY_REQUEST',
    truthBoundary: 'THIS REQUEST RECORDS A MERGE GOVERNOR RESULT THAT WAS PRODUCED ONLY AFTER THE INDEPENDENT EXACT-HEAD TRIBUNAL. selfMaintenanceReceiptId NAMES THE WORKER SELF-MAINTENANCE RECEIPT, NOT A SEPARATE VERIFIER RECEIPT. THE REQUEST DOES NOT SIGN, DEPLOY, ACTIVATE PRODUCTION, CONTACT CUSTOMERS, MOVE MONEY OR ESTABLISH RUNTIME SOVEREIGNTY.'
  };
}

export function verifySovereignReleaseRequest(request = {}) {
  const reasons = [];
  const core = coreOf(request);
  if (request.ok !== true || request.status !== 'SOVEREIGN_RELEASE_REQUEST_READY_FOR_OFFLINE_SIGNER') reasons.push('ready-release-request-required');
  if (request.version !== SOVEREIGN_RELEASE_HANDOFF_VERSION) reasons.push('release-request-version-mismatch');
  if (!SHA40.test(text(request.sourceCommit, 80))) reasons.push('exact-source-commit-required');
  if (!SHA40.test(text(request.candidateHeadSha, 80))) reasons.push('exact-candidate-head-required');
  if (!SHA40.test(text(request.priorMainSha, 80))) reasons.push('exact-prior-main-required');
  if (!Number.isSafeInteger(Number(request.prNumber)) || Number(request.prNumber) <= 0) reasons.push('valid-pr-number-required');
  if (!CHANGE_SET.test(text(request.changeSetId, 100))) reasons.push('canonical-change-set-id-required');
  if (!RECEIPT.test(text(request.selfMaintenanceReceiptId, 100))) reasons.push('canonical-self-maintenance-receipt-id-required');
  if (request.requestedAction !== 'PACK_SIGNED_SOVEREIGN_RELEASE_OFFLINE') reasons.push('offline-pack-action-required');
  if (request.signerBoundary !== 'OFFLINE_OWNER_CONTROLLED_AUTHORING_MACHINE_ONLY') reasons.push('offline-signer-boundary-required');
  if (request.signingAuthority !== 'NOT_GRANTED_BY_REQUEST') reasons.push('request-cannot-grant-signing-authority');
  if (request.deploymentAuthority !== 'NONE') reasons.push('request-cannot-grant-deployment-authority');
  if (request.businessEffectAuthority !== 'NONE') reasons.push('request-cannot-grant-business-effect-authority');
  if (request.externalEffectAuthority !== 'NONE') reasons.push('request-cannot-grant-external-effect-authority');
  if (text(request.requestDigest, 80) !== digest(core)) reasons.push('release-request-digest-mismatch');
  return reasons.length ? fail(reasons, 'SOVEREIGN_RELEASE_REQUEST_INVALID') : { ok: true, status: 'SOVEREIGN_RELEASE_REQUEST_VERIFIED', sourceCommit: request.sourceCommit, requestDigest: request.requestDigest, signingAuthority: 'NONE', deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE' };
}

export function admitOfflineReleasePack({ request, localHeadSha, worktreeClean, signingKeyPresent, signingKeySymlink = false } = {}) {
  const verified = verifySovereignReleaseRequest(request);
  if (!verified.ok) return verified;
  const reasons = [];
  const head = text(localHeadSha, 80).toLowerCase();
  if (!SHA40.test(head) || head !== request.sourceCommit) reasons.push('local-head-must-equal-request-source-commit');
  if (worktreeClean !== true) reasons.push('clean-local-worktree-required');
  if (signingKeyPresent !== true) reasons.push('offline-signing-key-required');
  if (signingKeySymlink === true) reasons.push('signing-key-symlink-refused');
  if (reasons.length) return fail(reasons, 'OFFLINE_RELEASE_PACK_REFUSED', { sourceCommit: request.sourceCommit });
  return {
    ok: true,
    status: 'OFFLINE_RELEASE_PACK_ADMITTED',
    sourceCommit: request.sourceCommit,
    requestDigest: request.requestDigest,
    packEntrypoint: 'ops/sovereign/uberbondctl pack',
    signingAuthority: 'LOCAL_PROCESS_ONLY__NOT_INHERITED_FROM_REQUEST',
    deploymentAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'ADMISSION ALLOWS LOCAL PACK/SIGN ONLY. SIGNED BUNDLE STILL REQUIRES SEPARATE RUNTIME ADMISSION; NO DEPLOYMENT HAS OCCURRED.'
  };
}
