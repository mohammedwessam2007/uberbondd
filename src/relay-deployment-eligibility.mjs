// Pure preflight for the single authorized UberBond relay preview deployment.
// It never calls Vercel and cannot deploy, promote, alias, or mutate a project.

import { createHash } from 'node:crypto';

export const RELAY_DEPLOYMENT_ELIGIBILITY_POLICY_VERSION =
  'relay-deployment-eligibility-1.0.0';
export const EXPECTED_RELAY_PROJECT_ID = 'prj_QTPTlb6JpYN8IyBTgyVrlWgq4ePT';
export const EXPECTED_RELAY_TEAM_ID = 'team_A9LnjIuS5PU0rNetsHMu1N0r';
export const EXPECTED_RELAY_PROJECT_NAME = 'uberbondd-relay';
export const EXPECTED_RELAY_BUNDLE_BLOBS = Object.freeze([
  Object.freeze({ path: 'relay/README.md', sha: 'ce140dd935f96cec3735b50cf3f799ac4126a99c' }),
  Object.freeze({ path: 'relay/api/agent-relay/health.mjs', sha: '637aeb1d004a943c2123b6eaf287f5c669c2392c' }),
  Object.freeze({ path: 'relay/api/agent-relay/tasks.mjs', sha: 'a7962dbbe491abb00062be224014a8493f494d30' }),
  Object.freeze({ path: 'relay/api/agent-relay/tasks/[...path].mjs', sha: 'fbada490c96fc49cd11c18ed3c03dc288bdd37f2' }),
  Object.freeze({ path: 'relay/lib/contract.mjs', sha: '522813ac4918bb1d8080f9395a2d13f33bf4ce10' }),
  Object.freeze({ path: 'relay/package.json', sha: 'd8c2ea455fd8f3a50e055f40f4eb7df185722904' }),
  Object.freeze({ path: 'relay/vercel.json', sha: '842896260c1a120b3907b8ad12702137a76bf49a' })
]);
export const EXPECTED_RELAY_BUNDLE_DIGEST =
  '210ce5422f776201e68dd2b7a853c9e4490def02ca69789b8e3c2067dd3d6b25';

function canonicalManifestDigest(blobs) {
  const lines = blobs
    .map(item => `${item.path} ${item.sha}`)
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex');
}

export function verifyRelayBundleEvidence(testedBundle) {
  const reasons = [];
  const blobs = Array.isArray(testedBundle?.blobs) ? testedBundle.blobs : [];
  if (testedBundle?.ok !== true) reasons.push('bundle-verification-not-passed');
  if (testedBundle?.root !== 'relay/') reasons.push('relay-root-required');
  if (testedBundle?.matchedBlobCount !== EXPECTED_RELAY_BUNDLE_BLOBS.length
    || testedBundle?.expectedBlobCount !== EXPECTED_RELAY_BUNDLE_BLOBS.length) {
    reasons.push('exact-seven-blob-count-required');
  }
  if (testedBundle?.failedTests !== 0) reasons.push('zero-failed-tests-required');
  if (blobs.length !== EXPECTED_RELAY_BUNDLE_BLOBS.length) reasons.push('exact-blob-manifest-required');

  const expected = new Map(EXPECTED_RELAY_BUNDLE_BLOBS.map(item => [item.path, item.sha]));
  const seen = new Set();
  for (const item of blobs) {
    const path = String(item?.path || '');
    const sha = String(item?.sha || '').toLowerCase();
    if (seen.has(path)) reasons.push('duplicate-blob-path');
    seen.add(path);
    if (expected.get(path) !== sha) reasons.push('blob-path-or-sha-mismatch');
  }
  for (const path of expected.keys()) {
    if (!seen.has(path)) reasons.push('expected-blob-missing');
  }

  const computedDigest = blobs.length
    ? canonicalManifestDigest(blobs.map(item => ({
        path: String(item?.path || ''),
        sha: String(item?.sha || '').toLowerCase()
      })))
    : null;
  if (computedDigest !== EXPECTED_RELAY_BUNDLE_DIGEST
    || testedBundle?.digest !== EXPECTED_RELAY_BUNDLE_DIGEST) {
    reasons.push('canonical-bundle-digest-required');
  }

  return Object.freeze({
    ok: reasons.length === 0,
    reasonCodes: [...new Set(reasons)],
    expectedBlobCount: EXPECTED_RELAY_BUNDLE_BLOBS.length,
    matchedBlobCount: reasons.length === 0 ? EXPECTED_RELAY_BUNDLE_BLOBS.length : 0,
    expectedDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    computedDigest
  });
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function decision(status, reasonCodes, detail = {}) {
  return {
    ok: status !== 'INVALID',
    policyVersion: RELAY_DEPLOYMENT_ELIGIBILITY_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    authorizedAttempts: status === 'DEPLOY_PREVIEW_ONCE' ? 1 : 0,
    productionPromotion: false,
    ...detail
  };
}

export function evaluateRelayDeploymentEligibility({
  project,
  deployments,
  testedBundle,
  resetAt,
  date = new Date()
} = {}) {
  const observedAt = timestamp(date);
  const quotaResetAt = timestamp(resetAt);
  if (!observedAt || !quotaResetAt) {
    return decision('INVALID', ['valid-time-evidence-required'], { observedAt, quotaResetAt });
  }
  if (project?.id !== EXPECTED_RELAY_PROJECT_ID
    || project?.accountId !== EXPECTED_RELAY_TEAM_ID
    || project?.name !== EXPECTED_RELAY_PROJECT_NAME) {
    return decision('INVALID', ['exact-relay-project-identity-required'], { observedAt, quotaResetAt });
  }
  const bundleEvidence = verifyRelayBundleEvidence(testedBundle);
  if (!bundleEvidence.ok) {
    return decision('INVALID', ['byte-for-byte-tested-relay-bundle-required'], {
      observedAt,
      quotaResetAt,
      bundleReasonCodes: bundleEvidence.reasonCodes
    });
  }

  const items = Array.isArray(deployments) ? deployments : [];
  if (items.length > 0 || project.latestDeployment) {
    return decision('ALREADY_DEPLOYED_VERIFY_ONLY', ['deployment-already-exists'], {
      observedAt,
      quotaResetAt,
      deploymentCount: items.length
    });
  }
  if (Date.parse(observedAt) < Date.parse(quotaResetAt)) {
    return decision('WAIT_FOR_QUOTA_RESET', ['deployment-window-not-open'], {
      observedAt,
      quotaResetAt,
      remainingMs: Date.parse(quotaResetAt) - Date.parse(observedAt),
      deploymentCount: 0
    });
  }
  return decision('DEPLOY_PREVIEW_ONCE', [], {
    observedAt,
    quotaResetAt,
    projectId: EXPECTED_RELAY_PROJECT_ID,
    teamId: EXPECTED_RELAY_TEAM_ID,
    projectName: EXPECTED_RELAY_PROJECT_NAME,
    environment: 'preview',
    deploymentCount: 0,
    requiredVerification: [
      'deployment-state-READY',
      'GET-health-200-HEALTHY_PARTIAL_ADAPTER',
      'tasks-501-durable-queue-required'
    ],
    truthCeiling: 'INTERFACE_ONLY'
  });
}
