#!/usr/bin/env node
// What is the relay actually doing right now?
//
// The GitHub issue list cannot answer that. An issue labelled agent-relay:claimed
// looks the same whether a worker is mid-run or died an hour ago holding the
// lease. A queue with nothing running looks the same as a queue being worked.
// Those need different responses, so this prints the difference.
//
// Read-only: it lists issues and their comments and computes. It claims
// nothing, writes nothing, and changes no state.
//
// Usage:
//   GITHUB_REPOSITORY=owner/repo node scripts/relay-status.mjs
//   ... --json          machine-readable
//   ... --stale 600     treat a queued task older than N seconds as stale
//
// Exit code is 0 when the queue is healthy (IDLE or ACTIVE) and 1 when it
// wants a human (STRANDED or STALLED), so it can gate a check without parsing.

import { fileURLToPath } from 'node:url';
import { summarizeRelayQueue, TASK_LABEL, DONE_LABEL } from '../src/github-relay.mjs';

// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1, while curl and
// git honour it automatically. In a proxied sandbox the proxy carries the
// credential, so without this every call is a bare 401 with no clue why.
const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || '';
if (envProxy && process.env.NODE_USE_ENV_PROXY !== '1' && !process.env.UBERBOND_STATUS_REEXEC) {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', UBERBOND_STATUS_REEXEC: '1' }
  });
  process.exit(run.status ?? 1);
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const staleIndex = args.indexOf('--stale');
const staleQueuedSeconds = staleIndex >= 0 ? Number(args[staleIndex + 1]) || 3600 : 3600;

const repository = (process.env.GITHUB_REPOSITORY || 'mohammedwessam2007/uberbondd').trim();
if (!repository.includes('/')) {
  console.error('[relay-status] GITHUB_REPOSITORY must be "owner/repo"');
  process.exit(1);
}
const [owner, repo] = repository.split('/');
const token = String(process.env.GITHUB_TOKEN || '').trim();

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'uberbond-relay-status',
      // Only send the header when we have a value; an empty one would override
      // the credential a proxy injects.
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

const issues = await gh(`/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(TASK_LABEL)}&per_page=100`);
const open = (issues || []).filter(issue => !issue.pull_request);

const tasks = [];
for (const issue of open) {
  const labels = (issue.labels || []).map(label => String(label?.name ?? label));
  if (labels.includes(DONE_LABEL)) continue;
  const comments = issue.comments > 0
    ? await gh(`/repos/${owner}/${repo}/issues/${issue.number}/comments?per_page=100`)
    : [];
  tasks.push({ issue, comments });
}

const summary = summarizeRelayQueue({ tasks, staleQueuedSeconds });

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const { counts } = summary;
  console.log(`\nrelay queue: ${repository}   ${summary.observedAt}`);
  console.log(`verdict    : ${summary.verdict}`);
  console.log(`open tasks : ${summary.total}  (queued ${counts.QUEUED}, claimed ${counts.CLAIMED}, lease-expired ${counts.LEASE_EXPIRED})`);
  if (summary.oldestQueuedSeconds !== null) {
    console.log(`oldest wait: ${Math.round(summary.oldestQueuedSeconds / 60)} min`);
  }
  for (const task of summary.inFlight) {
    console.log(`  in flight  #${task.issueNumber} ${task.taskId}  held by ${task.holder} until ${task.expiresAt}`);
  }
  for (const task of summary.stranded) {
    console.log(`  STRANDED   #${task.issueNumber} ${task.taskId}  last held by ${task.lastHolder}, ${task.attempts} attempt(s)`);
  }
  for (const task of summary.retried) {
    console.log(`  retried    #${task.issueNumber} ${task.taskId}  ${task.attempts} attempts`);
  }
  if (summary.verdict === 'STRANDED') {
    console.log('\nA worker claimed a task and never finished it. The lease has lapsed so the');
    console.log('task is claimable again, but any work it did was lost. Re-run a worker.');
  } else if (summary.verdict === 'STALLED') {
    console.log('\nWork is waiting and nothing is running. This is not a failure -- no worker');
    console.log('is active. Start one: node scripts/github-relay-worker.mjs');
  }
  console.log('');
}

process.exit(['STRANDED', 'STALLED'].includes(summary.verdict) ? 1 : 0);
