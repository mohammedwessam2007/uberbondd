import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMailHubCapabilityMatrix,
  buildMailHubSnapshot,
  compileProvisioningPlan,
  inspectProviderInfrastructure,
  rankReadySenderRoutes
} from '../src/mailhub-control-plane.mjs';

test('provisioning plan is exact, bounded and separates owner effects from read-only checks', () => {
  const plan = compileProvisioningPlan({
    provider: 'icemail',
    workspaceId: 'ws_1',
    existingDomains: ['uberbond.agency'],
    requestedDomains: ['uberbond.cloud'],
    requestedMailboxes: ['ops@uberbond.cloud', 'reply@uberbond.cloud'],
    forwardingEmail: 'mohamed@example.com',
    estimatedCostCents: 500,
    budgetCents: 1000
  });
  assert.equal(plan.ok, true);
  assert.match(plan.planId, /^mailhub_plan_/);
  assert.deepEqual(plan.domains.existing, ['uberbond.agency']);
  assert.deepEqual(plan.domains.requested, ['uberbond.cloud']);
  assert.equal(plan.stages[0].stage, 'RECONCILE_PROVIDER');
  assert.equal(plan.stages.find(stage => stage.stage === 'PROVISION_DOMAIN').approvalScope, 'icemail:provisionDomains');
  assert.equal(plan.stages.find(stage => stage.stage === 'START_WARMUP').approvalScope, 'icemail:startWarmup');
  assert.equal(plan.executionStatus, 'PLAN_ONLY_OWNER_APPROVAL_REQUIRED');
  assert.equal(plan.rollback.includes('never blindly retry'), true);
});

test('provisioning plan rejects duplicate targets, malformed contacts and budgets before any provider call', () => {
  const result = compileProvisioningPlan({
    provider: 'mailforge',
    workspaceId: 'ws_1',
    existingDomains: ['uberbond.cloud'],
    requestedDomains: ['uberbond.cloud', 'bad domain'],
    requestedMailboxes: ['not-an-email'],
    forwardingEmail: 'not-an-email',
    estimatedCostCents: 1001,
    budgetCents: 1000
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('domain-already-present-reconcile-before-provision'));
  assert.ok(result.reasonCodes.includes('requested-domain-invalid'));
  assert.ok(result.reasonCodes.includes('requested-mailbox-invalid'));
  assert.ok(result.reasonCodes.includes('forwarding-email-invalid'));
  assert.ok(result.reasonCodes.includes('estimated-cost-exceeds-budget'));
});

test('provider inspection distinguishes an empty confirmed inventory from an unavailable inventory', async () => {
  const adapter = {
    providerName: 'icemail',
    identity: async () => ({ ok: true, status: 'CONFIGURED_ADAPTER_READY', provider: 'icemail', authentication: 'API_KEY' }),
    listDomains: async () => ({ ok: true, status: 'OK', domains: [] }),
    listMailboxes: async () => ({ ok: true, status: 'OK', mailboxes: [] })
  };
  const observed = await inspectProviderInfrastructure({ providerAdapter: adapter, workspaceId: 'ws_1' });
  assert.equal(observed.ok, true);
  assert.equal(observed.state, 'RECONCILED');
  assert.equal(observed.reads.domains.count, 0);
  assert.equal(observed.reads.mailboxes.count, 0);

  const blocked = await inspectProviderInfrastructure({ providerAdapter: { ...adapter, listMailboxes: async () => ({ ok: false, status: 'PROVIDER_UNREACHABLE' }) }, workspaceId: 'ws_1' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.state, 'RECONCILIATION_INCOMPLETE');
  assert.ok(blocked.reasonCodes.includes('mailboxes:PROVIDER_UNREACHABLE'));
});

test('sender ranking uses only provider-confirmed capacity and leaves final send authority elsewhere', () => {
  const result = rankReadySenderRoutes({ candidates: [
    {
      candidateId: 'm1',
      provider: 'icemail',
      sentToday: 9,
      healthScore: 80,
      mailboxState: { mailboxId: 'm1', address: 'a@uberbond.cloud', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', currentDailyCap: 10, paused: false },
      domainState: { state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' }
    },
    {
      candidateId: 'm2',
      provider: 'mailforge',
      sentToday: 0,
      healthScore: 60,
      mailboxState: { mailboxId: 'm2', address: 'b@uberbond.cloud', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_ACTIVE', currentDailyCap: 100, paused: false },
      domainState: { state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' }
    },
    {
      candidateId: 'm3',
      provider: 'unknown',
      sentToday: 0,
      mailboxState: { mailboxId: 'm3', address: 'c@uberbond.cloud', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false },
      domainState: { state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' }
    }
  ] });
  assert.equal(result.state, 'ROUTE_AVAILABLE');
  assert.equal(result.selected.candidateId, 'm1');
  assert.equal(result.selected.availableCapacity, 1);
  assert.ok(result.blocked.some(item => item.candidateId === 'm2' && item.reasonCodes.includes('warmup-not-provider-confirmed-complete')));
  assert.ok(result.blocked.some(item => item.candidateId === 'm3' && item.reasonCodes.includes('provider-daily-cap-unknown-or-zero')));
  assert.equal(result.routeIsNotSendAuthorization, true);
});

test('MailHub snapshot never turns a provider cap into revenue or synthetic customers', () => {
  const snapshot = buildMailHubSnapshot({
    domainStates: [{ state: 'READY_FOR_LIMITED_OUTREACH' }, { state: 'WARMING' }],
    mailboxStates: [{ authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', currentDailyCap: 10, paused: false }, { authenticationStatus: 'UNKNOWN', warmupStatus: 'WARMUP_NOT_STARTED', currentDailyCap: null, paused: true }],
    providerInspections: [{ ok: true, state: 'RECONCILED' }]
  });
  assert.equal(snapshot.mailboxes.providerConfirmedDailyCapacity, 10);
  assert.deepEqual(snapshot.commercialTruth, { verifiedCustomers: 0, clearedRevenue: 'not-derived-from-mailbox-state', acceptedDeliveries: 0 });
  assert.equal(snapshot.noSyntheticCapacity, true);
});

test('capability matrix reports adapters without claiming live sending authority', () => {
  const matrix = buildMailHubCapabilityMatrix({ adapters: [{ providerName: 'icemail', configured: true, listMailboxes() {}, provisionMailboxes() {} }] });
  assert.equal(matrix.providers[0].capabilities.listMailboxes, true);
  assert.equal(matrix.providers[0].capabilities.provisionMailboxes, true);
  assert.equal(matrix.providers[0].liveSendingAuthority, false);
});
