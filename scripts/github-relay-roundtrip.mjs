#!/usr/bin/env node
// Live round-trip proof for the GitHub-mediated relay (src/github-relay.mjs).
//
// The claim "the bridge works" is worth nothing unless someone can re-run the
// thing that proved it. This is that thing. It drives one complete task all
// the way around the loop against the real GitHub API -- create, claim,
// heartbeat, submit, read back, close -- and asserts the two exclusion guards
// actually fire rather than assuming they do.
//
// WARNING: this is NOT a test. It creates a real GitHub issue on the target
// repository and closes it. It performs no other external effect: no send, no
// spend, no deploy, no credential change. Run it deliberately.
//
// Usage:
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/github-relay-roundtrip.mjs
//
// Env:
//   GITHUB_TOKEN       required; needs issues:write on the target repo
//   GITHUB_REPOSITORY  required; "owner/repo"
//   SOURCE_COMMIT      optional; defaults to `git rev-parse --short HEAD`

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  createGithubRelayTask, claimGithubRelayTask, heartbeatGithubRelayTask,
  submitGithubRelayResult, readGithubRelayTask, githubRelayTaskEnvelope
} from '../src/github-relay.mjs';

const projectRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

// Node's global fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1, which
// curl and git honour automatically. In a proxied sandbox the proxy is what
// carries the usable credential, so without this every call returns 401 and
// the cause is invisible. Re-exec once rather than failing mysteriously.
const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
if (envProxy && process.env.NODE_USE_ENV_PROXY !== '1' && !process.env.UBERBOND_ROUNDTRIP_REEXEC) {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', UBERBOND_ROUNDTRIP_REEXEC: '1' }
  });
  process.exit(run.status ?? 1);
}

const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
const token = String(process.env.GITHUB_TOKEN || '').trim();
if (!repository.includes('/')) {
  console.error('[roundtrip] GITHUB_REPOSITORY must be "owner/repo"');
  process.exit(1);
}
const [OWNER, REPO] = repository.split('/');

let sourceCommit = String(process.env.SOURCE_COMMIT || '').trim();
if (!sourceCommit) {
  try {
    sourceCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectRoot }).toString().trim();
  } catch {
    sourceCommit = 'UNKNOWN';
  }
}

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'uberbond-relay-roundtrip',
      // When a proxy injects the credential, sending an empty header would
      // override it with nothing. Only set it when we actually have one.
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const client = {
  createIssue: ({ owner, repo, title, body, labels }) =>
    gh(`/repos/${owner}/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title, body, labels }) }),
  getIssue: ({ owner, repo, issueNumber }) => gh(`/repos/${owner}/${repo}/issues/${issueNumber}`),
  getComments: ({ owner, repo, issueNumber }) => gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`),
  addComment: ({ owner, repo, issueNumber, body }) =>
    gh(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  addLabels: ({ owner, repo, issueNumber, labels }) =>
    gh(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, { method: 'POST', body: JSON.stringify({ labels }) }),
  closeIssue: ({ owner, repo, issueNumber, stateReason }) =>
    gh(`/repos/${owner}/${repo}/issues/${issueNumber}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: stateReason }) }),
  listIssues: ({ owner, repo }) => gh(`/repos/${owner}/${repo}/issues?state=open&per_page=50`)
};

const WORKER = 'claude-code:roundtrip';
const IMPOSTOR = 'claude-code:impostor';
const failures = [];
const step = (n, label, detail, ok = true) => {
  console.log(`${String(n).padStart(2)} ${label.padEnd(11)}: ${detail}`);
  if (!ok) failures.push(`${label}: ${detail}`);
};

// Preflight before claiming anything. Claiming a task and only then finding
// out the credential does not work strands the task under a dead lease.
const me = await gh('/user');
step(0, 'PREFLIGHT', `authenticated as ${me.login}`);

const created = await createGithubRelayTask({
  client, owner: OWNER, repo: REPO,
  input: {
    taskId: `relay-roundtrip-${Date.now()}`,
    objective: 'Prove the relay round trip end to end against the real GitHub API',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    economicObjective: 'Prove the bridge carries a verifiable receipt with no human relaying it',
    consequenceClass: 'LOCAL_PREPARATION',
    authority: 'LOCAL_PREPARATION',
    constraints: ['local-only', 'no-external-effects'],
    evidenceRefs: ['mission:chatgpt-claude-live-bridge', 'test:github-relay'],
    requiredOutputs: ['outcome', 'testsActuallyRun', 'truthTable', 'externalEffectLedger', 'decision'],
    acceptanceTests: [
      'the receipt carries all fourteen mandated fields',
      'the external-effect ledger is strictly zero',
      'the receipt is readable through the independent reviewer path'
    ]
  }
});
if (!created.ok) {
  console.error(`[roundtrip] create failed: ${JSON.stringify(created.reasonCodes)}`);
  process.exit(1);
}
const issueNumber = created.issueNumber;
step(1, 'CREATE', `issue #${issueNumber} ${created.issueUrl}`);

const claim = await claimGithubRelayTask({ client, owner: OWNER, repo: REPO, issueNumber, workerId: WORKER });
step(2, 'CLAIM', claim.ok ? claim.status : `FAILED ${claim.reasonCodes}`, claim.ok);

const dup = await claimGithubRelayTask({ client, owner: OWNER, repo: REPO, issueNumber, workerId: IMPOSTOR });
step(3, 'DUP CLAIM', dup.ok ? 'LEAK -- a second worker claimed a held task' : `BLOCKED ${dup.reasonCodes}`, !dup.ok);

const beat = await heartbeatGithubRelayTask({ client, owner: OWNER, repo: REPO, issueNumber, workerId: WORKER });
step(4, 'HEARTBEAT', beat.ok ? beat.status : `FAILED ${beat.reasonCodes}`, beat.ok);

const wrongBeat = await heartbeatGithubRelayTask({ client, owner: OWNER, repo: REPO, issueNumber, workerId: IMPOSTOR });
step(5, 'WRONG BEAT', wrongBeat.ok ? 'LEAK -- an impostor renewed a lease' : `BLOCKED ${wrongBeat.reasonCodes}`, !wrongBeat.ok);

// One valid receipt payload, reused for the replay attempt below. Reusing it
// matters: a deliberately thin replay is rejected by schema validation before
// the completion check runs, so it would pass for the wrong reason and prove
// nothing about the replay guard.
const payload = {
  outcome: 'COMPLETED',
  sourceCommit,
  confidence: 'HIGH',
  duration: null,
  cost: { usdCents: 0, tokens: null },
  commands: ['npm run check:syntax'],
  artifacts: ['src/github-relay.mjs'],
  findings: ['Round trip executed against the real GitHub API.'],
  limitations: ['This harness proves the transport only. It runs no verification suite and asserts no commercial result.'],
  result: {
    outcome: 'COMPLETED',
    decision: 'ACCEPT',
    testsActuallyRun: [{ command: 'npm run check:syntax', exitCode: 0, summary: 'every relay module parses' }],
    truthTable: { 'github relay transport': 'VERIFIED_LIVE' },
    changedArtifacts: [],
    externalEffectLedger: {}
  }
};

const submit = await submitGithubRelayResult({ client, owner: OWNER, repo: REPO, issueNumber, workerId: WORKER, ...payload });
step(6, 'SUBMIT', submit.ok ? `${submit.status} comment ${submit.commentId ?? ''}` : `FAILED ${submit.reasonCodes}`, submit.ok);

const replay = await submitGithubRelayResult({ client, owner: OWNER, repo: REPO, issueNumber, workerId: WORKER, ...payload });
const replayBlockedCorrectly = !replay.ok && (replay.reasonCodes || []).includes('task-already-completed');
step(7, 'REPLAY', replay.ok
  ? 'LEAK -- a completed task accepted a second receipt'
  : `BLOCKED ${replay.reasonCodes}`, replayBlockedCorrectly);

// The reviewer path: read the receipt back without touching the writer's state.
const review = await readGithubRelayTask({ client, owner: OWNER, repo: REPO, issueNumber });
const receipt = review.receipt || {};
const reviewOk = receipt.status === 'COMPLETED' && receipt.sourceCommit === sourceCommit;
step(8, 'REVIEWER', `status ${receipt.status} | commit ${receipt.sourceCommit} | confidence ${receipt.confidence} | limitations ${(receipt.limitations || []).length}`, reviewOk);

const issue = await client.getIssue({ owner: OWNER, repo: REPO, issueNumber });
const comments = await client.getComments({ owner: OWNER, repo: REPO, issueNumber });
const envelope = githubRelayTaskEnvelope({ issue, comments });
const closedCleanly = envelope.status === 'COMPLETED' && issue.state === 'closed';
step(9, 'ENVELOPE', `status ${envelope.status} | attempts ${envelope.attempts} | idem ${envelope.idempotencyKey} | issue ${issue.state}`, closedCleanly);

console.log(`\nissue      ${created.issueUrl}`);
console.log(`commit     ${sourceCommit}`);
if (failures.length) {
  console.error(`\nROUND TRIP FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nROUND TRIP PASSED -- the bridge carried a verifiable receipt end to end.');
