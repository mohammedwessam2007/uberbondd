import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  EXPECTED_RELAY_BUNDLE_BLOBS,
  EXPECTED_RELAY_BUNDLE_DIGEST,
  EXPECTED_RELAY_PROJECT_ID,
  EXPECTED_RELAY_PROJECT_NAME,
  EXPECTED_RELAY_TEAM_ID
} from '../src/relay-deployment-eligibility.mjs';
import { compileExactRelayPreviewRequest } from '../src/relay-vercel-api-request.mjs';
import {
  executeExactRelayPreviewAttempt,
  RELAY_VERCEL_API_RESPONSE_LIMIT_BYTES
} from '../src/relay-vercel-api-executor.mjs';

const root = new URL('../', import.meta.url);
const token = 'vercel_test_token_not_real_123456';
const eligibility = Object.freeze({
  status: 'DEPLOY_PREVIEW_ONCE',
  authorizedAttempts: 1,
  projectId: EXPECTED_RELAY_PROJECT_ID,
  teamId: EXPECTED_RELAY_TEAM_ID,
  projectName: EXPECTED_RELAY_PROJECT_NAME,
  environment: 'preview',
  productionPromotion: false,
  deploymentCount: 0
});

async function compiled() {
  const files = await Promise.all(EXPECTED_RELAY_BUNDLE_BLOBS.map(async ({ path }) => ({
    path,
    data: await readFile(new URL(path, root), 'utf8')
  })));
  return compileExactRelayPreviewRequest({
    eligibilityDecision: eligibility,
    bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    files,
    credentialAvailable: true
  });
}

function response(payload, { status = 200, contentLength = null } = {}) {
  let reads = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => name === 'content-length' ? contentLength : null },
    async text() {
      reads += 1;
      return typeof payload === 'string' ? payload : JSON.stringify(payload);
    },
    get reads() { return reads; }
  };
}

test('executes exactly one exact request and returns an accepted attempt receipt', async () => {
  let calls = 0;
  let captured;
  const fetchImpl = async (url, options) => {
    calls += 1;
    captured = { url, options };
    return response({
      id: 'dpl_Exact123',
      url: 'uberbondd-relay-preview-abc.vercel.app',
      projectId: EXPECTED_RELAY_PROJECT_ID
    });
  };
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token, fetchImpl,
    date: '2026-08-21T16:00:00.000Z'
  });
  assert.equal(calls, 1);
  assert.equal(captured.url, `https://api.vercel.com/v13/deployments?teamId=${EXPECTED_RELAY_TEAM_ID}`);
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.authorization, `Bearer ${token}`);
  assert.equal(JSON.parse(captured.options.body).project, EXPECTED_RELAY_PROJECT_ID);
  assert.equal(result.status, 'ATTEMPT_ACCEPTED_VERIFY');
  assert.equal(result.attemptsConsumed, 1);
  assert.equal(result.requestCount, 1);
  assert.equal(result.externalEffectLedger.deployments, 1);
  assert.equal(result.tokenReturned, false);
  assert.equal(JSON.stringify(result).includes(token), false);
});

for (const [name, mutate] of [
  ['wrong URL', value => ({ ...value, request: { ...value.request, url: 'https://api.vercel.com/v13/deployments' } })],
  ['wrong project', value => ({ ...value, request: { ...value.request, body: { ...value.request.body, project: 'prj_wrong' } } })],
  ['production target', value => ({ ...value, request: { ...value.request, body: { ...value.request.body, target: 'production' } } })],
  ['second attempt', value => ({ ...value, authorizedAttempts: 2 })]
]) {
  test(`rejects compiled request with ${name} before fetch`, async () => {
    let calls = 0;
    const result = await executeExactRelayPreviewAttempt({
      compiledRequest: mutate(await compiled()),
      token,
      fetchImpl: async () => { calls += 1; }
    });
    assert.equal(result.status, 'REJECTED_BEFORE_EXTERNAL_ATTEMPT');
    assert.equal(result.attemptsConsumed, 0);
    assert.equal(calls, 0);
  });
}

test('rejects absent credential before fetch', async () => {
  let calls = 0;
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(),
    token: '',
    fetchImpl: async () => { calls += 1; }
  });
  assert.equal(result.status, 'REJECTED_BEFORE_EXTERNAL_ATTEMPT');
  assert.equal(calls, 0);
});

test('rejects unbounded timeout before fetch', async () => {
  let calls = 0;
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token, timeoutMs: 60_000,
    fetchImpl: async () => { calls += 1; }
  });
  assert.equal(result.status, 'REJECTED_BEFORE_EXTERNAL_ATTEMPT');
  assert.equal(calls, 0);
});

test('quota response consumes one attempt and never retries', async () => {
  let calls = 0;
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token,
    fetchImpl: async () => {
      calls += 1;
      return response({ error: { code: 'rate_limited' } }, { status: 429 });
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'ATTEMPT_BLOCKED_NO_RETRY_THIS_RUN');
  assert.equal(result.attemptsConsumed, 1);
  assert.equal(result.secondAttemptAuthorized, false);
});

test('network failure becomes uncertain after exactly one call', async () => {
  let calls = 0;
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token,
    fetchImpl: async () => {
      calls += 1;
      throw new Error(`failure containing ${token}`);
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY');
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('declared oversized response is rejected without reading body', async () => {
  const res = response('{}', { contentLength: String(RELAY_VERCEL_API_RESPONSE_LIMIT_BYTES + 1) });
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token, fetchImpl: async () => res
  });
  assert.equal(res.reads, 0);
  assert.equal(result.status, 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY');
});

test('actual oversized response is rejected', async () => {
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token,
    fetchImpl: async () => response('x'.repeat(RELAY_VERCEL_API_RESPONSE_LIMIT_BYTES + 1))
  });
  assert.equal(result.status, 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY');
});

test('malformed JSON response is uncertain and not retried', async () => {
  let calls = 0;
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token,
    fetchImpl: async () => { calls += 1; return response('{bad'); }
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY');
});

test('production response is never accepted as a preview', async () => {
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token,
    fetchImpl: async () => response({
      id: 'dpl_Exact123',
      url: 'uberbondd-relay-preview-abc.vercel.app',
      projectId: EXPECTED_RELAY_PROJECT_ID,
      target: 'production'
    })
  });
  assert.equal(result.status, 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY');
  assert.equal(result.externalEffectLedger.deployments, 0);
});

test('foreign project response is never accepted', async () => {
  const result = await executeExactRelayPreviewAttempt({
    compiledRequest: await compiled(), token,
    fetchImpl: async () => response({
      id: 'dpl_Exact123',
      url: 'uberbondd-relay-preview-abc.vercel.app',
      projectId: 'prj_foreign'
    })
  });
  assert.equal(result.status, 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY');
});

