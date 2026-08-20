import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileRelayShadowBindingPlan,
  evaluateRelayShadowObservation,
  RELAY_JOB_TYPE,
  RELAY_PROJECT_ID,
  RELAY_TEAM_ID
} from '../src/relay-shadow-binding.mjs';

const zero = { providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 };
const receipt = {
  ok: true,
  status: 'PREVIEW_INTERFACE_PROVEN',
  truthClassification: 'INTERFACE_ONLY',
  projectId: RELAY_PROJECT_ID,
  teamId: RELAY_TEAM_ID,
  deploymentId: 'dpl_123ABC',
  url: 'https://uberbondd-relay-preview.vercel.app',
  environment: 'preview',
  productionPromotion: 'BLOCKED',
  fullDurableRelay: 'NOT_PROVEN'
};
const queueContract = { jobType: RELAY_JOB_TYPE, durableStore: true, readOnly: true, executionAuthority: false, externalEffectLedger: zero };

function plan(overrides = {}) {
  return compileRelayShadowBindingPlan({ previewReceipt: receipt, queueContract, date: '2026-08-21T02:00:00Z', ...overrides });
}

test('builds deterministic read-only plan from exact live preview receipt', () => {
  const a = plan();
  const b = plan();
  assert.equal(a.ok, true);
  assert.equal(a.planId, b.planId);
  assert.equal(a.executionAuthority, false);
  assert.deepEqual(a.allowedOperations, ['relayHealthSummary', 'listCloudRelayTasks']);
});

test('rejects absent preview proof', () => assert.equal(plan({ previewReceipt: null }).ok, false));
test('rejects truth inflation', () => assert.equal(plan({ previewReceipt: { ...receipt, truthClassification: 'FULLY_LIVE' } }).ok, false));
test('rejects wrong project', () => assert.equal(plan({ previewReceipt: { ...receipt, projectId: 'prj_wrong' } }).ok, false));
test('rejects wrong team', () => assert.equal(plan({ previewReceipt: { ...receipt, teamId: 'team_wrong' } }).ok, false));
test('rejects production deployment', () => assert.equal(plan({ previewReceipt: { ...receipt, environment: 'production' } }).ok, false));
test('rejects unblocked promotion', () => assert.equal(plan({ previewReceipt: { ...receipt, productionPromotion: 'ALLOWED' } }).ok, false));
test('rejects invalid deployment identity', () => assert.equal(plan({ previewReceipt: { ...receipt, deploymentId: 'bad' } }).ok, false));
test('rejects foreign preview host', () => assert.equal(plan({ previewReceipt: { ...receipt, url: 'https://example.com' } }).ok, false));
test('rejects noncanonical queue job type', () => assert.equal(plan({ queueContract: { ...queueContract, jobType: 'other' } }).ok, false));
test('rejects write-capable queue contract', () => assert.equal(plan({ queueContract: { ...queueContract, readOnly: false } }).ok, false));
test('rejects execution authority', () => assert.equal(plan({ queueContract: { ...queueContract, executionAuthority: true } }).ok, false));
test('rejects nonzero queue effect ledger', () => assert.equal(plan({ queueContract: { ...queueContract, externalEffectLedger: { ...zero, messages: 1 } } }).ok, false));

const health = { ok: true, total: 0, counts: { queued: 0, retry: 0, active: 0, completed: 0, 'dead-letter': 0 }, staleLeases: 0, externalEffectLedger: zero };
const tasks = { ok: true, count: 0, tasks: [], externalEffectLedger: zero };

test('accepts a zero-mutation shadow observation', () => {
  const result = evaluateRelayShadowObservation({ plan: plan(), healthSummary: health, taskList: tasks, date: '2026-08-21T02:01:00Z' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SHADOW_OBSERVED');
  assert.equal(result.mutationCount, 0);
  assert.equal(result.executionAuthority, false);
});

test('observation is deterministic', () => {
  const input = { plan: plan(), healthSummary: health, taskList: tasks, date: '2026-08-21T02:01:00Z' };
  assert.equal(evaluateRelayShadowObservation(input).observationId, evaluateRelayShadowObservation(input).observationId);
});

test('rejects missing plan', () => assert.equal(evaluateRelayShadowObservation({ healthSummary: health, taskList: tasks }).ok, false));
test('rejects health failure', () => assert.equal(evaluateRelayShadowObservation({ plan: plan(), healthSummary: { ...health, ok: false }, taskList: tasks }).ok, false));
test('rejects nonzero health effects', () => assert.equal(evaluateRelayShadowObservation({ plan: plan(), healthSummary: { ...health, externalEffectLedger: { ...zero, providerCalls: 1 } }, taskList: tasks }).ok, false));
test('rejects malformed task list', () => assert.equal(evaluateRelayShadowObservation({ plan: plan(), healthSummary: health, taskList: { ...tasks, tasks: null } }).ok, false));
test('rejects task count mismatch', () => assert.equal(evaluateRelayShadowObservation({ plan: plan(), healthSummary: health, taskList: { ...tasks, count: 1 } }).ok, false));
test('rejects foreign job type', () => assert.equal(evaluateRelayShadowObservation({ plan: plan(), healthSummary: health, taskList: { ...tasks, count: 1, tasks: [{ type: 'foreign' }] } }).ok, false));

test('source contains no relay mutation call', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/relay-shadow-binding.mjs', import.meta.url), 'utf8'));
  for (const name of ['createCloudRelayTask(', 'claimCloudRelayTask(', 'heartbeatCloudRelayTask(', 'submitCloudRelayResult(']) {
    assert.equal(source.includes(name), false);
  }
});
