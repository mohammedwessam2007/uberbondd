import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACCOUNT_STATES,
  deriveProviderStatesFromReceipts,
  isLiveReadyProviderState,
  scanReceiptForSecrets,
  stricterColdRule,
  summarizeActivationReceipts,
  validateProviderActivationReceipt
} from '../src/provider-activation-receipt.mjs';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const registry = JSON.parse(readFileSync('artifacts/outreach/free-first-provider-registry-2026-09-01.json', 'utf8')).providers;
const artifactReceipts = JSON.parse(readFileSync('artifacts/outreach/provider-activation-receipts-2026-09-01.json', 'utf8')).receipts;
const registryProvider = id => registry.find(row => row.id === id);

function receipt(overrides = {}) {
  return {
    providerId: 'resend-free',
    accountState: 'EXISTING',
    freePlanVerified: true,
    freeQuotaObserved: { daily: 100, monthly: 3000 },
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

test('a well-formed receipt normalizes and carries no authority', () => {
  const result = validateProviderActivationReceipt(receipt(), { now: NOW, registryProvider: registryProvider('resend-free') });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.providerId, 'resend-free');
  assert.equal(result.receipt.accountState, 'EXISTING');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.messages, 0);
});

test('every enum field refuses a value outside its vocabulary', () => {
  const cases = [
    ['accountState', 'ACTIVATED', 'account-state-invalid'],
    ['coldB2BRule', 'PROBABLY_FINE', 'cold-b2b-rule-invalid'],
    ['domainVerificationState', 'DONE', 'domain-verification-state-invalid'],
    ['credentialRuntimeState', 'CONFIGURED', 'credential-runtime-state-invalid']
  ];
  for (const [field, bad, code] of cases) {
    const result = validateProviderActivationReceipt(receipt({ [field]: bad }), { now: NOW });
    assert.equal(result.ok, false, `${field} accepted "${bad}"`);
    assert.ok(result.reasonCodes.includes(code), `${field}: expected ${code}, got ${result.reasonCodes}`);
  }
});

test('a credential value anywhere in a receipt is refused and never echoed back', () => {
  const leaked = 'api_key=NOT_A_REAL_CREDENTIAL_0000000000000000';
  const result = validateProviderActivationReceipt(receipt({ notes: `provider note ${leaked}` }), { now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.startsWith('secret-value-rejected')));
  assert.equal(JSON.stringify(result).includes(leaked), false, 'the rejection itself leaked the secret');
  assert.equal(result.receipt, undefined, 'a secret-bearing receipt must not be normalized at all');
});

test('a key that merely looks like a credential is refused, and the one state key that looks like one is not', () => {
  const withSecretKey = validateProviderActivationReceipt({ ...receipt(), apiToken: 'anything' }, { now: NOW });
  assert.equal(withSecretKey.ok, false);
  assert.ok(withSecretKey.reasonCodes.some(code => code.startsWith('secret-shaped-key-rejected')));

  // credentialRuntimeState matches the same key pattern and holds an enum, not
  // a credential. Exempting it must not exempt its value from the enum check.
  assert.equal(validateProviderActivationReceipt(receipt(), { now: NOW }).ok, true);
  assert.equal(validateProviderActivationReceipt(receipt({ credentialRuntimeState: 'sk_live_abc' }), { now: NOW }).ok, false);
});

test('an observation from the future, a non-HTTPS evidence url and a bad quota are each refused', () => {
  const future = validateProviderActivationReceipt(receipt({ policyObservedAt: '2027-01-01T00:00:00.000Z' }), { now: NOW });
  assert.ok(future.reasonCodes.includes('policy-observed-at-in-future'));

  const insecure = validateProviderActivationReceipt(receipt({ policyEvidenceUrl: 'http://resend.com/legal' }), { now: NOW });
  assert.ok(insecure.reasonCodes.includes('policy-evidence-url-https-required'));

  const quota = validateProviderActivationReceipt(receipt({ freeQuotaObserved: { daily: -5 } }), { now: NOW });
  assert.ok(quota.reasonCodes.includes('free-quota-observed-invalid:daily'));
});

test('a trial provider without an expiry is refused', () => {
  const trialProvider = { ...registryProvider('resend-free'), freePlan: { ongoing: false, trial: true, expiresAt: '2026-10-01T00:00:00.000Z' } };
  const result = validateProviderActivationReceipt(receipt({ trialExpiresAt: null }), { now: NOW, registryProvider: trialProvider });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('trial-expiry-required'));
});

test('the cold rule ladder only ever tightens', () => {
  assert.equal(stricterColdRule('ALLOWED', 'PROHIBITED'), 'PROHIBITED');
  assert.equal(stricterColdRule('PROHIBITED', 'ALLOWED'), 'PROHIBITED');
  assert.equal(stricterColdRule('CONSENT_REQUIRED', 'UNKNOWN'), 'UNKNOWN');
  assert.equal(stricterColdRule('ALLOWED', 'CONSENT_REQUIRED'), 'CONSENT_REQUIRED');
  assert.equal(stricterColdRule('ALLOWED', 'ALLOWED'), 'ALLOWED');
  // An unrecognized rule is not a permissive one.
  assert.equal(stricterColdRule('ALLOWED', 'WHATEVER'), 'UNKNOWN');
});

test('a fully activated fresh receipt is the only thing that reaches live-ready', () => {
  const derived = deriveProviderStatesFromReceipts({
    receipts: [receipt()],
    registryProviders: [registryProvider('resend-free')],
    now: NOW
  });
  assert.equal(derived.ok, true);
  const state = derived.providerStates['resend-free'];
  assert.equal(state.receiptState, 'FRESH');
  assert.equal(isLiveReadyProviderState(state), true);
  assert.deepEqual(derived.summary.liveReadyProviderIds, ['resend-free']);
});

test('each missing activation fact independently blocks live-ready', () => {
  const breakers = [
    { credentialRuntimeState: 'NOT_CONFIGURED' },
    { accountState: 'NOT_STARTED' },
    { freePlanVerified: false },
    { domainVerificationState: 'PENDING' },
    { healthObservation: { state: 'DEGRADED', observedAt: '2026-09-01T06:00:00.000Z' } },
    { autoChargeRisk: true }
  ];
  for (const override of breakers) {
    const derived = deriveProviderStatesFromReceipts({
      receipts: [receipt(override)],
      registryProviders: [registryProvider('resend-free')],
      now: NOW
    });
    assert.equal(isLiveReadyProviderState(derived.providerStates['resend-free']), false,
      `${JSON.stringify(override)} still reached live-ready`);
  }
});

test('a receipt older than the freshness window yields no live flags at all', () => {
  const stale = receipt({ policyObservedAt: '2026-07-15T00:00:00.000Z' });
  const derived = deriveProviderStatesFromReceipts({
    receipts: [stale],
    registryProviders: [registryProvider('resend-free')],
    now: NOW
  });
  const state = derived.providerStates['resend-free'];
  assert.equal(state.receiptState, 'STALE');
  assert.ok(state.reasonCodes.includes('provider-activation-receipt-stale'));
  assert.deepEqual(
    [state.configured, state.active, state.domainAuthenticated, state.providerHealthy],
    [false, false, false, false]
  );
});

test('an expired trial yields no live flags even while the receipt is fresh', () => {
  const derived = deriveProviderStatesFromReceipts({
    receipts: [receipt({ trialExpiresAt: '2026-08-20T00:00:00.000Z' })],
    registryProviders: [registryProvider('resend-free')],
    now: NOW
  });
  const state = derived.providerStates['resend-free'];
  assert.equal(state.receiptState, 'FRESH');
  assert.ok(state.reasonCodes.includes('free-trial-expired'));
  assert.equal(isLiveReadyProviderState(state), false);
});

test('a provider with no receipt, a broken receipt, or two receipts is refused rather than guessed', () => {
  const missing = deriveProviderStatesFromReceipts({ receipts: [], registryProviders: [registryProvider('resend-free')], now: NOW });
  assert.equal(missing.providerStates['resend-free'].receiptState, 'MISSING');

  const invalid = deriveProviderStatesFromReceipts({
    receipts: [receipt({ accountState: 'NONSENSE' })],
    registryProviders: [registryProvider('resend-free')], now: NOW
  });
  assert.equal(invalid.providerStates['resend-free'].receiptState, 'INVALID');

  // Two receipts for one provider is not "the newer one wins" -- it is an
  // unresolved contradiction about the same account.
  const duplicated = deriveProviderStatesFromReceipts({
    receipts: [receipt(), receipt()],
    registryProviders: [registryProvider('resend-free')], now: NOW
  });
  assert.equal(duplicated.providerStates['resend-free'].receiptState, 'INVALID');
  assert.ok(duplicated.providerStates['resend-free'].reasonCodes.includes('duplicate-activation-receipts-for-provider'));
});

test('a receipt for a provider the registry does not know is surfaced, not silently dropped', () => {
  const derived = deriveProviderStatesFromReceipts({
    receipts: [receipt({ providerId: 'some-provider-nobody-reviewed' })],
    registryProviders: [registryProvider('resend-free')],
    now: NOW
  });
  assert.deepEqual(derived.summary.unregisteredReceiptProviderIds, ['some-provider-nobody-reviewed']);
  assert.equal(derived.providerStates['some-provider-nobody-reviewed'].receiptState, 'INVALID');
});

test('a receipt can tighten the registry cold rule and can never loosen it', () => {
  const senderNet = registryProvider('sender-net-free');
  assert.equal(senderNet.purposeRules.COLD_B2B, 'PROHIBITED');
  const derived = deriveProviderStatesFromReceipts({
    receipts: [receipt({ providerId: 'sender-net-free', coldB2BRule: 'ALLOWED', policyEvidenceUrl: 'https://www.sender.net/' })],
    registryProviders: [senderNet],
    now: NOW
  });
  assert.equal(derived.providerStates['sender-net-free'].coldB2BRule, 'PROHIBITED',
    'a receipt claiming ALLOWED overrode a registry that says PROHIBITED');

  const mailgun = registryProvider('mailgun-free');
  assert.equal(mailgun.purposeRules.COLD_B2B, 'UNKNOWN');
  const tightened = deriveProviderStatesFromReceipts({
    receipts: [receipt({ providerId: 'mailgun-free', coldB2BRule: 'PROHIBITED', policyEvidenceUrl: 'https://www.mailgun.com/pricing/' })],
    registryProviders: [mailgun],
    now: NOW
  });
  assert.equal(tightened.providerStates['mailgun-free'].coldB2BRule, 'PROHIBITED');
});

test('the summary counts human blockers and lets a secret-bearing receipt contribute nothing', () => {
  const leaked = 'api_key=NOT_A_REAL_CREDENTIAL_0000000000000000';
  const summary = summarizeActivationReceipts([
    receipt({ accountState: 'BLOCKED_HUMAN', blocker: 'phone verification required' }),
    receipt({ providerId: 'brevo-free', notes: leaked, policyEvidenceUrl: 'https://www.brevo.com/pricing/' })
  ], { now: NOW });
  assert.equal(summary.receiptCount, 2);
  assert.equal(summary.secretRejectedReceiptCount, 1);
  assert.equal(summary.humanBlockers.length, 1);
  assert.equal(summary.humanBlockers[0].blocker, 'phone verification required');
  assert.equal(JSON.stringify(summary).includes(leaked), false);
  assert.equal(JSON.stringify(summary).includes('brevo-free'), false,
    'a receipt refused for carrying a secret still contributed its provider id');
});

test('the secret scanner reports paths and never values', () => {
  const hits = scanReceiptForSecrets({ nested: { apiKey: 'NOT_A_REAL_CREDENTIAL_0000000000000000' } });
  assert.ok(hits.length > 0);
  assert.ok(hits.every(hit => !hit.includes('NOT_A_REAL_CREDENTIAL')));
  assert.ok(hits.some(hit => hit.includes('receipt.nested.apiKey')));
});

test('every row of the committed activation artifact validates and none of them is live-ready', () => {
  assert.equal(artifactReceipts.length, registry.length);
  for (const row of artifactReceipts) {
    const result = validateProviderActivationReceipt(row, { now: NOW, registryProvider: registryProvider(row.providerId) });
    assert.equal(result.ok, true, `${row.providerId}: ${result.reasonCodes}`);
    assert.equal(row.accountState, 'NOT_STARTED');
  }
  const derived = deriveProviderStatesFromReceipts({ receipts: artifactReceipts, registryProviders: registry, now: NOW });
  assert.equal(derived.status, 'PROVIDER_STATES_DERIVED__NO_LIVE_READY_PROVIDER');
  assert.deepEqual(derived.summary.liveReadyProviderIds, []);
  assert.equal(derived.summary.fresh, registry.length);
});

test('the account-state vocabulary is the one the activation mission issues receipts against', () => {
  assert.deepEqual([...ACCOUNT_STATES], [
    'NOT_STARTED', 'CREATED', 'EXISTING', 'BLOCKED_HUMAN', 'REJECTED', 'SKIPPED_LOW_ECONOMIC_FIT'
  ]);
});
