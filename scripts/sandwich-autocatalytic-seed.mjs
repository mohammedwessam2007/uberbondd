#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TASK_LABEL, buildTaskIssueBody, parseTaskIssueBody } from '../src/github-relay.mjs';
import { compileFiniteCompletionDirective } from './uberbond-finite-completion-seed.mjs';
import {
  compileSandwichAutocatalyticDirective,
  compileSandwichAutocatalyticTask,
  SANDWICH_AUTOCATALYTIC_GOVERNOR_VERSION
} from '../src/sandwich-autocatalytic-governor.mjs';

const TERMINAL_PATH = 'artifacts/sovereign/terminal-realization.json';
const GRAPH_PATH = 'artifacts/sovereign/canonical-execution-leaf-graph.json';
const MAX_FILE_BYTES = 2_000_000;
const MAX_GITHUB_BYTES = 2_000_000;
const SHA40 = /^[0-9a-f]{40}$/i;
const ZERO_EFFECTS = Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const exactSha = value => {
  const candidate = text(value, 80).toLowerCase();
  return SHA40.test(candidate) ? candidate : null;
};
const fail = (reasonCodes, status = 'SANDWICH_AUTOCATALYTIC_SEED_REFUSED', extra = {}) => ({
  ok: false,
  status,
  policyVersion: SANDWICH_AUTOCATALYTIC_GOVERNOR_VERSION,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EFFECTS },
  ...extra
});

function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text(value, 300));
  return match ? { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` } : null;
}
function safePath(root, relativePath) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error('sandwich-autocatalytic-path-escaped-root');
  return resolved;
}
async function readJson(root, relativePath) {
  try {
    const raw = await fs.readFile(safePath(root, relativePath), 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > MAX_FILE_BYTES) return { state: 'TOO_LARGE', data: null };
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data)
      ? { state: 'AVAILABLE', data }
      : { state: 'INVALID', data: null };
  } catch (error) {
    return { state: error?.code === 'ENOENT' ? 'UNAVAILABLE' : 'INVALID', data: null };
  }
}
async function boundedJson(response) {
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_GITHUB_BYTES) throw new Error('github-response-too-large');
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) throw new Error(`github-http-${response.status}`);
  return payload;
}
async function github(pathname, { token, method = 'GET', body, fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(`https://api.github.com${pathname}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'UberBond-Sandwich-Autocatalytic-Seed',
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000)
  });
  return boundedJson(response);
}
function writeOutput(name, value) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  return fs.appendFile(target, `${name}=${String(value).replaceAll('\n', ' ')}\n`, 'utf8');
}
function taskMatches(issue, taskId) {
  if (issue?.pull_request) return false;
  const parsed = parseTaskIssueBody(issue?.body);
  return parsed?.taskId === taskId
    && Array.isArray(parsed?.constraints)
    && parsed.constraints.includes('sandwich-autocatalytic-descendant-genesis');
}

export async function runSandwichAutocatalyticSeed({ env = process.env, repoRoot = process.cwd(), fetchImpl = globalThis.fetch, date = new Date() } = {}) {
  const repository = parseRepository(env.GITHUB_REPOSITORY);
  const token = String(env.GITHUB_TOKEN || '');
  const baseRevision = exactSha(env.GITHUB_SHA);
  const reasons = [];
  if (String(env.GITHUB_ACTIONS || '').toLowerCase() !== 'true') reasons.push('github-actions-runtime-required');
  if (!repository) reasons.push('github-repository-required');
  if (!token) reasons.push('scoped-github-token-required');
  if (!baseRevision) reasons.push('exact-main-base-revision-required');
  if (typeof fetchImpl !== 'function') reasons.push('fetch-implementation-required');
  if (reasons.length) return fail(reasons);

  const [terminalRead, graphRead] = await Promise.all([
    readJson(repoRoot, TERMINAL_PATH),
    readJson(repoRoot, GRAPH_PATH)
  ]);
  const finiteDirective = compileFiniteCompletionDirective({
    baseRevision,
    terminalRealization: terminalRead.data,
    executionGraph: graphRead.data
  });
  const directive = compileSandwichAutocatalyticDirective({ baseRevision, finiteDirective });
  if (!directive.ok) {
    await writeOutput('task_required', 'false');
    await writeOutput('issue_number', '');
    return {
      ...directive,
      terminalEvidenceState: terminalRead.state,
      graphEvidenceState: graphRead.state,
      repositoryIssueEffects: 0
    };
  }

  const task = compileSandwichAutocatalyticTask({ directive, date });
  if (!task?.taskId) return task;
  const query = new URLSearchParams({ state: 'all', labels: TASK_LABEL, per_page: '50' });
  const issues = await github(`/repos/${repository.owner}/${repository.repo}/issues?${query}`, { token, fetchImpl });
  if (!Array.isArray(issues)) return fail(['github-issue-list-invalid'], 'SANDWICH_AUTOCATALYTIC_RELAY_REFUSED');
  const existing = issues.filter(issue => taskMatches(issue, task.taskId)).sort((a,b) => Number(b.number || 0) - Number(a.number || 0))[0];
  if (existing) {
    const issueNumber = Number(existing.number);
    if (String(existing.state || '').toLowerCase() !== 'open') {
      await writeOutput('task_required', 'false');
      await writeOutput('issue_number', '');
      return {
        ok: true,
        status: 'SANDWICH_DESCENDANT_SAME_BASE_ALREADY_ATTEMPTED',
        policyVersion: SANDWICH_AUTOCATALYTIC_GOVERNOR_VERSION,
        baseRevision,
        priorIssueNumber: issueNumber,
        taskId: task.taskId,
        repositoryIssueEffects: 0,
        nextRequiredAction: 'WAIT_FOR_NEW_MAIN_OR_NEW_EVIDENCE__DO_NOT_REPEAT_IDENTICAL_DESCENDANT_GENESIS_ON_SAME_BASE',
        businessEffectAuthority: 'NONE',
        externalEffectAuthority: 'NONE',
        externalEffectLedger: { ...ZERO_EFFECTS }
      };
    }
    await writeOutput('task_required', 'true');
    await writeOutput('issue_number', issueNumber);
    return {
      ok: true,
      status: 'SANDWICH_DESCENDANT_TASK_ALREADY_QUEUED',
      policyVersion: SANDWICH_AUTOCATALYTIC_GOVERNOR_VERSION,
      baseRevision,
      issueNumber,
      taskId: task.taskId,
      repositoryIssueEffects: 0,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  const created = await github(`/repos/${repository.owner}/${repository.repo}/issues`, {
    token,
    method: 'POST',
    fetchImpl,
    body: {
      title: `UberBond Sandwich descendant genesis: ${baseRevision.slice(0, 12)}`,
      body: buildTaskIssueBody(task),
      labels: [TASK_LABEL]
    }
  });
  const issueNumber = Number(created?.number || 0);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) return fail(['github-created-issue-number-required'], 'SANDWICH_AUTOCATALYTIC_RELAY_REFUSED');
  await writeOutput('task_required', 'true');
  await writeOutput('issue_number', issueNumber);
  return {
    ok: true,
    status: 'SANDWICH_DESCENDANT_TASK_QUEUED',
    policyVersion: SANDWICH_AUTOCATALYTIC_GOVERNOR_VERSION,
    baseRevision,
    issueNumber,
    taskId: task.taskId,
    directive,
    repositoryIssueEffects: 1,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    truthBoundary: 'THIS_CREATES_ONE ZERO-EFFECT REQUIREMENT-GENESIS TASK. IT DOES NOT IMPLEMENT THE REQUIREMENT, MERGE, DEPLOY, CREATE EXTERNAL EFFECTS, OR PROVE GLOBAL COMPLETION.'
  };
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) {
  try {
    const result = await runSandwichAutocatalyticSeed();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result?.ok) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(fail(['sandwich-autocatalytic-seed-threw'], 'SANDWICH_AUTOCATALYTIC_RUNTIME_REFUSED', { detail: text(error?.message, 500) }), null, 2)}\n`);
    process.exitCode = 2;
  }
}
