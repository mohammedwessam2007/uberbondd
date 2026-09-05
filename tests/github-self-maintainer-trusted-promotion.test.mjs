import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAgentCodeChangeSet, contentSha256 } from '../src/agent-code-change-contract.mjs';
import { issueVerifiedSelfMaintenanceReceipt } from '../src/self-maintenance-receipt-provenance.mjs';
import { issueGithubActionsSelfMaintainerAuthority } from '../src/github-actions-self-maintainer-authority.mjs';
import { createTrustedGithubSelfMaintainerPromotionAdapter } from '../src/github-self-maintainer-trusted-promotion.mjs';

const BASE = 'a'.repeat(40);
const BEFORE = 'export const value = 1;\n';
const AFTER = 'export const value = 2;\n';
const NOW = new Date('2026-09-05T12:00:00.000Z');

function candidate() {
  return compileAgentCodeChangeSet({
    taskId: 'task_1', baseRevision: BASE, summary: 'A harmless verified update.', consequenceClass: 'LOCAL_PREPARATION',
    verification: ['node --check src/example.mjs'],
    changes: [{ operation: 'UPDATE', path: 'src/example.mjs', beforeSha256: contentSha256(BEFORE), content: AFTER, rationale: 'Pin the verified state.' }]
  });
}

function trustedInputs(changeSet) {
  const receipt = issueVerifiedSelfMaintenanceReceipt({
    policyVersion: 'uberbond-self-maintainer-1.0.0', taskId: 'task_1', changeSetId: changeSet.changeSetId,
    baseRevision: BASE, verifiedFingerprint: 'b'.repeat(64), verificationReceiptId: 'sandbox_verify_1', verifiedAt: NOW.toISOString()
  }).receipt;
  const authority = issueGithubActionsSelfMaintainerAuthority({
    baseRevision: BASE, date: NOW,
    env: {
      GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'mohammedwessam2007/uberbondd', GITHUB_SHA: BASE,
      GITHUB_WORKFLOW_REF: 'mohammedwessam2007/uberbondd/.github/workflows/uberbond-self-maintainer.yml@refs/heads/main',
      GITHUB_EVENT_NAME: 'schedule', GITHUB_TOKEN: 'test-token'
    }
  }).authority;
  return { receipt, authority };
}

function github() {
  const calls = [];
  const files = new Map([['src/example.mjs', BEFORE]]);
  return {
    calls,
    client: {
      async getBranch() { calls.push('getBranch'); return { ok: true, payload: { commit: { sha: BASE } } }; },
      async createBranch() { calls.push('createBranch'); return { ok: true, payload: {} }; },
      async getFile({ path }) {
        calls.push('getFile');
        if (!files.has(path)) return { ok: true, status: 'NOT_FOUND', payload: null };
        return { ok: true, status: 'OK', payload: { type: 'file', sha: 'blob', content: Buffer.from(files.get(path)).toString('base64') } };
      },
      async putFile({ path, content }) { calls.push('putFile'); files.set(path, content); return { ok: true, payload: {} }; },
      async deleteFile({ path }) { calls.push('deleteFile'); files.delete(path); return { ok: true, payload: {} }; },
      async createPullRequest() { calls.push('createPullRequest'); return { ok: true, payload: { number: 1, html_url: 'https://example.invalid/pr/1' } }; }
    }
  };
}

test('trusted process-local receipt + trusted workflow authority can open review PR', async () => {
  const changeSet = candidate();
  const { receipt, authority } = trustedInputs(changeSet);
  const gh = github();
  const promote = createTrustedGithubSelfMaintainerPromotionAdapter({ githubClient: gh.client, env: {}, date: () => NOW });
  const result = await promote({
    task: { taskId: 'task_1', objective: 'Repair example.' }, repository: 'mohammedwessam2007/uberbondd', authority, changeSet, verifiedReceipt: receipt
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PR_OPENED_REVIEW_REQUIRED');
  assert.ok(gh.calls.includes('createPullRequest'));
});

test('cloning either verification receipt or authority removes promotion power before GitHub I/O', async () => {
  const changeSet = candidate();
  const originals = trustedInputs(changeSet);
  for (const pair of [
    { receipt: structuredClone(originals.receipt), authority: originals.authority },
    { receipt: originals.receipt, authority: structuredClone(originals.authority) }
  ]) {
    const gh = github();
    const promote = createTrustedGithubSelfMaintainerPromotionAdapter({ githubClient: gh.client, env: {}, date: () => NOW });
    const result = await promote({
      task: { taskId: 'task_1', objective: 'Repair example.' }, repository: 'mohammedwessam2007/uberbondd',
      authority: pair.authority, changeSet, verifiedReceipt: pair.receipt
    });
    assert.equal(result.ok, false);
    assert.equal(gh.calls.length, 0);
  }
});
