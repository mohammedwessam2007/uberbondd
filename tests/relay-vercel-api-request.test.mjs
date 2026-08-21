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

const root = new URL('../', import.meta.url);
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

async function exactFiles() {
  return Promise.all(EXPECTED_RELAY_BUNDLE_BLOBS.map(async ({ path }) => ({
    path,
    data: await readFile(new URL(path, root), 'utf8')
  })));
}

test('compiles a credential-gated exact request without executing it', async () => {
  const result = compileExactRelayPreviewRequest({
    eligibilityDecision: eligibility,
    bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    files: await exactFiles()
  });
  assert.equal(result.status, 'BLOCKED_CREDENTIAL_REQUIRED');
  assert.equal(result.ok, false);
  assert.equal(result.authorizedAttempts, 0);
  assert.equal(result.transportReady, false);
  assert.equal(result.verifiedFileCount, 7);
  assert.equal(result.request.method, 'POST');
  assert.equal(
    result.request.url,
    `https://api.vercel.com/v13/deployments?teamId=${EXPECTED_RELAY_TEAM_ID}`
  );
  assert.equal(result.request.body.project, EXPECTED_RELAY_PROJECT_ID);
  assert.equal(result.request.body.name, EXPECTED_RELAY_PROJECT_NAME);
  assert.equal('target' in result.request.body, false);
  assert.equal(result.request.body.files.length, 7);
  assert.equal(result.externalEffectLedger.deployments, 0);
});

test('credential availability permits one request but does not execute it', async () => {
  const result = compileExactRelayPreviewRequest({
    eligibilityDecision: eligibility,
    bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    files: await exactFiles(),
    credentialAvailable: true
  });
  assert.equal(result.status, 'READY_FOR_SINGLE_EXTERNAL_ATTEMPT');
  assert.equal(result.authorizedAttempts, 1);
  assert.equal(result.secondAttemptAuthorized, false);
  assert.equal(result.productionPromotion, 'BLOCKED');
  assert.equal(result.truthCeiling, 'INTERFACE_ONLY');
  assert.equal(result.externalEffectLedger.deployments, 0);
});

for (const [name, mutate, reason] of [
  ['wrong project', d => ({ ...d, projectId: 'prj_wrong' }), 'exact-one-preview-eligibility-required'],
  ['wrong team', d => ({ ...d, teamId: 'team_wrong' }), 'exact-one-preview-eligibility-required'],
  ['production environment', d => ({ ...d, environment: 'production' }), 'exact-one-preview-eligibility-required'],
  ['existing deployment', d => ({ ...d, deploymentCount: 1 }), 'exact-one-preview-eligibility-required'],
  ['second attempt', d => ({ ...d, authorizedAttempts: 2 }), 'exact-one-preview-eligibility-required']
]) {
  test(`rejects ${name}`, async () => {
    const result = compileExactRelayPreviewRequest({
      eligibilityDecision: mutate(eligibility),
      bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
      files: await exactFiles(),
      credentialAvailable: true
    });
    assert.equal(result.status, 'REJECTED');
    assert.ok(result.reasonCodes.includes(reason));
  });
}

test('rejects a substituted digest', async () => {
  const result = compileExactRelayPreviewRequest({
    eligibilityDecision: eligibility,
    bundleDigest: '0'.repeat(64),
    files: await exactFiles(),
    credentialAvailable: true
  });
  assert.ok(result.reasonCodes.includes('canonical-bundle-digest-required'));
});

test('rejects changed file bytes', async () => {
  const files = await exactFiles();
  files[0] = { ...files[0], data: `${files[0].data}\nchanged` };
  const result = compileExactRelayPreviewRequest({
    eligibilityDecision: eligibility,
    bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    files,
    credentialAvailable: true
  });
  assert.ok(result.reasonCodes.includes('inline-file-git-blob-mismatch'));
});

test('rejects duplicate and missing paths', async () => {
  const files = await exactFiles();
  files[0] = { ...files[1] };
  const result = compileExactRelayPreviewRequest({
    eligibilityDecision: eligibility,
    bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    files,
    credentialAvailable: true
  });
  assert.ok(result.reasonCodes.includes('duplicate-inline-file-path'));
  assert.ok(result.reasonCodes.includes('expected-inline-file-missing'));
});

test('rejects an extra path even when count remains seven', async () => {
  const files = await exactFiles();
  files[0] = { path: 'relay/evil.mjs', data: 'export default 1;\n' };
  const result = compileExactRelayPreviewRequest({
    eligibilityDecision: eligibility,
    bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    files,
    credentialAvailable: true
  });
  assert.ok(result.reasonCodes.includes('unexpected-inline-file-path'));
});

test('never places a credential value in the compiled request', async () => {
  const result = compileExactRelayPreviewRequest({
    eligibilityDecision: eligibility,
    bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    files: await exactFiles(),
    credentialAvailable: true
  });
  assert.equal(JSON.stringify(result).includes('Authorization'), false);
  assert.equal(JSON.stringify(result).includes('Bearer secret'), false);
});

