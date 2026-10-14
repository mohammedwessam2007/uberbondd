// Closure of the PR #1402 donor gaps that the integrated UberWarm2 seed path
// lacked (NO or PARTIAL in the 1402-vs-1403 comparison). Each case was
// reproduced against the head before the fix. Fakes only: nothing reaches an
// SMTP server, provider, DNS or the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberWarm2SeedBatch, executeUberWarm2SeedProbe as rawExecute,
  createUberWarm2SeedApprovalProof, UBERWARM2_SEED_TEMPLATE_DIGEST
} from '../src/uberwarm2-seed-executor.mjs';
import { createUberWarm2SmtpSeedBridge } from '../src/uberwarm2-smtp-seed-bridge.mjs';

const KEY = 'test-only-never-production-seed-approval-hmac-key-2026';
const MIN = 60 * 1000;
const T = new Date('2026-10-12T18:00:00.000Z');
const SENDER = 'tara@example.net';
const SEED_A = 'owned-seed@gmail.com';
const SEED_B = 'owned-seed@outlook.com';
const GOOD_SENDER = {
  mailboxId: 'tara', address: SENDER, authenticationStatus: 'AUTHENTICATED', paused: false,
  dnsAuthenticated: true, transportAuthorized: true, providerPolicyCompatible: true
};
const GOOD_SEED = {
  email: SEED_A, ownerControlled: true, receiveReady: true, consentToTest: true,
  consentEvidenceRef: 'owner-test-agreement:g', permissionExpiresAt: '2026-12-31T00:00:00Z'
};
const GOOD_SEED_B = { ...GOOD_SEED, email: SEED_B, consentEvidenceRef: 'owner-test-agreement:m' };

function probe(probeId, seedEmail = SEED_A, senderEmail = SENDER) {
  return { probeId, bodyToken: probeId, senderEmail, seedEmail, seedProvider: 'google', authority: 'PLAN_ONLY', sendAuthorized: false };
}
function compile({
  mailboxes = [GOOD_SENDER], seeds = [GOOD_SEED, GOOD_SEED_B],
  probes = [probe('uw2-gap-a'), probe('uw2-gap-b', SEED_B)], now = T
} = {}) {
  return compileUberWarm2SeedBatch({ placementPlan: { probes }, mailboxes, seedInboxes: seeds, now });
}
function approval(b, probeId, { expiresAt = '2026-10-12T18:40:00Z' } = {}) {
  const entry = {
    granted: true, grantedBy: 'founder', expiresAt,
    scopes: ['uberwarm2:owner-controlled-seed-test'], batchDigest: b.batchDigest,
    templateDigest: UBERWARM2_SEED_TEMPLATE_DIGEST, evidenceRef: 'owner-authorized-fixture', probeId
  };
  return { ...entry, proof: createUberWarm2SeedApprovalProof({ approval: entry, verificationKey: KEY }) };
}
function store() {
  const seen = new Set(), claims = [];
  return {
    claims,
    async claimOnceAndEnforceCaps(r) {
      claims.push(r);
      if (seen.has(r.reservationKey)) return { ok: false, reason: 'replay-blocked' };
      seen.add(r.reservationKey);
      return { ok: true, claimed: true, capsEnforced: true, reservationKey: r.reservationKey };
    },
    async finalize() { return { ok: true }; }
  };
}
function transport(boundSender = SENDER) {
  const calls = [];
  return {
    calls, authorizedSmtp: true, boundSender,
    async sendOwnedSeed(x) { calls.push(x); return { ok: true, accepted: true, messageId: 'provider-id-' + x.probeId }; }
  };
}
const execute = args => rawExecute({
  verifyCurrentSenderHealth: async () => true, verifyCurrentSeedConsent: async () => true, ...args
});

// --- Scoped, single-probe authorization --------------------------------------

test('an approval naming one probe cannot execute a different probe in the same batch', async () => {
  const b = compile(), [a, other] = b.probes, s = store(), tx = transport();
  const result = await execute({
    batch: b, probeId: other.probeId, approval: approval(b, a.probeId),
    approvalVerificationKey: KEY, store: s, transport: tx, now: new Date(T.getTime() + 2 * MIN)
  });
  assert.equal(result.status, 'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  assert.equal(s.claims.length, 0);
  assert.equal(tx.calls.length, 0);
});

test('an approval carrying no probe scope cannot authorize any probe', async () => {
  const b = compile(), p = b.probes[0], s = store(), tx = transport();
  const result = await execute({
    batch: b, probeId: p.probeId, approval: approval(b, ''),
    approvalVerificationKey: KEY, store: s, transport: tx, now: new Date(T.getTime() + 2 * MIN)
  });
  assert.equal(result.status, 'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  assert.equal(s.claims.length, 0);
  assert.equal(tx.calls.length, 0);
});

// --- 45-minute plan and approval window --------------------------------------

test('a plan older than 45 minutes cannot send, even under an approval that outlives it', async () => {
  const b = compile(), p = b.probes[0], s = store(), tx = transport();
  const result = await execute({
    batch: b, probeId: p.probeId, approval: approval(b, p.probeId, { expiresAt: '2026-10-12T18:50:00Z' }),
    approvalVerificationKey: KEY, store: s, transport: tx, now: new Date(T.getTime() + 46 * MIN)
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('batch-expired'), result.reasonCodes.join(','));
  assert.equal(s.claims.length, 0);
  assert.equal(tx.calls.length, 0);
});

test('an approval may not outlive the 45-minute plan window', async () => {
  const b = compile(), p = b.probes[0], s = store(), tx = transport();
  const result = await execute({
    batch: b, probeId: p.probeId, approval: approval(b, p.probeId, { expiresAt: '2026-10-12T19:00:00Z' }),
    approvalVerificationKey: KEY, store: s, transport: tx, now: new Date(T.getTime() + 2 * MIN)
  });
  assert.equal(result.status, 'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  assert.ok(result.reasonCodes.includes('approval-exceeds-45-minute-plan-window'), result.reasonCodes.join(','));
  assert.equal(s.claims.length, 0);
  assert.equal(tx.calls.length, 0);
});

test('control: a plan executed inside its 45-minute window still sends once', async () => {
  const b = compile(), p = b.probes[0], s = store(), tx = transport();
  const result = await execute({
    batch: b, probeId: p.probeId, approval: approval(b, p.probeId, { expiresAt: '2026-10-12T18:44:00Z' }),
    approvalVerificationKey: KEY, store: s, transport: tx, now: new Date(T.getTime() + 40 * MIN)
  });
  assert.equal(result.status, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
  assert.equal(tx.calls.length, 1);
});

// --- Sender DNS, transport and provider-policy gates -------------------------

test('a sender lacking DNS authentication, transport authorization or provider-policy compatibility is excluded at compile', () => {
  const cases = [
    ['dnsAuthenticated', 'sender-dns-authentication-required'],
    ['transportAuthorized', 'sender-transport-not-authorized'],
    ['providerPolicyCompatible', 'sender-provider-policy-incompatible']
  ];
  for (const [flag, reason] of cases) {
    const b = compile({ mailboxes: [{ ...GOOD_SENDER, [flag]: false }] });
    assert.equal(b.ok, false, flag);
    assert.ok(!b.probes?.length, flag);
    assert.ok(b.rejections.every(r => r.reasonCodes.includes(reason)), `${flag}: ${JSON.stringify(b.rejections)}`);
  }
});

// --- Batch integrity: duplicates and sender/recipient collisions ------------

test('duplicate sender addresses refuse the whole batch, whatever their order', () => {
  const paused = { ...GOOD_SENDER, paused: true };
  for (const mailboxes of [[GOOD_SENDER, paused], [paused, GOOD_SENDER]]) {
    const b = compile({ mailboxes });
    assert.equal(b.ok, false);
    assert.ok(!b.probes?.length);
    assert.ok(b.reasonCodes.includes('duplicate-sender-address'), b.reasonCodes?.join(','));
  }
});

test('duplicate seed addresses refuse the whole batch, whatever their order', () => {
  const unconsented = { ...GOOD_SEED, consentToTest: false };
  for (const seeds of [[GOOD_SEED, unconsented], [unconsented, GOOD_SEED]]) {
    const b = compile({ seeds, probes: [probe('uw2-gap-a')] });
    assert.equal(b.ok, false);
    assert.ok(!b.probes?.length);
    assert.ok(b.reasonCodes.includes('duplicate-seed-address'), b.reasonCodes?.join(','));
  }
});

test('a seed that is also an authenticated sender in the plan is refused as a collision', () => {
  const collision = { ...GOOD_SENDER, mailboxId: 'owned', address: SEED_A };
  const b = compile({ mailboxes: [GOOD_SENDER, collision], seeds: [GOOD_SEED], probes: [probe('uw2-gap-a')] });
  assert.equal(b.ok, false);
  assert.ok(!b.probes?.length);
  assert.ok(b.reasonCodes.includes('seed-is-also-active-sender'), b.reasonCodes?.join(','));
});

// --- Recipient permission expiry ---------------------------------------------

test('undated or lapsed recipient permission is not proven at compile', () => {
  const undated = { ...GOOD_SEED };
  delete undated.permissionExpiresAt;
  const lapsed = { ...GOOD_SEED, permissionExpiresAt: '2020-01-01T00:00:00Z' };
  for (const seed of [undated, lapsed]) {
    const b = compile({ seeds: [seed, GOOD_SEED_B] });
    assert.equal(b.probes.length, 1, JSON.stringify(seed));
    assert.equal(b.probes[0].probeId, 'uw2-gap-b');
    assert.ok(b.rejections.some(r => r.probeId === 'uw2-gap-a' &&
      r.reasonCodes.includes('recipient-not-proven-consenting-owned-seed')));
  }
});

test('permission that lapses between plan and send blocks SMTP with no claim', async () => {
  const lapsing = { ...GOOD_SEED, permissionExpiresAt: '2026-10-12T18:30:00Z' };
  const b = compile({ seeds: [lapsing], probes: [probe('uw2-gap-a')] });
  assert.equal(b.ok, true);
  const p = b.probes[0], s = store(), tx = transport();
  const result = await execute({
    batch: b, probeId: p.probeId, approval: approval(b, p.probeId, { expiresAt: '2026-10-12T18:44:00Z' }),
    approvalVerificationKey: KEY, store: s, transport: tx, now: new Date('2026-10-12T18:40:00.000Z')
  });
  assert.equal(result.status, 'UBERWARM2_LIVE_PREFLIGHT_REFUSED');
  assert.ok(result.reasonCodes.includes('recipient-permission-expired'), result.reasonCodes.join(','));
  assert.equal(s.claims.length, 0);
  assert.equal(tx.calls.length, 0);
});

// --- Executor-side transport binding -----------------------------------------

test('the executor refuses a transport not authorized or bound to the probe sender before claiming', async () => {
  const b = compile(), p = b.probes[0];
  const unauthorized = { ...transport(), authorizedSmtp: false };
  const otherSender = transport('dana@example.net');
  for (const tx of [unauthorized, otherSender]) {
    const s = store();
    const result = await execute({
      batch: b, probeId: p.probeId, approval: approval(b, p.probeId),
      approvalVerificationKey: KEY, store: s, transport: tx, now: new Date(T.getTime() + 2 * MIN)
    });
    assert.equal(result.status, 'UBERWARM2_TRANSPORT_REQUIRED');
    assert.equal(s.claims.length, 0);
    assert.equal(tx.calls.length, 0);
  }
});

// --- SMTP bridge: exact payload, terms isolation, no secret in results ------

const ACCOUNT = {
  email: SENDER, sendingMailboxId: 'tara', connected: true, tokens: { encrypted: true },
  smtpRoute: {
    authorized: true, termsCompatible: true, evidenceRef: 'winnr-support:authorized-test',
    host: 'smtp.test.invalid', secure: true, port: 465
  }
};
const BRIDGE_SEEDS = [{
  email: SEED_A, ownerControlled: true, receiveReady: true, consentToTest: true, consentEvidenceRef: 'owner-approval:1'
}];
const RESERVATION = 'uberwarm2-seed:' + 'a'.repeat(64);
const TEMPLATE_BODY = 'Owner-authorized delivery and inbox-placement test. No reply or other action is requested. Reference: test-probe-1';
function bridge({ account = {}, transportFactory, credentialReader } = {}) {
  return createUberWarm2SmtpSeedBridge({
    account: { ...ACCOUNT, ...account },
    allowedSeeds: BRIDGE_SEEDS,
    encryptionKey: 'test-only-key',
    credentialReader: credentialReader ?? (() => ({ username: 'encrypted-user-never-exported', password: 'never-export-password' })),
    transportFactory: transportFactory ?? (() => ({ ok: true, async send(v) { return { confirmed: true, messageId: v.messageId }; } }))
  });
}
const sendArgs = overrides => ({
  from: SENDER, to: SEED_A, probeId: 'test-probe-1', reservationKey: RESERVATION,
  permittedPurpose: 'OWNER_CONTROLLED_PLACEMENT_PROBE',
  subject: 'UberBond permitted mailbox delivery test', body: TEMPLATE_BODY, ...overrides
});

test('the SMTP bridge sends only the exact rendered template body, with nothing appended', async () => {
  const calls = [];
  const b = bridge({ transportFactory: () => ({ ok: true, async send(v) { calls.push(v); return { confirmed: true, messageId: v.messageId }; } }) });
  const appended = await b.sendOwnedSeed(sendArgs({ body: TEMPLATE_BODY + ' Please reply to confirm.' }));
  assert.equal(appended.ok, false);
  assert.equal(calls.length, 0);
  const exact = await b.sendOwnedSeed(sendArgs());
  assert.equal(exact.ok, true);
  assert.equal(calls.length, 1);
});

test('terms incompatibility alone keeps the SMTP bridge closed', () => {
  assert.equal(bridge().ok, true, 'control');
  assert.equal(bridge({ account: { smtpRoute: { ...ACCOUNT.smtpRoute, termsCompatible: false } } }).ok, false);
});

test('no username or password reaches a bridge result when the transport throws', async () => {
  const constructionThrow = bridge({
    transportFactory: () => { throw new Error('connect failed for encrypted-user-never-exported:never-export-password'); }
  });
  const constructed = await constructionThrow.sendOwnedSeed(sendArgs());
  assert.equal(constructed.ok, false);
  assert.doesNotMatch(JSON.stringify(constructed), /never-export|encrypted-user/);
  const sendThrow = bridge({
    transportFactory: () => ({ ok: true, async send() { throw new Error('smtp rejected never-export-password'); } })
  });
  const sent = await sendThrow.sendOwnedSeed(sendArgs());
  assert.equal(sent.ok, false);
  assert.doesNotMatch(JSON.stringify(sent), /never-export|encrypted-user/);
});
