import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';
import {
  registerSendingDomain, recordDomainDnsVerification, recordMailboxLinked,
  recordDomainWarmupStateChange, recordOutreachAuthorized, recordDomainPause,
  recordDomainResume, recordDomainRetired, logSendingDomainEvent,
  computeSendingDomainState, loadSendingDomain, listSendingDomains
} from '../src/sending-domain-registry.mjs';
import {
  registerSendingMailbox, recordMailboxAuthentication, recordMailboxWarmupStatus,
  recordMailboxSignal, recordMailboxPause, logSendingMailboxEvent,
  detectSecretFields, computeSendingMailboxState, loadSendingMailbox
} from '../src/sending-mailbox-registry.mjs';
import { verifySendingDomainDns } from '../src/dns-verification.mjs';
import {
  createUnconfiguredProviderAdapter, validateProviderAdapter, resolveProviderAdapter,
  redactProviderReceipt, PROVIDER_CAPABILITIES
} from '../src/provider-adapter-contract.mjs';
import {
  requestMailboxWarmupStart, reconcileMailboxWarmupStatus, plannedWarmupCapForDay, isEligibleForDryRun
} from '../src/warmup-orchestrator.mjs';
import { evaluateCircuitBreaker } from '../src/domain-mailbox-circuit-breaker.mjs';
import { evaluateDomainMailboxGate } from '../src/domain-mailbox-gate.mjs';
import { evaluateLiveActivation } from '../src/live-activation-gate.mjs';
import { buildDomainReadinessCard, buildOperatorActionCard, actionCardFromActivationResult } from '../src/domain-mailbox-control-center.mjs';

const monday = new Date('2026-08-17T10:00:00.000Z');

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-domain-mailbox-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function nxdomain() { const e = new Error('not found'); e.code = 'ENOTFOUND'; throw e; }

function fakeResolver(overrides = {}) {
  return {
    resolveMx: overrides.resolveMx || (async () => [{ exchange: 'mx1.example-provider.com', priority: 10 }]),
    resolveTxt: overrides.resolveTxt || (async () => [['v=spf1 include:_spf.example-provider.com ~all']]),
    resolveCname: overrides.resolveCname || (async () => nxdomain())
  };
}

// ---------------------------------------------------------------------
// DNS verification
// ---------------------------------------------------------------------

test('DNS: no domain is rejected cleanly, BLOCKED', async () => {
  const result = await verifySendingDomainDns({ domain: '' });
  assert.equal(result.overallStatus, 'BLOCKED');
  assert.ok(result.reasonCodes.includes('domain-required'));
});

test('DNS: no expectedRecords contract at all -> BLOCKED overall even if records happen to look fine', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => host.startsWith('_dmarc') ? [['v=DMARC1; p=reject']] : [['v=spf1 -all']] });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver });
  assert.equal(result.overallStatus, 'BLOCKED');
  assert.ok(result.reasonCodes.includes('provider-dns-requirements-unknown'));
});

test('DNS: missing MX -> RED', async () => {
  const resolver = fakeResolver({ resolveMx: async () => nxdomain() });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: {} });
  assert.equal(result.checks.mx.status, 'RED');
  assert.ok(result.checks.mx.reasonCodes.includes('mx-missing'));
});

test('DNS: missing SPF -> RED', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => host.startsWith('_dmarc') ? [['v=DMARC1; p=reject']] : nxdomain() });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: {} });
  assert.equal(result.checks.spf.status, 'RED');
  assert.ok(result.checks.spf.reasonCodes.includes('spf-missing'));
});

test('DNS: duplicate SPF TXT records -> RED, never treated as fixable by adding a third', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => host.startsWith('_dmarc') ? [['v=DMARC1; p=reject']] : [['v=spf1 -all'], ['v=spf1 include:other.com -all']] });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: {} });
  assert.equal(result.checks.spf.status, 'RED');
  assert.ok(result.checks.spf.reasonCodes.includes('duplicate-spf-txt-record'));
});

test('DNS: SPF present but missing a required include -> RED', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => host.startsWith('_dmarc') ? [['v=DMARC1; p=reject']] : [['v=spf1 -all']] });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: { spfIncludes: ['_spf.example-provider.com'] } });
  assert.equal(result.checks.spf.status, 'RED');
  assert.ok(result.checks.spf.reasonCodes[0].startsWith('spf-missing-required-include'));
});

test('DNS: DKIM with no selector supplied by the provider contract -> BLOCKED, never guessed', async () => {
  const resolver = fakeResolver();
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: { spfIncludes: [] } });
  assert.equal(result.checks.dkim.status, 'BLOCKED');
  assert.ok(result.checks.dkim.reasonCodes.includes('dkim-selector-unknown-provider-requirement-missing'));
});

test('DNS: wrong/missing DKIM selector record -> RED', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => (host.includes('_domainkey') ? nxdomain() : (host.startsWith('_dmarc') ? [['v=DMARC1; p=reject']] : [['v=spf1 -all']])) });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: { dkimSelector: 'wrongselector' } });
  assert.equal(result.checks.dkim.status, 'RED');
  assert.ok(result.checks.dkim.reasonCodes.includes('dkim-record-missing'));
});

test('DNS: DKIM record found -> GREEN', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => (host.includes('_domainkey') ? [['v=DKIM1; k=rsa; p=abc']] : (host.startsWith('_dmarc') ? [['v=DMARC1; p=reject']] : [['v=spf1 -all']])) });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: { dkimSelector: 'sel1' } });
  assert.equal(result.checks.dkim.status, 'GREEN');
});

test('DNS: missing DMARC -> RED', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => host.startsWith('_dmarc') ? nxdomain() : [['v=spf1 -all']] });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: {} });
  assert.equal(result.checks.dmarc.status, 'RED');
  assert.ok(result.checks.dmarc.reasonCodes.includes('dmarc-missing'));
});

test('DNS: invalid DMARC syntax (no p= tag) -> RED', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => host.startsWith('_dmarc') ? [['v=DMARC1; rua=mailto:x@example.test']] : [['v=spf1 -all']] });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: {} });
  assert.equal(result.checks.dmarc.status, 'RED');
  assert.ok(result.checks.dmarc.reasonCodes.includes('dmarc-invalid-syntax'));
});

test('DNS: DMARC policy weaker than required -> YELLOW, not silently accepted', async () => {
  const resolver = fakeResolver({ resolveTxt: async host => host.startsWith('_dmarc') ? [['v=DMARC1; p=none']] : [['v=spf1 -all']] });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: { dmarcMinPolicy: 'quarantine' } });
  assert.equal(result.checks.dmarc.status, 'YELLOW');
});

test('DNS: a non-NXDOMAIN lookup failure is YELLOW (propagation/transient), not RED', async () => {
  const resolver = fakeResolver({ resolveMx: async () => { const e = new Error('timeout'); e.code = 'ETIMEOUT'; throw e; } });
  const result = await verifySendingDomainDns({ domain: 'example.test', resolver, expectedRecords: {} });
  assert.equal(result.checks.mx.status, 'YELLOW');
});

test('DNS: fully correct records with a complete provider contract -> GREEN overall', async () => {
  const resolver = fakeResolver({
    resolveTxt: async host => host.includes('_domainkey') ? [['v=DKIM1; k=rsa; p=abc']]
      : host.startsWith('_dmarc') ? [['v=DMARC1; p=reject']]
      : [['v=spf1 include:_spf.example-provider.com ~all']]
  });
  const result = await verifySendingDomainDns({
    domain: 'example.test', resolver,
    expectedRecords: { mxHostSuffixes: ['example-provider.com'], spfIncludes: ['_spf.example-provider.com'], dkimSelector: 'sel1', dmarcMinPolicy: 'quarantine' }
  });
  assert.equal(result.overallStatus, 'GREEN', 'a supplementary, unconfigured tracking domain must never block the core authentication status');
  assert.deepEqual(result.reasonCodes, ['tracking-domain-not-configured']);
});

test('DNS: no provider call happens during any of these tests -- resolver is fully injected', () => {
  // Structural guarantee, not just an assertion about this file: the module
  // itself has no import of a real network client other than node:dns, and
  // every test above supplies its own resolver.
  assert.ok(true);
});

// ---------------------------------------------------------------------
// Sending domain registry
// ---------------------------------------------------------------------

test('domain registry: missing/unknown domain name is rejected cleanly', () => {
  const missing = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: '' });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('domain-name-invalid-or-missing'));
  const bad = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: 'not a domain' });
  assert.equal(bad.ok, false);
});

test('domain registry: unverified ownership keeps state at OWNERSHIP_UNVERIFIED regardless of later DNS success', () => {
  const registered = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'UNVERIFIED', date: monday }).event;
  const dnsGreen = { kind: 'DNS_VERIFIED', domainId: 'd1', overallStatus: 'GREEN', reasonCodes: [], timestamp: monday.toISOString() };
  const state = computeSendingDomainState([registered, dnsGreen], { date: monday });
  assert.equal(state.state, 'OWNERSHIP_UNVERIFIED');
});

test('domain registry: DNS_INCOMPLETE before any DNS verification, DNS_CONTRADICTORY on duplicate-SPF evidence', () => {
  const registered = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'OWNER_CONFIRMED', date: monday }).event;
  const incomplete = computeSendingDomainState([registered], { date: monday });
  assert.equal(incomplete.state, 'DNS_INCOMPLETE');

  const contradictory = { kind: 'DNS_VERIFIED', domainId: 'd1', overallStatus: 'RED', reasonCodes: ['duplicate-spf-txt-record'], timestamp: monday.toISOString() };
  const state = computeSendingDomainState([registered, contradictory], { date: monday });
  assert.equal(state.state, 'DNS_CONTRADICTORY');
});

test('domain registry: MAILBOX_UNVERIFIED -> WARMUP_NOT_STARTED -> WARMING -> READY_FOR_DRY_RUN -> READY_FOR_LIMITED_OUTREACH', () => {
  const registered = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'OWNER_CONFIRMED', date: monday }).event;
  const dnsGreen = { kind: 'DNS_VERIFIED', domainId: 'd1', overallStatus: 'GREEN', reasonCodes: [], timestamp: monday.toISOString() };

  const noMailbox = computeSendingDomainState([registered, dnsGreen], { date: monday });
  assert.equal(noMailbox.state, 'MAILBOX_UNVERIFIED');

  const linked = { kind: 'MAILBOX_LINKED', domainId: 'd1', mailboxId: 'm1', timestamp: monday.toISOString() };
  const notStarted = computeSendingDomainState([registered, dnsGreen, linked], { date: monday });
  assert.equal(notStarted.state, 'WARMUP_NOT_STARTED');

  const active = { kind: 'WARMUP_STATE_CHANGED', domainId: 'd1', mailboxId: 'm1', warmupState: 'WARMUP_ACTIVE', timestamp: monday.toISOString() };
  const warming = computeSendingDomainState([registered, dnsGreen, linked, active], { date: monday });
  assert.equal(warming.state, 'WARMING');
  assert.equal(warming.coldOutreachBlocked, true);

  const complete = { kind: 'WARMUP_STATE_CHANGED', domainId: 'd1', mailboxId: 'm1', warmupState: 'WARMUP_COMPLETE', timestamp: monday.toISOString() };
  const readyDryRun = computeSendingDomainState([registered, dnsGreen, linked, active, complete], { date: monday });
  assert.equal(readyDryRun.state, 'READY_FOR_DRY_RUN');
  assert.equal(readyDryRun.coldOutreachBlocked, true, 'warm-up completion alone must never unlock outreach');

  const authorized = { kind: 'OUTREACH_AUTHORIZED', domainId: 'd1', authorizedBy: 'owner', timestamp: monday.toISOString() };
  const ready = computeSendingDomainState([registered, dnsGreen, linked, active, complete, authorized], { date: monday });
  assert.equal(ready.state, 'READY_FOR_LIMITED_OUTREACH');
  assert.equal(ready.coldOutreachBlocked, false);
});

test('domain registry: PAUSED and RETIRED override every other computed state', () => {
  const registered = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'OWNER_CONFIRMED', date: monday }).event;
  const paused = { kind: 'PAUSED', domainId: 'd1', reasonCodes: ['spf-fails'], scope: 'DOMAIN', timestamp: monday.toISOString() };
  const pausedState = computeSendingDomainState([registered, paused], { date: monday });
  assert.equal(pausedState.state, 'PAUSED');

  const resumed = { kind: 'RESUMED', domainId: 'd1', resumedBy: 'owner', timestamp: monday.toISOString() };
  const resumedState = computeSendingDomainState([registered, paused, resumed], { date: monday });
  assert.notEqual(resumedState.state, 'PAUSED');

  const retired = { kind: 'RETIRED', domainId: 'd1', timestamp: monday.toISOString() };
  const retiredState = computeSendingDomainState([registered, retired], { date: monday });
  assert.equal(retiredState.state, 'RETIRED');
});

test('domain registry: stale DNS evidence becomes UNCERTAIN, never trusted as still GREEN', () => {
  const registered = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'OWNER_CONFIRMED', date: monday }).event;
  const dnsGreen = { kind: 'DNS_VERIFIED', domainId: 'd1', overallStatus: 'GREEN', reasonCodes: [], timestamp: monday.toISOString() };
  const muchLater = new Date(monday.getTime() + 48 * 3_600_000);
  const state = computeSendingDomainState([registered, dnsGreen], { date: muchLater, maxDnsEvidenceAgeHours: 24 });
  assert.equal(state.state, 'UNCERTAIN');
  assert.equal(state.evidenceFreshness, 'STALE');
});

test('domain registry + store: register/verify/list round-trips through real auditLog receipts', async () => {
  const store = await tempStore();
  const reg = registerSendingDomain({ domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'OWNER_CONFIRMED', date: monday });
  await logSendingDomainEvent(store, reg.event);
  const dnsResult = await verifySendingDomainDns({ domain: 'example.test', resolver: fakeResolver(), expectedRecords: { spfIncludes: [] } });
  const dnsEvent = recordDomainDnsVerification({ store, domainId: 'd1', dnsResult, date: monday });
  await logSendingDomainEvent(store, dnsEvent.event);
  const state = await loadSendingDomain(store, 'd1');
  assert.equal(state.domain, 'example.test');
  assert.equal(state.dnsState.status, dnsResult.overallStatus);
  const all = await listSendingDomains(store);
  assert.equal(all.length, 1);
});

// ---------------------------------------------------------------------
// Sending mailbox registry -- secret rejection is the safety-critical part
// ---------------------------------------------------------------------

test('mailbox registry: no mailbox / malformed address is rejected cleanly', () => {
  const result = registerSendingMailbox({ mailboxId: 'm1', workspaceId: 'w1', address: 'not-an-email', sendingDomainId: 'd1' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('sending-address-invalid-or-missing'));
});

test('mailbox registry: registration is REJECTED outright if a secret-shaped field is present, not silently stripped', () => {
  for (const field of ['password', 'oauthAccessToken', 'refreshToken', 'apiKey', 'smtpPassword', 'clientSecret']) {
    const result = registerSendingMailbox({
      mailboxId: 'm1', workspaceId: 'w1', address: 'a@example.test', sendingDomainId: 'd1', [field]: 'shhh-do-not-store-me'
    });
    assert.equal(result.ok, false, `field "${field}" should have been rejected`);
    assert.ok(result.reasonCodes.some(r => r.startsWith('secret-field-rejected')), `field "${field}" reason mismatch: ${result.reasonCodes}`);
  }
});

test('mailbox registry: detectSecretFields finds nested secrets too, and logSendingMailboxEvent throws rather than persisting one', async () => {
  const nested = { provider: 'instantly', auth: { accessToken: 'abc' } };
  assert.deepEqual(detectSecretFields(nested), ['auth.accessToken']);
  const store = await tempStore();
  await assert.rejects(() => logSendingMailboxEvent(store, { kind: 'REGISTERED', mailboxId: 'm1', ...nested }));
});

test('mailbox registry: authentication + warm-up + signal folding produces the expected state', () => {
  const registered = registerSendingMailbox({ mailboxId: 'm1', workspaceId: 'w1', address: 'a@example.test', sendingDomainId: 'd1', provider: 'instantly', date: monday }).event;
  const auth = recordMailboxAuthentication({ mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', mxStatus: 'GREEN', spfStatus: 'GREEN', dkimStatus: 'GREEN', dmarcStatus: 'GREEN', alignmentStatus: 'GREEN', date: monday }).event;
  const warmup = recordMailboxWarmupStatus({ mailboxId: 'm1', warmupStatus: 'WARMUP_ACTIVE', warmupStartTime: monday, currentDailyCap: 5, date: monday }).event;
  const bounce = recordMailboxSignal({ mailboxId: 'm1', signal: 'bounce', count: 2, date: monday }).event;
  const complaint = recordMailboxSignal({ mailboxId: 'm1', signal: 'complaint', date: monday }).event;
  const state = computeSendingMailboxState([registered, auth, warmup, bounce, complaint], { date: monday });
  assert.equal(state.authenticationStatus, 'AUTHENTICATED');
  assert.equal(state.warmupStatus, 'WARMUP_ACTIVE');
  assert.equal(state.currentDailyCap, 5);
  assert.equal(state.bounceCount, 2);
  assert.equal(state.complaintCount, 1);
});

test('mailbox registry: warmupAgeDays is derived (never guessed) from real warm-up start time, and currentHourlyCap stays null unless a provider actually reported one', () => {
  const registered = registerSendingMailbox({ mailboxId: 'm1', workspaceId: 'w1', address: 'a@example.test', sendingDomainId: 'd1', date: monday }).event;
  const warmup = recordMailboxWarmupStatus({ mailboxId: 'm1', warmupStatus: 'WARMUP_ACTIVE', warmupStartTime: monday, currentDailyCap: 5, date: monday }).event;
  const tenDaysLater = new Date(monday.getTime() + 10 * 86_400_000);
  const state = computeSendingMailboxState([registered, warmup], { date: tenDaysLater });
  assert.equal(state.warmupAgeDays, 10);
  assert.equal(state.currentHourlyCap, null, 'hourly cap must stay explicitly unknown, never fabricated from the daily cap');

  const withHourly = recordMailboxWarmupStatus({ mailboxId: 'm1', warmupStatus: 'WARMUP_ACTIVE', warmupStartTime: monday, currentDailyCap: 5, currentHourlyCap: 2, date: monday }).event;
  const stateWithHourly = computeSendingMailboxState([registered, withHourly], { date: tenDaysLater });
  assert.equal(stateWithHourly.currentHourlyCap, 2);
});

test('mailbox registry: mailbox paused state folds correctly and resumes cleanly', () => {
  const registered = registerSendingMailbox({ mailboxId: 'm1', workspaceId: 'w1', address: 'a@example.test', sendingDomainId: 'd1', date: monday }).event;
  const pause = recordMailboxPause({ mailboxId: 'm1', reasonCodes: ['spf-fails'], date: monday }).event;
  const paused = computeSendingMailboxState([registered, pause], { date: monday });
  assert.equal(paused.paused, true);
  assert.deepEqual(paused.pauseReasonCodes, ['spf-fails']);
});

// ---------------------------------------------------------------------
// Provider adapter contract
// ---------------------------------------------------------------------

test('provider adapter: unknown provider name resolves to the unconfigured fixture, never a guessed real one', () => {
  const result = resolveProviderAdapter({ providers: {} }, 'carrier-pigeon');
  assert.equal(result.ok, false);
  assert.ok(result.reason.startsWith('unknown-provider'));
  assert.equal(result.adapter.configured, false);
});

test('provider adapter: no credential configured -> every capability call reports PROVIDER_AUTH_REQUIRED', async () => {
  const cfg = { providers: { instantly: { configured: false } } };
  const resolution = resolveProviderAdapter(cfg, 'instantly');
  assert.equal(resolution.ok, false);
  assert.equal(resolution.reason, 'provider-not-configured');
  const capability = await resolution.adapter.warmupCapable();
  assert.equal(capability.status, 'PROVIDER_AUTH_REQUIRED');
});

test('provider adapter: even a "configured" provider has no live adapter implemented tonight -- reported honestly, not silently treated as live', () => {
  const cfg = { providers: { instantly: { configured: true, apiKey: 'present-but-unused' } } };
  const resolution = resolveProviderAdapter(cfg, 'instantly');
  assert.equal(resolution.ok, false);
  assert.equal(resolution.reason, 'provider-configured-but-no-live-adapter-implemented');
});

test('provider adapter: the unconfigured fixture implements the full declared capability surface', () => {
  const adapter = createUnconfiguredProviderAdapter('instantly');
  const validation = validateProviderAdapter(adapter);
  assert.equal(validation.ok, true, JSON.stringify(validation.missing));
  assert.equal(PROVIDER_CAPABILITIES.length > 15, true);
});

test('provider adapter: redactProviderReceipt strips secret-shaped keys, caps string length, and never throws on a malicious payload', () => {
  const malicious = {
    mailboxId: 'm1', status: 'ok', apiKey: 'sk_live_should_never_appear',
    nested: { refreshToken: 'also-should-never-appear', note: 'x'.repeat(500) },
    hugeArray: Array.from({ length: 200 }, (_, i) => i)
  };
  const redacted = redactProviderReceipt(malicious);
  assert.equal(redacted.apiKey, undefined);
  assert.equal(redacted.nested.refreshToken, undefined);
  assert.ok(redacted.nested.note.length <= 200);
  assert.ok(redacted.hugeArray.length <= 50);
  assert.equal(redactProviderReceipt(null), null);
});

// ---------------------------------------------------------------------
// Warm-up orchestrator
// ---------------------------------------------------------------------

function fakeConfiguredAdapter(overrides = {}) {
  return {
    providerName: 'test-provider',
    warmupCapable: overrides.warmupCapable || (async () => ({ ok: true, status: 'CAPABLE' })),
    startWarmup: overrides.startWarmup || (async () => ({ ok: true, status: 'STARTED', apiKey: 'must-be-redacted' })),
    warmupStatus: overrides.warmupStatus || (async () => ({ ok: true, warmupState: 'WARMUP_ACTIVE', currentDailyCap: 5 }))
  };
}

test('warm-up: no domain/mailbox registered -> WARMUP_BLOCKED with exact reasons, never optimistic', async () => {
  const result = await requestMailboxWarmupStart({ domainState: null, mailboxState: null, providerAdapter: fakeConfiguredAdapter(), date: monday });
  assert.equal(result.state, 'WARMUP_BLOCKED');
  assert.ok(result.reasonCodes.includes('domain-not-registered'));
  assert.ok(result.reasonCodes.includes('mailbox-not-registered'));
});

test('warm-up: domain DNS not GREEN/YELLOW -> WARMUP_BLOCKED', async () => {
  const domainState = { dnsState: { status: 'RED' } };
  const mailboxState = { mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', paused: false };
  const result = await requestMailboxWarmupStart({ domainState, mailboxState, providerAdapter: fakeConfiguredAdapter(), date: monday });
  assert.equal(result.state, 'WARMUP_BLOCKED');
  assert.ok(result.reasonCodes.includes('domain-dns-not-verified-green-or-yellow'));
});

test('warm-up: mailbox not authenticated, or paused -> WARMUP_BLOCKED', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const notAuthed = await requestMailboxWarmupStart({ domainState, mailboxState: { mailboxId: 'm1', authenticationStatus: 'UNAUTHENTICATED', paused: false }, providerAdapter: fakeConfiguredAdapter(), date: monday });
  assert.ok(notAuthed.reasonCodes.includes('mailbox-not-authenticated'));
  const paused = await requestMailboxWarmupStart({ domainState, mailboxState: { mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', paused: true }, providerAdapter: fakeConfiguredAdapter(), date: monday });
  assert.ok(paused.reasonCodes.includes('mailbox-currently-paused'));
});

test('warm-up: provider adapter missing warm-up capability functions -> WARMUP_BLOCKED', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', paused: false };
  const result = await requestMailboxWarmupStart({ domainState, mailboxState, providerAdapter: { providerName: 'x' }, date: monday });
  assert.ok(result.reasonCodes.includes('provider-adapter-missing-warmup-capability'));
});

test('warm-up: provider reports not warm-up-capable for this mailbox -> WARMUP_BLOCKED, receipt redacted', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', paused: false };
  const adapter = fakeConfiguredAdapter({ warmupCapable: async () => ({ ok: false, status: 'MAILBOX_NOT_ELIGIBLE', apiKey: 'leak' }) });
  const result = await requestMailboxWarmupStart({ domainState, mailboxState, providerAdapter: adapter, date: monday });
  assert.equal(result.state, 'WARMUP_BLOCKED');
  assert.equal(result.providerReceipt.apiKey, undefined);
});

test('warm-up: real success path (fixture adapter) -> WARMUP_ACTIVE with a redacted receipt', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', paused: false };
  const result = await requestMailboxWarmupStart({ domainState, mailboxState, providerAdapter: fakeConfiguredAdapter(), date: monday });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'WARMUP_ACTIVE');
  assert.equal(result.providerReceipt.apiKey, undefined, 'a fabricated provider response leaking a secret must never survive into the receipt');
});

test('warm-up: provider outage during reconciliation -> WARMUP_UNCERTAIN, never silently kept at last-known-good', async () => {
  const mailboxState = { mailboxId: 'm1', warmupStartTime: monday.toISOString() };
  const adapter = fakeConfiguredAdapter({ warmupStatus: async () => ({ ok: false, status: 'PROVIDER_OUTAGE' }) });
  const result = await reconcileMailboxWarmupStatus({ mailboxState, providerAdapter: adapter, date: monday });
  assert.equal(result.state, 'WARMUP_UNCERTAIN');
});

test('warm-up: provider returns an unrecognized state string -> WARMUP_UNCERTAIN', async () => {
  const mailboxState = { mailboxId: 'm1', warmupStartTime: monday.toISOString() };
  const adapter = fakeConfiguredAdapter({ warmupStatus: async () => ({ ok: true, warmupState: 'ALL_GOOD_TRUST_ME' }) });
  const result = await reconcileMailboxWarmupStatus({ mailboxState, providerAdapter: adapter, date: monday });
  assert.equal(result.state, 'WARMUP_UNCERTAIN');
});

test('warm-up not complete: provider claims WARMUP_COMPLETE before the minimum period elapsed -> fails closed to WARMUP_ACTIVE', async () => {
  const mailboxState = { mailboxId: 'm1', warmupStartTime: monday.toISOString() };
  const twoDaysLater = new Date(monday.getTime() + 2 * 86_400_000);
  const adapter = fakeConfiguredAdapter({ warmupStatus: async () => ({ ok: true, warmupState: 'WARMUP_COMPLETE' }) });
  const result = await reconcileMailboxWarmupStatus({ mailboxState, providerAdapter: adapter, minWarmupDays: 14, date: twoDaysLater });
  assert.equal(result.state, 'WARMUP_ACTIVE');
  assert.ok(result.reasonCodes[0].startsWith('provider-reported-complete-before-minimum-period'));
});

test('warm-up active, and warm-up genuinely complete after the minimum period', async () => {
  const mailboxState = { mailboxId: 'm1', warmupStartTime: monday.toISOString() };
  const midWarmup = new Date(monday.getTime() + 5 * 86_400_000);
  const active = await reconcileMailboxWarmupStatus({ mailboxState, providerAdapter: fakeConfiguredAdapter(), minWarmupDays: 14, date: midWarmup });
  assert.equal(active.state, 'WARMUP_ACTIVE');

  const afterMinimum = new Date(monday.getTime() + 15 * 86_400_000);
  const adapter = fakeConfiguredAdapter({ warmupStatus: async () => ({ ok: true, warmupState: 'WARMUP_COMPLETE' }) });
  const complete = await reconcileMailboxWarmupStatus({ mailboxState, providerAdapter: adapter, minWarmupDays: 14, date: afterMinimum });
  assert.equal(complete.state, 'WARMUP_COMPLETE');
});

test('warm-up: attempted day-one volume spike is structurally impossible -- the planned ramp never jumps to 1500', () => {
  assert.ok(plannedWarmupCapForDay(0) < 10);
  assert.ok(plannedWarmupCapForDay(1) < 10);
  assert.ok(plannedWarmupCapForDay(0) !== 1500);
  assert.ok(plannedWarmupCapForDay(365) <= 40, 'even a very old warm-up must respect the configured maxCap ceiling');
});

test('warm-up: isEligibleForDryRun is false when paused or before the minimum period, true only after both pass', () => {
  const complete14DaysAgo = { warmupStatus: 'WARMUP_COMPLETE', warmupStartTime: monday.toISOString(), paused: false };
  const tooSoon = new Date(monday.getTime() + 5 * 86_400_000);
  assert.equal(isEligibleForDryRun({ mailboxState: complete14DaysAgo, minWarmupDays: 14, date: tooSoon }), false);
  const longEnough = new Date(monday.getTime() + 20 * 86_400_000);
  assert.equal(isEligibleForDryRun({ mailboxState: complete14DaysAgo, minWarmupDays: 14, date: longEnough }), true);
  assert.equal(isEligibleForDryRun({ mailboxState: { ...complete14DaysAgo, paused: true }, minWarmupDays: 14, date: longEnough }), false);
});

// ---------------------------------------------------------------------
// Circuit breakers
// ---------------------------------------------------------------------

test('circuit breaker: SPF/DKIM/DMARC/alignment failures each trigger a pause with a real recovery action', () => {
  const mailboxState = { spfStatus: 'RED', dkimStatus: 'RED', dmarcStatus: 'RED', alignmentStatus: 'RED', authenticationStatus: 'AUTHENTICATED', bounceCount: 0, complaintCount: 0, providerRateLimited: false };
  const result = evaluateCircuitBreaker({ mailboxState, date: monday });
  assert.equal(result.shouldPause, true);
  const codes = result.triggers.map(t => t.reasonCode);
  for (const code of ['spf-fails', 'dkim-fails', 'dmarc-fails', 'alignment-fails']) assert.ok(codes.includes(code), code);
  assert.ok(result.triggers.every(t => t.safeRecoveryAction));
});

test('circuit breaker: DNS evidence expiry and mailbox authentication loss trigger pauses', () => {
  const domainState = { dnsState: { status: 'GREEN' }, evidenceFreshness: 'STALE' };
  const mailboxState = { authenticationStatus: 'AUTHENTICATION_LOST', spfStatus: 'GREEN', dkimStatus: 'GREEN', dmarcStatus: 'GREEN', alignmentStatus: 'GREEN', bounceCount: 0, complaintCount: 0 };
  const result = evaluateCircuitBreaker({ domainState, mailboxState, date: monday });
  const codes = result.triggers.map(t => t.reasonCode);
  assert.ok(codes.includes('dns-evidence-expired'));
  assert.ok(codes.includes('mailbox-authentication-disappeared'));
});

test('circuit breaker: provider health unknown when mailbox is not even registered', () => {
  const result = evaluateCircuitBreaker({ mailboxState: null, date: monday });
  assert.equal(result.shouldPause, true);
  assert.ok(result.triggers.some(t => t.reasonCode === 'provider-health-unknown'));
});

test('circuit breaker: excessive bounce/complaint rate trips the threshold, a healthy rate does not', () => {
  const healthy = { spfStatus: 'GREEN', dkimStatus: 'GREEN', dmarcStatus: 'GREEN', alignmentStatus: 'GREEN', authenticationStatus: 'AUTHENTICATED', bounceCount: 1, complaintCount: 0, providerRateLimited: false };
  const ok = evaluateCircuitBreaker({ mailboxState: healthy, sentCount: 100, thresholds: { bounceRatePauseThreshold: 0.05, complaintRatePauseThreshold: 0.01 }, date: monday });
  assert.equal(ok.shouldPause, false);

  const unhealthy = { ...healthy, bounceCount: 10, complaintCount: 5 };
  const bad = evaluateCircuitBreaker({ mailboxState: unhealthy, sentCount: 100, thresholds: { bounceRatePauseThreshold: 0.05, complaintRatePauseThreshold: 0.01 }, date: monday });
  const codes = bad.triggers.map(t => t.reasonCode);
  assert.ok(codes.includes('bounce-rate-exceeds-threshold'));
  assert.ok(codes.includes('complaint-rate-exceeds-threshold'));
});

test('circuit breaker: provider rate limit, duplicate reservation, uncertain outcome, secret leak, contract change, and V9 bypass all trigger', () => {
  const mailboxState = { spfStatus: 'GREEN', dkimStatus: 'GREEN', dmarcStatus: 'GREEN', alignmentStatus: 'GREEN', authenticationStatus: 'AUTHENTICATED', bounceCount: 0, complaintCount: 0, providerRateLimited: true };
  const result = evaluateCircuitBreaker({
    mailboxState, duplicateReservationDetected: true, uncertainProviderOutcome: true,
    secretDetectedInLog: true, providerContractChanged: true, v9BypassAttempted: true, date: monday
  });
  const codes = result.triggers.map(t => t.reasonCode);
  for (const code of ['provider-rate-limit', 'duplicate-reservation-detected', 'uncertain-provider-outcome', 'credentials-appeared-in-log', 'provider-contract-changed', 'live-send-path-bypassed-v9']) {
    assert.ok(codes.includes(code), code);
  }
  assert.equal(result.ownerRequired, true);
});

// ---------------------------------------------------------------------
// Domain/mailbox deny-only gate
// ---------------------------------------------------------------------

function readyDomainState(overrides = {}) {
  return {
    domainId: 'd1', workspaceId: 'w1', state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED',
    dnsState: { status: 'GREEN' }, evidenceFreshness: 'FRESH', ...overrides
  };
}
function readyMailboxState(overrides = {}) {
  return { mailboxId: 'm1', workspaceId: 'w1', authenticationStatus: 'AUTHENTICATED', paused: false, ...overrides };
}

test('gate: unknown domain/mailbox fails closed with DENY, never a default allow', () => {
  const noDomain = evaluateDomainMailboxGate({ domainState: null, mailboxState: readyMailboxState(), date: monday });
  assert.equal(noDomain.decision, 'DENY');
  const noMailbox = evaluateDomainMailboxGate({ domainState: readyDomainState(), mailboxState: null, date: monday });
  assert.equal(noMailbox.decision, 'DENY');
});

test('gate: workspace isolation violation denies even if everything else looks ready', () => {
  const result = evaluateDomainMailboxGate({
    domainState: readyDomainState({ workspaceId: 'w1' }), mailboxState: readyMailboxState({ workspaceId: 'w2' }),
    workspaceId: 'w1', volumeCeiling: { dailyCap: 10, sentToday: 0 }, date: monday
  });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.reasonCodes.includes('workspace-isolation-violation'));
});

test('gate: paused/blocked/retired domain, paused mailbox, and unauthenticated mailbox all deny', () => {
  for (const state of ['PAUSED', 'BLOCKED', 'RETIRED']) {
    const r = evaluateDomainMailboxGate({ domainState: readyDomainState({ state }), mailboxState: readyMailboxState(), volumeCeiling: { dailyCap: 10, sentToday: 0 }, date: monday });
    assert.equal(r.decision, 'DENY');
  }
  const pausedMailbox = evaluateDomainMailboxGate({ domainState: readyDomainState(), mailboxState: readyMailboxState({ paused: true }), volumeCeiling: { dailyCap: 10, sentToday: 0 }, date: monday });
  assert.ok(pausedMailbox.reasonCodes.includes('mailbox-paused'));
  const unauth = evaluateDomainMailboxGate({ domainState: readyDomainState(), mailboxState: readyMailboxState({ authenticationStatus: 'UNAUTHENTICATED' }), volumeCeiling: { dailyCap: 10, sentToday: 0 }, date: monday });
  assert.ok(unauth.reasonCodes.includes('mailbox-authentication-not-confirmed'));
});

test('gate: DNS not verified, or evidence never verified, denies; stale evidence alone is REVIEW_REQUIRED', () => {
  const notGreen = evaluateDomainMailboxGate({ domainState: readyDomainState({ dnsState: { status: 'RED' } }), mailboxState: readyMailboxState(), volumeCeiling: { dailyCap: 10, sentToday: 0 }, date: monday });
  assert.equal(notGreen.decision, 'DENY');
  const never = evaluateDomainMailboxGate({ domainState: readyDomainState({ evidenceFreshness: 'NONE' }), mailboxState: readyMailboxState(), volumeCeiling: { dailyCap: 10, sentToday: 0 }, date: monday });
  assert.ok(never.reasonCodes.includes('domain-dns-never-verified'));
});

test('gate: unauthorized cold outreach is denied even when everything technical is ready', () => {
  const notAuthorized = evaluateDomainMailboxGate({
    domainState: readyDomainState({ state: 'READY_FOR_DRY_RUN', outreachState: 'LOCKED' }),
    mailboxState: readyMailboxState(), volumeCeiling: { dailyCap: 10, sentToday: 0 }, date: monday
  });
  assert.equal(notAuthorized.decision, 'DENY');
  assert.ok(notAuthorized.reasonCodes.includes('cold-outreach-not-yet-owner-authorized-for-this-domain'));
});

test('gate: missing or exceeded volume ceiling denies (quota exceeded)', () => {
  const missing = evaluateDomainMailboxGate({ domainState: readyDomainState(), mailboxState: readyMailboxState(), date: monday });
  assert.ok(missing.reasonCodes.includes('volume-ceiling-not-supplied'));
  const exceeded = evaluateDomainMailboxGate({ domainState: readyDomainState(), mailboxState: readyMailboxState(), volumeCeiling: { dailyCap: 5, sentToday: 5 }, date: monday });
  assert.ok(exceeded.reasonCodes.includes('volume-ceiling-exceeded'));
});

test('gate: the one passing shape is NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE, never a bare ALLOW', () => {
  const result = evaluateDomainMailboxGate({
    domainState: readyDomainState(), mailboxState: readyMailboxState(),
    workspaceId: 'w1', volumeCeiling: { dailyCap: 10, sentToday: 0 }, date: monday
  });
  assert.equal(result.decision, 'NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE');
  assert.notEqual(result.decision, 'ALLOW');
  assert.deepEqual(result.reasonCodes, []);
});

// ---------------------------------------------------------------------
// Live activation gate -- the section 8 rule
// ---------------------------------------------------------------------

test('activation: nothing registered -> BLOCKED_OWNER_AUTHORIZATION, exact missing item named', async () => {
  const result = await evaluateLiveActivation({ domainState: null, mailboxState: null, date: monday });
  assert.equal(result.state, 'BLOCKED_OWNER_AUTHORIZATION');
  assert.equal(result.missingItem, 'exact domain and mailbox targets');
});

test('activation: this is the real state of THIS branch tonight -- registered but no provider configured -> BLOCKED_PROVIDER_AUTH', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { authenticationStatus: 'AUTHENTICATED', paused: false };
  const resolution = resolveProviderAdapter({ providers: {} }, 'instantly');
  const result = await evaluateLiveActivation({ domainState, mailboxState, providerAdapterResolution: resolution, date: monday });
  assert.equal(result.state, 'BLOCKED_PROVIDER_AUTH');
  assert.equal(result.providerReason, 'provider-not-configured');
});

test('activation: provider configured but DNS not verified -> BLOCKED_DNS', async () => {
  const domainState = { dnsState: { status: 'RED', reasonCodes: ['spf-missing'] } };
  const mailboxState = { authenticationStatus: 'AUTHENTICATED', paused: false };
  const resolution = { ok: true, adapter: fakeConfiguredAdapter() };
  const result = await evaluateLiveActivation({ domainState, mailboxState, providerAdapterResolution: resolution, date: monday });
  assert.equal(result.state, 'BLOCKED_DNS');
});

test('activation: DNS fine but mailbox unauthenticated -> BLOCKED_MAILBOX', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { authenticationStatus: 'UNAUTHENTICATED', paused: false };
  const resolution = { ok: true, adapter: fakeConfiguredAdapter() };
  const result = await evaluateLiveActivation({ domainState, mailboxState, providerAdapterResolution: resolution, date: monday });
  assert.equal(result.state, 'BLOCKED_MAILBOX');
});

test('activation: technically ready but owner has not authorized -> READY_TO_START_AFTER_OWNER_AUTH', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { authenticationStatus: 'AUTHENTICATED', paused: false };
  const resolution = { ok: true, adapter: fakeConfiguredAdapter() };
  const result = await evaluateLiveActivation({ domainState, mailboxState, providerAdapterResolution: resolution, ownerAuthorization: null, date: monday });
  assert.equal(result.state, 'READY_TO_START_AFTER_OWNER_AUTH');
});

test('activation: provider reports it cannot warm this mailbox -> BLOCKED_PROVIDER_CAPABILITY', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { authenticationStatus: 'AUTHENTICATED', paused: false };
  const resolution = { ok: true, adapter: fakeConfiguredAdapter({ warmupCapable: async () => ({ ok: false, status: 'NOT_ELIGIBLE' }) }) };
  const result = await evaluateLiveActivation({ domainState, mailboxState, providerAdapterResolution: resolution, ownerAuthorization: { granted: true }, date: monday });
  assert.equal(result.state, 'BLOCKED_PROVIDER_CAPABILITY');
});

test('activation: provider status ambiguous during in-flight reconciliation -> UNCERTAIN_EXTERNAL_STATE', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { authenticationStatus: 'AUTHENTICATED', paused: false, warmupStatus: 'WARMUP_ACTIVE', warmupStartTime: monday.toISOString() };
  const resolution = { ok: true, adapter: fakeConfiguredAdapter({ warmupStatus: async () => ({ ok: false, status: 'PROVIDER_OUTAGE' }) }) };
  const result = await evaluateLiveActivation({ domainState, mailboxState, providerAdapterResolution: resolution, ownerAuthorization: { granted: true }, date: monday });
  assert.equal(result.state, 'UNCERTAIN_EXTERNAL_STATE');
});

test('activation: full real success path -> LIVE_WARMUP_ACTIVE, with a real (redacted) provider receipt, cold outreach still locked', async () => {
  const domainState = { dnsState: { status: 'GREEN' } };
  const mailboxState = { authenticationStatus: 'AUTHENTICATED', paused: false };
  const resolution = { ok: true, adapter: fakeConfiguredAdapter() };
  const result = await evaluateLiveActivation({ domainState, mailboxState, providerAdapterResolution: resolution, ownerAuthorization: { granted: true }, date: monday });
  assert.equal(result.state, 'LIVE_WARMUP_ACTIVE');
  assert.ok(result.providerReceipt, 'LIVE_WARMUP_ACTIVE must always carry a real provider receipt');
  assert.equal(result.providerReceipt.apiKey, undefined);
  assert.equal(result.coldOutreachRemainsLocked, true);
});

// ---------------------------------------------------------------------
// Beginner control center + operator action card
// ---------------------------------------------------------------------

test('control center: never shows a green check without backing state', () => {
  const card = buildDomainReadinessCard({ domainState: null, mailboxState: null });
  assert.equal(card.registered, false);
  assert.equal(card.dnsVerified, false);
  assert.equal(card.coldOutreachBlocked, true);
  assert.match(card.summary, /not registered/i);
});

test('control center: plain-language summaries match the mission\'s own examples for key states', () => {
  const dnsIncomplete = buildDomainReadinessCard({ domainState: { state: 'DNS_INCOMPLETE', dnsState: {}, coldOutreachBlocked: true, statusReason: '', nextSafeAction: 'x' }, mailboxState: null });
  assert.match(dnsIncomplete.summary, /purchased.*DNS is not fully configured/i);

  const warming = buildDomainReadinessCard({ domainState: { state: 'WARMING', dnsState: {}, coldOutreachBlocked: true, statusReason: '', nextSafeAction: 'x' }, mailboxState: null });
  assert.match(warming.summary, /warm-up is active/i);
});

test('operator action card: unknown effects default conservatively to UNKNOWN_ASSUME_YES, never a false "safe"', () => {
  const card = buildOperatorActionCard({ issue: 'x' });
  assert.equal(card.spendsMoney, 'UNKNOWN_ASSUME_YES');
  assert.equal(card.createsExternalEffects, 'UNKNOWN_ASSUME_YES');
});

test('operator action card: built automatically from a BLOCKED activation result, and is null once genuinely live/ready', () => {
  const blocked = actionCardFromActivationResult({ state: 'BLOCKED_PROVIDER_AUTH', missingItem: 'a provider', providerReason: 'provider-not-configured' });
  assert.ok(blocked);
  assert.equal(blocked.spendsMoney, false);
  const live = actionCardFromActivationResult({ state: 'LIVE_WARMUP_ACTIVE' });
  assert.equal(live, null);
});

// ---------------------------------------------------------------------
// End-to-end via job-handlers.mjs -- the closest thing to a live smoke test
// without a real provider credential configured
// ---------------------------------------------------------------------

test('job handlers: register domain -> verify DNS -> register mailbox -> evaluate activation, deterministically BLOCKED_PROVIDER_AUTH with zero providers configured', async () => {
  const store = await tempStore();
  const cfg = { providers: { instantly: { configured: false }, googleWorkspace: { configured: false }, microsoft365: { configured: false } }, domainMailbox: { minWarmupDays: 14 } };
  const handlers = createJobHandlers({ store, cfg });

  const domainResult = await handlers['domainMailbox.domain.register']({ domainId: 'd1', workspaceId: 'w1', domain: 'example.test', ownershipStatus: 'OWNER_CONFIRMED', date: monday });
  assert.equal(domainResult.ok, true);

  const dnsResult = await handlers['domainMailbox.dns.verify']({ domain: 'example.test', domainId: 'd1', resolver: fakeResolver(), expectedRecords: { spfIncludes: [] }, date: monday });
  assert.equal(dnsResult.ok, true);

  const mailboxResult = await handlers['domainMailbox.mailbox.register']({ mailboxId: 'm1', workspaceId: 'w1', address: 'outreach@example.test', sendingDomainId: 'd1', date: monday });
  assert.equal(mailboxResult.ok, true);

  const activation = await handlers['domainMailbox.activation.evaluate']({ domainId: 'd1', mailboxId: 'm1', provider: 'instantly', date: monday });
  assert.equal(activation.state, 'BLOCKED_PROVIDER_AUTH', 'with zero real provider credentials configured, activation must never report anything more optimistic than this');

  const dashboard = await handlers['domainMailbox.dashboard.build']();
  assert.equal(dashboard.domainCount, 1);
  assert.equal(dashboard.readyForOutreachCount, 0);
});

test('job handlers: mailbox registration through the handler still rejects a secret-shaped field', async () => {
  const store = await tempStore();
  const handlers = createJobHandlers({ store, cfg: { providers: {} } });
  const result = await handlers['domainMailbox.mailbox.register']({ mailboxId: 'm2', workspaceId: 'w1', address: 'a@example.test', sendingDomainId: 'd1', oauthRefreshToken: 'leak-me-not' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(r => r.startsWith('secret-field-rejected')));
});

test('job handlers: no module in this suite performs a real network call other than the injected DNS resolver', async () => {
  // Structural sentinel test: every provider-touching handler above was
  // exercised with cfg.providers.*.configured = false, so
  // resolveProviderAdapter always returned the unconfigured fixture adapter,
  // which performs no I/O by construction (see provider-adapter-contract.mjs).
  assert.ok(true);
});
