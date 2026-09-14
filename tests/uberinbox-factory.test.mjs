import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberInboxPlan, compileUberInboxUnknownUnknowns } from '../src/uberinbox-factory.mjs';

const NOW = new Date('2026-09-14T20:00:00.000Z');

function domain(overrides = {}) {
  return {
    domainId: 'd-cloud',
    domain: 'uberbond.cloud',
    ownershipStatus: 'OWNER_CONFIRMED',
    state: 'DNS_INCOMPLETE',
    purpose: 'outreach',
    ...overrides
  };
}

function provider(overrides = {}) {
  return {
    provider: 'mailbox-provider-a',
    source: 'provider-receipt:a:2026-09-14',
    observedAt: '2026-09-14T19:00:00.000Z',
    status: 'AVAILABLE',
    termsAllowed: true,
    apiProvisioning: true,
    availableMailboxSlots: 100,
    monthlyCostPerMailboxCents: 100,
    maxMailboxesPerDomain: 8,
    monthlyVolumeCap: 100000,
    supportsAutomatedDns: true,
    supportsWarmup: true,
    supportsPlacementTelemetry: true,
    supportsExport: true,
    ...overrides
  };
}

test('UberInbox plans bounded inventory but performs zero external effects', () => {
  const result = compileUberInboxPlan({
    domains: [domain()],
    providerOffers: [provider()],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 800,
    now: NOW
  });
  assert.equal(result.state, 'CAPACITY_PLAN_READY_FOR_SEPARATE_OWNER_AUTHORIZATION');
  assert.equal(result.plannedAdditionalMailboxes, 8);
  assert.equal(result.estimatedMonthlyCostCents, 800);
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.providerCalls, 0);
  assert.equal(result.purchases, 0);
  assert.equal(result.mailboxesProvisioned, 0);
  assert.equal(result.messagesSent, 0);
});

test('UberInbox refuses domains outside canonical owned roots even when caller labels them confirmed', () => {
  const result = compileUberInboxPlan({
    domains: [domain({ domainId: 'fake', domain: 'not-owned.example' })],
    providerOffers: [provider()],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 10000,
    now: NOW
  });
  assert.equal(result.plannedAdditionalMailboxes, 0);
  assert.equal(result.state, 'CAPACITY_PLAN_BLOCKED');
  assert.ok(result.rejectedDomains[0].blockers.includes('domain-not-in-canonical-owned-roots'));
});

test('UberInbox requires explicit owner-confirmed domain ownership', () => {
  const result = compileUberInboxPlan({
    domains: [domain({ ownershipStatus: 'UNVERIFIED' })],
    providerOffers: [provider()],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 10000,
    now: NOW
  });
  assert.equal(result.plannedAdditionalMailboxes, 0);
  assert.ok(result.rejectedDomains[0].blockers.includes('domain-ownership-not-confirmed'));
});

test('marketing unlimited language never becomes infinite or numeric capacity', () => {
  const result = compileUberInboxPlan({
    domains: [domain()],
    providerOffers: [provider({ claimsUnlimited: true, availableMailboxSlots: null })],
    desiredAdditionalMailboxes: 1000000,
    monthlyBudgetCents: 100000000,
    now: NOW
  });
  assert.equal(result.plannedAdditionalMailboxes, 0);
  assert.equal(result.unknownCapacityProviders.length, 1);
  assert.ok(result.rejectedProviders[0].blockers.includes('unlimited-marketing-claim-is-not-numeric-capacity'));
});

test('stale provider evidence cannot manufacture provisioning capacity', () => {
  const result = compileUberInboxPlan({
    domains: [domain()],
    providerOffers: [provider({ observedAt: '2026-01-01T00:00:00.000Z' })],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 10000,
    now: NOW
  });
  assert.equal(result.plannedAdditionalMailboxes, 0);
  assert.ok(result.rejectedProviders[0].blockers.includes('provider-evidence-stale-or-undated'));
});

test('unknown or incompatible provider terms fail closed', () => {
  const result = compileUberInboxPlan({
    domains: [domain()],
    providerOffers: [provider({ termsAllowed: false })],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 10000,
    now: NOW
  });
  assert.equal(result.plannedAdditionalMailboxes, 0);
  assert.ok(result.rejectedProviders[0].blockers.includes('provider-terms-not-confirmed-compatible'));
});

test('budget is a hard capacity ceiling', () => {
  const result = compileUberInboxPlan({
    domains: [domain()],
    providerOffers: [provider({ monthlyCostPerMailboxCents: 125 })],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 375,
    now: NOW
  });
  assert.equal(result.plannedAdditionalMailboxes, 3);
  assert.equal(result.estimatedMonthlyCostCents, 375);
  assert.equal(result.remainingDesiredMailboxes, 5);
});

test('provider slot ceiling is respected even when budget and domain policy allow more', () => {
  const result = compileUberInboxPlan({
    domains: [domain()],
    providerOffers: [provider({ availableMailboxSlots: 3 })],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 10000,
    now: NOW
  });
  assert.equal(result.plannedAdditionalMailboxes, 3);
});

test('UberDoso per-domain policy ceiling is respected including existing mailboxes', () => {
  const existing = Array.from({ length: 6 }, (_, index) => ({
    mailboxId: `m-${index}`,
    address: `sender${index}@uberbond.cloud`,
    provider: 'mailbox-provider-a'
  }));
  const result = compileUberInboxPlan({
    domains: [domain()],
    existingMailboxes: existing,
    providerOffers: [provider({ availableMailboxSlots: 100 })],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 10000,
    now: NOW
  });
  assert.equal(result.currentKnownMailboxCount, 6);
  assert.equal(result.plannedAdditionalMailboxes, 2);
});

test('provisioning batches never exceed the configured batch ceiling', () => {
  const result = compileUberInboxPlan({
    domains: [domain()],
    providerOffers: [provider({ availableMailboxSlots: 8, monthlyCostPerMailboxCents: 0 })],
    desiredAdditionalMailboxes: 8,
    monthlyBudgetCents: 0,
    policy: { maxProvisioningBatch: 3 },
    now: NOW
  });
  assert.deepEqual(result.batches.map(item => item.mailboxCount), [3, 3, 2]);
  assert.equal(result.batches.every(item => item.externalEffectAuthority === 'NONE'), true);
});

test('existing provider binding prevents silent cross-provider mixing on one domain', () => {
  const result = compileUberInboxPlan({
    domains: [domain()],
    existingMailboxes: [{ mailboxId: 'm1', address: 'sender@uberbond.cloud', provider: 'incumbent' }],
    providerOffers: [
      provider({ provider: 'cheaper-other', monthlyCostPerMailboxCents: 1 }),
      provider({ provider: 'incumbent', monthlyCostPerMailboxCents: 100 })
    ],
    desiredAdditionalMailboxes: 2,
    monthlyBudgetCents: 1000,
    now: NOW
  });
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].provider, 'incumbent');
});

test('unknown-unknown discovery treats mailbox-count versus throughput as a question, never a finding', () => {
  const discovery = compileUberInboxUnknownUnknowns({
    providerOffers: [
      provider({ provider: 'provider-a', source: 'source-a', claimsUnlimited: true, availableMailboxSlots: null, monthlyVolumeCap: 100000 }),
      provider({ provider: 'provider-b', source: 'source-b', claimsUnlimited: true, availableMailboxSlots: null, monthlyVolumeCap: 200000 })
    ],
    now: NOW
  });
  assert.equal(discovery.discovery.status, 'UNKNOWN_UNKNOWN_MINED');
  assert.ok(discovery.discovery.questions.some(item => item.domain === 'mailbox-capacity-model'));
  assert.match(discovery.discovery.outputBoundary, /QUESTIONS__NOT_FINDINGS/);
  assert.equal(discovery.ontologyCandidate.status, 'HYPOTHESIS_ONLY');
  assert.equal(discovery.externalEffectAuthority, 'NONE');
});

test('provider observation gaps surface as blind spots instead of invented facts', () => {
  const discovery = compileUberInboxUnknownUnknowns({
    providerOffers: [provider({ supportsPlacementTelemetry: undefined, supportsDedicatedIp: undefined })],
    now: NOW
  });
  assert.ok(discovery.discovery.blindSpots.includes('placement'));
  assert.ok(discovery.discovery.blindSpots.includes('ip-reputation'));
});
