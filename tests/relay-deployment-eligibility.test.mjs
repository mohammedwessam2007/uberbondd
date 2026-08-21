import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRelayDeploymentEligibility,
  EXPECTED_RELAY_BUNDLE_BLOBS,
  EXPECTED_RELAY_BUNDLE_DIGEST,
  EXPECTED_RELAY_PROJECT_ID,
  EXPECTED_RELAY_PROJECT_NAME,
  EXPECTED_RELAY_TEAM_ID
} from '../src/relay-deployment-eligibility.mjs';

const resetAt = '2026-08-21T01:26:31.833Z';
const project = {
  id: EXPECTED_RELAY_PROJECT_ID,
  accountId: EXPECTED_RELAY_TEAM_ID,
  name: EXPECTED_RELAY_PROJECT_NAME,
  latestDeployment: null
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

test('waits before exact reset', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: bundle, resetAt,
    date: '2026-08-21T01:26:31.832Z'
  });
  assert.equal(value.status, 'WAIT_FOR_QUOTA_RESET');
  assert.equal(value.authorizedAttempts, 0);
  assert.equal(value.remainingMs, 1);
});

test('authorizes exactly one preview attempt at reset', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: bundle, resetAt, date: resetAt
  });
  assert.equal(value.status, 'DEPLOY_PREVIEW_ONCE');
  assert.equal(value.authorizedAttempts, 1);
  assert.equal(value.environment, 'preview');
  assert.equal(value.productionPromotion, false);
  assert.equal(value.truthCeiling, 'INTERFACE_ONLY');
});

test('authorizes exactly one preview attempt after reset', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: bundle, resetAt,
    date: '2026-08-21T02:00:00.000Z'
  });
  assert.equal(value.status, 'DEPLOY_PREVIEW_ONCE');
  assert.equal(value.authorizedAttempts, 1);
});

test('near-match project name fails closed', () => {
  const value = evaluateRelayDeploymentEligibility({
    project: { ...project, name: 'uberbond-relay' },
    deployments: [], testedBundle: bundle, resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
});

test('wrong project id fails closed', () => {
  const value = evaluateRelayDeploymentEligibility({
    project: { ...project, id: 'prj_wrong' },
    deployments: [], testedBundle: bundle, resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
});

test('wrong team fails closed', () => {
  const value = evaluateRelayDeploymentEligibility({
    project: { ...project, accountId: 'team_wrong' },
    deployments: [], testedBundle: bundle, resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
});

test('digest mismatch fails closed', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: { ...bundle, matchedBlobCount: 6 },
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
});

test('count-only evidence cannot impersonate byte-for-byte proof', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: { ...bundle, blobs: undefined },
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
  assert.ok(value.bundleReasonCodes.includes('exact-blob-manifest-required'));
});

test('one substituted blob hash fails closed despite matching counts', () => {
  const blobs = bundle.blobs.map((item, index) => index === 0 ? { ...item, sha: '0'.repeat(40) } : item);
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: { ...bundle, blobs },
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
  assert.ok(value.bundleReasonCodes.includes('blob-path-or-sha-mismatch'));
});

test('duplicate path plus missing expected path fails closed', () => {
  const blobs = bundle.blobs.map(item => ({ ...item }));
  blobs[1] = { ...blobs[0] };
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: { ...bundle, blobs },
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
  assert.ok(value.bundleReasonCodes.includes('duplicate-blob-path'));
  assert.ok(value.bundleReasonCodes.includes('expected-blob-missing'));
});

test('claimed digest must equal the canonical manifest digest', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: { ...bundle, digest: 'f'.repeat(64) },
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
  assert.ok(value.bundleReasonCodes.includes('canonical-bundle-digest-required'));
});

test('manifest order does not affect canonical digest', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: { ...bundle, blobs: [...bundle.blobs].reverse() },
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'DEPLOY_PREVIEW_ONCE');
});

test('test failure fails closed', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: { ...bundle, failedTests: 1 },
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
});

test('wrong bundle root fails closed', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: { ...bundle, root: 'lite/' },
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'INVALID');
});

test('existing deployment switches to verification only', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [{ id: 'dpl_existing' }], testedBundle: bundle,
    resetAt, date: resetAt
  });
  assert.equal(value.status, 'ALREADY_DEPLOYED_VERIFY_ONLY');
  assert.equal(value.authorizedAttempts, 0);
});

test('project latest deployment also prevents another attempt', () => {
  const value = evaluateRelayDeploymentEligibility({
    project: { ...project, latestDeployment: { id: 'dpl_existing' } },
    deployments: [], testedBundle: bundle, resetAt, date: resetAt
  });
  assert.equal(value.status, 'ALREADY_DEPLOYED_VERIFY_ONLY');
});

test('invalid timestamps fail closed', () => {
  const value = evaluateRelayDeploymentEligibility({
    project, deployments: [], testedBundle: bundle, resetAt: 'invalid', date: resetAt
  });
  assert.equal(value.status, 'INVALID');
  assert.equal(value.authorizedAttempts, 0);
});
