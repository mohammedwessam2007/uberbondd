import crypto from 'node:crypto';
import { applyAgentCodeChangeSet } from './agent-code-change-applier.mjs';
import { collectAgentGitSandboxChanges } from './agent-git-sandbox-collector.mjs';
import { runSandboxVerification } from './agent-sandbox-verifier.mjs';

export const UBERBOND_SELF_MAINTAINER_POLICY_VERSION = 'uberbond-self-maintainer-1.0.0';

const ZERO = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function sha(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: UBERBOND_SELF_MAINTAINER_POLICY_VERSION,
    status,
    reasonCodes: unique(reasonCodes),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO },
    ...extra
  };
}

function typedEvidence(values) {
  if (!Array.isArray(values)) return [];
  return unique(values.map(value => text(value, 500)).filter(value => /^(receipt|test|audit|github|doc|provider|issue):/i.test(value))).slice(0, 50);
}

/**
 * The self-maintainer never lets a model write directly to the repository.
 * Models/councils operate outside this sandbox and produce a typed
 * AgentCodeChangeSet. The write/test sandbox must have ZERO network egress and
 * ZERO mounted provider/business credentials. This removes the old
 * Anthropic-only sandbox dependency from the repository-write path and makes
 * the write path provider-neutral.
 */
export function validateSelfMaintainerIsolation(receipt, sandboxRoot) {
  const reasons = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['self-maintainer-isolation-receipt-required'];
  if (String(receipt.status || '').toUpperCase() !== 'VERIFIED_ISOLATED') reasons.push('self-maintainer-os-isolation-not-verified');
  if (text(receipt.sandboxRoot, 1000) !== text(sandboxRoot, 1000)) reasons.push('self-maintainer-sandbox-root-mismatch');
  if (String(receipt.filesystemScope || '').toUpperCase() !== 'EPHEMERAL_SANDBOX_ONLY') reasons.push('self-maintainer-ephemeral-filesystem-required');
  if (receipt.businessCredentialsMounted !== false) reasons.push('self-maintainer-business-credentials-must-not-be-mounted');
  if (receipt.hostHomeMounted !== false) reasons.push('self-maintainer-host-home-must-not-be-mounted');
  if (receipt.productionNetworkReachability !== false) reasons.push('self-maintainer-production-network-must-be-unreachable');
  if (String(receipt.networkEgressMode || '').toUpperCase() !== 'NONE') reasons.push('self-maintainer-network-egress-must-be-none');
  if (!['NONE', 'NO_PROVIDER_CREDENTIALS'].includes(String(receipt.providerCredentialScope || '').toUpperCase())) {
    reasons.push('self-maintainer-provider-credentials-must-be-absent');
  }
  const refs = typedEvidence(receipt.evidenceRefs);
  if (!refs.length || refs.length !== (Array.isArray(receipt.evidenceRefs) ? receipt.evidenceRefs.length : 0)) {
    reasons.push('self-maintainer-typed-isolation-evidence-required');
  }
  return reasons;
}

function changeFingerprint(changeSet) {
  const changes = Array.isArray(changeSet?.changes) ? changeSet.changes : [];
  const normalized = changes.map(change => ({
    operation: String(change.operation || '').toUpperCase(),
    path: text(change.path, 500),
    beforeSha256: change.beforeSha256 || null,
    afterSha256: change.afterSha256 || null,
    contentSha256: change.content == null ? null : sha(String(change.content))
  })).sort((a, b) => `${a.path}:${a.operation}`.localeCompare(`${b.path}:${b.operation}`));
  return sha(normalized);
}

function verificationReceiptFor(sandbox) {
  return {
    ...sandbox.isolationReceipt,
    status: 'VERIFIED_ISOLATED',
    verificationNetworkEgressMode: 'NONE',
    modelExecutorAttached: false,
    phase: 'VERIFICATION'
  };
}

function promotionAuthorityReasons(authority, { repository, baseRevision, now = new Date() } = {}) {
  if (authority == null) return ['repository-promotion-authority-required'];
  const reasons = [];
  if (String(authority.status || '').toUpperCase() !== 'AUTHORIZED') reasons.push('repository-promotion-authority-not-authorized');
  if (String(authority.scope || '').toUpperCase() !== 'BRANCH_AND_PR_ONLY') reasons.push('repository-promotion-scope-must-be-branch-and-pr-only');
  if (repository && text(authority.repository, 300) !== text(repository, 300)) reasons.push('repository-promotion-target-mismatch');
  if (baseRevision && text(authority.baseRevision, 160) !== text(baseRevision, 160)) reasons.push('repository-promotion-base-mismatch');
  const expiresAt = new Date(authority.expiresAt || 0);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) reasons.push('repository-promotion-authority-expired-or-invalid');
  const refs = typedEvidence(authority.evidenceRefs);
  if (!refs.length) reasons.push('repository-promotion-authority-evidence-required');
  return reasons;
}

function cleanupPacket(cleanup) {
  return {
    ok: cleanup?.ok === true,
    receiptRef: text(cleanup?.receiptRef, 500) || null
  };
}

/**
 * Run one complete provider-neutral self-maintenance candidate.
 *
 * Avengers / frontier models create the candidate outside the write sandbox.
 * This module applies and verifies it in a zero-network sandbox. An optional
 * promotion adapter may create a branch/PR only after exact tested-state
 * binding and only under separate BRANCH_AND_PR_ONLY authority.
 *
 * This function never merges, deploys, spends, messages customers, changes
 * credentials, or calls a model/provider.
 */
export async function runUberBondSelfMaintenance({
  task,
  candidateChangeSet,
  createSandbox,
  destroySandbox,
  applyChangeSet = applyAgentCodeChangeSet,
  verifySandbox = runSandboxVerification,
  collectChanges = collectAgentGitSandboxChanges,
  promotionAdapter = null,
  repositoryAuthority = null,
  repository = '',
  date = new Date()
} = {}) {
  if (!task?.taskId || !task?.objective) return fail(['valid-self-maintenance-task-required']);
  if (!candidateChangeSet?.ok || !candidateChangeSet?.changeSetId) return fail(['validated-agent-code-change-set-required']);
  if (text(candidateChangeSet.taskId, 160) !== text(task.taskId, 160)) return fail(['self-maintenance-task-change-set-identity-mismatch']);
  if (typeof createSandbox !== 'function') return fail(['self-maintenance-sandbox-factory-required']);
  if (typeof destroySandbox !== 'function') return fail(['self-maintenance-sandbox-destroyer-required']);
  if (typeof applyChangeSet !== 'function') return fail(['self-maintenance-change-applier-required']);
  if (typeof verifySandbox !== 'function') return fail(['self-maintenance-verifier-required']);
  if (typeof collectChanges !== 'function') return fail(['self-maintenance-change-collector-required']);

  let sandbox = null;
  let result = null;
  let cleanup = { ok: false, receiptRef: null };

  async function executeInsideSandbox() {
    const isolationReasons = validateSelfMaintainerIsolation(sandbox.isolationReceipt, sandbox.sandboxRoot);
    if (isolationReasons.length) return fail(isolationReasons, 'SANDBOX_BLOCKED');

    const applied = await applyChangeSet({
      sandboxRoot: sandbox.sandboxRoot,
      changeSet: candidateChangeSet,
      date
    });
    if (!applied?.ok) {
      return fail(applied?.reasonCodes || ['self-maintenance-apply-failed'], 'REPAIR_REQUIRED', {
        applyStatus: applied?.status || null,
        changeSetId: candidateChangeSet.changeSetId
      });
    }

    const verificationCommands = Array.isArray(candidateChangeSet.verification) && candidateChangeSet.verification.length
      ? candidateChangeSet.verification
      : (Array.isArray(task.acceptanceTests) ? task.acceptanceTests : []);
    if (!verificationCommands.length) return fail(['self-maintenance-verification-commands-required'], 'REPAIR_REQUIRED');

    const verification = await verifySandbox({
      sandboxRoot: sandbox.sandboxRoot,
      isolationReceipt: verificationReceiptFor(sandbox),
      commands: verificationCommands,
      date
    });
    if (!verification?.ok || verification.status !== 'PASS') {
      return fail(['self-maintenance-verification-failed'], 'REPAIR_REQUIRED', {
        verificationReceiptId: verification?.verificationReceiptId || null,
        verificationStatus: verification?.status || null,
        executed: verification?.executed || []
      });
    }

    const collected = await collectChanges({
      sandboxRoot: sandbox.sandboxRoot,
      taskId: candidateChangeSet.taskId,
      baseRevision: candidateChangeSet.baseRevision,
      verification: verificationCommands,
      summary: candidateChangeSet.summary || `Verified UberBond self-maintenance change set for ${candidateChangeSet.taskId}`
    });
    if (!collected?.ok || collected.status !== 'CHANGE_SET_COLLECTED' || !collected.changeSet) {
      return fail(['self-maintenance-post-verification-change-collection-failed'], 'STOP_REVIEW_REQUIRED');
    }

    const proposedFingerprint = changeFingerprint(candidateChangeSet);
    const observedFingerprint = changeFingerprint(collected.changeSet);
    if (proposedFingerprint !== observedFingerprint) {
      return fail(['self-maintenance-tested-state-differs-from-proposed-change-set'], 'STOP_REVIEW_REQUIRED', {
        proposedFingerprint,
        observedFingerprint,
        observedChangeSetId: collected.changeSet.changeSetId
      });
    }

    const verifiedReceiptCore = {
      policyVersion: UBERBOND_SELF_MAINTAINER_POLICY_VERSION,
      taskId: task.taskId,
      changeSetId: candidateChangeSet.changeSetId,
      baseRevision: candidateChangeSet.baseRevision,
      verifiedFingerprint: observedFingerprint,
      verificationReceiptId: verification.verificationReceiptId,
      verificationCommands,
      isolationEvidenceRefs: typedEvidence(sandbox.isolationReceipt.evidenceRefs),
      modelProviderCallsInsideWriteSandbox: 0,
      repositoryPromotionAuthority: promotionAdapter ? 'SEPARATE_AUTHORITY_REQUIRED' : 'NOT_REQUESTED',
      businessEffectAuthority: 'NONE',
      verifiedAt: (date instanceof Date ? date : new Date(date || Date.now())).toISOString()
    };
    const verifiedReceipt = {
      ...verifiedReceiptCore,
      selfMaintenanceReceiptId: `self_maint_${sha(verifiedReceiptCore).slice(0, 24)}`
    };

    if (typeof promotionAdapter !== 'function') {
      return {
        ok: true,
        policyVersion: UBERBOND_SELF_MAINTAINER_POLICY_VERSION,
        status: 'VERIFIED_CHANGESET_READY_FOR_PROMOTION',
        verifiedReceipt,
        observedChangeSet: collected.changeSet,
        promotion: { status: 'NOT_REQUESTED' },
        businessEffectAuthority: 'NONE',
        externalEffectLedger: { ...ZERO }
      };
    }

    const authorityReasons = promotionAuthorityReasons(repositoryAuthority, {
      repository,
      baseRevision: candidateChangeSet.baseRevision,
      now: date instanceof Date ? date : new Date(date || Date.now())
    });
    if (authorityReasons.length) return fail(authorityReasons, 'PROMOTION_BLOCKED', { verifiedReceipt });

    const promotion = await promotionAdapter({
      task,
      repository,
      authority: repositoryAuthority,
      changeSet: collected.changeSet,
      verifiedReceipt
    });
    if (!promotion?.ok) {
      return fail(promotion?.reasonCodes || ['repository-promotion-failed'], 'PROMOTION_BLOCKED', {
        verifiedReceipt,
        promotionStatus: promotion?.status || null
      });
    }

    return {
      ok: true,
      policyVersion: UBERBOND_SELF_MAINTAINER_POLICY_VERSION,
      status: 'VERIFIED_CHANGESET_PROMOTED_TO_REVIEW',
      verifiedReceipt,
      promotion,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: {
        ...ZERO,
        repositoryBranchesCreated: Number(promotion.repositoryBranchesCreated || 0),
        repositoryPullRequestsCreated: Number(promotion.repositoryPullRequestsCreated || 0)
      }
    };
  }

  try {
    sandbox = await createSandbox({ task, baseRevision: candidateChangeSet.baseRevision });
    if (!sandbox?.ok || !sandbox.sandboxRoot || !sandbox.isolationReceipt) {
      result = fail(['self-maintenance-verified-sandbox-required'], 'SANDBOX_BLOCKED');
    } else {
      result = await executeInsideSandbox();
    }
  } catch (error) {
    result = fail(['self-maintenance-execution-threw'], 'STOP_REVIEW_REQUIRED', {
      detail: text(error?.message, 800)
    });
  }

  if (sandbox) {
    try {
      cleanup = await destroySandbox({ sandbox });
    } catch {
      cleanup = { ok: false, receiptRef: null };
    }
  } else {
    cleanup = { ok: true, receiptRef: null };
  }

  if (!cleanup?.ok) {
    return fail(['self-maintenance-sandbox-cleanup-failed'], 'STOP_REVIEW_REQUIRED', {
      priorStatus: result?.status || null,
      priorOk: result?.ok === true,
      cleanup: cleanupPacket(cleanup)
    });
  }

  return {
    ...(result || fail(['self-maintenance-result-missing'], 'STOP_REVIEW_REQUIRED')),
    cleanup: cleanupPacket(cleanup)
  };
}
