#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { compileAgentCodeChangeSet, contentSha256 } from '../../../src/agent-code-change-contract.mjs';

export const SELF_MAINTAINER_PR_VERIFIER_VERSION = 'uberbond.self-maintainer-pr-verifier.v1';

const EXACT_SHA = /^[a-f0-9]{40}$/i;
const BRANCH_PREFIX = 'uberbond/self-maintain/';
const REQUIRED_VERIFICATION = Object.freeze(['npm run check:syntax', 'npm run test:deterministic']);

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function runGit(args, { encoding = 'utf8' } = {}) {
  return execFileSync('git', args, { encoding, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2_000_000 });
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_PR_VERIFIER_VERSION,
    status: 'SELF_MAINTAINER_PR_VERIFICATION_REFUSED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    ...extra
  };
}

function parseNameStatus(raw) {
  const parts = String(raw || '').split('\0').filter(Boolean);
  const rows = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++];
    if (!status) break;
    if (/^[RC]/.test(status)) {
      const before = parts[i++];
      const after = parts[i++];
      rows.push({ status, before, path: after });
      continue;
    }
    rows.push({ status, path: parts[i++] });
  }
  return rows;
}

async function contentAtHead(filePath) {
  return readFile(filePath, 'utf8');
}

function contentAtBase(baseSha, filePath) {
  return runGit(['show', `${baseSha}:${filePath}`]);
}

export async function verifySelfMaintainerPullRequest({ env = process.env } = {}) {
  const baseSha = text(env.UBERBOND_PR_BASE_SHA, 80).toLowerCase();
  const headSha = text(env.UBERBOND_PR_HEAD_SHA, 80).toLowerCase();
  const baseRef = text(env.UBERBOND_PR_BASE_REF, 160);
  const headRef = text(env.UBERBOND_PR_HEAD_REF, 200);
  const author = text(env.UBERBOND_PR_AUTHOR, 160);
  const reasons = [];

  if (!EXACT_SHA.test(baseSha)) reasons.push('exact-pr-base-sha-required');
  if (!EXACT_SHA.test(headSha)) reasons.push('exact-pr-head-sha-required');
  if (baseRef !== 'main') reasons.push('self-maintainer-base-main-required');
  if (!headRef.startsWith(BRANCH_PREFIX)) reasons.push('self-maintainer-branch-prefix-required');
  if (author !== 'github-actions[bot]') reasons.push('github-actions-authored-self-maintainer-pr-required');
  if (reasons.length) return fail(reasons);

  const observedHead = text(runGit(['rev-parse', 'HEAD']), 80).toLowerCase();
  if (observedHead !== headSha) return fail(['checked-out-head-sha-mismatch'], { observedHead });

  const parentLine = text(runGit(['rev-list', '--parents', '-n', '1', headSha]), 500);
  const ancestry = parentLine.split(/\s+/).filter(Boolean);
  if (ancestry.length !== 2 || ancestry[0] !== headSha || ancestry[1] !== baseSha) {
    return fail(['single-exact-base-parent-required'], { ancestry });
  }

  const rows = parseNameStatus(runGit(['diff', '--name-status', '-z', `${baseSha}..${headSha}`]));
  if (!rows.length) return fail(['nonempty-self-maintainer-diff-required']);
  if (rows.length > 20) return fail(['self-maintainer-change-count-limit']);

  const changes = [];
  for (const row of rows) {
    if (!row.path || /^[RC]/.test(row.status)) return fail(['rename-copy-not-admitted-by-autonomous-path']);
    if (row.status === 'A') {
      const content = await contentAtHead(row.path);
      changes.push({ operation: 'CREATE', path: row.path, beforeSha256: null, content, rationale: 'Independent verifier reconstructed autonomous create.' });
      continue;
    }
    if (row.status === 'M') {
      const before = contentAtBase(baseSha, row.path);
      const content = await contentAtHead(row.path);
      changes.push({ operation: 'UPDATE', path: row.path, beforeSha256: contentSha256(before), content, rationale: 'Independent verifier reconstructed autonomous update.' });
      continue;
    }
    if (row.status === 'D') {
      const before = contentAtBase(baseSha, row.path);
      changes.push({ operation: 'DELETE', path: row.path, beforeSha256: contentSha256(before), content: null, rationale: 'Independent verifier reconstructed autonomous delete.' });
      continue;
    }
    return fail([`unsupported-git-change-status:${row.status}`]);
  }

  const reconstructed = compileAgentCodeChangeSet({
    taskId: `independent_verify_${headSha.slice(0, 24)}`,
    baseRevision: baseSha,
    changes,
    verification: REQUIRED_VERIFICATION,
    summary: 'Independent read-only verification reconstruction of a self-maintainer PR.',
    consequenceClass: 'LOCAL_PREPARATION'
  });
  if (!reconstructed?.ok) {
    return fail(['canonical-agent-change-contract-refused', ...(reconstructed?.reasonCodes || [])]);
  }

  return {
    ok: true,
    policyVersion: SELF_MAINTAINER_PR_VERIFIER_VERSION,
    status: 'SELF_MAINTAINER_PR_ADMITTED_FOR_INDEPENDENT_TESTS',
    baseSha,
    headSha,
    headRef,
    changedPaths: changes.map(change => change.path),
    changedPathCount: changes.length,
    canonicalContractVersion: reconstructed.policyVersion,
    canonicalReconstructionId: reconstructed.changeSetId,
    requiredVerification: [...REQUIRED_VERIFICATION],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'THIS RECEIPT ADMITS THE PR TO READ_ONLY TESTING. IT DOES NOT MERGE, DEPLOY, CONTACT CUSTOMERS, MOVE MONEY, OR ESTABLISH RUNTIME/COMMERCIAL/ASI TRUTH.'
  };
}

async function main() {
  try {
    const result = await verifySelfMaintainerPullRequest();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(fail(['self-maintainer-pr-verifier-exception'], { detail: text(error?.message, 300) }), null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
