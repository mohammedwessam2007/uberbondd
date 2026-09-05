import crypto from 'node:crypto';
import {
  validateAgentCodeChangeSet,
  contentSha256
} from './agent-code-change-contract.mjs';

export const GITHUB_SELF_MAINTAINER_PROMOTION_POLICY_VERSION = 'github-self-maintainer-promotion-1.0.0';

const MAX_RESPONSE_BYTES = 500_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/;

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: GITHUB_SELF_MAINTAINER_PROMOTION_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text(value, 300));
  return match ? { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` } : null;
}

function slug(value) {
  return text(value, 100).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'change';
}

function deterministicBranch(task, changeSet) {
  return `uberbond/self-maintain/${slug(task?.taskId)}-${String(changeSet?.changeSetId || '').replace(/[^A-Za-z0-9]/g, '').slice(-12).toLowerCase()}`;
}

function encodePath(value) {
  return String(value || '').split('/').map(part => encodeURIComponent(part)).join('/');
}

function base64Utf8(value) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
}

function decodeBase64(value) {
  try { return Buffer.from(String(value || '').replace(/\s/g, ''), 'base64').toString('utf8'); }
  catch { return null; }
}

async function boundedPayload(response) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('github-response-too-large');
  const raw = String(await response.text());
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('github-response-too-large');
  if (!raw) return null;
  return JSON.parse(raw);
}

function makeRestClient({ token, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'UberBond-Self-Maintainer'
  };

  async function request(method, pathname, body, { allow404 = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${pathname}`, {
        method,
        signal: controller.signal,
        headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
      return fail([error?.name === 'AbortError' ? 'github-request-timeout' : 'github-network-failure'], 'UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }

    if (allow404 && response?.status === 404) return { ok: true, status: 'NOT_FOUND', payload: null };
    let payload = null;
    try { payload = await boundedPayload(response); }
    catch { return fail(['github-response-invalid'], 'UNAVAILABLE'); }
    if (!response?.ok) {
      const code = response?.status === 401 ? 'github-unauthorized'
        : response?.status === 403 ? 'github-forbidden'
          : response?.status === 404 ? 'github-not-found'
            : response?.status === 422 ? 'github-validation-failed'
              : response?.status >= 500 ? 'github-upstream-failure'
                : 'github-http-failure';
      return fail([code], response?.status >= 500 ? 'UNAVAILABLE' : 'REJECTED');
    }
    return { ok: true, status: 'OK', payload };
  }

  return Object.freeze({
    getBranch: ({ owner, repo, branch }) => request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`),
    createBranch: ({ owner, repo, branch, sha }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, { ref: `refs/heads/${branch}`, sha }),
    getFile: ({ owner, repo, branch, path }) => request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, undefined, { allow404: true }),
    putFile: ({ owner, repo, branch, path, content, message, sha }) => request('PUT', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`, {
      message,
      content: base64Utf8(content),
      branch,
      ...(sha ? { sha } : {})
    }),
    deleteFile: ({ owner, repo, branch, path, message, sha }) => request('DELETE', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}`, { message, branch, sha }),
    createPullRequest: ({ owner, repo, head, base, title, body }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, { head, base, title, body, maintainer_can_modify: false })
  });
}

function authorityReasons(authority, repository, baseRevision, now = new Date()) {
  const reasons = [];
  if (!authority || String(authority.status || '').toUpperCase() !== 'AUTHORIZED') reasons.push('branch-pr-authority-required');
  if (String(authority?.scope || '').toUpperCase() !== 'BRANCH_AND_PR_ONLY') reasons.push('branch-pr-only-authority-required');
  if (text(authority?.repository, 300) !== repository) reasons.push('authority-repository-mismatch');
  if (text(authority?.baseRevision, 160) !== baseRevision) reasons.push('authority-base-revision-mismatch');
  const expires = new Date(authority?.expiresAt || 0);
  if (Number.isNaN(expires.getTime()) || expires <= now) reasons.push('branch-pr-authority-expired');
  return reasons;
}

function currentContent(fileResult) {
  if (!fileResult?.ok) return { ok: false, reasonCodes: fileResult?.reasonCodes || ['github-file-read-failed'] };
  if (fileResult.status === 'NOT_FOUND') return { ok: true, exists: false, sha: null, content: null };
  const payload = fileResult.payload;
  if (!payload || Array.isArray(payload) || payload.type !== 'file' || !payload.sha) return { ok: false, reasonCodes: ['github-file-payload-invalid'] };
  const content = decodeBase64(payload.content);
  if (content == null) return { ok: false, reasonCodes: ['github-file-base64-invalid'] };
  return { ok: true, exists: true, sha: payload.sha, content };
}

async function verifyBranchFile(client, repo, branch, change) {
  const read = currentContent(await client.getFile({ ...repo, branch, path: change.path }));
  if (!read.ok) return read;
  if (change.operation === 'DELETE') {
    return read.exists ? { ok: false, reasonCodes: [`post-promotion-delete-still-present:${change.path}`] } : { ok: true };
  }
  if (!read.exists) return { ok: false, reasonCodes: [`post-promotion-file-missing:${change.path}`] };
  if (contentSha256(read.content) !== change.afterSha256) return { ok: false, reasonCodes: [`post-promotion-hash-mismatch:${change.path}`] };
  return { ok: true };
}

/**
 * Promote an already verified self-maintenance change set to a fresh GitHub
 * branch and PR. This adapter never writes the base branch and never merges.
 */
export function createGithubSelfMaintainerPromotionAdapter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  githubClient = null,
  baseBranch = 'main',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  date = () => new Date()
} = {}) {
  const configuredRepository = parseRepository(env.GITHUB_REPOSITORY);
  const token = String(env.GITHUB_TOKEN || '');
  const client = githubClient || (configuredRepository && token && typeof fetchImpl === 'function'
    ? makeRestClient({ token, fetchImpl, timeoutMs })
    : null);

  return async function promote({ task, repository, authority, changeSet, verifiedReceipt } = {}) {
    const repo = parseRepository(repository || configuredRepository?.fullName);
    const validation = validateAgentCodeChangeSet(changeSet);
    const reasons = [];
    if (!repo) reasons.push('valid-github-repository-required');
    if (!client) reasons.push('github-promotion-client-not-configured');
    if (!validation.ok) reasons.push(...(validation.reasonCodes || ['validated-change-set-required']));
    if (!verifiedReceipt?.selfMaintenanceReceiptId || verifiedReceipt.changeSetId !== changeSet?.changeSetId) reasons.push('verified-self-maintenance-receipt-required');
    if (!/^[a-f0-9]{40}$/i.test(String(changeSet?.baseRevision || ''))) reasons.push('exact-git-base-revision-required');
    if (repo) reasons.push(...authorityReasons(authority, repo.fullName, changeSet?.baseRevision, date()));
    if (reasons.length) return fail(reasons, 'PROMOTION_BLOCKED');

    const base = await client.getBranch({ ...repo, branch: baseBranch });
    if (!base?.ok) return base;
    const observedBaseSha = text(base.payload?.commit?.sha, 160);
    if (observedBaseSha !== changeSet.baseRevision) {
      return fail(['base-branch-advanced-revalidation-required'], 'STALE_BASE', { observedBaseSha });
    }

    const branch = deterministicBranch(task, changeSet);
    if (!SAFE_BRANCH.test(branch) || branch === baseBranch) return fail(['safe-self-maintenance-branch-required']);
    const created = await client.createBranch({ ...repo, branch, sha: observedBaseSha });
    if (!created?.ok) return created;

    let repositoryWrites = 0;
    for (const change of changeSet.changes) {
      const before = currentContent(await client.getFile({ ...repo, branch, path: change.path }));
      if (!before.ok) return fail(before.reasonCodes, 'PROMOTION_BLOCKED', { branch });
      if (change.operation === 'CREATE') {
        if (before.exists) return fail([`create-target-already-exists:${change.path}`], 'PROMOTION_BLOCKED', { branch });
        const write = await client.putFile({ ...repo, branch, path: change.path, content: change.content, message: `UberBond self-maintain: create ${change.path}` });
        if (!write?.ok) return write;
      } else if (change.operation === 'UPDATE') {
        if (!before.exists || contentSha256(before.content) !== change.beforeSha256) return fail([`before-hash-mismatch:${change.path}`], 'STALE_BASE', { branch });
        const write = await client.putFile({ ...repo, branch, path: change.path, content: change.content, message: `UberBond self-maintain: update ${change.path}`, sha: before.sha });
        if (!write?.ok) return write;
      } else if (change.operation === 'DELETE') {
        if (!before.exists || contentSha256(before.content) !== change.beforeSha256) return fail([`before-hash-mismatch:${change.path}`], 'STALE_BASE', { branch });
        const write = await client.deleteFile({ ...repo, branch, path: change.path, message: `UberBond self-maintain: delete ${change.path}`, sha: before.sha });
        if (!write?.ok) return write;
      }
      repositoryWrites += 1;
      const post = await verifyBranchFile(client, repo, branch, change);
      if (!post.ok) return fail(post.reasonCodes, 'PROMOTION_BLOCKED', { branch });
    }

    const title = `UberBond self-maintenance: ${text(task?.objective, 80) || task?.taskId}`;
    const body = [
      'Generated by UberBond Self-Maintainer from a zero-network, credential-free verified change set.',
      '',
      `Task: ${task?.taskId}`,
      `Base: ${changeSet.baseRevision}`,
      `Change set: ${changeSet.changeSetId}`,
      `Self-maintenance receipt: ${verifiedReceipt.selfMaintenanceReceiptId}`,
      '',
      'This PR has NOT been merged or deployed. Independent review and exact-head verification remain required.'
    ].join('\n');
    const pr = await client.createPullRequest({ ...repo, head: branch, base: baseBranch, title, body });
    if (!pr?.ok || !Number.isSafeInteger(Number(pr.payload?.number))) return fail(pr?.reasonCodes || ['github-pr-creation-failed'], 'PROMOTION_BLOCKED', { branch });

    return {
      ok: true,
      policyVersion: GITHUB_SELF_MAINTAINER_PROMOTION_POLICY_VERSION,
      status: 'PR_OPENED_REVIEW_REQUIRED',
      repository: repo.fullName,
      branch,
      baseBranch,
      baseRevision: observedBaseSha,
      prNumber: Number(pr.payload.number),
      prUrl: text(pr.payload.html_url, 1000) || null,
      repositoryBranchesCreated: 1,
      repositoryPullRequestsCreated: 1,
      repositoryWrites,
      mergeAuthority: 'NONE',
      deploymentAuthority: 'NONE',
      businessEffectAuthority: 'NONE'
    };
  };
}
