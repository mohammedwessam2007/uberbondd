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
    githubConfigured: true
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
