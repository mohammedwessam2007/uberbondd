import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateFreeCapacity,
  freeCapacityForDays,
  selectFreeRoute,
  validateFreeProvider
} from '../src/free-first-outreach-router.mjs';
import providers from '../artifacts/outreach/free-first-provider-registry-2026-09-01.json' with { type: 'json' };

const registry = providers.providers;

test('report-derived permanent free pool equals 75,100 messages per 30 days', () => {
  const result = aggregateFreeCapacity({ providers: registry, days: 30 });
  assert.equal(result.ok, true);
  assert.equal(result.capacity, 75100);
  assert.equal(result.effectiveDaily, 75100 / 30);
});

test('cold B2B cannot leak into opt-in-only free ESP pool', () => {
  const result = selectFreeRoute({ purpose: 'COLD_B2B', providers: registry, at: '2026-09-01T00:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('no-proven-free-cold-b2b-provider-route'));
  assert.equal(result.evaluations.some(row => row.eligible), false);
});

test('consent-gated marketing requires consent evidence', () => {
  const noConsent = selectFreeRoute({ purpose: 'OPT_IN_MARKETING', providers: registry, at: '2026-09-01T00:00:00.000Z' });
  assert.equal(noConsent.ok, false);
  const withConsent = selectFreeRoute({ purpose: 'OPT_IN_MARKETING', providers: registry, consentEvidence: true, at: '2026-09-01T00:00:00.000Z' });
  assert.equal(withConsent.ok, true);
  assert.equal(withConsent.route.costCents, 0);
  assert.equal(withConsent.route.executionAuthority, 'NONE');
});

test('monthly quota beats misleading headline daily cap', () => {
  const smtp2go = registry.find(row => row.id === 'smtp2go-free');
  const capacity = freeCapacityForDays(smtp2go, 30);
  assert.equal(capacity.ok, true);
  assert.equal(capacity.capacity, 1000);
  assert.equal(capacity.effectiveDaily, 1000 / 30);
});

test('free route refuses after provider monthly quota is exhausted', () => {
  const result = selectFreeRoute({
    purpose: 'TRANSACTIONAL',
    providers: [registry.find(row => row.id === 'resend-free')],
    usageByProvider: { 'resend-free': { monthlyUsed: 3000 } },
    at: '2026-09-01T00:00:00.000Z'
  });
  assert.equal(result.ok, false);
  assert.ok(result.evaluations[0].reasonCodes.includes('provider-free-quota-exhausted'));
});

test('live mode requires actual provider activation and domain authentication', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const blocked = selectFreeRoute({ purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE', at: '2026-09-01T00:00:00.000Z' });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.evaluations[0].reasonCodes.includes('provider-not-configured'));
  const ready = selectFreeRoute({
    purpose: 'TRANSACTIONAL',
    providers: [provider],
    mode: 'LIVE',
    providerStates: { 'resend-free': { configured: true, active: true, domainAuthenticated: true, providerHealthy: true } },
    at: '2026-09-01T00:00:00.000Z'
  });
  assert.equal(ready.ok, true);
});

test('stale policy evidence removes provider from routing without changing application code', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const result = selectFreeRoute({ purpose: 'TRANSACTIONAL', providers: [provider], at: '2026-12-01T00:00:00.000Z', maxPolicyAgeDays: 45 });
  assert.equal(result.ok, false);
  assert.ok(result.evaluations[0].reasonCodes.includes('provider-policy-evidence-stale'));
});

test('account-farming multiplication is structurally rejected', () => {
  const provider = structuredClone(registry[0]);
  provider.organizationAccountLimit = 4;
  const result = validateFreeProvider(provider);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('single-legitimate-organization-allocation-required'));
});

// ---------------------------------------------------------------------------
// LIVE routing derived from activation receipts.
//
// The whole point of these: a researched quota is a statement about published
// policy, and LIVE mode may only route through a provider some external
// activation step actually observed. Before these existed, any caller could
// hand selectFreeRoute four true booleans and get a LIVE route to an account
// that did not exist.
// ---------------------------------------------------------------------------

import { liveUsableCapacity } from '../src/free-first-outreach-router.mjs';
import activationArtifact from '../artifacts/outreach/provider-activation-receipts-2026-09-01.json' with { type: 'json' };

const AT = '2026-09-01T12:00:00.000Z';
const notStartedReceipts = activationArtifact.receipts;

function activationReceipt(overrides = {}) {
  return {
    providerId: 'resend-free',
    accountState: 'EXISTING',
    freePlanVerified: true,
    freeQuotaObserved: {},
    coldB2BRule: 'PROHIBITED',
    apiAvailable: true,
    smtpAvailable: true,
    domainVerificationState: 'VERIFIED',
    credentialRuntimeState: 'CONFIGURED_SECURELY',
    trialExpiresAt: null,
    autoChargeRisk: false,
    policyObservedAt: '2026-09-01T00:00:00.000Z',
    policyEvidenceUrl: 'https://resend.com/legal/acceptable-use',
    blocker: null,
    healthObservation: { state: 'HEALTHY', observedAt: '2026-09-01T06:00:00.000Z' },
    ...overrides
  };
}

test('the committed NOT_STARTED receipts permit no live route and no live capacity', () => {
  const live = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: registry, mode: 'LIVE',
    activationReceipts: notStartedReceipts, at: AT
  });
  assert.equal(live.ok, false);
  const resend = live.evaluations.find(row => row.providerId === 'resend-free');
  assert.ok(resend.reasonCodes.includes('provider-not-active'));
  assert.ok(resend.reasonCodes.includes('provider-not-configured'));

  const capacity = liveUsableCapacity({ providers: registry, activationReceipts: notStartedReceipts, at: AT });
  assert.equal(capacity.capacity, 0);
  assert.equal(capacity.status, 'NO_LIVE_USABLE_CAPACITY');

  // The same providers still plan fine: activation gates LIVE, not research.
  assert.equal(selectFreeRoute({ purpose: 'TRANSACTIONAL', providers: registry, at: AT }).ok, true);
});

test('one fully activated provider is enough for a live route and for live capacity', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const live = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: [activationReceipt()], at: AT
  });
  assert.equal(live.ok, true);
  assert.equal(live.route.providerId, 'resend-free');
  assert.equal(live.route.executionAuthority, 'NONE');

  const capacity = liveUsableCapacity({ providers: [provider], activationReceipts: [activationReceipt()], at: AT });
  assert.equal(capacity.capacity, 3000);
});

test('an observed quota may lower the researched quota and may never raise it', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const route = (freeQuotaObserved, monthlyUsed) => selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: [activationReceipt({ freeQuotaObserved })],
    usageByProvider: { 'resend-free': { monthlyUsed } }, at: AT
  });

  // Researched 3000/month with 600 used still routes.
  assert.equal(route({}, 600).ok, true);
  // An observed 500/month with 600 used does not: observation tightened it.
  const lowered = route({ monthly: 500 }, 600);
  assert.equal(lowered.ok, false);
  assert.ok(lowered.evaluations[0].reasonCodes.includes('provider-free-quota-exhausted'));
  // An observed 9999/month cannot resurrect an exhausted researched quota.
  const raised = route({ monthly: 9999 }, 3000);
  assert.equal(raised.ok, false, 'an observed quota raised the researched limit');
  assert.ok(raised.evaluations[0].reasonCodes.includes('provider-free-quota-exhausted'));
});

test('cold B2B stays refused end to end even when a receipt claims the provider allows it', () => {
  const provider = registry.find(row => row.id === 'sender-net-free');
  const result = selectFreeRoute({
    purpose: 'COLD_B2B', providers: [provider], mode: 'LIVE',
    activationReceipts: [activationReceipt({
      providerId: 'sender-net-free', coldB2BRule: 'ALLOWED',
      policyEvidenceUrl: 'https://www.sender.net/'
    })],
    audienceSize: 1, at: AT
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('no-proven-free-cold-b2b-provider-route'));
  assert.ok(result.evaluations[0].reasonCodes.includes('provider-purpose-prohibited'));
});

test('an auto-charge risk observed on the account refuses the free route', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const result = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: [activationReceipt({ autoChargeRisk: true })], at: AT
  });
  assert.equal(result.ok, false);
  assert.ok(result.evaluations[0].reasonCodes.includes('auto-charge-free-route-prohibited'));
});

test('a recipient cap is compared to a real audience, and an unknown audience is refused', () => {
  const provider = registry.find(row => row.id === 'mailjet-free');
  assert.equal(provider.quota.recipientCap, 1000);
  const receipts = [activationReceipt({ providerId: 'mailjet-free', policyEvidenceUrl: 'https://www.mailjet.com/pricing/' })];

  const tooMany = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: receipts, audienceSize: 1001, at: AT
  });
  assert.equal(tooMany.ok, false);
  assert.ok(tooMany.evaluations[0].reasonCodes.includes('provider-recipient-cap-exceeded'));

  const unknown = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: receipts, at: AT
  });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.evaluations[0].reasonCodes.includes('audience-size-required-for-recipient-capped-provider'));

  const withinCap = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: receipts, audienceSize: 900, at: AT
  });
  assert.equal(withinCap.ok, true);
});

test('a stale activation receipt blocks live routing by name', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const result = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: [activationReceipt({ policyObservedAt: '2026-06-01T00:00:00.000Z' })], at: AT
  });
  assert.equal(result.ok, false);
  assert.ok(result.evaluations[0].reasonCodes.includes('provider-activation-receipt-stale'));
});

test('receipts and pre-derived states are mutually exclusive rather than silently ranked', () => {
  const provider = registry.find(row => row.id === 'resend-free');
  const result = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: [activationReceipt()],
    providerStates: { 'resend-free': { configured: true, active: true, domainAuthenticated: true, providerHealthy: true } },
    at: AT
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('provider-states-and-activation-receipts-are-mutually-exclusive'));
});

test('an audience size that is not a whole count is refused before any provider is considered', () => {
  const result = selectFreeRoute({ purpose: 'TRANSACTIONAL', providers: registry, audienceSize: -3, at: AT });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['valid-audience-size-required']);
});

test('a provider with no receipt at all, and one with a broken receipt, each say so by name', () => {
  const provider = registry.find(row => row.id === 'resend-free');

  const noReceipt = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: [], at: AT
  });
  assert.equal(noReceipt.ok, false);
  assert.ok(noReceipt.evaluations[0].reasonCodes.includes('provider-activation-receipt-missing'),
    'a provider nobody has activated must say the receipt is missing, not merely that it is inactive');

  const brokenReceipt = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    activationReceipts: [activationReceipt({ accountState: 'ACTIVATED_PROBABLY' })], at: AT
  });
  assert.equal(brokenReceipt.ok, false);
  assert.ok(brokenReceipt.evaluations[0].reasonCodes.includes('provider-activation-receipt-invalid'));
  assert.equal(brokenReceipt.evaluations[0].receiptState, 'INVALID');
});
