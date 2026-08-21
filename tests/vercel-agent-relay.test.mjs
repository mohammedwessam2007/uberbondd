import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, runtimeConfig } from '../api/agent-relay.mjs';

function responseCapture() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    end(body) { this.body = String(body || ''); }
  };
}

const env = {
  UBERBOND_RELAY_TOKEN: 'relay-test-token',
  GITHUB_TOKEN: 'github-test-token',
  GITHUB_REPOSITORY: 'mohammedwessam2007/uberbondd'
};

function req({ method = 'GET', url = '/api/agent-relay?op=health', body, authorization = 'Bearer relay-test-token' } = {}) {
  return { method, url, body, headers: { authorization } };
}

test('reports configuration without exposing secrets', async () => {
  assert.deepEqual(runtimeConfig(env), {
    relayToken: 'relay-test-token',
    githubToken: 'github-test-token',
    owner: 'mohammedwessam2007',
    repo: 'uberbondd',
    repositoryConfigured: true,
    githubConfigured: true,
    githubTimeoutMs: 10_000
  });
  const res = responseCapture();
  await createHandler({ env })(req(), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /"status":"READY"/);
  assert.doesNotMatch(res.body, /relay-test-token|github-test-token/);
});

test('fails closed when the relay environment is incomplete', async () => {
  const res = responseCapture();
  await createHandler({ env: { UBERBOND_RELAY_TOKEN: 'relay-test-token' } })(req(), res);
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /RELAY_NOT_CONFIGURED/);
});

test('rejects an incorrect bearer token before any client call', async () => {
  let called = false;
  const res = responseCapture();
  await createHandler({ env, client: { listIssues: async () => { called = true; return []; } } })(req({ authorization: 'Bearer wrong' }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test('poll delegates to the canonical GitHub transport', async () => {
  const res = responseCapture();
  const client = {
    async listIssues() { return []; }
  };
  await createHandler({ env, client })(req({ url: '/api/agent-relay?op=poll&targetAgent=claude-code&limit=1' }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /"count":0/);
  assert.match(res.body, /"externalEffectLedger"/);
});

test('rejects malformed issue numbers without touching GitHub', async () => {
  let called = false;
  const res = responseCapture();
  const client = { async getIssue() { called = true; return null; } };
  await createHandler({ env, client })(req({ url: '/api/agent-relay?op=read&issueNumber=not-a-number' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test('rejects non-zero external effects in submitted results via canonical validator', async () => {
  const res = responseCapture();
  const comments = [{ id: 1, body: '```uberbond-claim\n{"workerId":"claude-code"}\n```' }];
  const client = {
    async getComments() { return comments; },
    async addComment() { throw new Error('must not write a result'); }
  };
  await createHandler({ env, client })(req({
    method: 'POST',
    body: {
      operation: 'submit', issueNumber: 30, workerId: 'claude-code',
      result: {
        outcome: 'claimed', changedArtifacts: [], testsActuallyRun: [], truthTable: {}, decision: 'PROCEED',
        externalEffectLedger: { providerCalls: 0, messages: 1, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 }
      }
    }
  }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /nonzero-external-effect-ledger-rejected/);
});

test('rejects an oversized already-parsed Vercel body before any GitHub write', async () => {
  let called = false;
  const res = responseCapture();
  const client = { async createIssue() { called = true; return {}; } };
  await createHandler({ env, client })(req({
    method: 'POST',
    body: { operation: 'create', input: { objective: 'x'.repeat(250_000) } }
  }), res);
  assert.equal(res.statusCode, 413);
  assert.equal(called, false);
  assert.doesNotMatch(res.body, /x{20}/);
});

test('rejects malformed string JSON as a client error without touching GitHub', async () => {
  let called = false;
  const res = responseCapture();
  const client = { async createIssue() { called = true; return {}; } };
  await createHandler({ env, client })(req({ method: 'POST', body: '{broken' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
  assert.match(res.body, /RELAY_REQUEST_FAILED/);
});

test('aborts a hung GitHub request at the configured bounded timeout', async () => {
  const res = responseCapture();
  const timedEnv = { ...env, UBERBOND_RELAY_GITHUB_TIMEOUT_MS: '25' };
  const hangingFetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  await createHandler({ env: timedEnv, fetch: hangingFetch })(req({
    url: '/api/agent-relay?op=poll&targetAgent=claude-code&limit=1'
  }), res);
  assert.equal(res.statusCode, 504);
  assert.match(res.body, /RELAY_REQUEST_FAILED/);
  assert.doesNotMatch(res.body, /github-test-token|relay-test-token/);
});

// --- the real GitHub client, not a fake --------------------------------------
// Every test above hands createHandler a `client` object, which skips the code
// that actually builds GitHub URLs. That is precisely where poll was broken:
// the transport passes state 'OPEN', GitHub answers 422 for anything but
// lowercase, and no fake ever cared. These drive the real client through a
// fake `fetch` so the URL itself is under test.

function fetchSpy(responder) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET', body: init?.body });
    const { status = 200, payload = [] } = responder?.({ url: String(url), init }) || {};
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(payload)
    };
  };
  return { impl, calls };
}

test('poll asks GitHub for a lowercase state, because GitHub 422s on anything else', async () => {
  const res = responseCapture();
  const spy = fetchSpy(({ url }) => {
    // Behave like the real API rather than accepting whatever we send.
    const state = new URL(url).searchParams.get('state');
    if (state !== null && state !== state.toLowerCase()) {
      return { status: 422, payload: { message: 'Validation Failed' } };
    }
    return { status: 200, payload: [] };
  });

  await createHandler({ env, fetch: spy.impl })(req({ url: '/api/agent-relay?op=poll' }), res);

  assert.equal(res.statusCode, 200, `poll failed against a GitHub-accurate fake: ${res.body}`);
  const listCall = spy.calls.find(call => call.url.includes('/issues?'));
  assert.ok(listCall, 'expected a call to the issues list endpoint');
  const state = new URL(listCall.url).searchParams.get('state');
  assert.equal(state, 'open', `state must be lowercase for GitHub; got ${state}`);
});

test('poll carries the task label through to the query rather than listing everything', async () => {
  const res = responseCapture();
  const spy = fetchSpy(() => ({ status: 200, payload: [] }));
  await createHandler({ env, fetch: spy.impl })(req({ url: '/api/agent-relay?op=poll' }), res);
  const listCall = spy.calls.find(call => call.url.includes('/issues?'));
  assert.equal(new URL(listCall.url).searchParams.get('labels'), 'agent-relay:task');
});

test('a GitHub validation failure surfaces as a failed request, not as an empty queue', async () => {
  // The dangerous version of this bug is not the 400 -- it is a 200 with
  // count:0, which reads as "no work to do" when the truth is "the query was
  // rejected". Pin that it fails loudly.
  const res = responseCapture();
  const spy = fetchSpy(() => ({ status: 422, payload: { message: 'Validation Failed' } }));
  await createHandler({ env, fetch: spy.impl })(req({ url: '/api/agent-relay?op=poll' }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /RELAY_REQUEST_FAILED/);
  assert.doesNotMatch(res.body, /"count":0/);
});

test('submit forwards the provenance the caller sent instead of filing UNKNOWN', async () => {
  // A caller that carefully supplies sourceCommit and confidence used to get a
  // receipt recording UNKNOWN for both -- and a 200 saying it had worked.
  const posted = [];
  const client = {
    async getIssue() { return { number: 7, body: '```uberbond-task\n{"taskId":"t-1","targetAgent":"claude-code"}\n```', labels: [] }; },
    async getComments() {
      return [{ id: 1, body: '```uberbond-claim\n{"workerId":"w-1","claimedAt":"2999-01-01T00:00:00.000Z","leaseSeconds":1800}\n```' }];
    },
    async addComment({ body }) { posted.push(body); return { id: 99 }; },
    async addLabels() { return {}; },
    async closeIssue() { return {}; }
  };
  const res = responseCapture();
  await createHandler({ env, client })(req({
    method: 'POST', url: '/api/agent-relay',
    body: {
      operation: 'submit', issueNumber: 7, workerId: 'w-1', status: 'COMPLETED',
      sourceCommit: 'abc1234', confidence: 'HIGH',
      findings: ['a finding'], limitations: ['a limitation'], duration: 4321,
      result: {
        outcome: 'ok', decision: 'PROCEED', testsActuallyRun: [], truthTable: {},
        changedArtifacts: [], externalEffectLedger: {}
      }
    }
  }), res);

  assert.equal(res.statusCode, 200, res.body);
  const receiptComment = posted.join('\n');
  assert.match(receiptComment, /"sourceCommit": "abc1234"/);
  assert.match(receiptComment, /"confidence": "HIGH"/);
  assert.match(receiptComment, /a finding/);
  assert.match(receiptComment, /a limitation/);
  assert.match(receiptComment, /"duration": 4321/);
  assert.doesNotMatch(receiptComment, /"sourceCommit": "UNKNOWN"/);
});
