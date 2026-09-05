import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAgentCodeChangeSet,
  contentSha256
} from '../src/agent-code-change-contract.mjs';
import { createGithubSelfMaintainerPromotionAdapter } from '../src/github-self-maintainer-promotion.mjs';

const BASE = 'a'.repeat(40);
const BEFORE = 'export const value = 1;\n';
const AFTER = 'export const value = 2;\n';

function candidate() {
  return compileAgentCodeChangeSet({
    taskId: 'task_maintain_1',
    baseRevision: BASE,
    summary: 'Change a harmless module.',
    consequenceClass: 'LOCAL_PREPARATION',
    verification: ['node --check src/example.mjs'],
    changes: [{
      operation: 'UPDATE',
      path: 'src/example.mjs',
      beforeSha256: contentSha256(BEFORE),
      content: AFTER,
      rationale: 'Regression repair.'
    }]
  });
}

function authority(overrides = {}) {
  return {
    status: 'AUTHORIZED',
    scope: 'BRANCH_AND_PR_ONLY',
    repository: 'mohammedwessam2007/uberbondd',
    baseRevision: BASE,
    expiresAt: '2026-09-06T00:00:00.000Z',
    evidenceRefs: ['audit:owner-repository-maintenance-authority'],
    ...overrides
  };
}

function fakeGithub({ baseSha = BASE, initial = BEFORE } = {}) {
  const files = new Map([['src/example.mjs', initial]]);
  const calls = [];
  return {
    calls,
    files,
    client: {
      async getBranch({ branch }) {
        calls.push(['getBranch', branch]);
        return { ok: true, payload: { commit: { sha: baseSha } } };
      },
      async createBranch({ branch, sha }) {
        calls.push(['createBranch', branch, sha]);
        return { ok: true, payload: { ref: `refs/heads/${branch}` } };
      },
      async getFile({ path }) {
        calls.push(['getFile', path]);
        if (!files.has(path)) return { ok: true, status: 'NOT_FOUND', payload: null };
        return {
          ok: true,
          status: 'OK',
          payload: {
            type: 'file',
            sha: `blob-${path}`,
            content: Buffer.from(files.get(path), 'utf8').toString('base64')
          }
        };
      },
      async putFile({ path, content }) {
        calls.push(['putFile', path]);
        files.set(path, content);
        return { ok: true, payload: { content: { sha: `after-${path}` } } };
      },
      async deleteFile({ path }) {
        calls.push(['deleteFile', path]);
        files.delete(path);
        return { ok: true, payload: { commit: { sha: 'delete-commit' } } };
      },
      async createPullRequest({ head, base }) {
        calls.push(['createPullRequest', head, base]);
        return { ok: true, payload: { number: 398, html_url: 'https://github.com/mohammedwessam2007/uberbondd/pull/398' } };
      }
    }
  };
}

test('verified change set is promoted to a fresh branch and PR, never merged', async () => {
  const changeSet = candidate();
  assert.equal(changeSet.ok, true);
  const github = fakeGithub();
  const adapter = createGithubSelfMaintainerPromotionAdapter({
    githubClient: github.client,
    env: {},
    date: () => new Date('2026-09-05T12:00:00.000Z')
  });
  const result = await adapter({
    task: { taskId: 'task_maintain_1', objective: 'Repair example.' },
    repository: 'mohammedwessam2007/uberbondd',
    authority: authority(),
    changeSet,
    verifiedReceipt: { selfMaintenanceReceiptId: 'self_maint_1', changeSetId: changeSet.changeSetId }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PR_OPENED_REVIEW_REQUIRED');
  assert.equal(result.mergeAuthority, 'NONE');
  assert.equal(result.deploymentAuthority, 'NONE');
  assert.equal(result.repositoryWrites, 1);
  assert.equal(github.files.get('src/example.mjs'), AFTER);
  assert.equal(github.calls.filter(([name]) => name === 'createPullRequest').length, 1);
});

test('base branch drift blocks before any repository write', async () => {
  const changeSet = candidate();
  const github = fakeGithub({ baseSha: 'b'.repeat(40) });
  const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => new Date('2026-09-05T12:00:00.000Z') });
  const result = await adapter({
    task: { taskId: 'task_maintain_1', objective: 'Repair example.' },
    repository: 'mohammedwessam2007/uberbondd',
    authority: authority(),
    changeSet,
    verifiedReceipt: { selfMaintenanceReceiptId: 'self_maint_1', changeSetId: changeSet.changeSetId }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'STALE_BASE');
  assert.equal(github.calls.some(([name]) => name === 'createBranch'), false);
  assert.equal(github.calls.some(([name]) => name === 'putFile'), false);
});

test('expired or widened authority cannot create a branch', async () => {
  for (const auth of [
    authority({ expiresAt: '2026-09-05T11:59:59.000Z' }),
    authority({ scope: 'BRANCH_PR_AND_MERGE' }),
    authority({ repository: 'someone/else' })
  ]) {
    const github = fakeGithub();
    const changeSet = candidate();
    const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => new Date('2026-09-05T12:00:00.000Z') });
    const result = await adapter({
      task: { taskId: 'task_maintain_1', objective: 'Repair example.' },
      repository: 'mohammedwessam2007/uberbondd',
      authority: auth,
      changeSet,
      verifiedReceipt: { selfMaintenanceReceiptId: 'self_maint_1', changeSetId: changeSet.changeSetId }
    });
    assert.equal(result.ok, false);
    assert.equal(github.calls.some(([name]) => name === 'createBranch'), false);
  }
});

test('before-hash mismatch blocks promotion before file write', async () => {
  const changeSet = candidate();
  const github = fakeGithub({ initial: 'export const value = 777;\n' });
  const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => new Date('2026-09-05T12:00:00.000Z') });
  const result = await adapter({
    task: { taskId: 'task_maintain_1', objective: 'Repair example.' },
    repository: 'mohammedwessam2007/uberbondd',
    authority: authority(),
    changeSet,
    verifiedReceipt: { selfMaintenanceReceiptId: 'self_maint_1', changeSetId: changeSet.changeSetId }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'STALE_BASE');
  assert.equal(github.calls.some(([name]) => name === 'putFile'), false);
  assert.equal(github.calls.some(([name]) => name === 'createPullRequest'), false);
});

test('unverified receipt cannot promote an otherwise valid change set', async () => {
  const changeSet = candidate();
  const github = fakeGithub();
  const adapter = createGithubSelfMaintainerPromotionAdapter({ githubClient: github.client, env: {}, date: () => new Date('2026-09-05T12:00:00.000Z') });
  const result = await adapter({
    task: { taskId: 'task_maintain_1', objective: 'Repair example.' },
    repository: 'mohammedwessam2007/uberbondd',
    authority: authority(),
    changeSet,
    verifiedReceipt: { selfMaintenanceReceiptId: null, changeSetId: changeSet.changeSetId }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('verified-self-maintenance-receipt-required'));
  assert.equal(github.calls.length, 0);
});
