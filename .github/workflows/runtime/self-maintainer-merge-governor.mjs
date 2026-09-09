#!/usr/bin/env node

import { compileAgentCodeChangeSet, contentSha256 } from '../../../src/agent-code-change-contract.mjs';

export const SELF_MAINTAINER_MERGE_GOVERNOR_VERSION = 'uberbond.self-maintainer-merge-governor.v1.1';

const EXACT_SHA = /^[a-f0-9]{40}$/i;
const BRANCH_PREFIX = 'uberbond/self-maintain/';
const MAX_RESPONSE_BYTES = 2_000_000;

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, status = 'MERGE_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_MERGE_GOVERNOR_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    repositoryMergeAuthority: 'WITHHELD',
    ...extra
  };
}

function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text(value, 300));
  return match ? { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` } : null;
}

function parsePromotionBody(body) {
  const raw = String(body || '');
  const taskId = raw.match(/^Task:\s*(\S+)\s*$/mi)?.[1] || '';
  const baseRevision = raw.match(/^Base:\s*([a-f0-9]{40})\s*$/mi)?.[1]?.toLowerCase() || '';
  const candidateCommit = raw.match(/^Candidate commit:\s*([a-f0-9]{40})\s*$/mi)?.[1]?.toLowerCase() || '';
  const changeSetId = raw.match(/^Change set:\s*(agent_changes_[a-f0-9]{24})\s*$/mi)?.[1] || '';
  const selfMaintenanceReceiptId = raw.match(/^Self-maintenance receipt:\s*(self_maint_[a-f0-9]{24})\s*$/mi)?.[1] || '';
  return { taskId, baseRevision, candidateCommit, changeSetId, selfMaintenanceReceiptId };
}

function makeClient({ token, repository, fetchImpl = globalThis.fetch } = {}) {
  async function request(method, pathname, body, { allow404 = false } = {}) {
    const response = await fetchImpl(`https://api.github.com${pathname}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        'user-agent': 'UberBond-Self-Maintainer-Merge-Governor',
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000)
    });
    if (allow404 && response.status === 404) return { ok: true, status: 'NOT_FOUND', payload: null };
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) return { ok: false, reasonCodes: ['github-response-too-large'] };
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; }
    catch { return { ok: false, reasonCodes: ['github-json-invalid'] }; }
    if (!response.ok) return { ok: false, reasonCodes: [`github-http-${response.status}`], payload };
    return { ok: true, status: 'OK', payload };
  }
  const prefix = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  return Object.freeze({
    getPullRequest: number => request('GET', `${prefix}/pulls/${number}`),
    getMainBranch: () => request('GET', `${prefix}/branches/main`),
    getPullCommits: number => request('GET', `${prefix}/pulls/${number}/commits?per_page=100`),
    getPullFiles: number => request('GET', `${prefix}/pulls/${number}/files?per_page=100`),
    getContent: (filePath, ref) => request('GET', `${prefix}/contents/${String(filePath).split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, undefined, { allow404: true }),
    mergePullRequest: (number, sha) => request('PUT', `${prefix}/pulls/${number}/merge`, {
      sha,
      merge_method: 'merge',
      commit_title: `UberBond autonomous verified maintenance (#${number})`,
      commit_message: 'Merged by the independent UberBond self-maintainer merge governor after exact-head read-only verification.'
    })
  });
}

function decodeContent(result, expectedState) {
  if (!result?.ok) return { ok: false, reasonCodes: result?.reasonCodes || ['github-content-read-failed'] };
  if (result.status === 'NOT_FOUND') return expectedState === 'ABSENT'
    ? { ok: true, exists: false, content: null }
    : { ok: false, reasonCodes: ['expected-github-content-missing'] };
  const payload = result.payload;
  if (!payload || Array.isArray(payload) || payload.type !== 'file' || payload.encoding !== 'base64') {
    return { ok: false, reasonCodes: ['regular-base64-github-file-required'] };
  }
  let content;
  try { content = Buffer.from(String(payload.content || '').replace(/\s/g, ''), 'base64').toString('utf8'); }
  catch { return { ok: false, reasonCodes: ['github-file-base64-invalid'] }; }
  return { ok: true, exists: true, content };
}

function existingTestMutation(filePath, status) {
  return String(filePath || '').startsWith('tests/') && status !== 'added';
}

export async function governVerifiedSelfMaintainerMerge({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const repository = parseRepository(env.GITHUB_REPOSITORY);
  const token = String(env.GITHUB_TOKEN || '');
  const verificationMode = text(env.UBERBOND_VERIFICATION_MODE, 40).toUpperCase();
  const verificationJobResult = text(env.UBERBOND_VERIFICATION_JOB_RESULT, 40).toLowerCase();
  const prNumber = Number(env.UBERBOND_PR_NUMBER || 0);
  const expectedHead = text(env.UBERBOND_VERIFY_HEAD_SHA, 80).toLowerCase();
  const expectedBase = text(env.UBERBOND_VERIFY_BASE_SHA, 80).toLowerCase();
  const reasons = [];
  if (!repository) reasons.push('github-repository-required');
  if (!token) reasons.push('github-token-required');
  if (verificationMode !== 'JOB_CHAIN') reasons.push('protected-job-chain-verification-required');
  if (verificationJobResult !== 'success') reasons.push('successful-independent-verification-job-required');
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) reasons.push('verification-pr-number-required');
  if (!EXACT_SHA.test(expectedHead)) reasons.push('verification-head-sha-required');
  if (!EXACT_SHA.test(expectedBase)) reasons.push('verification-base-sha-required');
  if (typeof fetchImpl !== 'function') reasons.push('fetch-implementation-required');
  if (reasons.length) return fail(reasons);

  const client = makeClient({ token, repository, fetchImpl });
  const prResult = await client.getPullRequest(prNumber);
  if (!prResult?.ok) return fail(prResult?.reasonCodes || ['pull-request-unavailable']);
  const pr = prResult.payload || {};
  const body = parsePromotionBody(pr.body);
  if (pr.state !== 'open') reasons.push('open-self-maintainer-pr-required');
  if (pr.draft === true) reasons.push('non-draft-self-maintainer-pr-required');
  if (pr.base?.ref !== 'main') reasons.push('main-base-required');
  if (!String(pr.head?.ref || '').startsWith(BRANCH_PREFIX)) reasons.push('self-maintainer-branch-prefix-required');
  if (pr.user?.login !== 'github-actions[bot]') reasons.push('github-actions-authored-self-maintainer-pr-required');
  if (pr.head?.repo?.full_name !== repository.fullName) reasons.push('same-repository-self-maintainer-head-required');
  if (text(pr.head?.sha, 80).toLowerCase() !== expectedHead) reasons.push('pr-head-not-independently-verified-head');
  if (!body.taskId) reasons.push('promotion-task-id-missing');
  if (!EXACT_SHA.test(body.baseRevision)) reasons.push('promotion-base-revision-missing');
  if (body.baseRevision !== expectedBase) reasons.push('promotion-base-not-independently-verified-base');
  if (body.candidateCommit !== expectedHead) reasons.push('promotion-candidate-commit-mismatch');
  if (!body.changeSetId) reasons.push('promotion-change-set-id-missing');
  if (!body.selfMaintenanceReceiptId) reasons.push('promotion-self-maintenance-receipt-id-missing');
  if (text(pr.base?.sha, 80).toLowerCase() !== body.baseRevision) reasons.push('pr-base-sha-promotion-base-mismatch');
  if (reasons.length) return fail(reasons);

  const main = await client.getMainBranch();
  const currentMain = text(main?.payload?.commit?.sha, 80).toLowerCase();
  if (!main?.ok || currentMain !== body.baseRevision) {
    return fail(['main-advanced-revalidation-required'], 'STALE_BASE', { currentMain, admittedBase: body.baseRevision });
  }

  const commitsResult = await client.getPullCommits(prNumber);
  const commits = Array.isArray(commitsResult?.payload) ? commitsResult.payload : [];
  if (!commitsResult?.ok || commits.length !== 1) return fail(['exactly-one-self-maintainer-commit-required']);
  const commit = commits[0];
  if (text(commit?.sha, 80).toLowerCase() !== expectedHead) reasons.push('single-pr-commit-head-mismatch');
  const parents = Array.isArray(commit?.parents) ? commit.parents.map(row => text(row?.sha, 80).toLowerCase()) : [];
  if (parents.length !== 1 || parents[0] !== body.baseRevision) reasons.push('single-pr-commit-exact-base-parent-required');
  if (reasons.length) return fail(reasons);

  const filesResult = await client.getPullFiles(prNumber);
  const files = Array.isArray(filesResult?.payload) ? filesResult.payload : [];
  if (!filesResult?.ok || !files.length) return fail(['nonempty-pr-file-set-required']);
  if (files.length > 20) return fail(['self-maintainer-change-count-limit']);

  const changes = [];
  for (const file of files) {
    const filePath = text(file?.filename, 1000);
    const status = text(file?.status, 40).toLowerCase();
    if (!filePath || !['added', 'modified', 'removed'].includes(status)) return fail([`unsupported-pr-file-status:${status || 'missing'}`]);
    if (existingTestMutation(filePath, status)) return fail(['autonomous-existing-test-mutation-requires-human-review']);
    if (status === 'added') {
      const after = decodeContent(await client.getContent(filePath, expectedHead), 'PRESENT');
      if (!after.ok) return fail(after.reasonCodes);
      changes.push({ operation: 'CREATE', path: filePath, beforeSha256: null, content: after.content, rationale: 'Independent merge governor reconstructed autonomous create.' });
      continue;
    }
    const before = decodeContent(await client.getContent(filePath, body.baseRevision), 'PRESENT');
    if (!before.ok) return fail(before.reasonCodes);
    if (status === 'removed') {
      changes.push({ operation: 'DELETE', path: filePath, beforeSha256: contentSha256(before.content), content: null, rationale: 'Independent merge governor reconstructed autonomous delete.' });
      continue;
    }
    const after = decodeContent(await client.getContent(filePath, expectedHead), 'PRESENT');
    if (!after.ok) return fail(after.reasonCodes);
    changes.push({ operation: 'UPDATE', path: filePath, beforeSha256: contentSha256(before.content), content: after.content, rationale: 'Independent merge governor reconstructed autonomous update.' });
  }

  const canonical = compileAgentCodeChangeSet({
    taskId: `merge_governor_${expectedHead.slice(0, 24)}`,
    baseRevision: body.baseRevision,
    changes,
    verification: ['npm run check:syntax', 'npm run test:deterministic'],
    summary: 'Independent merge governor reconstruction of the exact verified self-maintainer PR.',
    consequenceClass: 'LOCAL_PREPARATION'
  });
  if (!canonical?.ok) return fail(['canonical-agent-change-contract-refused', ...(canonical?.reasonCodes || [])]);

  const merged = await client.mergePullRequest(prNumber, expectedHead);
  if (!merged?.ok || merged.payload?.merged !== true) {
    return fail(merged?.reasonCodes || ['github-merge-refused'], 'MERGE_BLOCKED', { githubMessage: text(merged?.payload?.message, 300) || null });
  }

  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_MERGE_GOVERNOR_VERSION,
    status: 'SELF_MAINTAINER_CHANGE_MERGED_AFTER_INDEPENDENT_VERIFICATION',
    verificationMode,
    prNumber,
    baseRevision: body.baseRevision,
    verifiedHead: expectedHead,
    mergedCommit: text(merged.payload?.sha, 80) || null,
    taskId: body.taskId,
    changeSetId: body.changeSetId,
    selfMaintenanceReceiptId: body.selfMaintenanceReceiptId,
    changedPaths: changes.map(change => change.path),
    repositoryMergeAuthority: 'CONSUMED_FOR_THIS_EXACT_VERIFIED_HEAD_ONLY',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'MERGE AUTHORITY APPLIED ONLY TO THE EXACT INDEPENDENTLY VERIFIED LOCAL-PREPARATION PR. NO DEPLOYMENT, CUSTOMER, PAYMENT, SPEND, DNS, CREDENTIAL, PRIVATE-LIFE, OR ASI AUTHORITY IS CREATED.'
  };
}

async function main() {
  try {
    const result = await governVerifiedSelfMaintainerMerge();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(fail(['merge-governor-exception'], 'MERGE_REFUSED', { detail: text(error?.message, 300) }), null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
