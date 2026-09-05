import test from 'node:test';
import assert from 'node:assert/strict';
import {
  issueVerifiedSelfMaintenanceReceipt,
  validateVerifiedSelfMaintenanceReceipt
} from '../src/self-maintenance-receipt-provenance.mjs';
import {
  issueGithubActionsSelfMaintainerAuthority,
  validateGithubActionsSelfMaintainerAuthority
} from '../src/github-actions-self-maintainer-authority.mjs';

const BASE = 'a'.repeat(40);
const NOW = new Date('2026-09-05T12:00:00.000Z');

function receiptCore() {
  return {
    policyVersion: 'uberbond-self-maintainer-1.0.0',
    taskId: 'task_1',
    changeSetId: 'change_1',
    baseRevision: BASE,
    verifiedFingerprint: 'b'.repeat(64),
    verificationReceiptId: 'sandbox_verify_1',
    verifiedAt: NOW.toISOString(),
    modelProviderCallsInsideWriteSandbox: 0
  };
}

function workflowEnv(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'mohammedwessam2007/uberbondd',
    GITHUB_SHA: BASE,
    GITHUB_WORKFLOW_REF: 'mohammedwessam2007/uberbondd/.github/workflows/uberbond-self-maintainer.yml@refs/heads/main',
    GITHUB_EVENT_NAME: 'schedule',
    GITHUB_TOKEN: 'present-only-in-test',
    ...overrides
  };
}

test('verified self-maintenance receipt authority is process-local and clone-hostile', () => {
  const issued = issueVerifiedSelfMaintenanceReceipt(receiptCore());
  assert.equal(issued.ok, true);
  assert.equal(validateVerifiedSelfMaintenanceReceipt(issued.receipt, { changeSetId: 'change_1', baseRevision: BASE, taskId: 'task_1' }).ok, true);

  const cloned = structuredClone(issued.receipt);
  const jsonRoundTrip = JSON.parse(JSON.stringify(issued.receipt));
  assert.equal(validateVerifiedSelfMaintenanceReceipt(cloned, { changeSetId: 'change_1', baseRevision: BASE, taskId: 'task_1' }).ok, false);
  assert.equal(validateVerifiedSelfMaintenanceReceipt(jsonRoundTrip, { changeSetId: 'change_1', baseRevision: BASE, taskId: 'task_1' }).ok, false);
});

test('workflow-rooted branch/PR authority is process-local and clone-hostile', () => {
  const issued = issueGithubActionsSelfMaintainerAuthority({ env: workflowEnv(), baseRevision: BASE, date: NOW });
  assert.equal(issued.ok, true);
  assert.equal(validateGithubActionsSelfMaintainerAuthority(issued.authority, {
    repository: 'mohammedwessam2007/uberbondd', baseRevision: BASE, date: NOW
  }).ok, true);

  const cloned = structuredClone(issued.authority);
  assert.equal(validateGithubActionsSelfMaintainerAuthority(cloned, {
    repository: 'mohammedwessam2007/uberbondd', baseRevision: BASE, date: NOW
  }).ok, false);
});

test('a different workflow, event, or base SHA cannot mint repository authority', () => {
  for (const env of [
    workflowEnv({ GITHUB_WORKFLOW_REF: 'mohammedwessam2007/uberbondd/.github/workflows/ci.yml@refs/heads/main' }),
    workflowEnv({ GITHUB_EVENT_NAME: 'pull_request' }),
    workflowEnv({ GITHUB_SHA: 'c'.repeat(40) }),
    workflowEnv({ GITHUB_TOKEN: '' })
  ]) {
    const issued = issueGithubActionsSelfMaintainerAuthority({ env, baseRevision: BASE, date: NOW });
    assert.equal(issued.ok, false);
    assert.equal(issued.authority, null);
  }
});

test('authority expires and cannot cross repository or base identities', () => {
  const issued = issueGithubActionsSelfMaintainerAuthority({ env: workflowEnv(), baseRevision: BASE, date: NOW });
  assert.equal(issued.ok, true);
  assert.equal(validateGithubActionsSelfMaintainerAuthority(issued.authority, {
    repository: 'someone/else', baseRevision: BASE, date: NOW
  }).ok, false);
  assert.equal(validateGithubActionsSelfMaintainerAuthority(issued.authority, {
    repository: 'mohammedwessam2007/uberbondd', baseRevision: 'd'.repeat(40), date: NOW
  }).ok, false);
  assert.equal(validateGithubActionsSelfMaintainerAuthority(issued.authority, {
    repository: 'mohammedwessam2007/uberbondd', baseRevision: BASE, date: new Date('2026-09-05T12:31:00.000Z')
  }).ok, false);
});
