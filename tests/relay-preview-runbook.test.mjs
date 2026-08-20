import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayPreviewRun, advanceRelayPreviewRun } from '../src/relay-preview-runbook.mjs';

const digest = 'b'.repeat(64);
const resetAt = '2026-08-21T01:26:31.833Z';
const eligibility = { status: 'DEPLOY_PREVIEW_ONCE', authorizedAttempts: 1 };
const zero = { providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 };

function readyRun() { return createRelayPreviewRun({ bundleDigest: digest, resetAt, date: '2026-08-21T01:27:00Z' }); }
function authorizedRun() { return advanceRelayPreviewRun({ run: readyRun(), event: { type: 'PREFLIGHT_DECIDED', decision: eligibility }, date: '2026-08-21T01:27:01Z' }); }
function attemptedRun() { return advanceRelayPreviewRun({ run: authorizedRun(), event: { type: 'ATTEMPT_RECORDED', receipt: { attemptsConsumed: 1, secondAttemptAuthorized: false, attemptId: 'attempt:1', externalEffectLedger: { ...zero, deployments: 1 } } }, date: '2026-08-21T01:27:02Z' }); }
function endpointRun() { return advanceRelayPreviewRun({ run: attemptedRun(), event: { type: 'ATTEMPT_RECONCILED', decision: { status: 'VERIFY_ENDPOINTS', deploymentId: 'dpl_ABC', url: 'https://preview.vercel.app' } }, date: '2026-08-21T01:27:03Z' }); }

test('creates deterministic waiting run before reset', () => {
  const a = createRelayPreviewRun({ bundleDigest: digest, resetAt, date: '2026-08-20T20:00:00Z' });
  const b = createRelayPreviewRun({ bundleDigest: digest, resetAt, date: '2026-08-20T21:00:00Z' });
  assert.equal(a.stage, 'WAITING_FOR_RESET');
  assert.equal(a.runId, b.runId);
});
test('creates preflight run after reset', () => assert.equal(readyRun().stage, 'PREFLIGHT_REQUIRED'));
test('rejects invalid digest', () => assert.equal(createRelayPreviewRun({ bundleDigest: 'bad', resetAt }).stage, 'QUARANTINED'));
test('clock before reset remains waiting', () => {
  const run = createRelayPreviewRun({ bundleDigest: digest, resetAt, date: '2026-08-20T20:00:00Z' });
  assert.equal(advanceRelayPreviewRun({ run, event: { type: 'CLOCK_OBSERVED' }, date: '2026-08-20T21:00:00Z' }).stage, 'WAITING_FOR_RESET');
});
test('clock after reset requires preflight', () => {
  const run = createRelayPreviewRun({ bundleDigest: digest, resetAt, date: '2026-08-20T20:00:00Z' });
  assert.equal(advanceRelayPreviewRun({ run, event: { type: 'CLOCK_OBSERVED' }, date: '2026-08-21T01:27:00Z' }).stage, 'PREFLIGHT_REQUIRED');
});
test('wrong event order quarantines', () => assert.equal(advanceRelayPreviewRun({ run: readyRun(), event: { type: 'ATTEMPT_RECORDED' } }).stage, 'QUARANTINED'));
test('valid preflight authorizes one attempt', () => assert.equal(authorizedRun().stage, 'ATTEMPT_AUTHORIZED'));
test('invalid preflight quarantines', () => assert.equal(advanceRelayPreviewRun({ run: readyRun(), event: { type: 'PREFLIGHT_DECIDED', decision: { status: 'INVALID' } } }).stage, 'QUARANTINED'));
test('existing deployment routes directly to reconciliation', () => assert.equal(advanceRelayPreviewRun({ run: readyRun(), event: { type: 'PREFLIGHT_DECIDED', decision: { status: 'ALREADY_DEPLOYED_VERIFY_ONLY' } } }).stage, 'RECONCILIATION_REQUIRED'));
test('one-shot attempt moves to reconciliation', () => {
  const run = attemptedRun();
  assert.equal(run.stage, 'RECONCILIATION_REQUIRED');
  assert.equal(run.attemptsConsumed, 1);
  assert.equal(run.secondAttemptAuthorized, false);
});
test('attempt missing no-retry proof quarantines', () => assert.equal(advanceRelayPreviewRun({ run: authorizedRun(), event: { type: 'ATTEMPT_RECORDED', receipt: { attemptsConsumed: 1, secondAttemptAuthorized: true } } }).stage, 'QUARANTINED'));
test('ready reconciliation requires endpoint proof', () => assert.equal(endpointRun().stage, 'ENDPOINT_PROOF_REQUIRED'));
test('building deployment waits without retry', () => assert.equal(advanceRelayPreviewRun({ run: attemptedRun(), event: { type: 'ATTEMPT_RECONCILED', decision: { status: 'WAIT_NO_RETRY' } } }).stage, 'RECONCILIATION_REQUIRED'));
test('terminal failure requires repair', () => assert.equal(advanceRelayPreviewRun({ run: attemptedRun(), event: { type: 'ATTEMPT_RECONCILED', decision: { status: 'STOP_REPAIR_REQUIRED' } } }).stage, 'REPAIR_REQUIRED'));
test('quota block becomes terminal blocked', () => assert.equal(advanceRelayPreviewRun({ run: attemptedRun(), event: { type: 'ATTEMPT_RECONCILED', decision: { status: 'STOP_NO_SECOND_ATTEMPT' } } }).stage, 'BLOCKED'));
test('uncertain outcome quarantines', () => assert.equal(advanceRelayPreviewRun({ run: attemptedRun(), event: { type: 'ATTEMPT_RECONCILED', decision: { status: 'QUARANTINED' } } }).stage, 'QUARANTINED'));
test('valid endpoint receipt proves interface only', () => {
  const run = advanceRelayPreviewRun({ run: endpointRun(), event: { type: 'ENDPOINTS_PROVEN', receipt: { status: 'PREVIEW_INTERFACE_PROVEN', truthClassification: 'INTERFACE_ONLY', deploymentId: 'dpl_ABC', productionPromotion: 'BLOCKED', receiptId: 'receipt:1' } }, date: '2026-08-21T01:27:04Z' });
  assert.equal(run.stage, 'INTERFACE_PROVEN');
  assert.equal(run.truthClassification, 'INTERFACE_ONLY');
  assert.equal(run.workerExecution, 'BLOCKED');
});
test('endpoint deployment mismatch quarantines', () => assert.equal(advanceRelayPreviewRun({ run: endpointRun(), event: { type: 'ENDPOINTS_PROVEN', receipt: { status: 'PREVIEW_INTERFACE_PROVEN', truthClassification: 'INTERFACE_ONLY', deploymentId: 'dpl_OTHER', productionPromotion: 'BLOCKED' } } }).stage, 'QUARANTINED'));
test('truth inflation quarantines', () => assert.equal(advanceRelayPreviewRun({ run: endpointRun(), event: { type: 'ENDPOINTS_PROVEN', receipt: { status: 'PREVIEW_INTERFACE_PROVEN', truthClassification: 'FULLY_LIVE', deploymentId: 'dpl_ABC', productionPromotion: 'BLOCKED' } } }).stage, 'QUARANTINED'));
test('terminal interface proof cannot advance', () => {
  const proven = advanceRelayPreviewRun({ run: endpointRun(), event: { type: 'ENDPOINTS_PROVEN', receipt: { status: 'PREVIEW_INTERFACE_PROVEN', truthClassification: 'INTERFACE_ONLY', deploymentId: 'dpl_ABC', productionPromotion: 'BLOCKED' } } });
  assert.equal(advanceRelayPreviewRun({ run: proven, event: { type: 'PREFLIGHT_DECIDED', decision: eligibility } }).stage, 'QUARANTINED');
});
test('source has no external mutation primitive', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/relay-preview-runbook.mjs', import.meta.url), 'utf8'));
  for (const token of ['fetch(', 'createDeployment(', 'deployProject(', 'promoteDeployment(', 'enqueue(', 'claimCloudRelayTask(']) assert.equal(source.includes(token), false);
});
