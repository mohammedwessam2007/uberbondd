// Bounded producer/reviewer client for ChatGPT -> UberBond -> Claude Code.
//
// This is not an autonomous model loop. It compiles one canonical AgentTask,
// sends it to the existing relay ingress, and can read or bounded-poll the
// resulting receipt. The bearer credential remains inside this closure and is
// never returned, logged, placed in a task, or included in an error.

import { compileAgentTask } from './agent-relay.mjs';
import { ZERO_EFFECTS, hasSecret, validResult } from './cloud-agent-relay.mjs';

export const CHATGPT_RELAY_CLIENT_POLICY_VERSION = 'chatgpt-relay-client-1.0.0';

const MAX_TASK_BYTES = 200_000;
const MAX_RESPONSE_BYTES = 250_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MIN_REQUEST_TIMEOUT_MS = 25;
const MAX_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MIN_POLL_INTERVAL_MS = 25;
const MAX_POLL_INTERVAL_MS = 60_000;
const DEFAULT_MAX_POLLS = 10;
const MAX_POLLS = 100;

function byteSize(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? null), 'utf8');
}
function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function failure(reasonCodes, status = 'REJECTED') {
  return {
    ok: false,
    policyVersion: CHATGPT_RELAY_CLIENT_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function zeroLedger(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every(key => Object.hasOwn(ZERO_EFFECTS, key))
    && Object.entries(ZERO_EFFECTS).every(([key, zero]) => Number(value[key] || 0) === zero);
}

function normalizeAgent(value, fallback) {
  const normalized = String(value || fallback).trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized) ? normalized : '';
}

function normalizeEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
    url.pathname = url.pathname.replace(/\/$/, '');
    if (!url.pathname.endsWith('/api/agent-relay')) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

async function boundedResponseText(response) {
  const declaredLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error('response-too-large'), { code: 'response-too-large' });
  }
  if (response?.body && typeof response.body[Symbol.asyncIterator] === 'function') {
    let raw = '';
    let bytes = 0;
    for await (const chunk of response.body) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      bytes += byteSize(text);
      if (bytes > MAX_RESPONSE_BYTES) {
        throw Object.assign(new Error('response-too-large'), { code: 'response-too-large' });
      }
      raw += text;
    }
    return raw;
  }
  const raw = String(await response.text());
  if (byteSize(raw) > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error('response-too-large'), { code: 'response-too-large' });
  }
  return raw;
}

function safePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return failure(['relay-response-object-required']);
  if (hasSecret(payload)) return failure(['secret-like-relay-response-rejected']);
  if (!zeroLedger(payload.externalEffectLedger)) return failure(['invalid-relay-external-effect-ledger']);
  return payload;
}

export function createChatgptRelayClient({
  endpoint,
  bearerToken,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  originAgent = 'chatgpt',
  targetAgent = 'claude-code',
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const relayEndpoint = normalizeEndpoint(endpoint);
  const credential = String(bearerToken || '').trim();
  const origin = normalizeAgent(originAgent, 'chatgpt');
  const target = normalizeAgent(targetAgent, 'claude-code');
  const timeoutMs = boundedInteger(requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS, MIN_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS);
  const configReasons = [];
  if (!relayEndpoint) configReasons.push('valid-https-relay-endpoint-required');
  if (credential.length < 8) configReasons.push('relay-bearer-token-required');
  if (typeof fetchImpl !== 'function') configReasons.push('fetch-implementation-required');
  if (!origin || !target) configReasons.push('valid-agent-identities-required');
  if (typeof sleep !== 'function') configReasons.push('sleep-function-required');

  async function request({ method = 'GET', query = {}, body } = {}) {
    if (configReasons.length) return failure(configReasons, 'NOT_CONFIGURED');
    const url = new URL(relayEndpoint);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const serialized = body === undefined ? null : JSON.stringify(body);
    if (serialized != null && byteSize(serialized) > MAX_TASK_BYTES) return failure(['relay-request-too-large']);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${credential}`,
          accept: 'application/json',
          ...(serialized == null ? {} : { 'content-type': 'application/json' })
        },
        ...(serialized == null ? {} : { body: serialized })
      });
    } catch (error) {
      return failure([error?.name === 'AbortError' ? 'relay-request-timeout' : 'relay-network-failure'], 'UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
    if (!response || response.ok !== true) {
      const status = Number(response?.status || 0);
      return failure([status === 401 ? 'relay-unauthorized' : status === 503 ? 'relay-not-configured' : 'relay-http-failure'], 'UNAVAILABLE');
    }
    let raw;
    try { raw = await boundedResponseText(response); }
    catch (error) { return failure([error?.code || 'relay-response-read-failure']); }
    let payload;
    try { payload = JSON.parse(raw); }
    catch { return failure(['relay-response-json-required']); }
    return safePayload(payload);
  }

  async function createTask(input = {}, date = new Date()) {
    if (hasSecret(input)) return failure(['secret-like-task-rejected']);
    if (byteSize(input) > MAX_TASK_BYTES) return failure(['relay-request-too-large']);
    const task = compileAgentTask({
      ...input,
      originAgent: origin,
      targetAgent: target,
      consequenceClass: 'LOCAL_PREPARATION',
      date
    });
    if (!task.ok) return { ...task, clientPolicyVersion: CHATGPT_RELAY_CLIENT_POLICY_VERSION };
    const response = await request({ method: 'POST', body: { operation: 'create', input: task } });
    if (!response.ok) return response;
    if (response.taskId !== task.taskId || response.task?.taskId !== task.taskId) {
      return failure(['relay-task-identity-mismatch']);
    }
    return {
      ...response,
      clientPolicyVersion: CHATGPT_RELAY_CLIENT_POLICY_VERSION,
      compiledTask: task,
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  async function readTask({ issueNumber, expectedTaskId = '' } = {}) {
    const number = Number(issueNumber);
    if (!Number.isSafeInteger(number) || number <= 0) return failure(['valid-issue-number-required']);
    const response = await request({ query: { op: 'read', issueNumber: number } });
    if (!response.ok) return response;
    if (expectedTaskId && response.task?.taskId !== expectedTaskId) return failure(['relay-task-identity-mismatch']);
    if (response.result != null) {
      const resultErrors = validResult(response.result);
      if (resultErrors.length) return failure(resultErrors.map(code => `worker-${code}`));
      if (!['COMPLETED', 'FAILED'].includes(String(response.resultStatus || '').toUpperCase())) {
        return failure(['worker-result-status-invalid']);
      }
    }
    return { ...response, clientPolicyVersion: CHATGPT_RELAY_CLIENT_POLICY_VERSION, externalEffectLedger: { ...ZERO_EFFECTS } };
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
        policyVersion: CHATGPT_RELAY_CLIENT_POLICY_VERSION,
        endpoint: relayEndpoint || null,
        originAgent: origin || null,
        targetAgent: target || null,
        requestTimeoutMs: timeoutMs,
        reasonCodes: [...configReasons],
        credentialPresent: Boolean(credential),
        externalEffectLedger: { ...ZERO_EFFECTS }
      };
    },
    health: () => request({ query: { op: 'health' } }),
    createTask,
    readTask,
    waitForResult
  });
}
