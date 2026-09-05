import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAgentCodeChangeSet, contentSha256 } from '../src/agent-code-change-contract.mjs';
import { createGithubSelfMaintainerPromotionAdapter } from '../src/github-self-maintainer-promotion.mjs';

const BASE = 'a'.repeat(40);
const BASE_TREE = 'b'.repeat(40);
const CANDIDATE_TREE = 'c'.repeat(40);
const CANDIDATE_COMMIT = 'd'.repeat(40);
const BEFORE = 'export const value = 1;\n';
const AFTER = 'export const value = 2;\n';
const NOW = new Date('2026-09-05T12:00:00.000Z');

function candidate({ changes } = {}) {
  return compileAgentCodeChangeSet({
    taskId: 'task_maintain_1', baseRevision: BASE, summary: 'Change a harmless module.', consequenceClass: 'LOCAL_PREPARATION',
    verification: ['node --check src/example.mjs'],
    changes: changes || [{ operation: 'UPDATE', path: 'src/example.mjs', beforeSha256: contentSha256(BEFORE), content: AFTER, rationale: 'Regression repair.' }]
  });
}

function authority(overrides = {}) {
  return {
    status: 'AUTHORIZED', scope: 'BRANCH_AND_PR_ONLY', repository: 'mohammedwessam2007/uberbondd', baseRevision: BASE,
    expiresAt: '2026-09-06T00:00:00.000Z', evidenceRefs: ['audit:owner-repository-maintenance-authority'], ...overrides
  };
}

function fakeGithub({ baseSha = BASE, initial = BEFORE, failBlobAt = null, preexistingBranchSha = null } = {}) {
  const calls = [];
  const baseFiles = new Map([['src/example.mjs', initial]]);
  const candidateFiles = new Map(baseFiles);
  const blobs = new Map();
  let blobCount = 0;
  let branchSha = preexistingBranchSha;

  function filePayload(files, path) {
    if (!files.has(path)) return { ok: true, status: 'NOT_FOUND', payload: null };
    return { ok: true, status: 'OK', payload: { type: 'file', sha: `blob-${path}`, encoding: 'base64', content: Buffer.from(files.get(path), 'utf8').toString('base64') } };
  }

  return {
    calls,
    candidateFiles,
    client: {
      async getBranch({ branch }) {
        calls.push(['getBranch', branch]);
        if (branch === 'main') return { ok: true, status: 'OK', payload: { commit: { sha: baseSha } } };
        return branchSha ? { ok: true, status: 'OK', payload: { commit: { sha: branchSha } } } : { ok: true, status: 'NOT_FOUND', payload: null };
      },
      async getCommit({ sha }) { calls.push(['getCommit', sha]); return { ok: true, payload: { tree: { sha: BASE_TREE } } }; },
      async getTree() {
        calls.push(['getTree']);
        return { ok: true, payload: { truncated: false, tree: [{ path: 'src/example.mjs', mode: '100644', type: 'blob', sha: '1'.repeat(40) }] } };
      },
      async getFile({ ref, path }) {
        calls.push(['getFile', ref, path]);
        return filePayload(ref === BASE ? baseFiles : candidateFiles, path);
      },
      async createBlob({ content }) {
        blobCount += 1;
        calls.push(['createBlob', blobCount]);
        if (failBlobAt === blobCount) return { ok: false, status: 'UNAVAILABLE', reasonCodes: ['forced-blob-failure'] };
        const sha = String(blobCount).repeat(40).slice(0, 40);
        blobs.set(sha, content);
        return { ok: true, payload: { sha } };
      },
      async createTree({ entries }) {
        calls.push(['createTree']);
        for (const entry of entries) {
          if (entry.sha == null) candidateFiles.delete(entry.path);
          else candidateFiles.set(entry.path, blobs.get(entry.sha));
        }
        return { ok: true, payload: { sha: CANDIDATE_TREE } };
      },
      async createCommit() { calls.push(['createCommit']); return { ok: true, payload: { sha: CANDIDATE_COMMIT } }; },
      async createBranch({ branch, sha }) {
        calls.push(['createBranch', branch, sha]);
        if (branchSha) return { ok: false, status: 'REJECTED', reasonCodes: ['github-validation-failed'] };
        branchSha = sha;
        return { ok: true, payload: { ref: `refs/heads/${branch}` } };
      },
      async listPullRequests() { calls.push(['listPullRequests']); return { ok: true, payload: [] }; },
      async createPullRequest({ head, base }) {
        calls.push(['createPullRequest', head, base]);
        return { ok: true, payload: { number: 398, state: 'open', head: { ref: head }, base: { ref: base }, html_url: 'https://github.com/mohammedwessam2007/uberbondd/pull/398' } };
      }
    }
  };
}

function invoke(adapter, changeSet, auth = authority()) {
  return adapter({
    task: { taskId: 'task_maintain_1', objective: 'Repair example.' }, repository: 'mohammedwessam2007/uberbondd',
    authority: auth, changeSet, verifiedReceipt: { selfMaintenanceReceiptId: 'self_maint_1', changeSetId: changeSet.changeSetId }
  });
}

test('verified change set becomes one atomic Git commit on a review branch, never a base write or merge', async () => {
  const changeSet = candidate();
  const github = fakeGithub();
  const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => NOW });
  const result = await invoke(adapter, changeSet);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PR_OPENED_REVIEW_REQUIRED');
  assert.equal(result.atomicPromotion, true);
  assert.equal(result.repositoryWrites, 1);
  assert.equal(result.mergeAuthority, 'NONE');
  assert.equal(result.deploymentAuthority, 'NONE');
  assert.equal(github.candidateFiles.get('src/example.mjs'), AFTER);
  assert.equal(github.calls.filter(([name]) => name === 'createCommit').length, 1);
  assert.equal(github.calls.filter(([name]) => name === 'createBranch').length, 1);
  assert.equal(github.calls.filter(([name]) => name === 'createPullRequest').length, 1);
});

test('base drift blocks before blob/tree/commit/ref creation', async () => {
  const changeSet = candidate();
  const github = fakeGithub({ baseSha: 'e'.repeat(40) });
  const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => NOW });
  const result = await invoke(adapter, changeSet);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'STALE_BASE');
  assert.equal(github.calls.some(([name]) => ['createBlob', 'createTree', 'createCommit', 'createBranch'].includes(name)), false);
});

test('expired, widened, or wrong-repository authority cannot create Git objects', async () => {
  for (const auth of [
    authority({ expiresAt: '2026-09-05T11:59:59.000Z' }),
    authority({ scope: 'BRANCH_PR_AND_MERGE' }),
    authority({ repository: 'someone/else' })
  ]) {
    const github = fakeGithub();
    const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => NOW });
    const result = await invoke(adapter, candidate(), auth);
    assert.equal(result.ok, false);
    assert.equal(github.calls.length, 0);
  }
});

test('before-hash mismatch blocks before candidate Git object creation', async () => {
  const github = fakeGithub({ initial: 'export const value = 777;\n' });
  const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => NOW });
  const result = await invoke(adapter, candidate());
  assert.equal(result.ok, false);
  assert.equal(result.status, 'STALE_BASE');
  assert.equal(github.calls.some(([name]) => ['createBlob', 'createTree', 'createCommit', 'createBranch', 'createPullRequest'].includes(name)), false);
});

test('blob failure leaves no branch and no PR, eliminating half-written review branches', async () => {
  const secondBefore = 'export const other = 1;\n';
  const changeSet = candidate({ changes: [
    { operation: 'UPDATE', path: 'src/example.mjs', beforeSha256: contentSha256(BEFORE), content: AFTER, rationale: 'First repair.' },
    { operation: 'CREATE', path: 'src/other.mjs', content: secondBefore, rationale: 'Second safe file.' }
  ] });
  const github = fakeGithub({ failBlobAt: 2 });
  const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => NOW });
  const result = await invoke(adapter, changeSet);
  assert.equal(result.ok, false);
  assert.equal(github.calls.some(([name]) => name === 'createBranch'), false);
  assert.equal(github.calls.some(([name]) => name === 'createPullRequest'), false);
});

test('same atomic commit on an existing deterministic branch is idempotent, a different commit is a collision', async () => {
  for (const [existing, expectedOk] of [[CANDIDATE_COMMIT, true], ['f'.repeat(40), false]]) {
    const github = fakeGithub({ preexistingBranchSha: existing });
    const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => NOW });
    const result = await invoke(adapter, candidate());
    assert.equal(result.ok, expectedOk);
    if (!expectedOk) assert.ok(result.reasonCodes.includes('self-maintenance-branch-collision-or-create-failure'));
  }
});

test('unverified receipt cannot promote an otherwise valid change set', async () => {
  const changeSet = candidate();
  const github = fakeGithub();
  const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => NOW });
  const result = await adapter({
    task: { taskId: 'task_maintain_1', objective: 'Repair example.' }, repository: 'mohammedwessam2007/uberbondd', authority: authority(),
    changeSet, verifiedReceipt: { selfMaintenanceReceiptId: null, changeSetId: changeSet.changeSetId }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('verified-self-maintenance-receipt-required'));
  assert.equal(github.calls.length, 0);
});
