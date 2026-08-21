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

import { execFile, execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimGithubRelayTask,
  heartbeatGithubRelayTask,
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

// Node's global fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1, which
// curl and git honour automatically. In a sandboxed/proxied environment that
// difference is invisible until every API call returns 401 -- the proxy is
// what carries the usable credential, and a direct request never reaches it.
// Re-exec once with the flag set rather than silently failing. On an ordinary
// host with no proxy configured this branch never runs.
const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
if (envProxy && process.env.NODE_USE_ENV_PROXY !== '1' && !process.env.UBERBOND_RELAY_REEXEC) {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', UBERBOND_RELAY_REEXEC: '1' }
  });
  process.exit(run.status ?? 1);
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

// How often to renew the lease while a suite runs. A suite may run for many
// minutes; the lease is finite. Without renewal it can lapse mid-run, another
// worker takes the task, and this one finishes, submits, and is told
// lease-owner-mismatch -- every minute of work discarded with no explanation
// anyone would find. One API call a minute is a cheap way to never do that.
const HEARTBEAT_INTERVAL_MS = Math.max(15_000, Number(process.env.RELAY_HEARTBEAT_MS || 60_000));

/**
 * Run an allowlisted suite, renewing the lease while it runs.
 *
 * If a renewal is REFUSED the lease is already gone -- someone else owns the
 * task now. Carrying on would burn minutes producing a result that cannot be
 * submitted, so the child is killed and the loss is reported honestly rather
 * than surfacing later as a confusing submit failure.
 */
function runCommand(command, args, { issueNumber, workerId: worker } = {}) {
  return new Promise(resolveRun => {
    let leaseLost = null;
    let beats = 0;

    const child = execFile(
      command, args,
      { cwd: projectRoot, timeout: 900_000, maxBuffer: 8_000_000 },
      (error, stdout, stderr) => {
        clearInterval(timer);
        resolveRun({ ok: !error && !leaseLost, stdout: String(stdout), stderr: String(stderr), leaseLost, beats });
      }
    );

    const timer = setInterval(async () => {
      if (!issueNumber || !worker) return;
      try {
        const beat = await heartbeatGithubRelayTask({ client, owner, repo, issueNumber, workerId: worker });
        if (beat.ok) {
          beats += 1;
          return;
        }
        leaseLost = beat.reasonCodes || ['heartbeat-refused'];
        console.error(`[github-relay-worker] lease lost mid-run on #${issueNumber}: ${leaseLost.join(', ')} -- aborting`);
        clearInterval(timer);
        child.kill('SIGTERM');
      } catch (error) {
        // A transient network failure is not proof the lease is gone. Say so
        // and keep working; only an explicit refusal means we lost it.
        console.error(`[github-relay-worker] heartbeat error on #${issueNumber} (continuing): ${String(error.message || error).slice(0, 120)}`);
      }
    }, HEARTBEAT_INTERVAL_MS);
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

/**
 * Proves the credential actually works BEFORE any task is claimed.
 *
 * Without this, a bad or unroutable credential fails at the first write --
 * which, given claim happens before the work, can be *after* the claim
 * comment lands. That would leave a real task locked under a lease held by a
 * worker that has already died, blocking it until the lease expires. Failing
 * fast here costs one request and removes that whole class of outage.
 */
async function preflight() {
  try {
    const me = await gh('/user');
    console.log(`[github-relay-worker] authenticated as ${me?.login || 'unknown'}${envProxy ? ' (via env proxy)' : ''}`);
  } catch (error) {
    fail([
      `credential preflight failed, refusing to claim anything: ${error.message}`,
      envProxy
        ? 'An HTTPS proxy is configured; this run already retried with NODE_USE_ENV_PROXY=1.'
        : 'No HTTPS proxy is configured. If this host requires one, set HTTPS_PROXY.',
      'GITHUB_TOKEN must be a credential with issues:write on the target repository.'
    ].join(' '));
  }
}

// Resolved once: every receipt this run emits describes the same checkout, and
// a receipt that cannot name its commit cannot be verified by anyone later.
function resolveSourceCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'UNKNOWN';
  }
}

async function main() {
  await preflight();
  const sourceCommit = resolveSourceCommit();
  console.log(`[github-relay-worker] source commit ${sourceCommit}`);
  const polled = await pollGithubRelayTasks({ client, owner, repo, targetAgent, limit: 20 });
  if (!polled.ok) fail(`poll failed: ${polled.reasonCodes?.join(', ')}`);

  // `claimed` here is only "the CLAIMED label is present", and that label stays
  // on a task whose worker died. Filtering those out -- which this used to do --
  // made abandoned tasks permanently invisible to the one process able to
  // rescue them: the recovery path existed and nothing could ever reach it.
  //
  // So consider them too, and let claimGithubRelayTask decide. It reads the
  // real lease from the comments and refuses if one is genuinely live, which is
  // the only authority on the question. Fresh work still goes first; recovery
  // is what a worker does when there is nothing new to pick up.
  const unclaimed = polled.tasks.filter(task => !task.claimed);
  const maybeAbandoned = polled.tasks.filter(task => task.claimed);
  const open = [...unclaimed, ...maybeAbandoned];
  console.log(
    `[github-relay-worker] ${polled.count} task(s) visible, ${unclaimed.length} unclaimed, ` +
    `${maybeAbandoned.length} already-claimed (checked for an abandoned lease), target=${targetAgent}`
  );

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, tasks: open.map(t => ({ issue: t.issueNumber, taskId: t.taskId })) }, null, 2));
    return;
  }

  let handled = 0;
  for (const candidate of open) {
    if (handled >= maxTasks) break;
    const startedAt = Date.now();
    const claim = await claimGithubRelayTask({ client, owner, repo, issueNumber: candidate.issueNumber, workerId });
    if (!claim.ok) {
      // A task at its attempt limit is not the same as a task someone else is
      // holding: one is routine contention, the other means this task has
      // killed several workers already and needs a person. Logging both as
      // "skipped" hides the difference at exactly the moment it matters.
      if (claim.reasonCodes?.includes('task-exceeded-max-attempts')) {
        console.error(`[github-relay-worker] GIVING UP on #${candidate.issueNumber}: ${claim.detail}`);
        console.error('[github-relay-worker] This task has stranded repeatedly. Inspect it before retrying:');
        console.error(`[github-relay-worker]   ${candidate.issueUrl || `#${candidate.issueNumber}`}`);
      } else {
        console.log(`[github-relay-worker] skipped #${candidate.issueNumber}: ${claim.reasonCodes?.join(', ')}`);
      }
      continue;
    }
    if (claim.status === 'CLAIMED_RECOVERED') {
      console.log(
        `[github-relay-worker] recovered #${candidate.issueNumber} (${claim.taskId}) -- ` +
        `previous holder ${claim.recovered.lastHolder} abandoned it, attempt ${claim.attempt}/${claim.maxAttempts}`
      );
    } else {
      console.log(`[github-relay-worker] claimed #${candidate.issueNumber} (${claim.taskId}) attempt ${claim.attempt}/${claim.maxAttempts}`);
    }

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
      const run = await runCommand(command, args, { issueNumber: candidate.issueNumber, workerId });

      // The lease went to someone else while we were working. Submitting now
      // would be refused anyway, and re-reporting a task another worker owns
      // would corrupt its history. Stop here and say what happened.
      if (run.leaseLost) {
        console.error(
          `[github-relay-worker] abandoning #${candidate.issueNumber}: lease lost to another worker mid-run ` +
          `(${run.leaseLost.join(', ')}). No result submitted; the current owner will report.`
        );
        continue;
      }
      if (run.beats > 0) {
        console.log(`[github-relay-worker] renewed the lease ${run.beats} time(s) during #${candidate.issueNumber}`);
      }
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

    // The receipt contract has fourteen mandated fields and this worker was
    // filling in none of them, so the only unattended producer in the system
    // emitted its weakest receipts: sourceCommit UNKNOWN, confidence UNKNOWN,
    // no limitations. A receipt nobody can anchor to a commit is not evidence.
    const durationMs = Date.now() - startedAt;
    const submitted = await submitGithubRelayResult({
      client, owner, repo, issueNumber: candidate.issueNumber, workerId,
      status: result.decision === 'REPAIR' ? 'FAILED' : 'COMPLETED',
      result,
      sourceCommit,
      duration: durationMs,
      cost: { usdCents: 0, tokens: null },
      commands: result.testsActuallyRun.map(entry => entry.command).filter(Boolean),
      tests: result.testsActuallyRun,
      artifacts: [],
      // HIGH only when a suite actually ran to completion. An unsupported
      // objective produced no evidence at all, so claiming confidence in it
      // would be the exact dishonesty the receipt exists to prevent.
      confidence: suite ? 'HIGH' : 'LOW',
      findings: suite
        ? [`Ran the allowlisted "${suite}" suite; it ${result.decision === 'REPAIR' ? 'failed' : 'passed'}.`]
        : ['No allowlisted suite matched this objective, so nothing was executed.'],
      limitations: [
        'This worker runs only the repository\'s own allowlisted verification suites. It does not execute instructions from a task packet.',
        'No external effect of any kind was performed: no send, no spend, no deploy, no credential change.',
        ...(suite ? [] : ['The objective was not attempted, so this receipt reports no verification result.'])
      ]
    });
    console.log(`[github-relay-worker] #${candidate.issueNumber} -> ${submitted.ok ? submitted.status : submitted.reasonCodes?.join(', ')}`);
    handled += 1;
  }

  console.log(`[github-relay-worker] done; handled ${handled} task(s).`);
}

await main();
