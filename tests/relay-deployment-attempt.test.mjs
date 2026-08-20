import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRelayDeploymentAttemptReceipt, reconcileRelayDeploymentAttempt } from '../src/relay-deployment-attempt.mjs';
import { EXPECTED_RELAY_PROJECT_ID, EXPECTED_RELAY_PROJECT_NAME, EXPECTED_RELAY_TEAM_ID } from '../src/relay-deployment-eligibility.mjs';

const eligibility = {
  status: 'DEPLOY_PREVIEW_ONCE', authorizedAttempts: 1,
  projectId: EXPECTED_RELAY_PROJECT_ID, teamId: EXPECTED_RELAY_TEAM_ID,
  environment: 'preview', productionPromotion: false
};
const bundleDigest = 'a'.repeat(64);
const project = { id: EXPECTED_RELAY_PROJECT_ID, accountId: EXPECTED_RELAY_TEAM_ID, name: EXPECTED_RELAY_PROJECT_NAME };

function accepted(overrides = {}) {
  return compileRelayDeploymentAttemptReceipt({
    eligibilityDecision: eligibility,
    bundleDigest,
    response: { id: 'dpl_ABC123', url: 'relay-preview.vercel.app', environment: 'preview' },
    date: '2026-08-21T01:27:00Z',
    ...overrides
  });
}

test('records one accepted preview attempt and requires verification', () => {
  const receipt = accepted();
  assert.equal(receipt.status, 'ATTEMPT_ACCEPTED_VERIFY');
  assert.equal(receipt.attemptsConsumed, 1);
  assert.equal(receipt.secondAttemptAuthorized, false);
  assert.equal(receipt.externalEffectLedger.deployments, 1);
});
test('attempt receipt is deterministic', () => assert.equal(accepted().attemptId, accepted().attemptId));
test('rejects pre-reset or otherwise ineligible decision', () => assert.equal(accepted({ eligibilityDecision: { ...eligibility, status: 'WAIT_FOR_QUOTA_RESET' } }).ok, false));
test('rejects wrong project authorization', () => assert.equal(accepted({ eligibilityDecision: { ...eligibility, projectId: 'prj_wrong' } }).ok, false));
test('rejects production authorization', () => assert.equal(accepted({ eligibilityDecision: { ...eligibility, environment: 'production' } }).ok, false));
test('rejects missing bundle digest', () => assert.equal(accepted({ bundleDigest: '' }).ok, false));
test('rejects response and error contradiction', () => assert.equal(accepted({ error: { code: 'TIMEOUT' } }).ok, false));
test('invalid deployment response becomes uncertain, never retriable', () => {
  const receipt = accepted({ response: { id: 'bad', url: 'example.com', environment: 'production' } });
  assert.equal(receipt.status, 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY');
  assert.equal(receipt.secondAttemptAuthorized, false);
});
test('known quota error blocks a second attempt in the run', () => {
  const receipt = accepted({ response: null, error: { code: 'QUOTA_EXCEEDED' } });
  assert.equal(receipt.status, 'ATTEMPT_BLOCKED_NO_RETRY_THIS_RUN');
  assert.equal(receipt.attemptsConsumed, 1);
});
test('network error becomes uncertain', () => assert.equal(accepted({ response: null, error: { code: 'ETIMEDOUT' } }).status, 'ATTEMPT_UNCERTAIN_RECONCILE_ONLY'));
test('missing response and error is rejected', () => assert.equal(accepted({ response: null }).ok, false));

test('ready matching deployment routes to endpoint verification', () => {
  const decision = reconcileRelayDeploymentAttempt({
    attemptReceipt: accepted(), project,
    deployments: [{ id: 'dpl_ABC123', url: 'relay-preview.vercel.app', environment: 'preview', state: 'READY' }],
    date: '2026-08-21T01:28:00Z'
  });
  assert.equal(decision.status, 'VERIFY_ENDPOINTS');
  assert.equal(decision.secondAttemptAuthorized, false);
});
test('building deployment waits without retry', () => assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt: accepted(), project, deployments: [{ id: 'dpl_ABC123', environment: 'preview', state: 'BUILDING' }] }).status, 'WAIT_NO_RETRY'));
test('terminal deployment failure stops for repair', () => assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt: accepted(), project, deployments: [{ id: 'dpl_ABC123', environment: 'preview', state: 'ERROR' }] }).status, 'STOP_REPAIR_REQUIRED'));
test('missing deployment after accepted response quarantines unknown outcome', () => assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt: accepted(), project, deployments: [] }).status, 'QUARANTINED'));
test('deployment identity mismatch quarantines', () => assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt: accepted(), project, deployments: [{ id: 'dpl_OTHER', environment: 'preview', state: 'READY' }] }).status, 'QUARANTINED'));
test('multiple deployments quarantine', () => assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt: accepted(), project, deployments: [{ id: 'dpl_ABC123' }, { id: 'dpl_OTHER' }] }).status, 'QUARANTINED'));
test('wrong project quarantines', () => assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt: accepted(), project: { ...project, name: 'uberbond-relay' }, deployments: [] }).status, 'QUARANTINED'));
test('production deployment quarantines', () => assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt: accepted(), project, deployments: [{ id: 'dpl_ABC123', environment: 'production', state: 'READY' }] }).status, 'QUARANTINED'));
test('quota error with zero deployments confirms stop', () => {
  const attemptReceipt = accepted({ response: null, error: { code: 'DEPLOYMENT_QUOTA_EXCEEDED' } });
  assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt, project, deployments: [] }).status, 'STOP_NO_SECOND_ATTEMPT');
});
test('quota error contradicted by deployment quarantines', () => {
  const attemptReceipt = accepted({ response: null, error: { code: 'RATE_LIMITED' } });
  assert.equal(reconcileRelayDeploymentAttempt({ attemptReceipt, project, deployments: [{ id: 'dpl_X' }] }).status, 'QUARANTINED');
});
test('source contains no Vercel or deployment mutation call', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/relay-deployment-attempt.mjs', import.meta.url), 'utf8'));
  for (const token of ['deployProject(', 'createDeployment(', 'promoteDeployment(', 'fetch(']) assert.equal(source.includes(token), false);
});
