import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAgentCodeChangeSet, contentSha256 } from '../src/agent-code-change-contract.mjs';
import { issueVerifiedSelfMaintenanceReceipt } from '../src/self-maintenance-receipt-provenance.mjs';
import { issueGithubActionsSelfMaintainerAuthority } from '../src/github-actions-self-maintainer-authority.mjs';
import { createTrustedGithubSelfMaintainerPromotionAdapter } from '../src/github-self-maintainer-trusted-promotion.mjs';

const BASE = 'a'.repeat(40);
const BASE_TREE = 'b'.repeat(40);
const CANDIDATE_TREE = 'c'.repeat(40);
const CANDIDATE_COMMIT = 'd'.repeat(40);
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
  const blobs = new Map();
  let branchSha = null;

  function filePayload(path) {
    if (!files.has(path)) return { ok: true, status: 'NOT_FOUND', payload: null };
    return {
      ok: true,
      status: 'OK',
      payload: {
        type: 'file',
        sha: '1'.repeat(40),
        encoding: 'base64',
        content: Buffer.from(files.get(path), 'utf8').toString('base64')
      }
    };
  }

  return {
    calls,
    client: {
      async getBranch({ branch }) {
        calls.push('getBranch');
        if (branch === 'main') return { ok: true, status: 'OK', payload: { commit: { sha: BASE } } };
        return branchSha
          ? { ok: true, status: 'OK', payload: { commit: { sha: branchSha } } }
          : { ok: true, status: 'NOT_FOUND', payload: null };
      },
      async getCommit() {
        calls.push('getCommit');
        return { ok: true, payload: { tree: { sha: BASE_TREE } } };
      },
      async getTree() {
        calls.push('getTree');
        return {
          ok: true,
          payload: {
            truncated: false,
            tree: [{ path: 'src/example.mjs', mode: '100644', type: 'blob', sha: '1'.repeat(40) }]
          }
        };
      },
      async getFile({ path }) {
        calls.push('getFile');
        return filePayload(path);
      },
      async createBlob({ content }) {
        calls.push('createBlob');
        const sha = '2'.repeat(40);
        blobs.set(sha, content);
        return { ok: true, payload: { sha } };
      },
      async createTree({ entries }) {
        calls.push('createTree');
        for (const entry of entries) {
          if (entry.sha == null) files.delete(entry.path);
          else files.set(entry.path, blobs.get(entry.sha));
        }
        return { ok: true, payload: { sha: CANDIDATE_TREE } };
      },
      async createCommit() {
        calls.push('createCommit');
        return { ok: true, payload: { sha: CANDIDATE_COMMIT } };
      },
      async createBranch({ sha }) {
        calls.push('createBranch');
        branchSha = sha;
        return { ok: true, payload: {} };
      },
      async listPullRequests() {
        calls.push('listPullRequests');
        return { ok: true, payload: [] };
      },
      async createPullRequest({ head, base }) {
        calls.push('createPullRequest');
        return {
          ok: true,
          payload: {
            number: 1,
            state: 'open',
            head: { ref: head },
            base: { ref: base },
            html_url: 'https://example.invalid/pr/1'
          }
        };
      }
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
  assert.ok(gh.calls.includes('getCommit'));
  assert.ok(gh.calls.includes('getTree'));
  assert.ok(gh.calls.includes('createBlob'));
  assert.ok(gh.calls.includes('createTree'));
  assert.ok(gh.calls.includes('createCommit'));
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
