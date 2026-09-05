import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runUberBondSelfMaintenance,
  validateSelfMaintainerIsolation
} from '../src/uberbond-self-maintainer.mjs';

const BASE = 'a'.repeat(40);
const NOW = new Date('2026-09-05T12:00:00.000Z');

function isolation(overrides = {}) {
  return {
    status: 'VERIFIED_ISOLATED',
    sandboxRoot: '/tmp/uberbond-sandbox/repo',
    filesystemScope: 'EPHEMERAL_SANDBOX_ONLY',
    businessCredentialsMounted: false,
    hostHomeMounted: false,
    productionNetworkReachability: false,
    networkEgressMode: 'NONE',
    providerCredentialScope: 'NONE',
    evidenceRefs: ['audit:network-namespace-zero-egress'],
    ...overrides
  };
}

function changeSet(overrides = {}) {
  return {
    ok: true,
    changeSetId: 'change_1',
    taskId: 'task_1',
    baseRevision: BASE,
    summary: 'Change one harmless module.',
    verification: ['node --check src/example.mjs'],
    changes: [{
      operation: 'UPDATE',
      path: 'src/example.mjs',
      beforeSha256: 'b'.repeat(64),
      afterSha256: 'c'.repeat(64),
      content: 'export const value = 2;\n'
    }],
    ...overrides
  };
}

function harness(overrides = {}) {
  const calls = { apply: 0, verify: 0, collect: 0, destroy: 0, promote: 0 };
  const candidate = changeSet();
  const sandbox = {
    ok: true,
    sandboxRoot: '/tmp/uberbond-sandbox/repo',
    baseRevision: BASE,
    isolationReceipt: isolation()
  };
  return {
    calls,
    task: { taskId: 'task_1', objective: 'Improve UberBond.', acceptanceTests: candidate.verification },
    candidateChangeSet: candidate,
    createSandbox: async () => sandbox,
    destroySandbox: async () => { calls.destroy += 1; return { ok: true, receiptRef: 'receipt:sandbox-destroy:1' }; },
    applyChangeSet: async () => { calls.apply += 1; return { ok: true, status: 'SANDBOX_APPLIED_VERIFICATION_REQUIRED' }; },
    verifySandbox: async input => {
      calls.verify += 1;
      assert.equal(input.isolationReceipt.verificationNetworkEgressMode, 'NONE');
      assert.equal(input.isolationReceipt.modelExecutorAttached, false);
      return { ok: true, status: 'PASS', verificationReceiptId: 'sandbox_verify_1', executed: [{ command: candidate.verification[0], status: 'PASS' }] };
    },
    collectChanges: async () => { calls.collect += 1; return { ok: true, status: 'CHANGE_SET_COLLECTED', changeSet: structuredClone(candidate) }; },
    promotionAdapter: async () => { calls.promote += 1; return { ok: true, status: 'PR_OPENED', repositoryBranchesCreated: 1, repositoryPullRequestsCreated: 1, prNumber: 1 }; },
    repository: 'mohammedwessam2007/uberbondd',
    repositoryAuthority: {
      status: 'AUTHORIZED',
      scope: 'BRANCH_AND_PR_ONLY',
      repository: 'mohammedwessam2007/uberbondd',
      baseRevision: BASE,
      expiresAt: '2026-09-06T00:00:00.000Z',
      evidenceRefs: ['audit:owner-repository-maintenance-authority']
    },
    date: NOW,
    ...overrides
  };
}

test('write sandbox must be zero-network and credential-free', () => {
  assert.deepEqual(validateSelfMaintainerIsolation(isolation(), '/tmp/uberbond-sandbox/repo'), []);
  assert.ok(validateSelfMaintainerIsolation(isolation({ networkEgressMode: 'ANTHROPIC_ONLY' }), '/tmp/uberbond-sandbox/repo').includes('self-maintainer-network-egress-must-be-none'));
  assert.ok(validateSelfMaintainerIsolation(isolation({ providerCredentialScope: 'ANTHROPIC_ONLY' }), '/tmp/uberbond-sandbox/repo').includes('self-maintainer-provider-credentials-must-be-absent'));
  assert.ok(validateSelfMaintainerIsolation(isolation({ productionNetworkReachability: true }), '/tmp/uberbond-sandbox/repo').includes('self-maintainer-production-network-must-be-unreachable'));
});

test('verified candidate can be promoted to a branch/PR only after exact tested-state binding', async () => {
  const input = harness();
  const result = await runUberBondSelfMaintenance(input);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'VERIFIED_CHANGESET_PROMOTED_TO_REVIEW');
  assert.equal(result.verifiedReceipt.modelProviderCallsInsideWriteSandbox, 0);
  assert.equal(result.externalEffectLedger.repositoryBranchesCreated, 1);
  assert.equal(result.externalEffectLedger.repositoryPullRequestsCreated, 1);
  assert.deepEqual(input.calls, { apply: 1, verify: 1, collect: 1, destroy: 1, promote: 1 });
  assert.equal(result.cleanup.ok, true);
});

test('without separate repository authority the tested change cannot be promoted', async () => {
  const input = harness({ repositoryAuthority: null });
  const result = await runUberBondSelfMaintenance(input);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'PROMOTION_BLOCKED');
  assert.ok(result.reasonCodes.includes('repository-promotion-authority-required'));
  assert.equal(input.calls.promote, 0);
  assert.equal(input.calls.destroy, 1);
});

test('tested-state drift blocks promotion before repository mutation', async () => {
  const input = harness();
  input.collectChanges = async () => {
    input.calls.collect += 1;
    const changed = changeSet();
    changed.changes[0].content = 'export const value = 999;\n';
    return { ok: true, status: 'CHANGE_SET_COLLECTED', changeSet: changed };
  };
  const result = await runUberBondSelfMaintenance(input);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'STOP_REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('self-maintenance-tested-state-differs-from-proposed-change-set'));
  assert.equal(input.calls.promote, 0);
  assert.equal(input.calls.destroy, 1);
});

test('verification failure blocks promotion and still destroys the sandbox', async () => {
  const input = harness();
  input.verifySandbox = async () => {
    input.calls.verify += 1;
    return { ok: false, status: 'FAIL', verificationReceiptId: 'sandbox_verify_fail', executed: [{ command: 'node --check src/example.mjs', status: 'FAIL' }] };
  };
  const result = await runUberBondSelfMaintenance(input);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REPAIR_REQUIRED');
  assert.equal(input.calls.collect, 0);
  assert.equal(input.calls.promote, 0);
  assert.equal(input.calls.destroy, 1);
});

test('sandbox cleanup failure overrides an otherwise successful candidate', async () => {
  const input = harness();
  input.destroySandbox = async () => { input.calls.destroy += 1; return { ok: false }; };
  const result = await runUberBondSelfMaintenance(input);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'STOP_REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('self-maintenance-sandbox-cleanup-failed'));
  assert.equal(result.priorOk, true);
});

test('a verifier cannot be skipped by supplying no verification commands', async () => {
  const candidate = changeSet({ verification: [] });
  const input = harness({ candidateChangeSet: candidate, task: { taskId: 'task_1', objective: 'Improve UberBond.', acceptanceTests: [] } });
  input.collectChanges = async () => ({ ok: true, status: 'CHANGE_SET_COLLECTED', changeSet: structuredClone(candidate) });
  const result = await runUberBondSelfMaintenance(input);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REPAIR_REQUIRED');
  assert.ok(result.reasonCodes.includes('self-maintenance-verification-commands-required'));
  assert.equal(input.calls.promote, 0);
});
