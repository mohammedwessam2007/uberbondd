import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileWinnrFleet, classifyWinnrProviderFailure, assertExportAuthority, findDuplicateAddresses,
  verifyStoreKeyCompatibility, assertCompleteListing, assertProviderSchema, digestFull, digest16
} from '../src/winnr-fleet-control-plane.mjs';
import { encryptJson } from '../src/crypto.mjs';

const NOW = new Date('2026-10-13T13:00:00Z');
const FRESH = '2026-10-13T12:55:00Z';
const KEY = 'ab'.repeat(32);
const OTHER_KEY = 'cd'.repeat(32);
const STARTUP = 'startup-fixture.co';
const PILOT = 'pilot-fixture.com';

const providerDomains = [
  { id: 'dom-s', name: STARTUP, status: 'complete', dns_provider: 'winnr_20', registrar: 'external', tags: [] },
  { id: 'dom-p', name: PILOT, status: 'complete', dns_provider: 'winnr_20', registrar: 'external', tags: ['pre-warmed'] }
];

function mailbox(local, { status = 'active', domain = STARTUP, id = `mb-${local}` } = {}) {
  return { id, domain, full_address: `${local}@${domain}`, status, smtp_host: 'inbound.example.test', smtp_port: 465, imap_host: 'inbound.example.test', imap_port: 993 };
}

function smtpAccount(local, domain = STARTUP) {
  return { id: `smtp-${local}`, provider: 'smtp-relay', connected: true, slot: `winnr:${local}@${domain}` };
}

function imapAccount(local, domain = STARTUP) {
  return { id: `imap-${local}`, provider: 'imap-forwarding', connected: true, slot: `winnr-imap:${local}@${domain}` };
}

const LOCALS = ['hello', 'team', 'connect'];
const providerMailboxes = [...LOCALS.map(l => mailbox(l)), mailbox('pilot', { domain: PILOT, id: 'mb-pilot' })];

function smtpReceiptFor(results) {
  return { results: results.map(([local, fields]) => ({ slotDigest: digestFull(`winnr:${local}@${STARTUP}`), evaluated: true, confirmed: false, classification: 'UNCERTAIN', ...fields })) };
}

function imapReceiptFor(rows) {
  return { perAccount: rows.map(([local, fields]) => ({ slotDigest: digest16(`winnr-imap:${local}@${STARTUP}`), ...fields })) };
}

function base(overrides = {}) {
  return {
    providerDomains,
    providerMailboxes,
    localAccounts: [...LOCALS.flatMap(l => [smtpAccount(l), imapAccount(l)])],
    senderHealth: [],
    smtpReceipt: null,
    imapReceipt: null,
    domainOwnershipByName: { [STARTUP]: 'OWNER_CONFIRMED' },
    snapshotTakenAt: FRESH,
    now: NOW,
    ...overrides
  };
}

test('a fully imported, fully authenticated account is still not outbound-eligible without campaign authority', () => {
  const report = reconcileWinnrFleet(base({
    smtpReceipt: smtpReceiptFor(LOCALS.map(l => [l, { confirmed: true, classification: 'READY', evaluated: true }])),
    imapReceipt: imapReceiptFor(LOCALS.map(l => [l, { loginAccepted: true, classification: 'AUTH_CONFIRMED' }]))
  }));
  assert.equal(report.counts.infrastructureReady, 3);
  assert.equal(report.counts.outboundEligible, 0);
  assert.equal(report.outboundAuthorityGranted, false);
  assert.ok(report.perAccount.every(a => a.eligibilityReasons.includes('campaign-authority-not-granted')));
  assert.equal(report.messagesSent, 0);
});

test('imported credentials alone are not readiness: untested SMTP and IMAP are counted as untested, not passed', () => {
  const report = reconcileWinnrFleet(base());
  assert.equal(report.counts.smtp.UNTESTED, 3);
  assert.equal(report.counts.imap.UNTESTED, 3);
  assert.equal(report.counts.smtp.READY, 0);
  assert.equal(report.counts.imap.LOGIN_ACCEPTED, 0);
  assert.equal(report.counts.infrastructureReady, 0);
});

test('a network-blocked SMTP probe is NETWORK_BLOCKED, never AUTH_REJECTED or READY', () => {
  const report = reconcileWinnrFleet(base({
    smtpReceipt: smtpReceiptFor([['hello', { errorClass: 'CONNECT_TIMEOUT', errorStage: 'CONNECT' }], ['team', { errorClass: 'AUTH_REJECTED', errorStage: 'AUTH' }], ['connect', { errorClass: 'TLS_FAILED', errorStage: 'CONNECT' }]])
  }));
  assert.equal(report.counts.smtp.NETWORK_BLOCKED, 1);
  assert.equal(report.counts.smtp.AUTH_REJECTED, 1);
  assert.equal(report.counts.smtp.TLS_FAILED, 1);
  assert.equal(report.counts.smtp.READY, 0);
});

test('an IMAP transport failure is NETWORK_BLOCKED and an IMAP LOGIN rejection is AUTH_REJECTED', () => {
  const report = reconcileWinnrFleet(base({
    imapReceipt: imapReceiptFor([['hello', { classification: 'TRANSPORT_UNREACHABLE' }], ['team', { classification: 'AUTH_REJECTED' }], ['connect', { loginAccepted: true }]])
  }));
  assert.equal(report.counts.imap.NETWORK_BLOCKED, 1);
  assert.equal(report.counts.imap.AUTH_REJECTED, 1);
  assert.equal(report.counts.imap.LOGIN_ACCEPTED, 1);
});

test('a paused sender is not infrastructure-ready even when both probes passed', () => {
  const report = reconcileWinnrFleet(base({
    senderHealth: [{ inbox: `winnr:hello@${STARTUP}`, paused: true, pauseReason: 'winnr-smtp-auth-noop-probe-failed' }],
    smtpReceipt: smtpReceiptFor(LOCALS.map(l => [l, { confirmed: true, classification: 'READY', evaluated: true }])),
    imapReceipt: imapReceiptFor(LOCALS.map(l => [l, { loginAccepted: true }]))
  }));
  assert.equal(report.counts.pausedSmtp, 1);
  assert.equal(report.counts.infrastructureReady, 2);
  const hello = report.perAccount.find(a => a.paused);
  assert.ok(hello.eligibilityReasons.includes('smtp-sender-paused'));
});

test('a domain that is not control-confirmed blocks readiness', () => {
  const report = reconcileWinnrFleet(base({
    domainOwnershipByName: { [STARTUP]: 'UNVERIFIED' },
    smtpReceipt: smtpReceiptFor(LOCALS.map(l => [l, { confirmed: true, classification: 'READY', evaluated: true }])),
    imapReceipt: imapReceiptFor(LOCALS.map(l => [l, { loginAccepted: true }]))
  }));
  assert.equal(report.counts.domainsControlConfirmed, 0);
  assert.equal(report.counts.infrastructureReady, 0);
});

test('a missing local SMTP or IMAP record is detected, not papered over', () => {
  const report = reconcileWinnrFleet(base({ localAccounts: [smtpAccount('hello'), imapAccount('hello'), smtpAccount('team')] }));
  assert.equal(report.counts.missingLocalAccounts, 2);
  assert.ok(report.issues.some(i => i.code === 'MISSING_LOCAL_ACCOUNTS'));
});

test('a duplicated local account is detected and blocks readiness', () => {
  const report = reconcileWinnrFleet(base({ localAccounts: [smtpAccount('hello'), smtpAccount('hello'), imapAccount('hello'), smtpAccount('team'), imapAccount('team'), smtpAccount('connect'), imapAccount('connect')] }));
  assert.equal(report.counts.duplicateLocalAccounts, 1);
  assert.ok(report.issues.some(i => i.code === 'DUPLICATE_LOCAL_ACCOUNTS'));
});

test('a local account the provider does not list is an orphan and is never adopted', () => {
  const report = reconcileWinnrFleet(base({ localAccounts: [...LOCALS.flatMap(l => [smtpAccount(l), imapAccount(l)]), smtpAccount('ghost')] }));
  assert.equal(report.counts.orphanLocalAccounts, 1);
  assert.equal(report.perAccount.length, 3);
});

test('pilot mailboxes are excluded from the Startup set and are not orphans', () => {
  const report = reconcileWinnrFleet(base({ localAccounts: [...LOCALS.flatMap(l => [smtpAccount(l), imapAccount(l)]), smtpAccount('pilot', PILOT)] }));
  assert.equal(report.counts.startupMailboxes, 3);
  assert.equal(report.counts.pilotMailboxes, 1);
  assert.equal(report.counts.orphanLocalAccounts, 0);
});

test('an inactive provider mailbox is never ready', () => {
  const report = reconcileWinnrFleet(base({
    providerMailboxes: [mailbox('hello', { status: 'suspended' }), mailbox('team'), mailbox('connect')],
    smtpReceipt: smtpReceiptFor(LOCALS.map(l => [l, { confirmed: true, classification: 'READY', evaluated: true }])),
    imapReceipt: imapReceiptFor(LOCALS.map(l => [l, { loginAccepted: true }]))
  }));
  assert.equal(report.counts.startupMailboxesActive, 2);
  assert.equal(report.counts.infrastructureReady, 2);
  assert.ok(report.perAccount.find(a => !a.providerActive).eligibilityReasons.includes('provider-not-active'));
});

test('stale or undated provider inventory is reported as stale, not reconciled', () => {
  const stale = reconcileWinnrFleet(base({ snapshotTakenAt: '2026-10-13T09:00:00Z' }));
  assert.equal(stale.status, 'STALE_PROVIDER_INVENTORY');
  const undated = reconcileWinnrFleet(base({ snapshotTakenAt: null }));
  assert.equal(undated.status, 'STALE_PROVIDER_INVENTORY');
});

test('a receipt that predates the classifier is not trusted as a current SMTP result', () => {
  // The SMTP receipt in the field was recorded before connect timeouts had their own class. Its generic
  // classes must never be read as a network block or as an authentication result.
  const report = reconcileWinnrFleet(base({
    smtpReceipt: smtpReceiptFor([['hello', { errorClass: 'Error', errorStage: 'CONNECT' }]])
  }));
  assert.equal(report.counts.smtp.FAILED_UNCLASSIFIED, 1);
  assert.equal(report.counts.smtp.NETWORK_BLOCKED, 0);
});

test('provider failure classes map to distinct operator actions and none is retried automatically', () => {
  assert.equal(classifyWinnrProviderFailure({ reasonCodes: ['http-401'] }), 'TOKEN_INVALID_EXPIRED_OR_NOT_INJECTED');
  assert.equal(classifyWinnrProviderFailure({ reasonCodes: ['http-403'] }), 'PERMISSION_DENIED');
  assert.equal(classifyWinnrProviderFailure({ status: 'UBERWINNR_RATE_LIMITED', reasonCodes: ['provider-rate-limit'] }), 'RATE_LIMITED_NO_AUTO_RETRY');
  assert.equal(classifyWinnrProviderFailure({ reasonCodes: ['http-503'] }), 'PROVIDER_UNAVAILABLE');
  assert.equal(classifyWinnrProviderFailure({ reasonCodes: ['provider-network-error'] }), 'NETWORK_OR_PROXY_REFUSED');
  assert.equal(classifyWinnrProviderFailure({ status: 'UBERWINNR_WRITE_OUTCOME_UNCERTAIN' }), 'WRITE_OUTCOME_UNCERTAIN_DO_NOT_RETRY');
  assert.equal(classifyWinnrProviderFailure({ ok: true }), 'NONE');
});

test('a read-only token cannot export credentials', () => {
  assert.equal(assertExportAuthority({ permissions: ['read'] }).ok, false);
  assert.deepEqual(assertExportAuthority({ permissions: ['read'] }).reasonCodes, ['export-requires-write-scoped-token']);
  assert.equal(assertExportAuthority({ permissions: ['read', 'write'] }).ok, true);
  assert.equal(assertExportAuthority({}).ok, false);
});

test('duplicate addresses in one export are detected by address, case-insensitively', () => {
  const dupes = findDuplicateAddresses([{ email: 'Hello@x.co' }, { from_email: 'hello@x.co' }, { email: 'team@x.co' }]);
  assert.equal(dupes.length, 1);
  assert.equal(findDuplicateAddresses([{ email: 'a@x.co' }, { email: 'b@x.co' }]).length, 0);
});

test('a store whose ciphertext does not open with the supplied key is refused before any write', async () => {
  const existing = [{ id: 'a1', tokens: encryptJson({ kind: 'smtp-basic', username: 'u', password: 'p' }, KEY) }];
  assert.equal(verifyStoreKeyCompatibility({ accounts: existing, encryptionKey: KEY }).ok, true);
  const wrong = verifyStoreKeyCompatibility({ accounts: existing, encryptionKey: OTHER_KEY });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.undecryptable, 1);
  assert.deepEqual(wrong.reasonCodes, ['existing-store-ciphertext-not-readable-with-key']);
});

test('corrupted ciphertext counts as undecryptable and never as readable', () => {
  const corrupted = [{ id: 'c1', tokens: { v: 1, iv: 'AAAA', tag: 'AAAA', data: 'AAAA' } }];
  const r = verifyStoreKeyCompatibility({ accounts: corrupted, encryptionKey: KEY });
  assert.equal(r.ok, false);
  assert.equal(r.decryptable, 0);
});

test('an empty listing or a listing without a complete flag is not treated as the whole fleet', () => {
  assert.equal(assertCompleteListing({ pagination: { has_more: false } }).ok, true);
  assert.equal(assertCompleteListing({ pagination: { has_more: true } }).ok, false);
  assert.equal(assertCompleteListing({}, 'mailboxes').ok, false);
  assert.deepEqual(assertCompleteListing({}, 'mailboxes').reasonCodes, ['mailboxes-listing-incomplete-or-unknown']);
});

test('provider schema drift is refused rather than read as zero or as valid', () => {
  const drift = assertProviderSchema({ domains: [{ id: 'd', name: 'x' }], mailboxes: [{ id: 'm', full_address: 'a@x.co' }] });
  assert.equal(drift.ok, false);
  assert.ok(drift.reasonCodes.includes('provider-mailbox-missing-status'));
  assert.ok(drift.reasonCodes.includes('provider-domain-missing-tags'));
  assert.equal(assertProviderSchema({ domains: [], mailboxes: [] }).ok, true);
});

test('reports carry digests only: no addresses, domains or secrets in output', () => {
  const report = reconcileWinnrFleet(base({
    smtpReceipt: smtpReceiptFor(LOCALS.map(l => [l, { confirmed: true, classification: 'READY', evaluated: true }])),
    imapReceipt: imapReceiptFor(LOCALS.map(l => [l, { loginAccepted: true }]))
  }));
  const text = JSON.stringify(report);
  assert.equal(text.includes(STARTUP), false);
  assert.equal(text.includes('hello@'), false);
  assert.equal(text.includes('fixture-password'), false);
});
