// GitHub-mediated transport for the bounded ChatGPT <-> Claude Code relay.
//
// WHY THIS EXISTS
//
// src/cloud-agent-relay.mjs is the stronger transport: it carries task packets
// over the durable jobs queue with real database lease semantics
// (SELECT ... FOR UPDATE SKIP LOCKED, proven against a real PostgreSQL server
// in tests/postgres-store-live.test.mjs). It requires a deployed, reachable
// UberBond HTTP host.
//
// No such host exists yet (see docs/ARGUS_RELAY_TRUTH.md: only lite/vercel.json
// exists, and server.mjs/worker.mjs are long-running processes that cannot run
// on the current Vercel project as written). Rather than treat "no deployed
// host" as "no relay is possible," this module implements the mission's own
// explicitly-listed fallback: a GitHub-mediated task packet transport.
//
// GitHub Issues are already a durable, authenticated, always-on, credential-
// managed store that both sides of this bridge can reach today, with no new
// infrastructure and no new spend:
//
//     ChatGPT / owner
//         |  opens an Issue labelled `agent-relay:task` carrying a task packet
//         v
//     GitHub Issues  (durable transport + audit trail)
//         |  Claude Code polls -> claims (label + claim comment = the lease)
//         v
//     Claude Code performs bounded local work
//         |  posts a result comment, labels `agent-relay:done`, closes
//         v
//     GitHub Issue = the receipt (real ids, timestamps, author identity)
//
// SAME CONTRACT, DIFFERENT WIRE
//
// This is a transport, not a second relay. The task packet is compiled by the
// same compileAgentTask() used by the HTTP relay, the result is validated by
// the same validResult(), and both are scanned by the same hasSecret() and
// held to the same ZERO_EFFECTS ledger -- all imported from
// src/cloud-agent-relay.mjs rather than re-declared here, so the two transports
// cannot drift apart in what they consider safe.
//
// HONEST LEASE LIMITATION (read this before trusting it at scale)
//
// GitHub labels and comments are NOT database row locks. Two workers that poll
// and claim within the same instant can both believe they hold the lease --
// resolveLease() resolves that deterministically after the fact (earliest
// claim comment wins, by GitHub's own server-assigned comment id), but it
// cannot prevent the duplicated work that already happened. That is acceptable
// for the intended shape of this bridge (a small number of owner-initiated
// tasks, one Claude worker), and unacceptable for high-concurrency use. When a
// real UberBond host is deployed, src/cloud-agent-relay.mjs is the transport to
// promote; this one stays as the zero-infrastructure fallback.
//
// This module performs no GitHub calls itself. Every function takes an injected
// `client`, so the same logic serves a real Octokit/fetch worker, an MCP-driven
// session, and a deterministic test fake.

import { compileAgentTask } from './agent-relay.mjs';
import { ZERO_EFFECTS, hasSecret, validResult } from './cloud-agent-relay.mjs';

export const GITHUB_RELAY_POLICY_VERSION = 'github-relay-1.0.0';

export const TASK_LABEL = 'agent-relay:task';
export const CLAIMED_LABEL = 'agent-relay:claimed';
export const DONE_LABEL = 'agent-relay:done';
export const FAILED_LABEL = 'agent-relay:failed';

const TASK_FENCE = 'uberbond-task';
const CLAIM_FENCE = 'uberbond-claim';
const HEARTBEAT_FENCE = 'uberbond-heartbeat';
const RESULT_FENCE = 'uberbond-result';

const MAX_TASK_BYTES = 200_000;
const MAX_RESULT_BYTES = 250_000;
const DEFAULT_LEASE_SECONDS = 1800;

function sizeOf(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function at(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function errorResult(reasonCodes, detail = '') {
  return {
    ok: false,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    detail: String(detail || '').slice(0, 500),
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function normalizeWorkerId(value) {
  const workerId = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._:-]{0,119}$/i.test(workerId) ? workerId : '';
}

function normalizeTargetAgent(value) {
  const targetAgent = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(targetAgent) ? targetAgent : '';
}

const NAMED_ENTITIES = Object.freeze({
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' '
});

/**
 * Decodes HTML entities in a single left-to-right pass.
 *
 * This is load-bearing, not defensive padding. Different GitHub clients return
 * issue bodies differently: the REST API returns raw text, but some clients
 * (including the MCP GitHub server this repository is driven through) return
 * bodies with entities escaped -- `"` arrives as `&#34;`. A packet written as
 * valid JSON is then unparseable on read, and the relay silently sees zero
 * claimable tasks. Found live against real issue #30, not in a fixture.
 *
 * Single-pass matters: decoding `&amp;` in a separate pass would turn the
 * literal text `&amp;#34;` into `"`, corrupting content that was never escaped.
 */
export function decodeHtmlEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named === undefined ? match : named;
  });
}

/**
 * Extracts the payload of a named fenced JSON block. Fenced blocks (rather than
 * "parse the whole body") mean a human can add free prose above or below a
 * packet in the same issue/comment without breaking machine parsing.
 *
 * Parses the raw slice first and only falls back to entity-decoding if that
 * fails, so a packet legitimately containing the text "&amp;" is never mangled
 * on the happy path.
 */
export function extractFencedJson(body, fence) {
  const text = String(body || '');
  const opener = '```' + fence;
  const start = text.indexOf(opener);
  if (start === -1) return null;
  const bodyStart = start + opener.length;
  const end = text.indexOf('```', bodyStart);
  if (end === -1) return null;
  const slice = text.slice(bodyStart, end).trim();
  for (const candidate of [slice, decodeHtmlEntities(slice)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // fall through to the decoded candidate
    }
  }
  return null;
}

function fencedJson(fence, value) {
  return '```' + fence + '\n' + JSON.stringify(value, null, 2) + '\n```';
}

export function buildTaskIssueBody(task) {
  return [
    'Bounded UberBond relay task. Machine-read; edit the fenced block only if you know the contract.',
    '',
    fencedJson(TASK_FENCE, task),
    '',
    `Policy: ${GITHUB_RELAY_POLICY_VERSION}. A queued task is not a completed task,`,
    'and a completed task is not a customer, a payment, or revenue.'
  ].join('\n');
}

export function parseTaskIssueBody(body) {
  return extractFencedJson(body, TASK_FENCE);
}

export function buildClaimComment({ workerId, observedAt, leaseSeconds = DEFAULT_LEASE_SECONDS }) {
  return [
    `Claimed by \`${workerId}\`.`,
    '',
    fencedJson(CLAIM_FENCE, {
      policyVersion: GITHUB_RELAY_POLICY_VERSION,
      workerId,
      claimedAt: at(observedAt),
      leaseSeconds,
      leaseExpiresAt: at(new Date(Date.parse(at(observedAt)) + leaseSeconds * 1000))
    })
  ].join('\n');
}

export function buildHeartbeatComment({ workerId, observedAt, leaseSeconds = DEFAULT_LEASE_SECONDS }) {
  return [
    `Lease heartbeat from \`${workerId}\`.`,
    '',
    fencedJson(HEARTBEAT_FENCE, {
      policyVersion: GITHUB_RELAY_POLICY_VERSION,
      workerId,
      heartbeatAt: at(observedAt),
      leaseExpiresAt: at(new Date(Date.parse(at(observedAt)) + leaseSeconds * 1000))
    })
  ].join('\n');
}

export function buildResultComment(result, { workerId, observedAt, status }) {
  return [
    `Result from \`${workerId}\`: **${status}**.`,
    '',
    fencedJson(RESULT_FENCE, {
      policyVersion: GITHUB_RELAY_POLICY_VERSION,
      workerId,
      status,
      submittedAt: at(observedAt),
      result
    })
  ].join('\n');
}

export function parseResultComment(body) {
  return extractFencedJson(body, RESULT_FENCE);
}

/**
 * Determines who currently holds the lease on an issue, from its comments.
 *
 * Deterministic tie-break: the EARLIEST claim (by GitHub's own server-assigned,
 * monotonically-increasing comment id) wins, so two workers that raced still
 * converge on the same answer regardless of which one asks. A later claim is
 * only honoured once the earlier holder's lease has actually expired without a
 * heartbeat -- otherwise a second worker could steal an active lease simply by
 * asking again.
 */
export function resolveLease(comments = [], now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS) {
  const nowMs = Date.parse(at(now));
  const claims = [];
  const heartbeats = [];
  for (const comment of comments) {
    const claim = extractFencedJson(comment?.body, CLAIM_FENCE);
    if (claim?.workerId) claims.push({ id: Number(comment.id || 0), ...claim });
    const heartbeat = extractFencedJson(comment?.body, HEARTBEAT_FENCE);
    if (heartbeat?.workerId) heartbeats.push({ id: Number(comment.id || 0), ...heartbeat });
    const submitted = extractFencedJson(comment?.body, RESULT_FENCE);
    if (submitted?.workerId) {
      return { holder: null, state: 'COMPLETED', completedBy: submitted.workerId, expiresAt: null };
    }
  }
  if (!claims.length) return { holder: null, state: 'UNCLAIMED', expiresAt: null };

  claims.sort((a, b) => a.id - b.id);
  for (const claim of claims) {
    const latestBeat = heartbeats
      .filter(beat => beat.workerId === claim.workerId && beat.id > claim.id)
      .sort((a, b) => b.id - a.id)[0];
    const lastSeen = Date.parse(latestBeat?.heartbeatAt || claim.claimedAt || 0);
    const expiresAt = lastSeen + (Number(claim.leaseSeconds || leaseSeconds) * 1000);
    if (Number.isFinite(expiresAt) && expiresAt > nowMs) {
      return {
        holder: claim.workerId,
        state: 'HELD',
        expiresAt: new Date(expiresAt).toISOString()
      };
    }
  }
  return { holder: null, state: 'EXPIRED', expiresAt: null };
}

/**
 * Opens a bounded relay task as a GitHub Issue. The packet is compiled and
 * secret-scanned before anything is written, so a rejected task never reaches
 * GitHub at all.
 */
export async function createGithubRelayTask({ client, owner, repo, input = {}, date = new Date() } = {}) {
  if (!client || typeof client.createIssue !== 'function') return errorResult(['github-client-required']);
  if (sizeOf(input) > MAX_TASK_BYTES || hasSecret(input)) return errorResult(['secret-or-oversized-task-rejected']);
  const task = compileAgentTask({ ...input, date });
  if (!task.ok) return task;
  const targetAgent = normalizeTargetAgent(task.targetAgent);
  if (!targetAgent) return errorResult(['valid-target-agent-required']);

  const issue = await client.createIssue({
    owner,
    repo,
    title: `[relay:${targetAgent}] ${String(task.objective).slice(0, 120)}`,
    body: buildTaskIssueBody(task),
    labels: [TASK_LABEL, `agent-relay:for:${targetAgent}`]
  });

  return {
    ok: true,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    status: 'QUEUED',
    taskId: task.taskId,
    targetAgent,
    issueNumber: issue?.number ?? null,
    issueUrl: issue?.html_url || issue?.url || null,
    task,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function pollGithubRelayTasks({ client, owner, repo, targetAgent = 'claude-code', limit = 10 } = {}) {
  if (!client || typeof client.listIssues !== 'function') return errorResult(['github-client-required']);
  const target = normalizeTargetAgent(targetAgent);
  if (!target) return errorResult(['invalid-target-agent']);

  const issues = await client.listIssues({
    owner, repo, state: 'OPEN', labels: [TASK_LABEL], perPage: Math.max(1, Math.min(50, Number(limit) || 10))
  });

  const tasks = [];
  for (const issue of issues || []) {
    const labels = (issue.labels || []).map(label => String(label?.name ?? label));
    if (labels.includes(DONE_LABEL)) continue;
    const task = parseTaskIssueBody(issue.body);
    if (!task || normalizeTargetAgent(task.targetAgent) !== target) continue;
    tasks.push({
      issueNumber: issue.number,
      issueUrl: issue.html_url || null,
      taskId: task.taskId || null,
      objective: task.objective || null,
      claimed: labels.includes(CLAIMED_LABEL),
      createdAt: issue.created_at || null,
      task
    });
  }

  return {
    ok: true,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    count: tasks.length,
    targetAgent: target,
    tasks,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function claimGithubRelayTask({
  client, owner, repo, issueNumber, workerId,
  now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS
} = {}) {
  if (!client || typeof client.addComment !== 'function') return errorResult(['github-client-required']);
  const worker = normalizeWorkerId(workerId);
  if (!worker) return errorResult(['invalid-worker-id']);
  const issue = await client.getIssue({ owner, repo, issueNumber });
  if (!issue) return errorResult(['task-not-found']);
  const task = parseTaskIssueBody(issue.body);
  if (!task) return errorResult(['task-packet-unparseable']);

  const comments = await client.getComments({ owner, repo, issueNumber });
  const lease = resolveLease(comments, now, leaseSeconds);
  if (lease.state === 'COMPLETED') return errorResult(['task-already-completed']);
  if (lease.state === 'HELD' && lease.holder !== worker) {
    return errorResult(['lease-held-by-another-worker'], `Held by ${lease.holder} until ${lease.expiresAt}.`);
  }

  await client.addComment({ owner, repo, issueNumber, body: buildClaimComment({ workerId: worker, observedAt: now, leaseSeconds }) });
  if (typeof client.addLabels === 'function') {
    await client.addLabels({ owner, repo, issueNumber, labels: [CLAIMED_LABEL] });
  }

  return {
    ok: true,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    status: 'CLAIMED',
    taskId: task.taskId || null,
    issueNumber,
    workerId: worker,
    lease: { leaseSeconds, expiresAt: at(new Date(Date.parse(at(now)) + leaseSeconds * 1000)) },
    task,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function heartbeatGithubRelayTask({
  client, owner, repo, issueNumber, workerId,
  now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS
} = {}) {
  if (!client || typeof client.addComment !== 'function') return errorResult(['github-client-required']);
  const worker = normalizeWorkerId(workerId);
  if (!worker) return errorResult(['invalid-worker-id']);
  const comments = await client.getComments({ owner, repo, issueNumber });
  const lease = resolveLease(comments, now, leaseSeconds);
  if (lease.state === 'COMPLETED') return errorResult(['task-already-completed']);
  if (lease.holder !== worker) return errorResult(['lease-owner-mismatch']);

  await client.addComment({ owner, repo, issueNumber, body: buildHeartbeatComment({ workerId: worker, observedAt: now, leaseSeconds }) });
  return {
    ok: true,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    status: 'HEARTBEAT_ACCEPTED',
    issueNumber,
    workerId: worker,
    lease: { leaseSeconds, expiresAt: at(new Date(Date.parse(at(now)) + leaseSeconds * 1000)) },
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

/**
 * Posts the result and closes the issue. The result is held to exactly the same
 * contract as the HTTP relay: required fields, size ceiling, secret scan, and a
 * strictly-zero external-effect ledger. A worker that claims it sent an email,
 * spent money, or deployed something is rejected here, not recorded.
 */
export async function submitGithubRelayResult({
  client, owner, repo, issueNumber, workerId,
  status = 'COMPLETED', result = {}, now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS
} = {}) {
  if (!client || typeof client.addComment !== 'function') return errorResult(['github-client-required']);
  const worker = normalizeWorkerId(workerId);
  if (!worker) return errorResult(['invalid-worker-id']);
  const outcome = String(status || '').toUpperCase();
  if (!['COMPLETED', 'FAILED'].includes(outcome)) return errorResult(['invalid-result-status']);

  const resultErrors = validResult(result);
  if (resultErrors.length) return errorResult(resultErrors);
  if (sizeOf(result) > MAX_RESULT_BYTES) return errorResult(['result-too-large']);

  const comments = await client.getComments({ owner, repo, issueNumber });
  const lease = resolveLease(comments, now, leaseSeconds);
  if (lease.state === 'COMPLETED') return errorResult(['task-already-completed']);
  if (lease.holder !== worker) return errorResult(['lease-owner-mismatch']);

  const comment = await client.addComment({
    owner, repo, issueNumber,
    body: buildResultComment(result, { workerId: worker, observedAt: now, status: outcome })
  });
  if (typeof client.addLabels === 'function') {
    await client.addLabels({ owner, repo, issueNumber, labels: [outcome === 'COMPLETED' ? DONE_LABEL : FAILED_LABEL] });
  }
  if (typeof client.closeIssue === 'function') {
    await client.closeIssue({ owner, repo, issueNumber, stateReason: outcome === 'COMPLETED' ? 'completed' : 'not_planned' });
  }

  return {
    ok: true,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    status: 'RECEIVED',
    resultStatus: outcome,
    issueNumber,
    workerId: worker,
    commentId: comment?.id ?? null,
    commentUrl: comment?.html_url || null,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

/** Read-only view of one task's current state, for a reviewer (ChatGPT/owner). */
export async function readGithubRelayTask({ client, owner, repo, issueNumber, now = new Date() } = {}) {
  if (!client || typeof client.getIssue !== 'function') return errorResult(['github-client-required']);
  const issue = await client.getIssue({ owner, repo, issueNumber });
  if (!issue) return errorResult(['task-not-found']);
  const comments = await client.getComments({ owner, repo, issueNumber });
  const lease = resolveLease(comments, now);
  const submitted = (comments || []).map(comment => parseResultComment(comment?.body)).filter(Boolean).pop() || null;

  return {
    ok: true,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    issueNumber,
    issueUrl: issue.html_url || null,
    issueState: issue.state || null,
    task: parseTaskIssueBody(issue.body),
    lease,
    result: submitted?.result || null,
    resultStatus: submitted?.status || null,
    submittedBy: submitted?.workerId || null,
    submittedAt: submitted?.submittedAt || null,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
