import test from 'node:test';
import assert from 'node:assert/strict';
import { runTrustedUberBondSelfMaintenance } from '../src/uberbond-self-maintainer-trusted-runtime.mjs';
import { validateVerifiedSelfMaintenanceReceipt } from '../src/self-maintenance-receipt-provenance.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const BASE = 'a'.repeat(40);
const NOW = new Date('2026-09-05T12:00:00.000Z');

function changeSet() {
  return {
    ok: true,
    changeSetId: 'trusted_change_1',
    taskId: 'trusted_task_1',
    baseRevision: BASE,
    summary: 'Bounded verified change.',
    verification: ['node --check src/example.mjs'],
    changes: [{
      operation: 'UPDATE',
      path: 'src/example.mjs',
      beforeSha256: 'b'.repeat(64),
      afterSha256: 'c'.repeat(64),
      content: 'export const value = 2;\n'
    }]
  };
}

function harness() {
  const candidate = changeSet();
  const state = { destroyed: false, promoted: false };
  return {
    state,
    input: {
      task: { taskId: candidate.taskId, objective: 'Repair a bounded local module.' },
      candidateChangeSet: candidate,
      createSandbox: async () => ({
        ok: true,
        sandboxRoot: '/tmp/trusted-self-maintainer/repo',
        isolationReceipt: {
          status: 'VERIFIED_ISOLATED',
          sandboxRoot: '/tmp/trusted-self-maintainer/repo',
          filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
          businessCredentialsMounted: false,
          hostHomeMounted: false,
          productionNetworkReachability: false,
          networkEgressMode: 'NONE',
          providerCredentialScope: 'NONE',
          evidenceRefs: ['audit:trusted-runtime-zero-network']
        }
      }),
      destroySandbox: async () => {
        state.destroyed = true;
        return { ok: true, receiptRef: 'receipt:trusted-runtime-destroyed' };
      },
      applyChangeSet: async () => ({ ok: true, status: 'SANDBOX_APPLIED_VERIFICATION_REQUIRED' }),
      verifySandbox: async () => ({
        ok: true,
        status: 'PASS',
        verificationReceiptId: 'trusted_verify_1',
        executed: [{ command: candidate.verification[0], status: 'PASS' }]
      }),
      collectChanges: async () => ({ ok: true, status: 'CHANGE_SET_COLLECTED', changeSet: structuredClone(candidate) }),
      repository: 'mohammedwessam2007/uberbondd',
      date: NOW
    }
  };
}

test('trusted runtime issues process-local authority only after verified sandbox cleanup', async () => {
  const { state, input } = harness();
  const result = await runTrustedUberBondSelfMaintenance(input);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'VERIFIED_CHANGESET_READY_FOR_TRUSTED_PROMOTION');
  assert.equal(state.destroyed, true);
  assert.deepEqual(result.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);

  const trusted = validateVerifiedSelfMaintenanceReceipt(result.verifiedReceipt, {
    taskId: input.task.taskId,
    changeSetId: input.candidateChangeSet.changeSetId,
    baseRevision: BASE
  });
  assert.equal(trusted.ok, true);

  const cloned = validateVerifiedSelfMaintenanceReceipt(structuredClone(result.verifiedReceipt), {
    taskId: input.task.taskId,
    changeSetId: input.candidateChangeSet.changeSetId,
    baseRevision: BASE
  });
  assert.equal(cloned.ok, false);
  assert.ok(cloned.reasonCodes.includes('process-local-self-maintenance-receipt-origin-required'));
});

test('trusted promotion runs only after cleanup and keeps repository effects out of canonical business ledger', async () => {
  const { state, input } = harness();
  input.repositoryAuthority = { status: 'AUTHORIZED' };
  input.promotionAdapter = async ({ task, changeSet, verifiedReceipt }) => {
    assert.equal(state.destroyed, true, 'repository promotion ran before the write/test sandbox was destroyed');
    const trusted = validateVerifiedSelfMaintenanceReceipt(verifiedReceipt, {
      taskId: task.taskId,
      changeSetId: changeSet.changeSetId,
      baseRevision: changeSet.baseRevision
    });
    assert.equal(trusted.ok, true);
    state.promoted = true;
    return {
      ok: true,
      status: 'PR_OPENED_REVIEW_REQUIRED',
      repositoryBranchesCreated: 1,
      repositoryPullRequestsCreated: 1,
      prNumber: 999
    };
  };

  const result = await runTrustedUberBondSelfMaintenance(input);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'VERIFIED_CHANGESET_PROMOTED_TO_REVIEW');
  assert.equal(state.destroyed, true);
  assert.equal(state.promoted, true);
  assert.deepEqual(result.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
  assert.equal(result.promotion.repositoryBranchesCreated, 1);
  assert.equal(result.promotion.repositoryPullRequestsCreated, 1);
  assert.match(result.truthBoundary, /REPOSITORY_BRANCH_AND_PR_EFFECTS_ARE_REPORTED_SEPARATELY_IN_PROMOTION/);
});
