import crypto from 'node:crypto';
import {
  validateAgentCodeChangeSet,
  BUILD_PROTECTED_PATHS,
  SOVEREIGNTY_PROTECTED_PATHS
} from './agent-code-change-contract.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOVEREIGN_LOCAL_PROMOTION_VERSION = 'uberbond.sovereign-local-promotion.v1';
const SHA40 = /^[a-f0-9]{40}$/i;
const CHANGE_SET = /^agent_changes_[a-f0-9]{24}$/i;
const RECEIPT = /^self_maint_[a-f0-9]{24}$/i;
const MAX_FILES = 20;
const LOCAL_CONTROL_PREFIXES = Object.freeze([
  '.github', 'api', 'public', 'ops/sovereign', 'scripts/sovereign', 'src/sovereign',
  'src/uberbond-command-center-status.mjs', 'src/uberbond-command-center-normalizer.mjs',
  'src/command-center-client-policy.mjs', 'src/autonomy-command-center-status.mjs'
]);

const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const unique = values => [...new Set((values || []).filter(Boolean))];
function fail(reasonCodes, status = 'LOCAL_PROMOTION_REFUSED', extra = {}) {
  return { ok:false, policyVersion:SOVEREIGN_LOCAL_PROMOTION_VERSION, status, reasonCodes:unique(reasonCodes), deploymentAuthority:'NONE', signingAuthority:'NONE', businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(), ...extra };
}
function sha(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function normalizedPath(value) {
  const p = text(value, 1000).replaceAll('\\', '/');
  if (!p || p.startsWith('/') || p === '.' || p === '..' || p.startsWith('../') || p.includes('/../')) return null;
  return p;
}
function matchesPrefix(filePath, prefix) {
  const lower = filePath.toLowerCase(); const p = String(prefix || '').toLowerCase();
  if (p === '.env') return lower === '.env' || lower.startsWith('.env.') || lower.startsWith('.env/');
  return lower === p || lower.startsWith(`${p}/`);
}
function protectedReason(filePath) {
  if (SOVEREIGNTY_PROTECTED_PATHS.some(prefix => matchesPrefix(filePath, prefix))) return 'sovereignty-protected';
  if (BUILD_PROTECTED_PATHS.some(prefix => matchesPrefix(filePath, prefix))) return 'build-protected';
  if (LOCAL_CONTROL_PREFIXES.some(prefix => matchesPrefix(filePath, prefix))) return 'local-promotion-control-surface-protected';
  if (/^src\/.*self-maintainer/i.test(filePath)) return 'self-maintainer-control-surface-protected';
  return null;
}
export function sovereignChangeFingerprint(changeSet = {}) {
  const changes = Array.isArray(changeSet?.changes) ? changeSet.changes : [];
  const normalized = changes.map(change => ({
    operation:String(change.operation || '').toUpperCase(),
    path:text(change.path, 500),
    beforeSha256:change.beforeSha256 || null,
    afterSha256:change.afterSha256 || null,
    contentSha256:change.content == null ? null : sha(String(change.content))
  })).sort((a,b) => `${a.path}:${a.operation}`.localeCompare(`${b.path}:${b.operation}`));
  return sha(normalized);
}

export function compileSovereignLocalPromotionAdmission({ verifiedChange, currentHead, branchName = 'main', worktreeClean = false } = {}) {
  const v = verifiedChange || {}; const vr = v.verifiedReceipt || {}; const cs = v.observedChangeSet || {};
  const head = text(currentHead, 80).toLowerCase(); const branch = text(branchName, 160);
  const reasons = [];
  if (!SHA40.test(head)) reasons.push('exact-current-head-required');
  if (branch !== 'main') reasons.push('local-promotion-main-branch-required');
  if (worktreeClean !== true) reasons.push('clean-local-main-required');
  if (v.ok !== true || v.status !== 'VERIFIED_CHANGESET_READY_FOR_SEPARATE_PROMOTION_AUTHORITY') reasons.push('independent-sovereign-verifier-receipt-required');
  if (String(v.promotion || '').toUpperCase() !== 'NOT_PERFORMED') reasons.push('unpromoted-verified-change-required');
  if (String(v.signingAuthority || '').toUpperCase() !== 'NONE') reasons.push('verified-change-cannot-carry-signing-authority');
  if (String(v.deploymentAuthority || '').toUpperCase() !== 'NONE') reasons.push('verified-change-cannot-carry-deployment-authority');
  if (String(v.businessEffectAuthority || '').toUpperCase() !== 'NONE') reasons.push('verified-change-cannot-carry-business-effect-authority');
  if (String(v.externalEffectAuthority || '').toUpperCase() !== 'NONE') reasons.push('verified-change-cannot-carry-external-effect-authority');
  if (!SHA40.test(text(v.baseRevision,80)) || text(v.baseRevision,80).toLowerCase() !== head) reasons.push('verified-change-base-must-equal-current-head');
  if (!CHANGE_SET.test(text(vr.changeSetId,100))) reasons.push('canonical-change-set-id-required');
  if (!RECEIPT.test(text(vr.selfMaintenanceReceiptId,100))) reasons.push('canonical-self-maintenance-receipt-id-required');
  if (text(vr.baseRevision,80).toLowerCase() !== head) reasons.push('self-maintenance-receipt-base-mismatch');
  if (!text(vr.taskId,300) || text(vr.taskId,300) !== text(v.taskId,300)) reasons.push('verified-task-identity-mismatch');
  const validation = validateAgentCodeChangeSet(cs);
  if (!validation.ok) reasons.push(...(validation.reasonCodes || ['valid-observed-change-set-required']));
  if (text(cs.changeSetId,100) !== text(vr.changeSetId,100)) reasons.push('observed-change-set-identity-mismatch');
  if (text(cs.taskId,300) !== text(vr.taskId,300)) reasons.push('observed-change-set-task-mismatch');
  if (text(cs.baseRevision,80).toLowerCase() !== head) reasons.push('observed-change-set-base-mismatch');
  const fingerprint = sovereignChangeFingerprint(cs);
  if (!/^[a-f0-9]{64}$/i.test(text(vr.verifiedFingerprint,80)) || text(vr.verifiedFingerprint,80).toLowerCase() !== fingerprint) reasons.push('verified-fingerprint-mismatch');
  const changes = Array.isArray(cs.changes) ? cs.changes : [];
  if (!changes.length || changes.length > MAX_FILES) reasons.push('bounded-change-set-required');
  const changedPaths = [];
  for (const change of changes) {
    const p = normalizedPath(change.path);
    if (!p) { reasons.push('changed-file-path-invalid'); continue; }
    const protectedClass = protectedReason(p); if (protectedClass) reasons.push(`${protectedClass}:${p}`);
    if (p.startsWith('tests/') && String(change.operation || '').toUpperCase() !== 'CREATE') reasons.push(`existing-test-modification-refused:${p}`);
    changedPaths.push(p);
  }
  if (reasons.length) return fail(reasons, 'LOCAL_PROMOTION_ADMISSION_REFUSED', { currentHead:head || null, changeSetId:text(vr.changeSetId,100) || null });
  return {
    ok:true, policyVersion:SOVEREIGN_LOCAL_PROMOTION_VERSION, status:'LOCAL_PROMOTION_ADMITTED_FOR_ISOLATED_STAGE_AND_FIXED_GATES',
    baseRevision:head, taskId:vr.taskId, changeSetId:vr.changeSetId, receiptId:vr.selfMaintenanceReceiptId,
    verifiedFingerprint:fingerprint, changedPaths:[...new Set(changedPaths)].sort(), observedChangeSet:cs,
    fixedPostApplyChecks:['npm run check:syntax','npm run test:deterministic'],
    promotionTarget:'LOCAL_REFS_HEADS_MAIN', networkRequired:false,
    signingAuthority:'NONE', deploymentAuthority:'NONE', businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(),
    truthBoundary:'Admission allows a separate local promoter to stage, fixed-gate, and fast-forward only low-risk verified source changes. It cannot alter sovereignty/build/control surfaces, sign releases, deploy, contact customers, move money, change credentials/DNS, or create runtime/commercial truth.'
  };
}

export function compileSovereignLocalPromotionReceipt({ admission, promotionCommitSha, parentSha, verification = [] } = {}) {
  if (!admission?.ok) return fail(['admitted-local-promotion-required']);
  const commit = text(promotionCommitSha,80).toLowerCase(); const parent = text(parentSha,80).toLowerCase();
  const reasons = [];
  if (!SHA40.test(commit)) reasons.push('exact-promotion-commit-required');
  if (!SHA40.test(parent) || parent !== admission.baseRevision) reasons.push('promotion-parent-must-equal-admitted-base');
  const checks = Array.isArray(verification) ? verification : [];
  for (const required of admission.fixedPostApplyChecks || []) if (!checks.some(row => row?.command === required && row?.status === 'PASS')) reasons.push(`fixed-post-apply-check-required:${required}`);
  if (reasons.length) return fail(reasons, 'LOCAL_PROMOTION_RECEIPT_REFUSED');
  return {
    ok:true, policyVersion:SOVEREIGN_LOCAL_PROMOTION_VERSION,
    status:'SELF_MAINTAINER_LOCAL_MAIN_PROMOTED_AFTER_INDEPENDENT_VERIFICATION',
    promotionClass:'LOCAL_MAIN_FAST_FORWARD', promotionRef:'refs/heads/main', headSha:commit, promotionCommitSha:commit,
    priorMainSha:admission.baseRevision, changeSetId:admission.changeSetId, receiptId:admission.receiptId,
    verifiedFingerprint:admission.verifiedFingerprint, changedPaths:admission.changedPaths, verification:checks,
    localRepositoryPromotionEffects:1, networkCalls:0, signingAuthority:'NONE', deploymentAuthority:'NONE', businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zeroEffects(),
    truthBoundary:'A low-risk verified change advanced LOCAL main by one exact fast-forward commit after fixed local gates. This is source promotion only, not signing, deployment, customer/payment/revenue/runtime sovereignty, life outcome, or ASI evidence.'
  };
}
