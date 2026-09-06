// Direct ChatGPT-side client for UberBond's canonical GitHub Issues relay.
//
// The repository already proved `src/github-relay.mjs` against the real GitHub
// API. This module exposes that proven transport behind the same tiny client
// shape used by the bounded agent-evolution wave: health -> createTask ->
// readTask/waitForResult. It does not create a second relay contract.
//
// Configuration is read by presence only. The GitHub token never leaves the
// request closure, is never returned in config/health/results, and is never
// included in an error message.

import {
  TASK_LABEL,
  createGithubRelayTask,
  readGithubRelayTask
} from './github-relay.mjs';
import { ZERO_EFFECTS, validResult } from './cloud-agent-relay.mjs';

export const GITHUB_ISSUES_RELAY_CLIENT_POLICY_VERSION = 'github-issues-relay-client-1.0.0';

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MIN_REQUEST_TIMEOUT_MS = 25;
const MAX_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MIN_POLL_INTERVAL_MS = 25;
const MAX_POLL_INTERVAL_MS = 60_000;
const DEFAULT_MAX_POLLS = 10;
const MAX_POLLS = 100;
const MAX_RESPONSE_BYTES = 300_000;

function failure(reasonCodes, status = 'REJECTED') {
  return {
    ok: false,
    policyVersion: GITHUB_ISSUES_RELAY_CLIENT_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(String(value || '').trim());
  return match ? { owner: match[1], repo: match[2], repository: `${match[1]}/${match[2]}` } : null;
}

async function boundedResponseText(response) {
  const declaredLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error('github-response-too-large'), { code: 'github-response-too-large' });
  }
  const raw = String(await response.text());
  if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error('github-response-too-large'), { code: 'github-response-too-large' });
  }
  return raw;
}

function makeRestClient({ token, fetchImpl, requestTimeoutMs }) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'UberBond-GitHub-Issues-Relay-Client'
  };

  async function request(method, pathname, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${pathname}`, {
        method,
        signal: controller.signal,
        headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
      return failure([error?.name === 'AbortError' ? 'github-request-timeout' : 'github-network-failure'], 'UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }

    let raw;
    try { raw = await boundedResponseText(response); }
    catch (error) { return failure([error?.code || 'github-response-read-failure'], 'UNAVAILABLE'); }

    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); }
      catch { return failure(['github-response-json-required'], 'UNAVAILABLE'); }
    }
    if (!response?.ok) {
      const status = Number(response?.status || 0);
      const reason = status === 401 ? 'github-unauthorized'
        : status === 403 ? 'github-forbidden'
          : status === 404 ? 'github-not-found'
            : status === 422 ? 'github-validation-failed'
              : status >= 500 ? 'github-upstream-failure'
                : 'github-http-failure';
      return failure([reason], status >= 500 ? 'UNAVAILABLE' : 'REJECTED');
    }
    return payload;
  }

  return Object.freeze({
    createIssue: ({ owner, repo, title, body, labels }) =>
      request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, { title, body, labels }),
    listIssues: ({ owner, repo, state = 'open', labels = [], perPage = 50 }) => {
      const query = new URLSearchParams({
        state: String(state || 'open').toLowerCase(),
        per_page: String(Math.max(1, Math.min(50, Number(perPage) || 50)))
      });
      if (labels.length) query.set('labels', labels.join(','));
      return request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${query}`);
    },
    getIssue: ({ owner, repo, issueNumber }) =>
      request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`),
    getComments: ({ owner, repo, issueNumber }) =>
      request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?per_page=100`),
    addComment: ({ owner, repo, issueNumber, body }) =>
      request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`, { body }),
    addLabels: ({ owner, repo, issueNumber, labels }) =>
      request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`, { labels }),
    closeIssue: ({ owner, repo, issueNumber, stateReason }) =>
      request('PATCH', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`, { state: 'closed', state_reason: stateReason })
  });
}

export function describeGithubIssuesRelayReadiness({ env = process.env } = {}) {
  const repository = parseRepository(env.GITHUB_REPOSITORY);
  const credentialPresent = Boolean(String(env.GITHUB_TOKEN || ''));
  const blockers = [];
  if (!repository) blockers.push('github-repository-absent-or-invalid');
  if (!credentialPresent) blockers.push('github-credential-absent');
  return {
    policyVersion: GITHUB_ISSUES_RELAY_CLIENT_POLICY_VERSION,
    ready: blockers.length === 0,
    repositoryPresent: Boolean(repository),
    credentialPresent,
    blockers
  };
}

export function createGithubIssuesRelayClient({
  env = process.env,
  fetchImpl = globalThis.fetch,
  githubClient = null,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const repository = parseRepository(env.GITHUB_REPOSITORY);
  const token = String(env.GITHUB_TOKEN || '');
  const timeoutMs = boundedInteger(requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, MIN_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS);
  const configReasons = [];
  if (!repository) configReasons.push('github-repository-absent-or-invalid');
  if (!githubClient && !token) configReasons.push('github-credential-absent');
  if (!githubClient && typeof fetchImpl !== 'function') configReasons.push('fetch-implementation-required');
  if (typeof sleep !== 'function') configReasons.push('sleep-function-required');

  const lowLevel = configReasons.length
    ? null
    : (githubClient || makeRestClient({ token, fetchImpl, requestTimeoutMs: timeoutMs }));

  async function health() {
    if (configReasons.length) return failure(configReasons, 'NOT_CONFIGURED');
    let issues;
    try {
      issues = await lowLevel.listIssues({
        owner: repository.owner,
        repo: repository.repo,
        state: 'OPEN',
        labels: [TASK_LABEL],
        perPage: 1
      });
    } catch {
      return failure(['github-relay-health-failed'], 'UNAVAILABLE');
    }
    if (!Array.isArray(issues)) {
      if (issues?.ok === false) return issues;
      return failure(['github-relay-health-response-invalid'], 'UNAVAILABLE');
    }
    return {
      ok: true,
      policyVersion: GITHUB_ISSUES_RELAY_CLIENT_POLICY_VERSION,
      status: 'READY',
      transport: 'github-issues',
      repository: repository.repository,
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  async function createTask(input = {}, date = new Date()) {
    if (configReasons.length) return failure(configReasons, 'NOT_CONFIGURED');
    let created;
    try {
      created = await createGithubRelayTask({
        client: lowLevel,
        owner: repository.owner,
        repo: repository.repo,
        input,
        date
      });
    } catch {
      return failure(['github-relay-create-failed'], 'UNAVAILABLE');
    }
    if (!created?.ok) return created || failure(['github-relay-create-failed']);
    if (!Number.isSafeInteger(Number(created.issueNumber))) return failure(['github-relay-issue-number-required']);
    if (created.taskId && input.taskId && created.taskId !== input.taskId) return failure(['relay-task-identity-mismatch']);
    return {
      ...created,
      taskId: created.taskId || input.taskId || null,
      clientPolicyVersion: GITHUB_ISSUES_RELAY_CLIENT_POLICY_VERSION,
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  async function readTask({ issueNumber, expectedTaskId = '' } = {}) {
    const number = Number(issueNumber);
    if (!Number.isSafeInteger(number) || number <= 0) return failure(['valid-issue-number-required']);
    if (configReasons.length) return failure(configReasons, 'NOT_CONFIGURED');
    let current;
    try {
      current = await readGithubRelayTask({
        client: lowLevel,
        owner: repository.owner,
        repo: repository.repo,
        issueNumber: number
      });
    } catch {
      return failure(['github-relay-read-failed'], 'UNAVAILABLE');
    }
    if (!current?.ok) return current || failure(['github-relay-read-failed']);
    if (expectedTaskId && current.task?.taskId !== expectedTaskId) return failure(['relay-task-identity-mismatch']);
    if (current.result != null) {
      const resultErrors = validResult(current.result);
      if (resultErrors.length) return failure(resultErrors.map(code => `worker-${code}`));
      if (!['COMPLETED', 'FAILED'].includes(String(current.resultStatus || '').toUpperCase())) {
        return failure(['worker-result-status-invalid']);
      }
    }
    return {
      ...current,
      clientPolicyVersion: GITHUB_ISSUES_RELAY_CLIENT_POLICY_VERSION,
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  async function waitForResult({
    issueNumber,
    expectedTaskId = '',
    maxPolls = DEFAULT_MAX_POLLS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
  } = {}) {
    const polls = boundedInteger(maxPolls, DEFAULT_MAX_POLLS, 1, MAX_POLLS);
    const intervalMs = boundedInteger(pollIntervalMs, DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS, MAX_POLL_INTERVAL_MS);
    for (let attempt = 1; attempt <= polls; attempt += 1) {
      const current = await readTask({ issueNumber, expectedTaskId });
      if (!current.ok) return current;
      if (current.result != null) {
        return {
          ...current,
          status: 'RESULT_RECEIVED',
          polls: attempt,
          externalEffectLedger: { ...ZERO_EFFECTS }
        };
      }
      if (String(current.issueState || '').toLowerCase() === 'closed') {
        return failure(['relay-closed-without-result-receipt']);
      }
      if (attempt < polls) await sleep(intervalMs);
    }
    return {
      ...failure(['result-not-received-within-poll-bound'], 'PENDING'),
      polls
    };
  }

  return Object.freeze({
    getConfig() {
      return {
        ok: configReasons.length === 0,
        policyVersion: GITHUB_ISSUES_RELAY_CLIENT_POLICY_VERSION,
        transport: 'github-issues',
        repository: repository?.repository || null,
        repositoryPresent: Boolean(repository),
        credentialPresent: Boolean(token),
        injectedClient: Boolean(githubClient),
        requestTimeoutMs: timeoutMs,
        reasonCodes: [...configReasons],
        externalEffectLedger: { ...ZERO_EFFECTS }
      };
    },
    health,
    createTask,
    readTask,
    waitForResult
  });
}
