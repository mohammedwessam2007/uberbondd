#!/usr/bin/env node
// Device-off worker for the GitHub-mediated relay (src/github-relay.mjs).
//
// This is the script that lets the relay run with NO Claude session and NO
// founder device: point it at a repo with a token and it polls for
// `agent-relay:task` issues addressed to it, claims one, runs the bounded
// verification the task asks for, and posts a result receipt back.
//
// It is deliberately NOT a general-purpose agent. It executes exactly one
// allowlisted class of work -- the repository's own verification suites --
// because a worker that could run arbitrary instructions from an issue body
// would be a remote code execution hole wearing a task packet as a costume.
// Anything outside REPO_VERIFICATION is reported back as UNSUPPORTED_OBJECTIVE,
// never attempted.
//
// Usage:
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/github-relay-worker.mjs
//
// Env:
//   GITHUB_TOKEN        required; needs issues:write on the target repo
//   GITHUB_REPOSITORY   required; "owner/repo"
//   RELAY_WORKER_ID     optional; defaults to github-relay-worker:<pid>
//   RELAY_TARGET_AGENT  optional; defaults to claude-code
//   RELAY_MAX_TASKS     optional; defaults to 1 per invocation (bounded by design)
//   RELAY_DRY_RUN       optional; "true" polls and reports without claiming

import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimGithubRelayTask,
  pollGithubRelayTasks,
  submitGithubRelayResult
} from '../src/github-relay.mjs';

const projectRoot = resolve(process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), '..'));
const token = String(process.env.GITHUB_TOKEN || '').trim();
const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
const workerId = String(process.env.RELAY_WORKER_ID || `github-relay-worker:${process.pid}`).trim();
const targetAgent = String(process.env.RELAY_TARGET_AGENT || 'claude-code').trim().toLowerCase();
const maxTasks = Math.max(1, Math.min(5, Number(process.env.RELAY_MAX_TASKS || 1)));
const dryRun = process.env.RELAY_DRY_RUN === 'true';

// The only objectives this worker will act on. Everything else is refused.
const ALLOWED_SUITES = new Map([
  ['syntax', ['npm', ['run', 'check:syntax']]],
  ['deterministic', ['npm', ['run', 'test:deterministic']]],
  ['check', ['npm', ['run', 'check']]]
]);

function fail(message) {
  console.error(`[github-relay-worker] ${message}`);
  process.exit(1);
}

if (!token) fail('GITHUB_TOKEN is required.');
if (!/^[^/]+\/[^/]+$/.test(repository)) fail('GITHUB_REPOSITORY must be "owner/repo".');
const [owner, repo] = repository.split('/');

async function gh(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'uberbond-github-relay-worker',
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000)
  });
  const text = (await response.text()).slice(0, 1_000_000);
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!response.ok) {
    // Never echo the token or the raw headers into an error string.
    throw new Error(`GitHub ${method} ${path} failed: HTTP ${response.status} ${payload?.message || ''}`.trim());
  }
  return payload;
}

const client = {
  async createIssue({ title, body, labels }) {
    return gh(`/repos/${owner}/${repo}/issues`, { method: 'POST', body: { title, body, labels } });
  },
  async listIssues({ labels = [], perPage = 20 }) {
    const params = new URLSearchParams({ state: 'open', labels: labels.join(','), per_page: String(perPage) });
    return gh(`/repos/${owner}/${repo}/issues?${params}`);
  },
  async getIssue({ issueNumber }) {
    return gh(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  },
  async getComments({ issueNumber }) {
    return gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`);
  },
  async addComment({ issueNumber, body }) {
    return gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { method: 'POST', body: { body } });
  },
  async addLabels({ issueNumber, labels }) {
    return gh(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, { method: 'POST', body: { labels } });
  },
  async closeIssue({ issueNumber, stateReason }) {
    return gh(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: stateReason }
    });
  }
};

function runCommand(command, args) {
  return new Promise(resolveRun => {
    execFile(command, args, { cwd: projectRoot, timeout: 900_000, maxBuffer: 8_000_000 }, (error, stdout, stderr) => {
      resolveRun({ ok: !error, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/**
 * Chooses the suite a task is asking for, from its own structured fields only.
 * Free-text in the objective is never interpreted as a command -- at most it
 * selects one of three fixed, already-in-repo npm scripts.
 */
function selectSuite(task) {
  const requested = String(task?.constraints?.find?.(c => /^suite:/.test(String(c))) || '').replace(/^suite:/, '').trim();
  if (requested && ALLOWED_SUITES.has(requested)) return requested;
  const objective = String(task?.objective || '').toLowerCase();
  if (/\bsyntax\b/.test(objective)) return 'syntax';
  if (/\bfull check\b|\bcheck\b/.test(objective)) return 'check';
  if (/\btest|verif|suite\b/.test(objective)) return 'deterministic';
  return null;
}

function summarize(output, limit = 4000) {
  const lines = output.split('\n').filter(Boolean);
  const tail = lines.slice(-40).join('\n');
  return tail.slice(-limit);
}

async function main() {
  const polled = await pollGithubRelayTasks({ client, owner, repo, targetAgent, limit: 20 });
  if (!polled.ok) fail(`poll failed: ${polled.reasonCodes?.join(', ')}`);
  const open = polled.tasks.filter(task => !task.claimed);
  console.log(`[github-relay-worker] ${polled.count} task(s) visible, ${open.length} unclaimed, target=${targetAgent}`);

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, tasks: open.map(t => ({ issue: t.issueNumber, taskId: t.taskId })) }, null, 2));
    return;
  }

  let handled = 0;
  for (const candidate of open) {
    if (handled >= maxTasks) break;
    const claim = await claimGithubRelayTask({ client, owner, repo, issueNumber: candidate.issueNumber, workerId });
    if (!claim.ok) {
      console.log(`[github-relay-worker] skipped #${candidate.issueNumber}: ${claim.reasonCodes?.join(', ')}`);
      continue;
    }
    console.log(`[github-relay-worker] claimed #${candidate.issueNumber} (${claim.taskId})`);

    const suite = selectSuite(claim.task);
    let result;
    if (!suite) {
      result = {
        outcome: 'UNSUPPORTED_OBJECTIVE: this worker only runs the repository\'s own allowlisted verification suites (syntax, deterministic, check). No other instruction from a task packet is executed.',
        changedArtifacts: [],
        testsActuallyRun: [],
        truthTable: { objectiveSupported: 'ABSENT' },
        externalEffectLedger: {
          providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
          credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
        },
        decision: 'OWNER_REQUIRED'
      };
    } else {
      const [command, args] = ALLOWED_SUITES.get(suite);
      const run = await runCommand(command, args);
      result = {
        outcome: run.ok
          ? `Ran the allowlisted "${suite}" suite to completion; it passed.`
          : `Ran the allowlisted "${suite}" suite; it failed. Tail of output included below.`,
        changedArtifacts: [],
        testsActuallyRun: [{ command: `${command} ${args.join(' ')}`, result: run.ok ? 'PASS' : 'FAIL', tail: summarize(`${run.stdout}${run.stderr}`) }],
        truthTable: { [suite]: run.ok ? 'PASS_LOCAL' : 'FAILED' },
        externalEffectLedger: {
          providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
          credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
        },
        decision: run.ok ? 'PROCEED' : 'REPAIR'
      };
    }

    const submitted = await submitGithubRelayResult({
      client, owner, repo, issueNumber: candidate.issueNumber, workerId,
      status: result.decision === 'REPAIR' ? 'FAILED' : 'COMPLETED', result
    });
    console.log(`[github-relay-worker] #${candidate.issueNumber} -> ${submitted.ok ? submitted.status : submitted.reasonCodes?.join(', ')}`);
    handled += 1;
  }

  console.log(`[github-relay-worker] done; handled ${handled} task(s).`);
}

await main();
