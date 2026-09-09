#!/usr/bin/env node

import { BUILD_PROTECTED_PATHS, SOVEREIGNTY_PROTECTED_PATHS } from '../../../src/agent-code-change-contract.mjs';

export const SELF_MAINTAINER_MERGE_GOVERNOR_VERSION = 'uberbond.self-maintainer-merge-governor.v1';
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const SAFE_BRANCH_PREFIX = 'uberbond/self-maintain/';
const MAX_CHANGED_FILES = 20;
const MAX_RESPONSE_BYTES = 2_000_000;

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}
function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function fail(reasonCodes, status = 'MERGE_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_MERGE_GOVERNOR_VERSION,
    status,
    reasonCodes: unique(reasonCodes),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    ...extra
  };
}
function normalizedPath(value) {
  const p = text(value, 1000).replaceAll('\\', '/');
  if (!p || p.startsWith('/') || p === '.' || p === '..' || p.startsWith('../') || p.includes('/../')) return null;
  return p;
}
function matchesPrefix(filePath, prefix) {
  const lower = filePath.toLowerCase();
  const p = String(prefix || '').toLowerCase();
  if (p === '.env') return lower === '.env' || lower.startsWith('.env.') || lower.startsWith('.env/');
  return lower === p || lower.startsWith(`${p}/`);
}
function protectedReason(filePath) {
  if (SOVEREIGNTY_PROTECTED_PATHS.some(prefix => matchesPrefix(filePath, prefix))) return 'sovereignty-protected';
  if (BUILD_PROTECTED_PATHS.some(prefix => matchesPrefix(filePath, prefix))) return 'build-protected';
  return null;
}
function bodyMarker(body, label, pattern) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}:\\s*(\\S+)\\s*$`, 'mi').exec(String(body || ''));
  if (!match) return null;
  return pattern.test(match[1]) ? match[1] : null;
}

export function admitSelfMaintainerPullRequest({ pullRequest, changedFiles, currentMainSha, repository } = {}) {
  const reasons = [];
  const pr = pullRequest || {};
  const mainSha = text(currentMainSha, 80).toLowerCase();
  const repo = text(repository || pr?.base?.repo?.full_name, 300);
  const headSha = text(pr?.head?.sha, 80).toLowerCase();
  const baseSha = text(pr?.base?.sha, 80).toLowerCase();
  const headRef = text(pr?.head?.ref, 200);
  const baseRef = text(pr?.base?.ref, 100);

  if (!EXACT_SHA.test(mainSha)) reasons.push('exact-current-main-sha-required');
  if (String(pr?.state || '').toLowerCase() !== 'open') reasons.push('open-pull-request-required');
  if (pr?.draft === true) reasons.push('draft-pull-request-refused');
  if (baseRef !== 'main') reasons.push('main-base-required');
  if (!EXACT_SHA.test(baseSha) || baseSha !== mainSha) reasons.push('pull-request-base-must-equal-current-main');
  if (!EXACT_SHA.test(headSha)) reasons.push('exact-head-sha-required');
  if (!headRef.startsWith(SAFE_BRANCH_PREFIX)) reasons.push('self-maintainer-branch-prefix-required');
  if (text(pr?.head?.repo?.full_name, 300) !== repo || text(pr?.base?.repo?.full_name, 300) !== repo) reasons.push('same-repository-pull-request-required');
  if (!text(pr?.title, 300).startsWith('UberBond self-maintenance:')) reasons.push('self-maintainer-title-required');
  if (Number(pr?.commits) !== 1) reasons.push('single-atomic-candidate-commit-required');

  const body = String(pr?.body || '');
  const bodyBase = bodyMarker(body, 'Base', EXACT_SHA);
  const bodyCandidate = bodyMarker(body, 'Candidate commit', EXACT_SHA);
  const changeSetId = bodyMarker(body, 'Change set', /^agent_changes_[a-f0-9]{24}$/i);
  const receiptId = bodyMarker(body, 'Self-maintenance receipt', /^self_maint_[a-f0-9]{24}$/i);
  if (bodyBase !== mainSha) reasons.push('body-base-binding-required');
  if (bodyCandidate !== headSha) reasons.push('body-candidate-binding-required');
  if (!changeSetId) reasons.push('change-set-identity-required');
  if (!receiptId) reasons.push('self-maintenance-receipt-identity-required');
  if (!/Independent review and exact-head verification remain required\./.test(body)) reasons.push('review-boundary-statement-required');

  const files = Array.isArray(changedFiles) ? changedFiles : [];
  if (!files.length || files.length > MAX_CHANGED_FILES) reasons.push('bounded-changed-file-set-required');
  const normalizedFiles = [];
  for (const file of files) {
    const filePath = normalizedPath(file?.filename);
    if (!filePath) {
      reasons.push('changed-file-path-invalid');
      continue;
    }
    const status = String(file?.status || '').toLowerCase();
    if (!['added', 'modified', 'removed'].includes(status)) reasons.push(`changed-file-status-refused:${filePath}`);
    if (status !== 'removed' && typeof file?.patch !== 'string') reasons.push(`textual-patch-required:${filePath}`);
    const protectedClass = protectedReason(filePath);
    if (protectedClass) reasons.push(`${protectedClass}:${filePath}`);
    normalizedFiles.push({ path: filePath, status, additions: Number(file?.additions || 0), deletions: Number(file?.deletions || 0) });
  }

  if (reasons.length) return fail(reasons, 'ADMISSION_REFUSED', { headSha: headSha || null, baseSha: baseSha || null });
  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_MERGE_GOVERNOR_VERSION,
    status: 'ADMITTED_FOR_READ_ONLY_EXACT_HEAD_VERIFICATION',
    repository: repo,
    prNumber: Number(pr.number),
    headSha,
    baseSha,
    headRef,
    changeSetId,
    receiptId,
    changedFiles: normalizedFiles,
    verificationRequired: ['npm run check:syntax', 'npm run test:deterministic'],
    mergeAuthority: 'CONDITIONAL_AFTER_INDEPENDENT_READ_ONLY_VERIFICATION',
    deploymentAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
}

function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text(value, 300));
  return match ? { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` } : null;
}
async function boundedJson(response) {
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('github-response-too-large');
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(`github-http-${response.status}`);
  return payload;
}
async function github(pathname, { token, method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
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
  return boundedJson(response);
}
async function loadLiveAdmission({ repository, token, prNumber }) {
  const repo = parseRepository(repository);
  if (!repo) return fail(['github-repository-required'], 'RUNTIME_REFUSED');
  const [pr, branch, files] = await Promise.all([
    github(`/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}`, { token }),
    github(`/repos/${repo.owner}/${repo.repo}/branches/main`, { token }),
    github(`/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/files?per_page=100`, { token })
  ]);
  const mainSha = text(branch?.commit?.sha, 80).toLowerCase();
  return admitSelfMaintainerPullRequest({ pullRequest: pr, changedFiles: files, currentMainSha: mainSha, repository: repo.fullName });
}
function writeOutput(name, value) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  const line = `${name}=${String(value).replaceAll('\n', ' ')}\n`;
  return import('node:fs').then(({ appendFileSync }) => appendFileSync(target, line, 'utf8'));
}

export async function runMergeGovernor({ env = process.env } = {}) {
  const repository = text(env.GITHUB_REPOSITORY, 300);
  const token = String(env.GITHUB_TOKEN || '');
  const prNumber = Number(env.UBERBOND_PR_NUMBER || 0);
  const mode = text(env.UBERBOND_MERGE_GOVERNOR_MODE || 'ADMIT', 40).toUpperCase();
  if (!repository || !token || !Number.isSafeInteger(prNumber) || prNumber <= 0) return fail(['runtime-inputs-required'], 'RUNTIME_REFUSED');

  const admission = await loadLiveAdmission({ repository, token, prNumber });
  if (!admission.ok) return admission;

  if (mode === 'ADMIT') {
    await writeOutput('admitted', 'true');
    await writeOutput('pr_number', admission.prNumber);
    await writeOutput('head_sha', admission.headSha);
    await writeOutput('base_sha', admission.baseSha);
    return admission;
  }
  if (mode !== 'FINALIZE') return fail(['merge-governor-mode-invalid']);

  const verifyConclusion = text(env.UBERBOND_VERIFY_JOB_CONCLUSION, 40).toLowerCase();
  const verifiedHead = text(env.UBERBOND_VERIFIED_HEAD_SHA, 80).toLowerCase();
  if (verifyConclusion !== 'success') return fail(['independent-verification-job-not-successful'], 'MERGE_REFUSED');
  if (verifiedHead !== admission.headSha) return fail(['verified-head-sha-mismatch'], 'MERGE_REFUSED');

  const repo = parseRepository(repository);
  const merged = await github(`/repos/${repo.owner}/${repo.repo}/pulls/${prNumber}/merge`, {
    token,
    method: 'PUT',
    body: {
      sha: admission.headSha,
      merge_method: 'merge',
      commit_title: `UberBond autonomous merge: PR #${prNumber}`,
      commit_message: `Independent exact-head verification passed for ${admission.changeSetId}. Merge grants no deployment, customer, payment, spend, credential, DNS or production authority.`
    }
  });
  if (merged?.merged !== true || !EXACT_SHA.test(String(merged?.sha || ''))) return fail(['github-merge-not-confirmed'], 'MERGE_REFUSED');
  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_MERGE_GOVERNOR_VERSION,
    status: 'SELF_MAINTAINER_PR_MERGED_AFTER_INDEPENDENT_VERIFICATION',
    prNumber,
    headSha: admission.headSha,
    priorMainSha: admission.baseSha,
    mergeCommitSha: String(merged.sha).toLowerCase(),
    changeSetId: admission.changeSetId,
    receiptId: admission.receiptId,
    repositoryMergeEffects: 1,
    deploymentAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'A VERIFIED SOURCE MERGE IS NOT A DEPLOYMENT, CUSTOMER OUTCOME, PAYMENT, REVENUE, LIFE OUTCOME OR ASI RESULT.'
  };
}

const direct = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (direct) {
  try {
    const result = await runMergeGovernor();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(fail(['merge-governor-threw'], 'RUNTIME_REFUSED', { detail: text(error?.message, 500) }), null, 2)}\n`);
    process.exitCode = 2;
  }
}
