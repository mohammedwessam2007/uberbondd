// Bounded one-shot transport for an already compiled exact relay preview request.
// It never retries, never returns the credential, and never permits production.

import {
  EXPECTED_RELAY_BUNDLE_DIGEST,
  EXPECTED_RELAY_PROJECT_ID,
  EXPECTED_RELAY_PROJECT_NAME,
  EXPECTED_RELAY_TEAM_ID
} from './relay-deployment-eligibility.mjs';
import { compileRelayDeploymentAttemptReceipt } from './relay-deployment-attempt.mjs';

export const RELAY_VERCEL_API_EXECUTOR_POLICY_VERSION =
  'relay-vercel-api-executor-1.0.0';
export const RELAY_VERCEL_API_RESPONSE_LIMIT_BYTES = 8 * 1024;
export const RELAY_VERCEL_API_MAX_TIMEOUT_MS = 15_000;

const EXACT_URL =
  `https://api.vercel.com/v13/deployments?teamId=${EXPECTED_RELAY_TEAM_ID}`;

function reject(reasonCodes, detail = {}) {
  return Object.freeze({
    ok: false,
    policyVersion: RELAY_VERCEL_API_EXECUTOR_POLICY_VERSION,
    status: 'REJECTED_BEFORE_EXTERNAL_ATTEMPT',
    reasonCodes: [...new Set(reasonCodes)],
    attemptsConsumed: 0,
    requestCount: 0,
    secondAttemptAuthorized: false,
    productionPromotion: 'BLOCKED',
    externalEffectLedger: Object.freeze({
      deployments: 0,
      productionPromotions: 0,
      messagesOrOutreach: 0,
      spendUsd: 0,
      credentialChanges: 0,
      dnsChanges: 0,
      paymentChanges: 0,
      customerMutations: 0
    }),
    ...detail
  });
}

function exactCompiledRequest(compiled) {
  const request = compiled?.request;
  const body = request?.body;
  return compiled?.status === 'READY_FOR_SINGLE_EXTERNAL_ATTEMPT'
    && compiled?.authorizedAttempts === 1
    && compiled?.secondAttemptAuthorized === false
    && compiled?.transportReady === true
    && request?.method === 'POST'
    && request?.url === EXACT_URL
    && body?.project === EXPECTED_RELAY_PROJECT_ID
    && body?.name === EXPECTED_RELAY_PROJECT_NAME
    && !Object.hasOwn(body, 'target')
    && Array.isArray(body?.files)
    && body.files.length === 7
    && body?.meta?.uberbondBundleDigest === EXPECTED_RELAY_BUNDLE_DIGEST
    && body?.meta?.uberbondConsequenceClass === 'DEPLOYMENT_PREVIEW';
}

function safeErrorCode(response, payload) {
  if (response?.status === 429) return 'QUOTA_EXCEEDED';
  const supplied = String(payload?.error?.code || payload?.code || '').toUpperCase();
  return /^[A-Z0-9_]{1,64}$/.test(supplied)
    ? supplied
    : `HTTP_${Number(response?.status) || 0}`;
}

function withTransport(receipt, detail = {}) {
  return Object.freeze({
    ...receipt,
    executorPolicyVersion: RELAY_VERCEL_API_EXECUTOR_POLICY_VERSION,
    requestCount: 1,
    tokenReturned: false,
    secondAttemptAuthorized: false,
    ...detail
  });
}

function attemptEligibility() {
  return Object.freeze({
    status: 'DEPLOY_PREVIEW_ONCE',
    authorizedAttempts: 1,
    projectId: EXPECTED_RELAY_PROJECT_ID,
    teamId: EXPECTED_RELAY_TEAM_ID,
    environment: 'preview',
    productionPromotion: false
  });
}

function compileAttempt({ bundleDigest, response = null, error = null, date }) {
  return compileRelayDeploymentAttemptReceipt({
    eligibilityDecision: attemptEligibility(),
    bundleDigest,
    response,
    error,
    date
  });
}

export async function executeExactRelayPreviewAttempt({
  compiledRequest,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = RELAY_VERCEL_API_MAX_TIMEOUT_MS,
  date = new Date()
} = {}) {
  if (!exactCompiledRequest(compiledRequest)) {
    return reject(['exact-compiled-preview-request-required']);
  }
  if (typeof token !== 'string' || token.length < 20 || /\s/.test(token)) {
    return reject(['scoped-vercel-token-required']);
  }
  if (typeof fetchImpl !== 'function') return reject(['fetch-implementation-required']);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > RELAY_VERCEL_API_MAX_TIMEOUT_MS) {
    return reject(['bounded-timeout-required']);
  }

  const request = compiledRequest.request;
  const bundleDigest = request.body.meta.uberbondBundleDigest;
  try {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: {
        ...request.headers,
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(timeoutMs)
    });

    const declaredLength = Number(response?.headers?.get?.('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > RELAY_VERCEL_API_RESPONSE_LIMIT_BYTES) {
      return withTransport(compileAttempt({
        bundleDigest,
        error: { code: 'RESPONSE_TOO_LARGE' },
        date
      }), { responseStatus: Number(response?.status) || null });
    }

    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > RELAY_VERCEL_API_RESPONSE_LIMIT_BYTES) {
      return withTransport(compileAttempt({
        bundleDigest,
        error: { code: 'RESPONSE_TOO_LARGE' },
        date
      }), { responseStatus: Number(response?.status) || null });
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return withTransport(compileAttempt({
        bundleDigest,
        error: { code: 'MALFORMED_RESPONSE' },
        date
      }), { responseStatus: Number(response?.status) || null });
    }

    if (!response.ok) {
      return withTransport(compileAttempt({
        bundleDigest,
        error: { code: safeErrorCode(response, payload) },
        date
      }), { responseStatus: Number(response.status) || null });
    }

    const production = String(payload?.target || '').toLowerCase() === 'production';
    const wrongProject = payload?.projectId && payload.projectId !== EXPECTED_RELAY_PROJECT_ID;
    const normalized = production || wrongProject
      ? { id: payload?.id, url: payload?.url, environment: 'INVALID' }
      : { id: payload?.id, url: payload?.url, environment: 'preview' };
    return withTransport(compileAttempt({
      bundleDigest,
      response: normalized,
      date
    }), { responseStatus: Number(response.status) || null });
  } catch (error) {
    const code = ['AbortError', 'TimeoutError'].includes(error?.name)
      ? 'REQUEST_TIMEOUT'
      : 'NETWORK_ERROR';
    return withTransport(compileAttempt({
      bundleDigest,
      error: { code },
      date
    }));
  }
}
