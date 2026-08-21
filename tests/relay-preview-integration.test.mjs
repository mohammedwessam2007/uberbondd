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
import {
  verifyRelayPreviewEndpoints,
  compileRelayPreviewReceipt
} from '../src/relay-preview-proof.mjs';
import {
  createRelayPreviewRun,
  advanceRelayPreviewRun
} from '../src/relay-preview-runbook.mjs';
import {
  compileRelayShadowBindingPlan,
  RELAY_JOB_TYPE
} from '../src/relay-shadow-binding.mjs';

const resetAt = '2026-08-21T01:26:31.833Z';
const date = '2026-08-21T01:27:00.000Z';
const url = 'https://uberbondd-relay-preview.vercel.app';
const zero = {
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
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
const deployment = {
  id: 'dpl_SeamProof123',
  projectId: EXPECTED_RELAY_PROJECT_ID,
  teamId: EXPECTED_RELAY_TEAM_ID,
  state: 'READY',
  environment: 'preview',
  url
};

function response(status, body) {
  return { status, async json() { return body; } };
}

async function verifiedEndpointProof() {
  return verifyRelayPreviewEndpoints({
    baseUrl: url,
    fetchFn: async target => String(target).endsWith('/health')
      ? response(200, {
          status: 'HEALTHY_PARTIAL_ADAPTER',
          truth: { cloudRelay: 'INTERFACE_ONLY' }
        })
      : response(501, {
          status: 'NOT_IMPLEMENTED',
          reasonCodes: ['durable-queue-required'],
          truth: { cloudRelay: 'INTERFACE_ONLY' }
        })
  });
}

function runAtEndpointProof() {
  const eligibility = evaluateRelayDeploymentEligibility({
    project: {
      id: EXPECTED_RELAY_PROJECT_ID,
      accountId: EXPECTED_RELAY_TEAM_ID,
      name: EXPECTED_RELAY_PROJECT_NAME,
      latestDeployment: null
    },
    deployments: [],
    testedBundle: bundle,
    resetAt,
    date
  });
  let run = createRelayPreviewRun({
    bundleDigest: EXPECTED_RELAY_BUNDLE_DIGEST,
    resetAt,
    date
  });
  run = advanceRelayPreviewRun({
    run,
    event: { type: 'PREFLIGHT_DECIDED', decision: eligibility },
    date: '2026-08-21T01:27:01.000Z'
  });
  run = advanceRelayPreviewRun({
    run,
    event: {
      type: 'ATTEMPT_RECORDED',
      receipt: {
        attemptsConsumed: 1,
        secondAttemptAuthorized: false,
        attemptId: 'relay-deploy-attempt:seam',
        externalEffectLedger: { ...zero, deployments: 1 }
      }
    },
    date: '2026-08-21T01:27:02.000Z'
  });
  return advanceRelayPreviewRun({
    run,
    event: {
      type: 'ATTEMPT_RECONCILED',
      decision: {
        status: 'VERIFY_ENDPOINTS',
        deploymentId: deployment.id,
        url
      }
    },
    date: '2026-08-21T01:27:03.000Z'
  });
}

test('canonical compiler receipt advances runbook and plans read-only shadow binding', async () => {
  const endpointProof = await verifiedEndpointProof();
  const receipt = compileRelayPreviewReceipt({
    deployment,
    endpointProof,
    testedBundle: bundle,
    date: '2026-08-21T01:27:04.000Z'
  });
  assert.equal(receipt.ok, true);

  const proven = advanceRelayPreviewRun({
    run: runAtEndpointProof(),
    event: { type: 'ENDPOINTS_PROVEN', receipt },
    date: '2026-08-21T01:27:05.000Z'
  });
  assert.equal(proven.stage, 'INTERFACE_PROVEN');
  assert.equal(proven.truthClassification, 'INTERFACE_ONLY');

  const plan = compileRelayShadowBindingPlan({
    previewReceipt: receipt,
    queueContract: {
      jobType: RELAY_JOB_TYPE,
      durableStore: true,
      readOnly: true,
      executionAuthority: false,
      externalEffectLedger: zero
    },
    date: '2026-08-21T01:27:06.000Z'
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.deploymentId, deployment.id);
  assert.equal(plan.previewUrl, url);
  assert.equal(plan.executionAuthority, false);
  assert.equal(plan.workerExecution, 'BLOCKED');
});

test('legacy top-level-only receipt cannot bypass canonical nested deployment identity', async () => {
  const endpointProof = await verifiedEndpointProof();
  const canonical = compileRelayPreviewReceipt({
    deployment,
    endpointProof,
    testedBundle: bundle,
    date: '2026-08-21T01:27:04.000Z'
  });
  const { deployment: ignored, ...legacy } = canonical;
  const topLevelOnly = {
    ...legacy,
    deploymentId: deployment.id,
    projectId: deployment.projectId,
    teamId: deployment.teamId,
    environment: deployment.environment,
    url: deployment.url
  };

  const run = advanceRelayPreviewRun({
    run: runAtEndpointProof(),
    event: { type: 'ENDPOINTS_PROVEN', receipt: topLevelOnly },
    date: '2026-08-21T01:27:05.000Z'
  });
  assert.equal(run.stage, 'QUARANTINED');
  assert.equal(compileRelayShadowBindingPlan({
    previewReceipt: topLevelOnly,
    queueContract: {
      jobType: RELAY_JOB_TYPE,
      durableStore: true,
      readOnly: true,
      executionAuthority: false,
      externalEffectLedger: zero
    }
  }).ok, false);
});

