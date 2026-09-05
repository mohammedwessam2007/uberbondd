import {
  validateAgentCodeChangeSet,
  contentSha256
} from './agent-code-change-contract.mjs';

export const GITHUB_SELF_MAINTAINER_PROMOTION_POLICY_VERSION = 'github-self-maintainer-promotion-1.1.0';

const MAX_RESPONSE_BYTES = 2_000_000;
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
      return fail([code], response?.status >= 500 ? 'UNAVAILABLE' : 'REJECTED', { httpStatus: Number(response?.status || 0) || null });
    }
    return { ok: true, status: 'OK', payload };
  }

  return Object.freeze({
    getBranch: ({ owner, repo, branch }) => request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`, undefined, { allow404: true }),
    getCommit: ({ owner, repo, sha }) => request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(sha)}`),
    getTree: ({ owner, repo, sha }) => request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`),
    getFile: ({ owner, repo, ref, path }) => request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`, undefined, { allow404: true }),
    createBlob: ({ owner, repo, content }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`, { content, encoding: 'utf-8' }),
    createTree: ({ owner, repo, baseTree, entries }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`, { base_tree: baseTree, tree: entries }),
    createCommit: ({ owner, repo, message, tree, parent }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`, { message, tree, parents: [parent] }),
    createBranch: ({ owner, repo, branch, sha }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, { ref: `refs/heads/${branch}`, sha }),
    listPullRequests: ({ owner, repo, head, base }) => {
      const query = new URLSearchParams({ state: 'open', head: `${owner}:${head}`, base, per_page: '20' });
      return request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${query}`);
    },
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
  if (!payload || Array.isArray(payload) || payload.type !== 'file' || !payload.sha || payload.encoding !== 'base64') {
    return { ok: false, reasonCodes: ['github-file-payload-invalid'] };
  }
  const content = decodeBase64(payload.content);
  if (content == null) return { ok: false, reasonCodes: ['github-file-base64-invalid'] };
  return { ok: true, exists: true, sha: payload.sha, content };
}

function treeEntryMap(treeResult) {
  if (!treeResult?.ok || !Array.isArray(treeResult.payload?.tree) || treeResult.payload?.truncated === true) {
    return { ok: false, reasonCodes: ['complete-base-git-tree-required'] };
  }
  return {
    ok: true,
    entries: new Map(treeResult.payload.tree.map(entry => [entry.path, entry]))
  };
}

async function verifyBranchFile(client, repo, branch, change) {
  const read = currentContent(await client.getFile({ ...repo, ref: branch, path: change.path }));
  if (!read.ok) return read;
  if (change.operation === 'DELETE') {
    return read.exists ? { ok: false, reasonCodes: [`post-promotion-delete-still-present:${change.path}`] } : { ok: true };
  }
  if (!read.exists) return { ok: false, reasonCodes: [`post-promotion-file-missing:${change.path}`] };
  if (contentSha256(read.content) !== change.afterSha256) return { ok: false, reasonCodes: [`post-promotion-hash-mismatch:${change.path}`] };
  return { ok: true };
}

async function findExactOpenPr(client, repo, branch, baseBranch) {
  const listed = await client.listPullRequests({ ...repo, head: branch, base: baseBranch });
  if (!listed?.ok || !Array.isArray(listed.payload)) return null;
  return listed.payload.find(pr => pr?.head?.ref === branch && pr?.base?.ref === baseBranch && String(pr?.state || '').toLowerCase() === 'open') || null;
}

/**
 * Promote an already verified self-maintenance change set to one atomic Git
 * commit on a fresh review branch, then open a PR. The base branch is never
 * written and this adapter has no merge endpoint.
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
    if (!base?.ok || base.status === 'NOT_FOUND') return fail(base?.reasonCodes || ['base-branch-required'], 'PROMOTION_BLOCKED');
    const observedBaseSha = text(base.payload?.commit?.sha, 160);
    if (observedBaseSha !== changeSet.baseRevision) {
      return fail(['base-branch-advanced-revalidation-required'], 'STALE_BASE', { observedBaseSha });
    }

    const commit = await client.getCommit({ ...repo, sha: observedBaseSha });
    const baseTreeSha = text(commit?.payload?.tree?.sha, 160);
    if (!commit?.ok || !/^[a-f0-9]{40}$/i.test(baseTreeSha)) return fail(commit?.reasonCodes || ['base-tree-identity-required'], 'PROMOTION_BLOCKED');
    const tree = treeEntryMap(await client.getTree({ ...repo, sha: baseTreeSha }));
    if (!tree.ok) return fail(tree.reasonCodes, 'PROMOTION_BLOCKED');

    const atomicEntries = [];
    let blobsCreated = 0;
    for (const change of changeSet.changes) {
      const before = currentContent(await client.getFile({ ...repo, ref: observedBaseSha, path: change.path }));
      if (!before.ok) return fail(before.reasonCodes, 'PROMOTION_BLOCKED');
      const existing = tree.entries.get(change.path) || null;

      if (change.operation === 'CREATE') {
        if (before.exists || existing) return fail([`create-target-already-exists:${change.path}`], 'PROMOTION_BLOCKED');
        const blob = await client.createBlob({ ...repo, content: change.content });
        const blobSha = text(blob?.payload?.sha, 160);
        if (!blob?.ok || !/^[a-f0-9]{40}$/i.test(blobSha)) return fail(blob?.reasonCodes || [`blob-create-failed:${change.path}`], 'PROMOTION_BLOCKED');
        atomicEntries.push({ path: change.path, mode: '100644', type: 'blob', sha: blobSha });
        blobsCreated += 1;
        continue;
      }

      if (!before.exists || contentSha256(before.content) !== change.beforeSha256) {
        return fail([`before-hash-mismatch:${change.path}`], 'STALE_BASE');
      }
      if (!existing || existing.type !== 'blob' || !['100644', '100755'].includes(existing.mode)) {
        return fail([`base-tree-regular-file-required:${change.path}`], 'PROMOTION_BLOCKED');
      }
      if (change.operation === 'DELETE') {
        atomicEntries.push({ path: change.path, mode: existing.mode, type: 'blob', sha: null });
        continue;
      }

      const blob = await client.createBlob({ ...repo, content: change.content });
      const blobSha = text(blob?.payload?.sha, 160);
      if (!blob?.ok || !/^[a-f0-9]{40}$/i.test(blobSha)) return fail(blob?.reasonCodes || [`blob-create-failed:${change.path}`], 'PROMOTION_BLOCKED');
      atomicEntries.push({ path: change.path, mode: existing.mode, type: 'blob', sha: blobSha });
      blobsCreated += 1;
    }

    const createdTree = await client.createTree({ ...repo, baseTree: baseTreeSha, entries: atomicEntries });
    const candidateTreeSha = text(createdTree?.payload?.sha, 160);
    if (!createdTree?.ok || !/^[a-f0-9]{40}$/i.test(candidateTreeSha)) return fail(createdTree?.reasonCodes || ['atomic-tree-create-failed'], 'PROMOTION_BLOCKED');

    const createdCommit = await client.createCommit({
      ...repo,
      message: `UberBond self-maintenance: ${text(task?.objective, 120) || task?.taskId}`,
      tree: candidateTreeSha,
      parent: observedBaseSha
    });
    const candidateCommitSha = text(createdCommit?.payload?.sha, 160);
    if (!createdCommit?.ok || !/^[a-f0-9]{40}$/i.test(candidateCommitSha)) return fail(createdCommit?.reasonCodes || ['atomic-commit-create-failed'], 'PROMOTION_BLOCKED');

    const branch = deterministicBranch(task, changeSet);
    if (!SAFE_BRANCH.test(branch) || branch === baseBranch) return fail(['safe-self-maintenance-branch-required']);
    const createdBranch = await client.createBranch({ ...repo, branch, sha: candidateCommitSha });
    if (!createdBranch?.ok) {
      const existingBranch = await client.getBranch({ ...repo, branch });
      const existingSha = existingBranch?.ok && existingBranch.status !== 'NOT_FOUND' ? text(existingBranch.payload?.commit?.sha, 160) : '';
      if (existingSha !== candidateCommitSha) {
        return fail(['self-maintenance-branch-collision-or-create-failure'], 'PROMOTION_BLOCKED', {
          branch,
          candidateCommitSha,
          existingSha: existingSha || null,
          branchEffect: 'NONE_OR_PREEXISTING_ONLY'
        });
      }
    }

    for (const change of changeSet.changes) {
      const post = await verifyBranchFile(client, repo, branch, change);
      if (!post.ok) return fail(post.reasonCodes, 'PROMOTION_BLOCKED', {
        branch,
        candidateCommitSha,
        branchEffect: 'ATOMIC_COMMIT_PRESENT_PR_NOT_CREATED'
      });
    }

    const title = `UberBond self-maintenance: ${text(task?.objective, 80) || task?.taskId}`;
    const body = [
      'Generated by UberBond Self-Maintainer from a zero-network, credential-free verified change set.',
      '',
      `Task: ${task?.taskId}`,
      `Base: ${changeSet.baseRevision}`,
      `Candidate commit: ${candidateCommitSha}`,
      `Change set: ${changeSet.changeSetId}`,
      `Self-maintenance receipt: ${verifiedReceipt.selfMaintenanceReceiptId}`,
      '',
      'This PR has NOT been merged or deployed. Independent review and exact-head verification remain required.'
    ].join('\n');

    let pr = await client.createPullRequest({ ...repo, head: branch, base: baseBranch, title, body });
    if (!pr?.ok) {
      const existingPr = await findExactOpenPr(client, repo, branch, baseBranch);
      if (!existingPr) {
        return fail(pr?.reasonCodes || ['github-pr-creation-failed'], 'BRANCH_READY_PR_BLOCKED', {
          branch,
          candidateCommitSha,
          branchEffect: 'ATOMIC_COMMIT_PRESENT_PR_NOT_CREATED'
        });
      }
      pr = { ok: true, payload: existingPr, idempotentReuse: true };
    }
    if (!Number.isSafeInteger(Number(pr.payload?.number))) return fail(['github-pr-number-required'], 'BRANCH_READY_PR_BLOCKED', { branch, candidateCommitSha });

    return {
      ok: true,
      policyVersion: GITHUB_SELF_MAINTAINER_PROMOTION_POLICY_VERSION,
      status: pr.idempotentReuse ? 'PR_REUSED_REVIEW_REQUIRED' : 'PR_OPENED_REVIEW_REQUIRED',
      repository: repo.fullName,
      branch,
      baseBranch,
      baseRevision: observedBaseSha,
      candidateCommitSha,
      candidateTreeSha,
      prNumber: Number(pr.payload.number),
      prUrl: text(pr.payload.html_url, 1000) || null,
      repositoryBranchesCreated: createdBranch?.ok ? 1 : 0,
      repositoryPullRequestsCreated: pr.idempotentReuse ? 0 : 1,
      repositoryWrites: 1,
      blobsCreated,
      atomicPromotion: true,
      mergeAuthority: 'NONE',
      deploymentAuthority: 'NONE',
      businessEffectAuthority: 'NONE'
    };
  };
}
