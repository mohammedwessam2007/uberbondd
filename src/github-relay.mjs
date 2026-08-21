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
// Three tries, then a person. Two is not enough to survive one unlucky crash;
// unbounded means a poison task quietly consumes every worker that finds it.
const DEFAULT_MAX_ATTEMPTS = 3;

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

export function buildClaimComment({ workerId, observedAt, leaseSeconds = DEFAULT_LEASE_SECONDS, recovered = null }) {
  // When a claim is a takeover, say so in the human line as well as the packet.
  // Silently re-claiming an abandoned task makes the thread read as though the
  // first attempt never happened, which is exactly the history someone
  // debugging a repeatedly-failing task needs to see.
  const headline = recovered?.lastHolder
    ? `Claimed by \`${workerId}\`, recovering an abandoned lease last held by \`${recovered.lastHolder}\`.`
    : `Claimed by \`${workerId}\`.`;
  return [
    headline,
    '',
    fencedJson(CLAIM_FENCE, {
      policyVersion: GITHUB_RELAY_POLICY_VERSION,
      workerId,
      claimedAt: at(observedAt),
      leaseSeconds,
      leaseExpiresAt: at(new Date(Date.parse(at(observedAt)) + leaseSeconds * 1000)),
      ...(recovered?.lastHolder ? { recoveredFrom: recovered.lastHolder, lapsedAt: recovered.lapsedAt || null } : {})
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

export const RELAY_RECEIPT_VERSION = 'uberbond-relay-receipt-1.0.0';

const REQUIRED_RECEIPT_FIELDS = Object.freeze([
  'taskId', 'workerId', 'status', 'sourceCommit', 'commands', 'tests', 'artifacts',
  'findings', 'limitations', 'confidence', 'externalEffects', 'cost', 'duration', 'submittedAt'
]);
const CONFIDENCE_LEVELS = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']);

/**
 * Assembles the canonical receipt a reviewer (ChatGPT) reads back.
 *
 * `validResult()` from the HTTP relay stays the safety gate -- required fields,
 * size ceiling, secret scan, zero-effect ledger. This adds the *provenance*
 * layer on top: which commit was this measured against, what exactly was run,
 * how confident is the worker, and what did it NOT establish. Without
 * sourceCommit and limitations a receipt is unfalsifiable, which defeats the
 * point of having one.
 *
 * Every field is derived from the actual result when the caller does not supply
 * it, and unknowns are recorded as UNKNOWN/null rather than guessed -- a
 * fabricated confidence or an invented cost would be worse than an absent one.
 */
export function buildRelayReceipt({
  taskId, workerId, status, result,
  sourceCommit, commands, tests, artifacts, findings, limitations,
  confidence, cost, duration, submittedAt
} = {}) {
  const ran = Array.isArray(result?.testsActuallyRun) ? result.testsActuallyRun : [];
  return {
    receiptVersion: RELAY_RECEIPT_VERSION,
    taskId: String(taskId || ''),
    workerId: String(workerId || ''),
    status: String(status || '').toUpperCase(),
    sourceCommit: String(sourceCommit || 'UNKNOWN'),
    commands: Array.isArray(commands) && commands.length
      ? commands
      : ran.map(entry => entry?.command).filter(Boolean),
    tests: Array.isArray(tests) && tests.length ? tests : ran,
    artifacts: Array.isArray(artifacts) ? artifacts : (result?.changedArtifacts || []),
    findings: Array.isArray(findings) ? findings : [],
    limitations: Array.isArray(limitations) ? limitations : [],
    confidence: CONFIDENCE_LEVELS.includes(String(confidence).toUpperCase())
      ? String(confidence).toUpperCase() : 'UNKNOWN',
    externalEffects: { ...ZERO_EFFECTS, ...(result?.externalEffectLedger || {}) },
    // Honest unknown beats an invented number. A worker that cannot measure its
    // own token spend records null, not zero.
    cost: cost && typeof cost === 'object' ? cost : { usdCents: 0, tokens: null },
    duration: duration ?? null,
    submittedAt: at(submittedAt),
    result
  };
}

/** Structural check for the receipt envelope. Returns reason codes, never throws. */
export function validateRelayReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['receipt-object-required'];
  const reasons = [];
  for (const field of REQUIRED_RECEIPT_FIELDS) {
    if (!(field in receipt)) reasons.push(`receipt-missing-${field}`);
  }
  if (!receipt.taskId) reasons.push('receipt-task-id-required');
  if (!receipt.workerId) reasons.push('receipt-worker-id-required');
  if (!['COMPLETED', 'FAILED'].includes(receipt.status)) reasons.push('receipt-invalid-status');
  if (!CONFIDENCE_LEVELS.includes(receipt.confidence)) reasons.push('receipt-invalid-confidence');
  // A receipt asserting any nonzero external effect is refused here as well as
  // in validResult -- the ledger must fail closed at every layer that sees it.
  const effects = receipt.externalEffects || {};
  if (Object.entries(ZERO_EFFECTS).some(([key, zero]) => Number(effects[key] || 0) !== zero)) {
    reasons.push('receipt-nonzero-external-effects-rejected');
  }
  if (hasSecret(receipt)) reasons.push('receipt-secret-like-content-rejected');
  return reasons;
}

export function buildResultComment(receipt, { workerId, observedAt, status }) {
  return [
    `Result from \`${workerId}\`: **${status}**.`,
    '',
    fencedJson(RESULT_FENCE, {
      policyVersion: GITHUB_RELAY_POLICY_VERSION,
      workerId,
      status,
      submittedAt: at(observedAt),
      receipt,
      // `result` is retained alongside `receipt` so readers written against the
      // original shape keep working; the two are the same measurement.
      result: receipt?.result ?? receipt
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
  // `holder` stays null -- nobody holds an expired lease, and callers branch on
  // that. But throwing away WHO let it lapse loses the single most useful fact
  // about a stranded task: which worker vanished mid-run. Report it separately.
  const last = claims[claims.length - 1];
  const lastSeen = Date.parse(
    heartbeats.filter(beat => beat.workerId === last.workerId && beat.id > last.id)
      .sort((a, b) => b.id - a.id)[0]?.heartbeatAt || last.claimedAt || 0
  );
  const lapsedAt = lastSeen + (Number(last.leaseSeconds || leaseSeconds) * 1000);
  return {
    holder: null,
    state: 'EXPIRED',
    expiresAt: null,
    lastHolder: last.workerId || null,
    lapsedAt: Number.isFinite(lapsedAt) ? new Date(lapsedAt).toISOString() : null
  };
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
  now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS, maxAttempts = DEFAULT_MAX_ATTEMPTS
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

  // An expired lease is claimable again -- that is the recovery path, and it is
  // the right default. But claimable-forever is a crash loop: a task that kills
  // whatever picks it up gets retried until someone notices, burning a worker
  // each time while the issue list shows healthy-looking activity. Cap it, and
  // fail closed with a reason rather than looping.
  const priorAttempts = comments.filter(comment => extractFencedJson(comment?.body, CLAIM_FENCE)).length;
  if (priorAttempts >= maxAttempts) {
    return errorResult(
      ['task-exceeded-max-attempts'],
      `${priorAttempts} attempt(s) already recorded, limit ${maxAttempts}. A task that strands repeatedly needs a person, not another worker.`
    );
  }

  const recovered = lease.state === 'EXPIRED' && lease.lastHolder
    ? { lastHolder: lease.lastHolder, lapsedAt: lease.lapsedAt || null }
    : null;

  await client.addComment({
    owner, repo, issueNumber,
    body: buildClaimComment({ workerId: worker, observedAt: now, leaseSeconds, recovered })
  });
  if (typeof client.addLabels === 'function') {
    await client.addLabels({ owner, repo, issueNumber, labels: [CLAIMED_LABEL] });
  }

  return {
    ok: true,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    status: recovered ? 'CLAIMED_RECOVERED' : 'CLAIMED',
    taskId: task.taskId || null,
    issueNumber,
    workerId: worker,
    attempt: priorAttempts + 1,
    maxAttempts,
    recovered,
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
  status = 'COMPLETED', result = {}, now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS,
  taskId, sourceCommit, commands, tests, artifacts, findings, limitations, confidence, cost, duration
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

  // Resolve taskId from the issue itself when the caller did not pass one, so a
  // receipt is always bound to the task it answers rather than floating free.
  let resolvedTaskId = taskId;
  if (!resolvedTaskId && typeof client.getIssue === 'function') {
    const issue = await client.getIssue({ owner, repo, issueNumber });
    resolvedTaskId = parseTaskIssueBody(issue?.body)?.taskId || '';
  }

  const receipt = buildRelayReceipt({
    taskId: resolvedTaskId, workerId: worker, status: outcome, result,
    sourceCommit, commands, tests, artifacts, findings, limitations, confidence, cost, duration,
    submittedAt: now
  });
  const receiptErrors = validateRelayReceipt(receipt);
  if (receiptErrors.length) return errorResult(receiptErrors);
  if (sizeOf(receipt) > MAX_RESULT_BYTES) return errorResult(['result-too-large']);

  const comment = await client.addComment({
    owner, repo, issueNumber,
    body: buildResultComment(receipt, { workerId: worker, observedAt: now, status: outcome })
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
    // The full provenance receipt is what a reviewer verifies against; `result`
    // stays exposed for readers written against the original shape.
    receipt: submitted?.receipt || null,
    result: submitted?.result || null,
    resultStatus: submitted?.status || null,
    submittedBy: submitted?.workerId || null,
    submittedAt: submitted?.submittedAt || null,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

/**
 * Projects one task's full state -- immutable packet plus the mutable fields
 * the relay contract requires (status, lease, attempts, resultRefs,
 * idempotencyKey, updatedAt).
 *
 * Those mutable fields are DERIVED from the issue and its comments, never
 * stored a second time. Writing them into the frozen task packet would break
 * its immutability; keeping them in a parallel record would create exactly the
 * duplicated authority this codebase has spent several waves removing. GitHub
 * is the single source of truth and this is a read-only view over it.
 */
export function githubRelayTaskEnvelope({ issue, comments = [], now = new Date(), leaseSeconds = DEFAULT_LEASE_SECONDS } = {}) {
  const task = parseTaskIssueBody(issue?.body);
  if (!task) return null;
  const lease = resolveLease(comments, now, leaseSeconds);
  const labels = (issue?.labels || []).map(label => String(label?.name ?? label));
  const receipts = (comments || []).map(comment => parseResultComment(comment?.body)).filter(Boolean);
  const latest = receipts[receipts.length - 1] || null;

  const status = labels.includes(DONE_LABEL) ? 'COMPLETED'
    : labels.includes(FAILED_LABEL) ? 'FAILED'
    : lease.state === 'HELD' ? 'CLAIMED'
    : lease.state === 'EXPIRED' ? 'LEASE_EXPIRED'
    : 'QUEUED';

  return {
    ...task,
    parentTaskId: task.parentTask ?? null,
    status,
    lease,
    // Each claim comment is one attempt; that is the real attempt count, not a
    // counter someone has to remember to increment.
    attempts: (comments || []).filter(comment => extractFencedJson(comment?.body, CLAIM_FENCE)).length,
    resultRefs: receipts.map((_, index) => `${issue.html_url || `#${issue.number}`}#result-${index + 1}`),
    confidence: latest?.receipt?.confidence || 'UNKNOWN',
    // The issue number IS the idempotency key for this transport: one task, one
    // issue, enforced by GitHub itself.
    idempotencyKey: `github-issue:${issue?.number}`,
    createdAt: issue?.created_at || task.createdAt || null,
    updatedAt: issue?.updated_at || null,
    issueNumber: issue?.number ?? null,
    issueUrl: issue?.html_url || null
  };
}

/**
 * Aggregate queue health from raw issues and their comments.
 *
 * A relay with no visibility is a relay nobody trusts. Three states matter
 * operationally and none of them are obvious from looking at GitHub:
 *
 *   QUEUED for a long time  -- nothing is running. Not broken, just nobody
 *                              home, which is easy to mistake for broken.
 *   LEASE_EXPIRED           -- a worker claimed this and then died. The task is
 *                              claimable again, but work may have been done and
 *                              thrown away, and nothing announces that.
 *   attempts > 1            -- something keeps failing and retrying. A single
 *                              glance at the issue looks identical to a task
 *                              claimed once.
 *
 * Pure over its inputs (including `now`), so it is testable without a network
 * and cannot drift from what the transport actually reports.
 */
export function summarizeRelayQueue({ tasks = [], now = new Date(), staleQueuedSeconds = 3600, leaseSeconds = DEFAULT_LEASE_SECONDS, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const nowMs = at.getTime();
  const counts = { QUEUED: 0, CLAIMED: 0, LEASE_EXPIRED: 0, COMPLETED: 0, FAILED: 0 };
  const envelopes = [];

  for (const entry of tasks) {
    const envelope = githubRelayTaskEnvelope({
      issue: entry?.issue, comments: entry?.comments || [], now: at, leaseSeconds
    });
    if (!envelope) continue;
    envelopes.push(envelope);
    if (Object.hasOwn(counts, envelope.status)) counts[envelope.status] += 1;
  }

  const ageSeconds = envelope => {
    const created = Date.parse(envelope.createdAt || '');
    return Number.isFinite(created) ? Math.max(0, Math.round((nowMs - created) / 1000)) : null;
  };

  const queued = envelopes.filter(e => e.status === 'QUEUED');
  const allStranded = envelopes.filter(e => e.status === 'LEASE_EXPIRED');
  // A stranded task at its attempt limit will never be picked up again: no
  // worker is allowed to claim it. Reporting that the same way as a task a
  // worker will happily retry tells the reader to do the one thing that cannot
  // work -- run another worker.
  const exhausted = allStranded.filter(e => e.attempts >= maxAttempts);
  const stranded = allStranded.filter(e => e.attempts < maxAttempts);
  const inFlight = envelopes.filter(e => e.status === 'CLAIMED');
  const retried = envelopes.filter(e => e.attempts > 1 && e.status !== 'COMPLETED');
  const waits = queued.map(ageSeconds).filter(seconds => seconds !== null);
  const oldestQueuedSeconds = waits.length ? Math.max(...waits) : null;

  // Ordered by how much a person needs to know about it, most urgent first. A
  // stranded task outranks a merely idle queue: idle means nobody started,
  // stranded means someone started and vanished.
  const verdict = exhausted.length ? 'EXHAUSTED'
    : stranded.length ? 'STRANDED'
    : (oldestQueuedSeconds !== null && oldestQueuedSeconds > staleQueuedSeconds && inFlight.length === 0) ? 'STALLED'
    : (queued.length || inFlight.length) ? 'ACTIVE'
    : 'IDLE';

  return {
    ok: true,
    policyVersion: GITHUB_RELAY_POLICY_VERSION,
    observedAt: at.toISOString(),
    verdict,
    counts,
    total: envelopes.length,
    oldestQueuedSeconds,
    exhausted: exhausted.map(e => ({
      issueNumber: e.issueNumber, issueUrl: e.issueUrl, taskId: e.taskId,
      attempts: e.attempts, lastHolder: e.lease?.lastHolder || null, ageSeconds: ageSeconds(e)
    })),
    stranded: stranded.map(e => ({
      issueNumber: e.issueNumber, issueUrl: e.issueUrl, taskId: e.taskId,
      attempts: e.attempts,
      // An expired lease has no holder by definition; lastHolder is who let it lapse.
      lastHolder: e.lease?.lastHolder || null,
      lapsedAt: e.lease?.lapsedAt || null,
      ageSeconds: ageSeconds(e)
    })),
    inFlight: inFlight.map(e => ({
      issueNumber: e.issueNumber, taskId: e.taskId,
      holder: e.lease?.holder || null, expiresAt: e.lease?.expiresAt || null
    })),
    retried: retried.map(e => ({ issueNumber: e.issueNumber, taskId: e.taskId, attempts: e.attempts })),
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
