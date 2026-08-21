import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyRelayPreviewEndpoints,
  compileRelayPreviewReceipt
} from '../src/relay-preview-proof.mjs';
import {
  EXPECTED_RELAY_BUNDLE_BLOBS,
  EXPECTED_RELAY_BUNDLE_DIGEST
} from '../src/relay-deployment-eligibility.mjs';

const baseUrl = 'https://uberbondd-relay-preview.vercel.app';
const health = {
  status: 'HEALTHY_PARTIAL_ADAPTER',
  truth: { cloudRelay: 'INTERFACE_ONLY' }
};
const tasks = {
  status: 'NOT_IMPLEMENTED',
  reasonCodes: ['durable-queue-required', 'cloud-worker-not-deployed'],
  truth: { cloudRelay: 'INTERFACE_ONLY' }
};
function response(status, body) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    headers: { get(name) { return String(name).toLowerCase() === 'content-length' ? String(Buffer.byteLength(raw)) : null; } },
    async text() { return raw; }
  };
}
function goodFetch(calls = []) {
  return async url => {
    calls.push(String(url));
    return String(url).endsWith('/health') ? response(200, health) : response(501, tasks);
  };
}
const deployment = {
  id: 'dpl_verified',
  projectId: 'prj_QTPTlb6JpYN8IyBTgyVrlWgq4ePT',
  teamId: 'team_A9LnjIuS5PU0rNetsHMu1N0r',
  state: 'READY',
  environment: 'preview',
  url: baseUrl
};
const bundle = {
  ok: true,
  root: 'relay/',
  matchedBlobCount: 7,
  expectedBlobCount: 7,
  failedTests: 0,
  digest: EXPECTED_RELAY_BUNDLE_DIGEST,
  blobs: EXPECTED_RELAY_BUNDLE_BLOBS.map(item => ({ ...item }))
};

test('verifies exactly two fail-closed endpoints', async () => {
  const calls = [];
  const proof = await verifyRelayPreviewEndpoints({ fetchFn: goodFetch(calls), baseUrl });
  assert.equal(proof.ok, true);
  assert.equal(proof.callCount, 2);
  assert.equal(calls.length, 2);
  assert.equal(proof.truthClassification, 'INTERFACE_ONLY');
});

test('rejects non-Vercel URL', async () => {
  const proof = await verifyRelayPreviewEndpoints({ fetchFn: goodFetch(), baseUrl: 'https://example.com' });
  assert.equal(proof.status, 'INVALID');
});

test('rejects URL credentials', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    fetchFn: goodFetch(), baseUrl: 'https://user:pass@preview.vercel.app'
  });
  assert.equal(proof.status, 'INVALID');
});

test('rejects a non-root preview path', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    fetchFn: goodFetch(), baseUrl: `${baseUrl}/unexpected-path`
  });
  assert.equal(proof.status, 'INVALID');
});

test('rejects a nested lookalike Vercel hostname', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    fetchFn: goodFetch(), baseUrl: 'https://preview.evil.vercel.app'
  });
  assert.equal(proof.status, 'INVALID');
});

test('rejects unbounded timeout', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    fetchFn: goodFetch(), baseUrl, requestTimeoutMs: 60_000
  });
  assert.equal(proof.status, 'INVALID');
});

test('rejects bad health status', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async url => String(url).endsWith('/health')
      ? response(503, health)
      : response(501, tasks)
  });
  assert.equal(proof.ok, false);
  assert.ok(proof.reasonCodes.includes('health-http-status-invalid'));
});

test('rejects health truth inflation', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async url => String(url).endsWith('/health')
      ? response(200, { ...health, truth: { cloudRelay: 'FULLY_LIVE' } })
      : response(501, tasks)
  });
  assert.equal(proof.ok, false);
});

test('rejects writable task endpoint', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async url => String(url).endsWith('/health')
      ? response(200, health)
      : response(200, { status: 'READY' })
  });
  assert.equal(proof.ok, false);
  assert.ok(proof.reasonCodes.includes('tasks-http-status-invalid'));
});

test('rejects missing durable queue reason', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async url => String(url).endsWith('/health')
      ? response(200, health)
      : response(501, { ...tasks, reasonCodes: ['cloud-worker-not-deployed'] })
  });
  assert.equal(proof.ok, false);
});

test('network exception fails closed after bounded calls', async () => {
  let calls = 0;
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async () => { calls += 1; throw new Error('offline'); }
  });
  assert.equal(proof.ok, false);
  assert.equal(calls, 2);
});

test('declared oversized response is rejected without reading its body', async () => {
  let textReads = 0;
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async () => ({
      status: 200,
      headers: { get() { return '9000'; } },
      async text() { textReads += 1; return '{}'; }
    })
  });
  assert.equal(proof.ok, false);
  assert.equal(textReads, 0);
  assert.ok(proof.reasonCodes.includes('health-response-body-too-large'));
  assert.ok(proof.reasonCodes.includes('tasks-response-body-too-large'));
});

test('actual oversized response is rejected when content length is absent', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async () => ({
      status: 200,
      headers: { get() { return null; } },
      async text() { return JSON.stringify({ padding: 'x'.repeat(9_000) }); }
    })
  });
  assert.equal(proof.ok, false);
  assert.ok(proof.reasonCodes.includes('health-response-body-too-large'));
});

test('malformed JSON fails closed', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async () => response(200, '{not-json')
  });
  assert.equal(proof.ok, false);
  assert.ok(proof.reasonCodes.includes('health-response-invalid-json'));
});

test('arbitrary and secret-shaped response fields never survive into proof evidence', async () => {
  const proof = await verifyRelayPreviewEndpoints({
    baseUrl,
    fetchFn: async url => String(url).endsWith('/health')
      ? response(200, { ...health, apiKey: 'sk-do-not-retain', arbitrary: 'raw-health' })
      : response(501, { ...tasks, token: 'do-not-retain', arbitrary: 'raw-tasks' })
  });
  assert.equal(proof.ok, true);
  const serialized = JSON.stringify(proof);
  for (const forbidden of ['sk-do-not-retain', 'do-not-retain', 'raw-health', 'raw-tasks', 'apiKey', 'token']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.deepEqual(Object.keys(proof.health).sort(), [
    'healthyPartialAdapter', 'httpStatus', 'interfaceOnly', 'responseAccepted'
  ]);
});

test('compiles immutable interface-only receipt from complete proof', async () => {
  const endpointProof = await verifyRelayPreviewEndpoints({ fetchFn: goodFetch(), baseUrl });
  const receipt = compileRelayPreviewReceipt({
    deployment, endpointProof, testedBundle: bundle, date: '2026-08-21T02:00:00Z'
  });
  assert.equal(receipt.status, 'PREVIEW_INTERFACE_PROVEN');
  assert.equal(receipt.truthClassification, 'INTERFACE_ONLY');
  assert.equal(receipt.externalEffectLedger.deployments, 1);
  assert.equal(receipt.productionPromotion, 'BLOCKED');
});

test('receipt rejects non-ready deployment', async () => {
  const endpointProof = await verifyRelayPreviewEndpoints({ fetchFn: goodFetch(), baseUrl });
  const receipt = compileRelayPreviewReceipt({
    deployment: { ...deployment, state: 'ERROR' }, endpointProof, testedBundle: bundle
  });
  assert.equal(receipt.status, 'RECEIPT_REJECTED');
});

test('receipt rejects production environment', async () => {
  const endpointProof = await verifyRelayPreviewEndpoints({ fetchFn: goodFetch(), baseUrl });
  const receipt = compileRelayPreviewReceipt({
    deployment: { ...deployment, environment: 'production' }, endpointProof, testedBundle: bundle
  });
  assert.equal(receipt.status, 'RECEIPT_REJECTED');
});

test('receipt rejects endpoint URL mismatch', async () => {
  const endpointProof = await verifyRelayPreviewEndpoints({ fetchFn: goodFetch(), baseUrl });
  const receipt = compileRelayPreviewReceipt({
    deployment: { ...deployment, url: 'https://other-preview.vercel.app' },
    endpointProof, testedBundle: bundle
  });
  assert.equal(receipt.status, 'RECEIPT_REJECTED');
});

test('receipt rejects incomplete bundle proof', async () => {
  const endpointProof = await verifyRelayPreviewEndpoints({ fetchFn: goodFetch(), baseUrl });
  const receipt = compileRelayPreviewReceipt({
    deployment, endpointProof,
    testedBundle: { ...bundle, matchedBlobCount: 6 }
  });
  assert.equal(receipt.status, 'RECEIPT_REJECTED');
});
