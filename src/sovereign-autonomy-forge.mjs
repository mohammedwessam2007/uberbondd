import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION = 'uberbond.sovereign-autonomy-forge.v1.1';
export const RUNTIME_RELEASE_RECEIPT_SCHEMA = 'uberbond.runtime-release-receipt.v1';
export const FORGE_STATE_SCHEMA = 'uberbond.sovereign-forge-state.v1';

const EXACT_SHA = /^[a-f0-9]{40}$/i;
const EXACT_DIGEST = /^[a-f0-9]{64}$/i;
const SAFE_RELEASE = /^[A-Za-z0-9._-]{1,220}$/;
const PROVIDERS = Object.freeze(['open-model', 'claude-code-sandbox', 'openai', 'anthropic', 'ai-gateway']);

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const uniq = values => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

function fail(reasonCodes, status = 'FORGE_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
    status,
    reasonCodes: uniq(reasonCodes),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function pendingStateCore(state) {
  return {
    schemaVersion: state.schemaVersion,
    status: state.status,
    baseRevision: state.baseRevision,
    candidateRevision: state.candidateRevision,
    branchName: state.branchName,
    taskId: state.taskId,
    changeSetId: state.changeSetId,
    receiptId: state.receiptId,
    releaseName: state.releaseName,
    releaseSequence: state.releaseSequence,
    createdAt: state.createdAt,
    businessEffectAuthority: state.businessEffectAuthority,
    externalEffectAuthority: state.externalEffectAuthority
  };
}

function validatePendingStateDigest(state) {
  const observed = text(state?.stateDigest, 80).toLowerCase();
  if (!EXACT_DIGEST.test(observed)) return false;
  return digest(pendingStateCore(state)) === observed;
}

export function selectSovereignForgeProvider(readiness, { preferred = 'open-model', allowExternalFallback = false } = {}) {
  const wanted = text(preferred, 80).toLowerCase();
  if (!PROVIDERS.includes(wanted)) return fail(['forge-provider-unsupported'], 'MODEL_PROVIDER_BLOCKED');
  const rows = Array.isArray(readiness) ? readiness : [];
  const byName = new Map(rows.map(row => [text(row?.provider, 80).toLowerCase(), row]));
  const chosen = byName.get(wanted);
  if (chosen?.ready === true) {
    return {
      ok: true,
      policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
      status: 'MODEL_PROVIDER_READY',
      provider: wanted,
      sovereignPreferred: wanted === 'open-model',
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }
  if (!allowExternalFallback) {
    return fail([
      'preferred-forge-provider-not-ready',
      ...(Array.isArray(chosen?.blockers) ? chosen.blockers.map(code => `provider:${wanted}:${text(code, 120)}`) : [])
    ], 'MODEL_PROVIDER_BLOCKED', { provider: wanted });
  }
  for (const provider of PROVIDERS) {
    if (provider === wanted) continue;
    const row = byName.get(provider);
    if (row?.ready === true) {
      return {
        ok: true,
        policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
        status: 'MODEL_PROVIDER_READY_WITH_EXPLICIT_FALLBACK',
        provider,
        sovereignPreferred: false,
        businessEffectAuthority: 'NONE',
        externalEffectAuthority: 'NONE',
        externalEffectLedger: zeroEffects()
      };
    }
  }
  return fail(['no-authorized-forge-model-provider-ready'], 'MODEL_PROVIDER_BLOCKED', { provider: wanted });
}

export function parseRuntimeReleaseReceipt(value, { expectedReleaseName = null } = {}) {
  const reasons = [];
  const receipt = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!receipt) return fail(['runtime-release-receipt-object-required'], 'RUNTIME_RECEIPT_REJECTED');
  if (receipt.schemaVersion !== RUNTIME_RELEASE_RECEIPT_SCHEMA) reasons.push('runtime-release-receipt-schema-mismatch');
  const status = text(receipt.status, 40).toUpperCase();
  if (!['ADMITTED', 'REJECTED'].includes(status)) reasons.push('runtime-release-receipt-status-invalid');
  const releaseName = text(receipt.releaseName, 220);
  if (!SAFE_RELEASE.test(releaseName)) reasons.push('runtime-release-name-invalid');
  if (expectedReleaseName && releaseName !== expectedReleaseName) reasons.push('runtime-release-name-mismatch');
  const sourceCommit = text(receipt.sourceCommit, 80).toLowerCase();
  if (!EXACT_SHA.test(sourceCommit)) reasons.push('runtime-release-source-commit-invalid');
  const sequence = text(receipt.releaseSequence, 40);
  if (!/^\d{14}$/.test(sequence)) reasons.push('runtime-release-sequence-invalid');
  const recordedAt = text(receipt.recordedAt, 100);
  if (!Number.isFinite(Date.parse(recordedAt))) reasons.push('runtime-release-recorded-at-invalid');
  if (reasons.length) return fail(reasons, 'RUNTIME_RECEIPT_REJECTED');
  return {
    ok: true,
    policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
    status: 'RUNTIME_RELEASE_RECEIPT_VALID',
    receipt: {
      schemaVersion: RUNTIME_RELEASE_RECEIPT_SCHEMA,
      status,
      releaseName,
      sourceCommit,
      releaseSequence: sequence,
      recordedAt: new Date(recordedAt).toISOString(),
      exitCode: Number.isSafeInteger(Number(receipt.exitCode)) ? Number(receipt.exitCode) : null
    },
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compilePendingForgeDecision({ pending, admittedReceipt = null, rejectedReceipt = null, runtimeSourceCommit = null } = {}) {
  const state = pending && typeof pending === 'object' && !Array.isArray(pending) ? pending : null;
  if (!state || state.schemaVersion !== FORGE_STATE_SCHEMA || state.status !== 'PENDING_RUNTIME_ADMISSION') {
    return fail(['valid-pending-forge-state-required'], 'PENDING_STATE_REJECTED');
  }
  if (!validatePendingStateDigest(state)) {
    return fail(['pending-forge-state-digest-invalid'], 'PENDING_STATE_REJECTED');
  }
  const baseRevision = text(state.baseRevision, 80).toLowerCase();
  const candidateRevision = text(state.candidateRevision, 80).toLowerCase();
  const releaseName = text(state.releaseName, 220);
  const releaseSequence = text(state.releaseSequence, 40);
  if (!EXACT_SHA.test(baseRevision) || !EXACT_SHA.test(candidateRevision) || !SAFE_RELEASE.test(releaseName) || !/^\d{14}$/.test(releaseSequence)) {
    return fail(['pending-forge-state-identity-invalid'], 'PENDING_STATE_REJECTED');
  }
  const runtimeSha = text(runtimeSourceCommit, 80).toLowerCase();
  const admitted = admittedReceipt ? parseRuntimeReleaseReceipt(admittedReceipt, { expectedReleaseName: releaseName }) : null;
  const rejected = rejectedReceipt ? parseRuntimeReleaseReceipt(rejectedReceipt, { expectedReleaseName: releaseName }) : null;

  if (admitted?.ok && rejected?.ok) {
    return fail(['conflicting-runtime-admission-receipts'], 'RUNTIME_ADMISSION_CONFLICT');
  }
  if (admitted?.ok) {
    if (admitted.receipt.status !== 'ADMITTED') return fail(['admitted-receipt-status-mismatch'], 'RUNTIME_ADMISSION_CONFLICT');
    if (admitted.receipt.sourceCommit !== candidateRevision) return fail(['admitted-receipt-candidate-sha-mismatch'], 'RUNTIME_ADMISSION_CONFLICT');
    if (admitted.receipt.releaseSequence !== releaseSequence) return fail(['admitted-receipt-release-sequence-mismatch'], 'RUNTIME_ADMISSION_CONFLICT');
    if (!EXACT_SHA.test(runtimeSha)) return fail(['runtime-state-source-commit-required'], 'RUNTIME_ADMISSION_CONFLICT');
    if (runtimeSha !== candidateRevision) return fail(['runtime-state-does-not-confirm-admitted-candidate'], 'RUNTIME_ADMISSION_CONFLICT');
    return {
      ok: true,
      policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
      status: 'ADVANCE_CANONICAL_SOURCE_AFTER_RUNTIME_ADMISSION',
      baseRevision,
      candidateRevision,
      releaseName,
      releaseSequence,
      runtimeReceipt: admitted.receipt,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }
  if (rejected?.ok) {
    if (rejected.receipt.status !== 'REJECTED') return fail(['rejected-receipt-status-mismatch'], 'RUNTIME_ADMISSION_CONFLICT');
    if (rejected.receipt.sourceCommit !== candidateRevision) return fail(['rejected-receipt-candidate-sha-mismatch'], 'RUNTIME_ADMISSION_CONFLICT');
    if (rejected.receipt.releaseSequence !== releaseSequence) return fail(['rejected-receipt-release-sequence-mismatch'], 'RUNTIME_ADMISSION_CONFLICT');
    return {
      ok: true,
      policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
      status: 'ROLL_BACK_CANDIDATE_AND_MUTATE_STRATEGY',
      baseRevision,
      candidateRevision,
      releaseName,
      releaseSequence,
      blockerFingerprint: digest({
        kind: 'runtime-release-rejected',
        candidateRevision,
        releaseName,
        releaseSequence,
        exitCode: rejected.receipt.exitCode
      }),
      runtimeReceipt: rejected.receipt,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }
  return {
    ok: true,
    policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
    status: 'WAIT_FOR_RUNTIME_ADMISSION_RECEIPT',
    baseRevision,
    candidateRevision,
    releaseName,
    releaseSequence,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function buildLocalMergeAdmissionEnvelope({ repository = 'uberbond/sovereign-local', baseRevision, candidateRevision, branchName, taskId, changeSetId, receiptId, changedFiles } = {}) {
  const base = text(baseRevision, 80).toLowerCase();
  const head = text(candidateRevision, 80).toLowerCase();
  const branch = text(branchName, 200);
  if (!EXACT_SHA.test(base) || !EXACT_SHA.test(head)) return fail(['local-admission-exact-shas-required'], 'LOCAL_ADMISSION_REFUSED');
  if (!branch.startsWith('uberbond/self-maintain/')) return fail(['local-admission-branch-prefix-required'], 'LOCAL_ADMISSION_REFUSED');
  if (!/^agent_changes_[a-f0-9]{24}$/i.test(text(changeSetId, 80))) return fail(['local-admission-change-set-id-required'], 'LOCAL_ADMISSION_REFUSED');
  if (!/^self_maint_[a-f0-9]{24}$/i.test(text(receiptId, 80))) return fail(['local-admission-receipt-id-required'], 'LOCAL_ADMISSION_REFUSED');
  const body = [
    `Base: ${base}`,
    `Candidate commit: ${head}`,
    `Change set: ${changeSetId}`,
    `Self-maintenance receipt: ${receiptId}`,
    'Independent review and exact-head verification remain required.'
  ].join('\n');
  return {
    ok: true,
    policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
    status: 'LOCAL_MERGE_ADMISSION_ENVELOPE_READY',
    pullRequest: {
      number: 0,
      state: 'open',
      draft: false,
      title: `UberBond self-maintenance: ${text(taskId, 160) || changeSetId}`,
      body,
      commits: 1,
      base: { ref: 'main', sha: base, repo: { full_name: repository } },
      head: { ref: branch, sha: head, repo: { full_name: repository } }
    },
    changedFiles: Array.isArray(changedFiles) ? changedFiles : [],
    headParents: [base],
    repository,
    baseRevision: base,
    candidateRevision: head,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function newPendingForgeState({ baseRevision, candidateRevision, branchName, taskId, changeSetId, receiptId, releaseName, releaseSequence, createdAt = new Date() } = {}) {
  const base = text(baseRevision, 80).toLowerCase();
  const head = text(candidateRevision, 80).toLowerCase();
  const release = text(releaseName, 220);
  const sequence = text(releaseSequence, 40);
  const reasons = [];
  if (!EXACT_SHA.test(base) || !EXACT_SHA.test(head)) reasons.push('pending-state-exact-shas-required');
  if (!SAFE_RELEASE.test(release)) reasons.push('pending-state-release-name-invalid');
  if (!/^\d{14}$/.test(sequence)) reasons.push('pending-state-release-sequence-invalid');
  if (!text(branchName, 200).startsWith('uberbond/self-maintain/')) reasons.push('pending-state-branch-prefix-required');
  if (reasons.length) return fail(reasons, 'PENDING_STATE_REFUSED');
  const at = createdAt instanceof Date ? createdAt : new Date(createdAt || Date.now());
  if (!Number.isFinite(at.getTime())) return fail(['pending-state-created-at-invalid'], 'PENDING_STATE_REFUSED');
  const state = {
    schemaVersion: FORGE_STATE_SCHEMA,
    status: 'PENDING_RUNTIME_ADMISSION',
    baseRevision: base,
    candidateRevision: head,
    branchName: text(branchName, 200),
    taskId: text(taskId, 200),
    changeSetId: text(changeSetId, 100),
    receiptId: text(receiptId, 100),
    releaseName: release,
    releaseSequence: sequence,
    createdAt: at.toISOString(),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  return {
    ok: true,
    policyVersion: SOVEREIGN_AUTONOMY_FORGE_POLICY_VERSION,
    status: 'PENDING_STATE_READY',
    state: { ...state, stateDigest: digest(state) },
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
