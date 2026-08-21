// Pure compiler for the single exact UberBond relay preview request.
// This module performs no network, filesystem, credential, or deployment action.

import { createHash } from 'node:crypto';
import {
  EXPECTED_RELAY_BUNDLE_BLOBS,
  EXPECTED_RELAY_BUNDLE_DIGEST,
  EXPECTED_RELAY_PROJECT_ID,
  EXPECTED_RELAY_PROJECT_NAME,
  EXPECTED_RELAY_TEAM_ID
} from './relay-deployment-eligibility.mjs';

export const RELAY_VERCEL_API_REQUEST_POLICY_VERSION =
  'relay-vercel-api-request-1.0.0';

function gitBlobSha(data) {
  const bytes = Buffer.from(data, 'utf8');
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
}

function finish(status, reasonCodes, detail = {}) {
  return Object.freeze({
    ok: status === 'READY_FOR_SINGLE_EXTERNAL_ATTEMPT',
    policyVersion: RELAY_VERCEL_API_REQUEST_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes)],
    authorizedAttempts: status === 'READY_FOR_SINGLE_EXTERNAL_ATTEMPT' ? 1 : 0,
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

function exactEligibility(decision) {
  return decision?.status === 'DEPLOY_PREVIEW_ONCE'
    && decision?.authorizedAttempts === 1
    && decision?.projectId === EXPECTED_RELAY_PROJECT_ID
    && decision?.teamId === EXPECTED_RELAY_TEAM_ID
    && decision?.projectName === EXPECTED_RELAY_PROJECT_NAME
    && decision?.environment === 'preview'
    && decision?.productionPromotion === false
    && decision?.deploymentCount === 0;
}

function verifyInlineFiles(files) {
  const reasons = [];
  const rows = Array.isArray(files) ? files : [];
  if (rows.length !== EXPECTED_RELAY_BUNDLE_BLOBS.length) {
    reasons.push('exact-seven-inline-files-required');
  }

  const expected = new Map(EXPECTED_RELAY_BUNDLE_BLOBS.map(row => [row.path, row.sha]));
  const seen = new Set();
  const compiled = [];
  let totalBytes = 0;

  for (const row of rows) {
    const path = String(row?.path || '');
    const data = row?.data;
    if (seen.has(path)) reasons.push('duplicate-inline-file-path');
    seen.add(path);
    if (!expected.has(path)) reasons.push('unexpected-inline-file-path');
    if (typeof data !== 'string') {
      reasons.push('inline-file-string-data-required');
      continue;
    }
    const sha = gitBlobSha(data);
    if (expected.get(path) !== sha) reasons.push('inline-file-git-blob-mismatch');
    totalBytes += Buffer.byteLength(data, 'utf8');
    if (path.startsWith('relay/')) {
      compiled.push(Object.freeze({ file: path.slice('relay/'.length), data }));
    }
  }

  for (const path of expected.keys()) {
    if (!seen.has(path)) reasons.push('expected-inline-file-missing');
  }
  if (totalBytes > 2 * 1024 * 1024) reasons.push('inline-bundle-size-limit-exceeded');

  return {
    ok: reasons.length === 0,
    reasonCodes: [...new Set(reasons)],
    files: compiled.sort((a, b) => a.file.localeCompare(b.file)),
    totalBytes
  };
}

export function compileExactRelayPreviewRequest({
  eligibilityDecision,
  bundleDigest,
  files,
  credentialAvailable = false
} = {}) {
  if (!exactEligibility(eligibilityDecision)) {
    return finish('REJECTED', ['exact-one-preview-eligibility-required']);
  }
  if (bundleDigest !== EXPECTED_RELAY_BUNDLE_DIGEST) {
    return finish('REJECTED', ['canonical-bundle-digest-required']);
  }

  const inline = verifyInlineFiles(files);
  if (!inline.ok) {
    return finish('REJECTED', inline.reasonCodes, {
      verifiedFileCount: 0,
      totalBytes: inline.totalBytes
    });
  }

  const request = Object.freeze({
    method: 'POST',
    url: `https://api.vercel.com/v13/deployments?teamId=${EXPECTED_RELAY_TEAM_ID}`,
    headers: Object.freeze({ 'content-type': 'application/json' }),
    authorizationHeaderRequired: 'Bearer <VERCEL_TOKEN>',
    body: Object.freeze({
      name: EXPECTED_RELAY_PROJECT_NAME,
      project: EXPECTED_RELAY_PROJECT_ID,
      files: Object.freeze(inline.files),
      meta: Object.freeze({
        uberbondBundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
        uberbondConsequenceClass: 'DEPLOYMENT_PREVIEW'
      })
    })
  });

  if (credentialAvailable !== true) {
    return finish('BLOCKED_CREDENTIAL_REQUIRED', ['vercel-token-not-available'], {
      request,
      verifiedFileCount: inline.files.length,
      totalBytes: inline.totalBytes,
      transportReady: false
    });
  }

  return finish('READY_FOR_SINGLE_EXTERNAL_ATTEMPT', [], {
    request,
    verifiedFileCount: inline.files.length,
    totalBytes: inline.totalBytes,
    transportReady: true,
    truthCeiling: 'INTERFACE_ONLY'
  });
}

