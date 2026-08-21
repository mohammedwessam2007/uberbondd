// Bounded post-deployment proof for the dedicated UberBond relay preview.
// The caller injects fetch and deployment metadata. This module cannot create,
// promote, alias, retry, or mutate a deployment.

import crypto from 'node:crypto';
import { ZERO_EFFECTS } from './cloud-agent-relay.mjs';
import { verifyRelayBundleEvidence } from './relay-deployment-eligibility.mjs';

export const RELAY_PREVIEW_PROOF_POLICY_VERSION = 'relay-preview-proof-1.0.0';
export const RELAY_PREVIEW_MAX_RESPONSE_BYTES = 8_192;
const PROJECT_ID = 'prj_QTPTlb6JpYN8IyBTgyVrlWgq4ePT';
const TEAM_ID = 'team_A9LnjIuS5PU0rNetsHMu1N0r';
function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function failure(reasonCodes, status = 'BLOCKED', detail = {}) {
  return {
    ok: false,
    policyVersion: RELAY_PREVIEW_PROOF_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    truthClassification: 'NOT_PROVEN',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...detail
  };
}

function safeBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/i.test(url.hostname)) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    url.pathname = '/';
    return url;
  } catch {
    return null;
  }
}

async function readBoundedJson(response) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > RELAY_PREVIEW_MAX_RESPONSE_BYTES) {
    return { body: null, error: 'body-too-large' };
  }
  if (typeof response?.text !== 'function') return { body: null, error: 'text-reader-required' };
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > RELAY_PREVIEW_MAX_RESPONSE_BYTES) {
      return { body: null, error: 'body-too-large' };
    }
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { body: null, error: 'json-object-required' };
    }
    return { body, error: null };
  } catch {
    return { body: null, error: 'invalid-json' };
  }
}

export async function verifyRelayPreviewEndpoints({
  fetchFn,
  baseUrl,
  requestTimeoutMs = 10_000
} = {}) {
  if (typeof fetchFn !== 'function') return failure(['fetch-function-required'], 'INVALID');
  const url = safeBaseUrl(baseUrl);
  if (!url) return failure(['safe-vercel-preview-url-required'], 'INVALID');
  const timeout = Number(requestTimeoutMs);
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 30_000) {
    return failure(['bounded-request-timeout-required'], 'INVALID');
  }

  const calls = [];
  const request = async path => {
    const target = new URL(path, url);
    calls.push(target.toString());
    try {
      const response = await fetchFn(target, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeout)
      });
      const parsed = await readBoundedJson(response);
      return { status: Number(response?.status || 0), ...parsed };
    } catch (error) {
      return { status: 0, body: null, error: String(error?.name || 'fetch-failed') };
    }
  };

  const health = await request('/api/agent-relay/health');
  const tasks = await request('/api/agent-relay/tasks');
  const reasons = [];
  if (health.error) reasons.push(`health-response-${health.error}`);
  if (health.status !== 200) reasons.push('health-http-status-invalid');
  if (health.body?.status !== 'HEALTHY_PARTIAL_ADAPTER') reasons.push('health-contract-invalid');
  if (health.body?.truth?.cloudRelay !== 'INTERFACE_ONLY') reasons.push('health-truth-boundary-invalid');
  if (tasks.error) reasons.push(`tasks-response-${tasks.error}`);
  if (tasks.status !== 501) reasons.push('tasks-http-status-invalid');
  if (!Array.isArray(tasks.body?.reasonCodes)
    || !tasks.body.reasonCodes.includes('durable-queue-required')) {
    reasons.push('tasks-durable-queue-fail-closed-missing');
  }
  if (tasks.body?.truth?.cloudRelay !== 'INTERFACE_ONLY') reasons.push('tasks-truth-boundary-invalid');

  const healthEvidence = Object.freeze({
    httpStatus: health.status,
    healthyPartialAdapter: health.body?.status === 'HEALTHY_PARTIAL_ADAPTER',
    interfaceOnly: health.body?.truth?.cloudRelay === 'INTERFACE_ONLY',
    responseAccepted: !health.error
  });
  const taskEvidence = Object.freeze({
    httpStatus: tasks.status,
    notImplemented: tasks.body?.status === 'NOT_IMPLEMENTED',
    durableQueueRequired: Array.isArray(tasks.body?.reasonCodes)
      && tasks.body.reasonCodes.includes('durable-queue-required'),
    interfaceOnly: tasks.body?.truth?.cloudRelay === 'INTERFACE_ONLY',
    responseAccepted: !tasks.error
  });

  return {
    ok: reasons.length === 0,
    policyVersion: RELAY_PREVIEW_PROOF_POLICY_VERSION,
    status: reasons.length === 0 ? 'ENDPOINTS_VERIFIED' : 'ENDPOINTS_REJECTED',
    reasonCodes: [...new Set(reasons)],
    baseUrl: url.toString().replace(/\/$/, ''),
    calls,
    callCount: calls.length,
    health: healthEvidence,
    tasks: taskEvidence,
    truthClassification: reasons.length === 0 ? 'INTERFACE_ONLY' : 'NOT_PROVEN',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function compileRelayPreviewReceipt({
  deployment,
  endpointProof,
  testedBundle,
  date = new Date()
} = {}) {
  const observedAt = iso(date);
  const reasons = [];
  if (!observedAt) reasons.push('valid-observation-time-required');
  if (deployment?.projectId !== PROJECT_ID) reasons.push('exact-project-id-required');
  if (deployment?.teamId !== TEAM_ID) reasons.push('exact-team-id-required');
  if (String(deployment?.state || '').toUpperCase() !== 'READY') reasons.push('deployment-ready-required');
  if (String(deployment?.environment || '').toLowerCase() !== 'preview') reasons.push('preview-environment-required');
  if (!String(deployment?.id || '').startsWith('dpl_')) reasons.push('deployment-id-required');
  if (!safeBaseUrl(deployment?.url)) reasons.push('safe-deployment-url-required');
  if (!endpointProof?.ok || endpointProof.status !== 'ENDPOINTS_VERIFIED'
    || endpointProof.truthClassification !== 'INTERFACE_ONLY') {
    reasons.push('verified-endpoint-proof-required');
  }
  if (endpointProof?.baseUrl !== String(deployment?.url || '').replace(/\/$/, '')) {
    reasons.push('deployment-endpoint-url-mismatch');
  }
  if (!verifyRelayBundleEvidence(testedBundle).ok) {
    reasons.push('byte-for-byte-tested-bundle-required');
  }
  if (reasons.length) return failure(reasons, 'RECEIPT_REJECTED', { observedAt });

  const identity = {
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    url: deployment.url,
    bundleDigest: testedBundle.digest || null,
    endpointCalls: endpointProof.calls,
    observedAt
  };
  return {
    ok: true,
    policyVersion: RELAY_PREVIEW_PROOF_POLICY_VERSION,
    receiptId: `relay_preview_${crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24)}`,
    status: 'PREVIEW_INTERFACE_PROVEN',
    observedAt,
    deployment: {
      id: deployment.id,
      projectId: deployment.projectId,
      teamId: deployment.teamId,
      state: 'READY',
      environment: 'preview',
      url: deployment.url
    },
    endpointProof,
    testedBundle,
    truthClassification: 'INTERFACE_ONLY',
    fullDurableRelay: 'NOT_PROVEN',
    cloudWorker: 'NOT_PROVEN',
    claudeExecution: 'NOT_RUN',
    productionPromotion: 'BLOCKED',
    externalEffectLedger: { ...ZERO_EFFECTS, deployments: 1 }
  };
}
