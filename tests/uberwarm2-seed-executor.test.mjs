import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compilePlacementProbePlan, compilePlacementReport } from '../src/uberplacement.mjs';
import {
  compileUberWarm2SeedBatch, executeUberWarm2SeedProbe as realExecuteSeedProbe,
  compileUberWarm2ReceivedEvidence, createUberWarm2SeedApprovalProof,
  UBERWARM2_SEED_TEMPLATE_DIGEST, UBERWARM2_SEED_EXECUTION_VERSION, UBERWARM2_SEED_TEMPLATE
} from '../src/uberwarm2-seed-executor.mjs';
import { hasSendCapability } from '../src/uberwarm2-send-capability.mjs';

// Test clock: a supplied `now` becomes the execution clock. The executor no
// longer trusts a caller `now` for expiry, so tests say the time explicitly.
const clocked = args => {
  const { now, ...rest } = args;
  return now === undefined || rest.clock !== undefined ? rest : { ...rest, clock: () => new Date(now).getTime() };
};
const rawExecuteSeedProbe = args => realExecuteSeedProbe(clocked(args));
const KEY = 'test-only-never-production-seed-approval-hmac-key-2026';
const executeUberWarm2SeedProbe = args => rawExecuteSeedProbe({
  ...args,verifyCurrentSenderHealth: async()=>true,
  verifyCurrentSeedConsent: async()=>true
});
const T = new Date('2026-10-12T18:00:00.000Z');
const T1 = new Date('2026-10-12T18:02:00.000Z');
const T2 = new Date('2026-10-12T18:03:00.000Z');
const senders = [
  { mailboxId: 'tara', address: 'tara@example.net', authenticationStatus: 'AUTHENTICATED', paused: false,
    dnsAuthenticated: true, transportAuthorized: true, providerPolicyCompatible: true },
  { mailboxId: 'dana', address: 'dana@example.net', authenticationStatus: 'AUTHENTICATED', paused: true,
    dnsAuthenticated: true, transportAuthorized: true, providerPolicyCompatible: true }
];
const seeds = [
  { email: 'owned-seed@gmail.com', ownerControlled: true, receiveReady: true, consentToTest: true, consentEvidenceRef: 'owner-test-agreement:g', permissionExpiresAt: '2026-12-31T00:00:00Z' },
  { email: 'owned-seed@outlook.com', ownerControlled: true, receiveReady: true, consentToTest: true, consentEvidenceRef: 'owner-test-agreement:m', permissionExpiresAt: '2026-12-31T00:00:00Z' },
  { email: 'unrelated@yahoo.com', ownerControlled: false, receiveReady: true, consentToTest: false }
];
function batch(mailboxes = senders, seedInboxes = seeds) {
  const plan = compilePlacementProbePlan({
    senders: mailboxes.map(x => ({
      slot: x.mailboxId, email: x.address, connected: true, paused: x.paused
    })),
    seedInboxes: seedInboxes.map(x => ({ ...x, ownerControlled: x.ownerControlled, receiveReady: x.receiveReady })),
    campaignId: 'uberwarm2-activation-test', now: T
  });
  return compileUberWarm2SeedBatch({ placementPlan: plan, mailboxes, seedInboxes, now: T });
}
function approval(b, probeId = b.probes[0]?.probeId) {
  const entry = {
    granted: true, grantedBy: 'founder', expiresAt: '2026-10-12T18:40:00Z',
    scopes: ['uberwarm2:owner-controlled-seed-test'],
    batchDigest: b.batchDigest, templateDigest: UBERWARM2_SEED_TEMPLATE_DIGEST,
    evidenceRef: 'owner-authorized-fixture', probeId
  };
  return { ...entry, proof: createUberWarm2SeedApprovalProof({
    approval: entry, verificationKey: KEY
  }) };
}
function store() {
  const seen = new Set(), finished = [];
  return {
    seen, finished,
    async claimOnceAndEnforceCaps(r) {
      if (seen.has(r.reservationKey)) return { ok: false, reason: 'replay-blocked' };
      assert.equal(r.senderDailyLimit, 2);
      assert.equal(r.globalDailyLimit, 100);
      seen.add(r.reservationKey);
      return { ok: true, claimed: true, capsEnforced: true, reservationKey: r.reservationKey };
    },
    async finalize(r) { finished.push(r); return { ok: true }; }
  };
}
function transport() {
  const calls = [];
  return {
    calls, authorizedSmtp: true, boundSender: 'tara@example.net',
    async sendOwnedSeed(x) {
      calls.push(x);
      return { ok: true, accepted: true, messageId: 'provider-message-id-' + x.probeId };
    }
  };
}
test('only consenting owner-controlled seeds and healthy senders reach an executable batch', () => {
  const b = batch();
  assert.equal(b.ok, true);
  assert.equal(b.probes.length, 2);
  assert.equal(b.probes.every(p => p.senderEmail === 'tara@example.net'), true);
  assert.equal(b.probes.every(p => p.scope === 'OWNER_CONTROLLED_PLACEMENT_PROBE'), true);
  assert.equal(b.externalEffectAuthority, 'NONE');
  assert.equal(b.providerSubmissions, 0);
  assert.equal(b.artificialReplies, 0);
});
test('missing recipient consent excludes all candidates with no fallback to arbitrary prospect', () => {
  const s = seeds.map(x => ({ ...x, consentToTest: false }));
  const b = batch(senders, s);
  assert.equal(b.ok, false);
  assert.equal(b.status, 'UBERWARM2_NO_ELIGIBLE_SEEDS');
  assert.equal(b.probes.length, 0);
  assert.ok(b.rejections.every(x => x.reasonCodes.includes('recipient-not-proven-consenting-owned-seed')));
});
test('all paused senders are blocked regardless of plan sender connected flag', () => {
  const b = batch([senders[1]]);
  assert.equal(b.ok, false);
  assert.equal(b.probes.length, 0);
  assert.equal(b.providerSubmissions, 0);
});
test('real send requires exact unexpired owner authorization and a durable one-shot store', async () => {
  const b = batch(), tx = transport(), s = store();
  const p = b.probes[0];
  const noApproval = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: { granted: true }, store: s, transport: tx, now: T1
  });
  assert.equal(noApproval.status, 'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  const noStore = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, transport: tx, now: T1
  });
  assert.equal(noStore.status, 'UBERWARM2_DURABLE_LEDGER_REQUIRED');
  assert.equal(tx.calls.length, 0);
});
test('authorized exact-seed submission records SMTP acceptance, not Inbox delivery, and replay is refused', async () => {
  const b = batch(), s = store(), tx = transport(), p = b.probes[0];
  const opts = { batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, store: s, transport: tx, now: T1 };
  const first = await executeUberWarm2SeedProbe(opts);
  assert.equal(first.ok, true);
  assert.equal(first.status, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
  assert.equal(first.verifiedPlacements, 0);
  assert.equal(first.providerSubmissions, 1);
  assert.equal(tx.calls.length, 1);
  assert.equal(tx.calls[0].to, p.seedEmail);
  const again = await executeUberWarm2SeedProbe(opts);
  assert.equal(again.status, 'UBERWARM2_PROBE_NOT_CLAIMED');
  assert.equal(tx.calls.length, 1);
  assert.equal(s.finished.length, 1);
});
test('transport uncertainty must never trigger a second submission', async () => {
  const b = batch(), s = store(), p = b.probes[0], tx = { calls: 0,
    authorizedSmtp: true, boundSender: 'tara@example.net',
    async sendOwnedSeed() { this.calls++; throw new Error('network may have submitted'); }
  };
  const opts = { batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, store: s, transport: tx, now: T1 };
  const result = await executeUberWarm2SeedProbe(opts);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SUBMISSION_OUTCOME_UNCERTAIN');
  await executeUberWarm2SeedProbe(opts);
  assert.equal(tx.calls, 1);
});
test('reservation timeout and finalization failure fail closed', async () => {
  const b = batch(), tx = transport(), p = b.probes[0];
  const failed = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY,
    store: { async claimOnceAndEnforceCaps() { throw Error('timeout'); }, async finalize() {} },
    transport: tx, now: T1
  });
  assert.equal(failed.status, 'UBERWARM2_RESERVATION_UNKNOWN');
  assert.equal(tx.calls.length, 0);
  const s = store(); s.finalize = async () => { throw Error('commit unknown'); };
  const afterSend = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(afterSend.status, 'LEDGER_FINALIZATION_UNCERTAIN');
  assert.equal(afterSend.ok, false);
  assert.equal(tx.calls.length, 1);
});
test('stale, modified or forged batch cannot send', async () => {
  const b = batch(), tx = transport(), s = store(), p = b.probes[0];
  const tampered = { ...b, probes: [{ ...b.probes[0], seedEmail: 'stranger@unverified.com' }, ...b.probes.slice(1)] };
  const changed = await executeUberWarm2SeedProbe({
    batch: tampered, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(changed.status, 'UBERWARM2_EXECUTION_REFUSED');
  const expired = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, store: s, transport: tx,
    now: new Date('2026-10-14T18:00:00Z')
  });
  assert.equal(expired.status, 'UBERWARM2_EXECUTION_REFUSED');
  assert.equal(tx.calls.length, 0);
});
test('recipient-side verified placement requires exact identity, message ID, source and timestamps', async () => {
  const b = batch(), tx = transport(), s = store(), p = b.probes[0];
  const receipt = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  const good = {
    probeId: p.probeId, senderEmail: p.senderEmail, seedEmail: p.seedEmail,
    seedProvider: p.seedProvider, messageId: receipt.providerMessageId,
    folder: 'INBOX', observedAt: T2.toISOString(), evidenceRef: 'gmail:folder-verified-id',
    observationSource: 'RECIPIENT_PROVIDER', receivingProviderEvidenceRef: 'gmail:folder-verified-id'
  };
  const bad = [
    { ...good, seedEmail: 'someone@gmail.com', receivingProviderEvidenceRef: 'x1' },
    { ...good, messageId: 'wrong-id', receivingProviderEvidenceRef: 'x2' },
    { ...good, observationSource: 'AI_SIMULATION', receivingProviderEvidenceRef: 'x3' },
    { ...good, observedAt: '2026-10-11T12:00:00Z', receivingProviderEvidenceRef: 'x4' }
  ];
  const report = compileUberWarm2ReceivedEvidence({
    batch: b, receipts: [receipt], receivingObservations: [good, ...bad], now: T2,
    verifyReceivingObservation: ({observation}) =>
      observation.receivingProviderEvidenceRef === 'gmail:folder-verified-id'
  });
  assert.equal(report.ok, true);
  assert.equal(report.acceptedObservations, 1);
  assert.equal(report.exclusions.length, 4);
  assert.equal(report.report.senderReports[0].inboxPlacementRate, 1);
  assert.equal(report.truthBoundary.includes('never proves general inbox reputation'), true);
});
test('raw placement observations may not impersonate different planned senders or seeds', () => {
  const plan = {
    probes: [{ probeId: 'p', senderEmail: 'tara@example.net',
      seedEmail: 'owned-seed@gmail.com', seedProvider: 'google' }]
  };
  const base = {
    probeId: 'p', senderEmail: 'tara@example.net', seedEmail: 'owned-seed@gmail.com',
    seedProvider: 'google', folder: 'INBOX',
    observedAt: T.toISOString(), evidenceRef: 'receiver:1'
  };
  const hijacks = [
    { ...base, senderEmail: 'dana@example.net' },
    { ...base, seedEmail: 'forged@gmail.com' },
    { ...base, seedProvider: 'microsoft' }
  ];
  const r = compilePlacementReport({ plan, observations: hijacks, now: T2 });
  assert.equal(r.observedProbes, 0);
  assert.equal(r.senderReports[0].inboxPlacementRate, null);
});

test('a forged owner approval or absent protected verifier key is denied', async () => {
  const b = batch(), tx = transport(), s = store(), p = b.probes[0];
  const good = approval(b);
  const forged = {...good, grantedBy: 'attacker'};
  const result = await executeUberWarm2SeedProbe({
    batch:b, probeId:p.probeId, approval:forged, approvalVerificationKey:KEY,store:s,transport:tx,now:T1
  });
  assert.equal(result.status,'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  const missingSecret = await executeUberWarm2SeedProbe({
    batch:b, probeId:p.probeId, approval:good,store:s,transport:tx,now:T1
  });
  assert.equal(missingSecret.status,'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  assert.equal(tx.calls.length,0);
});
test('recipient inbox evidence with only a forged string reference is rejected', async () => {
  const b=batch(), s=store(), tx=transport(), p=b.probes[0];
  const receipt=await executeUberWarm2SeedProbe({
    batch:b,probeId:p.probeId,approval:approval(b),
    approvalVerificationKey:KEY,store:s,transport:tx,now:T1
  });
  const claimed={
    probeId:p.probeId,senderEmail:p.senderEmail,seedEmail:p.seedEmail,
    seedProvider:p.seedProvider,messageId:receipt.providerMessageId,
    folder:'INBOX',observedAt:T2.toISOString(),evidenceRef:'untrusted-self-report:fake',
    observationSource:'RECIPIENT_PROVIDER',
    receivingProviderEvidenceRef:'untrusted-self-report:fake'
  };
  const result=compileUberWarm2ReceivedEvidence({
    batch:b,receipts:[receipt],receivingObservations:[claimed],now:T2
  });
  assert.equal(result.acceptedObservations,0);
  assert.ok(result.exclusions[0].reasonCodes.includes('authenticated-receiving-provider-verification-required'));
});

test('recipient withdrawal or new sender quarantine between plan and send blocks SMTP',async()=>{
 const b=batch(),tx=transport(),s=store(),p=b.probes[0];
 const blocked=await rawExecuteSeedProbe({
   batch:b,probeId:p.probeId,approval:approval(b),
   approvalVerificationKey:KEY,store:s,transport:tx,now:T1,
   verifyCurrentSenderHealth:async()=>false,
   verifyCurrentSeedConsent:async()=>true
 });
 assert.equal(blocked.status,'UBERWARM2_LIVE_PREFLIGHT_REFUSED');
 assert.equal(tx.calls.length,0);
 assert.equal(s.seen.size,0);
 const withdrawn=await rawExecuteSeedProbe({
   batch:b,probeId:p.probeId,approval:approval(b),
   approvalVerificationKey:KEY,store:s,transport:tx,now:T1,
   verifyCurrentSenderHealth:async()=>true,
   verifyCurrentSeedConsent:async()=>false
 });
 assert.equal(withdrawn.status,'UBERWARM2_LIVE_PREFLIGHT_REFUSED');
 assert.equal(tx.calls.length,0);
 assert.equal(s.seen.size,0);
});
test('no trusted latest-sender-and-consent verifier means no send even with valid owner approval',async()=>{
 const b=batch(),tx=transport(),s=store(),p=b.probes[0];
 const result=await rawExecuteSeedProbe({
   batch:b,probeId:p.probeId,approval:approval(b),
   approvalVerificationKey:KEY,store:s,transport:tx,now:T1
 });
 assert.equal(result.status,'UBERWARM2_LIVE_PREFLIGHT_REFUSED');
 assert.equal(tx.calls.length,0);
});

// --- Regression closure Y1-Y14 (adversarial review of 2a36f22e) ---------------
// Each test was written before the matching fix and seen failing on the
// unmodified executor. Fakes only: no SMTP, DNS, provider or database access.

const Y_SENDER = {
  mailboxId: 'tara', address: 'tara@example.net', authenticationStatus: 'AUTHENTICATED', paused: false,
  dnsAuthenticated: true, transportAuthorized: true, providerPolicyCompatible: true
};
const Y_SEED = {
  email: 'owned-seed@gmail.com', ownerControlled: true, receiveReady: true, consentToTest: true,
  consentEvidenceRef: 'owner-test-agreement:g', permissionExpiresAt: '2026-12-31T00:00:00Z'
};
const Y_SEED_B = { ...Y_SEED, email: 'owned-seed@outlook.com', consentEvidenceRef: 'owner-test-agreement:m' };
const Y_LONG_A = 'a'.repeat(250) + 'x'.repeat(12);
const Y_LONG_B = 'a'.repeat(250) + 'y'.repeat(12);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function yProbe(probeId, { seedEmail = 'owned-seed@gmail.com', senderEmail = 'tara@example.net', seedProvider = 'google' } = {}) {
  return { probeId, bodyToken: probeId, senderEmail, seedEmail, seedProvider, authority: 'PLAN_ONLY', sendAuthorized: false };
}
function yCompile({
  mailboxes = [Y_SENDER], seeds = [Y_SEED, Y_SEED_B],
  probes = [yProbe('ubplacement_y1a'), yProbe('ubplacement_y1b', { seedEmail: 'owned-seed@outlook.com' })], now = T
} = {}) {
  return compileUberWarm2SeedBatch({ placementPlan: { probes }, mailboxes, seedInboxes: seeds, now });
}
// The digest is unkeyed, so a test can recompute it over a hand-built batch.
function yRedigest(b) {
  const canonical = { version: UBERWARM2_SEED_EXECUTION_VERSION, createdAt: b.createdAt, probes: b.probes };
  return { ...b, batchDigest: `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}` };
}
function ySigned(b, probeId, { expiresAt = '2026-10-12T18:40:00Z' } = {}) {
  const entry = {
    granted: true, grantedBy: 'founder', expiresAt, scopes: ['uberwarm2:owner-controlled-seed-test'],
    batchDigest: b.batchDigest, templateDigest: UBERWARM2_SEED_TEMPLATE_DIGEST,
    evidenceRef: 'owner-authorized-fixture', probeId
  };
  return { ...entry, proof: createUberWarm2SeedApprovalProof({ approval: entry, verificationKey: KEY }) };
}

test('Y1: a 99-character approval expiresAt whose tail is rewritten after signing is refused with no claim', async () => {
  const b = yCompile(), p = b.probes[0];
  const signedExpiry = '2026-10-12T18:40:00.' + '0'.repeat(78) + 'Z';
  const forgedExpiry = '2026-10-12T18:40:00.' + '0'.repeat(60) + '9'.repeat(18) + 'Z';
  assert.equal(signedExpiry.length, 99);
  assert.equal(forgedExpiry.length, 99);
  const forged = { ...ySigned(b, p.probeId, { expiresAt: signedExpiry }), expiresAt: forgedExpiry };
  const s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: forged, approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('Y1: an approval expiresAt outside the canonical UTC form is refused', async () => {
  const b = yCompile(), p = b.probes[0];
  const malformed = [
    '2026-10-12T18:40:00', '2026-10-12 18:40:00Z', '2026-10-12T18:40:00+00:00',
    '2026-10-12T18:40:00Z ', '2026-10-12T18:40:00.0000Z'
  ];
  for (const expiresAt of malformed) {
    const s = store(), tx = transport();
    const result = await executeUberWarm2SeedProbe({
      batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId, { expiresAt }),
      approvalVerificationKey: KEY, store: s, transport: tx, now: T1
    });
    assert.equal(result.status, 'UBERWARM2_OWNER_APPROVAL_REQUIRED', JSON.stringify(expiresAt));
    assert.equal(tx.calls.length, 0, JSON.stringify(expiresAt));
  }
});

test('Y2: an approval.probeId accessor that returns different values on successive reads executes nothing', async () => {
  const b = yCompile(), [p1, p2] = b.probes, s = store(), tx = transport();
  const entry = {
    granted: true, grantedBy: 'founder', expiresAt: '2026-10-12T18:40:00Z',
    scopes: ['uberwarm2:owner-controlled-seed-test'], batchDigest: b.batchDigest,
    templateDigest: UBERWARM2_SEED_TEMPLATE_DIGEST, evidenceRef: 'owner-authorized-fixture', probeId: p1.probeId
  };
  const attack = { ...entry, proof: createUberWarm2SeedApprovalProof({ approval: entry, verificationKey: KEY }) };
  let reads = 0;
  Object.defineProperty(attack, 'probeId', {
    enumerable: true, get() { reads += 1; return reads === 1 ? p2.probeId : p1.probeId; }
  });
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p2.probeId, approval: attack, approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('Y3: two 262-character probe IDs sharing a 250-character prefix are refused at compile', () => {
  const b = yCompile({ probes: [yProbe(Y_LONG_A), yProbe(Y_LONG_B, { seedEmail: 'owned-seed@outlook.com' })] });
  assert.equal(b.ok, false);
  assert.equal(b.probes.length, 0);
  assert.ok(b.rejections.every(r => r.reasonCodes.includes('probe-id-invalid')), JSON.stringify(b.rejections));
});

test('Y3: a 262-character probe ID cannot execute from a re-digested batch', async () => {
  const good = yCompile(), p = good.probes[0];
  const long = yRedigest({
    ...good, probes: [{ ...p, probeId: Y_LONG_A, bodyToken: Y_LONG_A, body: UBERWARM2_SEED_TEMPLATE.bodyPrefix + Y_LONG_A }]
  });
  const s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: long, probeId: Y_LONG_A, approval: ySigned(long, Y_LONG_A), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('Y3: a probeId with leading whitespace is refused at compile and at execute', async () => {
  const padded = ' ubplacement_y1a';
  const b = yCompile({ probes: [yProbe(padded)] });
  assert.equal(b.probes.length, 0);
  assert.ok(b.rejections[0]?.reasonCodes.includes('probe-id-invalid'), JSON.stringify(b.rejections));
  const good = yCompile(), p = good.probes[0];
  const padRow = yRedigest({
    ...good, probes: [{ ...p, probeId: padded, bodyToken: padded, body: UBERWARM2_SEED_TEMPLATE.bodyPrefix + padded }]
  });
  const s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: padRow, probeId: padded, approval: ySigned(padRow, padded), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('Y4: an approval whose probeId differs from the probe only by surrounding whitespace is refused', async () => {
  const b = yCompile(), p = b.probes[0], s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: ySigned(b, ' ' + p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.status, 'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('Y5: a hand-built row with a recomputed digest and an injected comma-separated seed is refused with no claim', async () => {
  const b = yCompile(), p = b.probes[0];
  const injected = yRedigest({ ...b, probes: [{ ...p, seedEmail: 'owned-seed@gmail.com,evil@example.net' }, ...b.probes.slice(1)] });
  const s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: injected, probeId: p.probeId, approval: ySigned(injected, p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('Y5: hand-built rows with a bracketed sender, zone-less permission, non-string provider, trailing-space seed or self-send are refused with no claim', async () => {
  const b = yCompile(), p = b.probes[0];
  const mutations = [
    { senderEmail: 'Tara <tara@example.net>' },
    { permissionExpiresAt: '2026-12-31T00:00:00' },
    { seedProvider: 42 },
    { seedEmail: 'owned-seed@gmail.com ' },
    { seedEmail: 'tara@example.net' }
  ];
  for (const change of mutations) {
    const tampered = yRedigest({ ...b, probes: [{ ...p, ...change }, ...b.probes.slice(1)] });
    const s = store(), tx = transport();
    const result = await executeUberWarm2SeedProbe({
      batch: tampered, probeId: p.probeId, approval: ySigned(tampered, p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
    });
    assert.equal(result.ok, false, JSON.stringify(change));
    assert.equal(s.seen.size, 0, JSON.stringify(change));
    assert.equal(tx.calls.length, 0, JSON.stringify(change));
  }
});

test('Y6: a zero-width character in the sender address is refused at compile', () => {
  const zw = 'tara​@example.net';
  const b = yCompile({ mailboxes: [{ ...Y_SENDER, address: zw }], probes: [yProbe('ubplacement_zw1', { senderEmail: zw })] });
  assert.equal(b.ok, false);
  assert.equal(b.probes.length, 0);
});

test('Y6: a seed of owned-seed@gmail.com,evil.com is refused at compile', () => {
  const bad = 'owned-seed@gmail.com,evil.com';
  const b = yCompile({ seeds: [{ ...Y_SEED, email: bad }], probes: [yProbe('ubplacement_cm1', { seedEmail: bad })] });
  assert.equal(b.ok, false);
  assert.equal(b.probes.length, 0);
});

test('Y6: a mailbox row whose address and email disagree is refused at compile', () => {
  const b = yCompile({ mailboxes: [{ ...Y_SENDER, email: 'dana@example.net' }], probes: [yProbe('ubplacement_mm1')] });
  assert.equal(b.ok, false);
  assert.equal(b.probes.length, 0);
});

test('Y7: non-boolean kill flags block the sender at compile', () => {
  const flags = [{ paused: 'true' }, { quarantined: 1 }, { placementQuarantine: {} }, { paused: 'no' }];
  for (const flag of flags) {
    const b = yCompile({ mailboxes: [{ ...Y_SENDER, ...flag }], probes: [yProbe('ubplacement_k1')] });
    assert.equal(b.probes.length, 0, JSON.stringify(flag));
  }
});

test('Y7: consentEvidenceRef must be a non-empty string at compile', () => {
  for (const consentEvidenceRef of [true, {}, '   ', 7]) {
    const b = yCompile({ seeds: [{ ...Y_SEED, consentEvidenceRef }], probes: [yProbe('ubplacement_c1')] });
    assert.equal(b.probes.length, 0, String(consentEvidenceRef));
  }
});

test('Y8: null, false, 0 and epoch-0 compile clocks are refused as invalid-clock', () => {
  for (const now of [null, false, 0, new Date(0)]) {
    const b = yCompile({ now });
    assert.equal(b.ok, false, String(now));
    assert.ok(!b.probes?.length, String(now));
    assert.ok(b.reasonCodes.includes('invalid-clock'), String(now));
  }
});

test('Y8: a zone-less recipient permission is refused at compile', () => {
  const b = yCompile({ seeds: [{ ...Y_SEED, permissionExpiresAt: '2026-12-31T00:00:00' }], probes: [yProbe('ubplacement_z1')] });
  assert.equal(b.probes.length, 0);
  assert.ok(b.rejections[0]?.reasonCodes.includes('recipient-not-proven-consenting-owned-seed'), JSON.stringify(b.rejections));
});

test('Y8: a null execution clock is refused as invalid-clock with no claim', async () => {
  const b = yCompile(), p = b.probes[0], s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: null
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('invalid-clock'), JSON.stringify(result.reasonCodes));
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('Y9: a seed that aliases the sender by Gmail dots or a plus tag refuses the whole batch', () => {
  const b = yCompile({
    mailboxes: [{ ...Y_SENDER, address: 'owned@gmail.com' }],
    seeds: [{ ...Y_SEED, email: 'owned+seed@gmail.com' }, { ...Y_SEED_B, email: 'o.wned@gmail.com' }],
    probes: [
      yProbe('ubplacement_al1', { senderEmail: 'owned@gmail.com', seedEmail: 'owned+seed@gmail.com' }),
      yProbe('ubplacement_al2', { senderEmail: 'owned@gmail.com', seedEmail: 'o.wned@gmail.com' })
    ]
  });
  assert.equal(b.ok, false);
  assert.ok(!b.probes?.length);
  assert.ok(b.reasonCodes.includes('seed-alias-collides-with-sender'), JSON.stringify(b.reasonCodes));
});

test('Y9: two seeds that collapse to one canonical recipient refuse the whole batch', () => {
  const b = yCompile({
    seeds: [{ ...Y_SEED, email: 'owned+a@outlook.com' }, { ...Y_SEED_B, email: 'owned+b@outlook.com' }],
    probes: [yProbe('ubplacement_du1', { seedEmail: 'owned+a@outlook.com' }), yProbe('ubplacement_du2', { seedEmail: 'owned+b@outlook.com' })]
  });
  assert.equal(b.ok, false);
  assert.ok(!b.probes?.length);
  assert.ok(b.reasonCodes.includes('seed-alias-duplicate'), JSON.stringify(b.reasonCodes));
});

test('Y10: with no now argument, a permission lapsing during the sender verifier results in zero transmissions', async () => {
  const start = Date.now();
  const b = compileUberWarm2SeedBatch({
    placementPlan: { probes: [yProbe('ubplacement_live1')] }, mailboxes: [Y_SENDER],
    seedInboxes: [{ ...Y_SEED, permissionExpiresAt: new Date(start + 300).toISOString() }], now: new Date(start)
  });
  assert.equal(b.ok, true);
  const p = b.probes[0], s = store(), tx = transport();
  const result = await rawExecuteSeedProbe({
    batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId, { expiresAt: new Date(start + 5 * 60 * 1000).toISOString() }),
    approvalVerificationKey: KEY, store: s, transport: tx,
    verifyCurrentSenderHealth: async () => { await sleep(600); return true; },
    verifyCurrentSeedConsent: async () => true
  });
  assert.equal(result.ok, false);
  assert.equal(tx.calls.length, 0);
  assert.equal(s.seen.size, 0);
});

test('Y10: an approval lapsing during the sender verifier, or a permission lapsing during the consent verifier, blocks transmission', async () => {
  const start = Date.now();
  const cases = [
    { label: 'approval lapses', approvalMs: start + 400, permissionMs: start + 5 * 60 * 1000,
      sender: async () => { await sleep(600); return true; }, consent: async () => true },
    { label: 'permission lapses in consent verifier', approvalMs: start + 5 * 60 * 1000, permissionMs: start + 300,
      sender: async () => true, consent: async () => { await sleep(600); return true; } }
  ];
  for (const c of cases) {
    const b = compileUberWarm2SeedBatch({
      placementPlan: { probes: [yProbe('ubplacement_live2')] }, mailboxes: [Y_SENDER],
      seedInboxes: [{ ...Y_SEED, permissionExpiresAt: new Date(c.permissionMs).toISOString() }], now: new Date(start)
    });
    assert.equal(b.ok, true, c.label);
    const p = b.probes[0], s = store(), tx = transport();
    const result = await rawExecuteSeedProbe({
      batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId, { expiresAt: new Date(c.approvalMs).toISOString() }),
      approvalVerificationKey: KEY, store: s, transport: tx,
      verifyCurrentSenderHealth: c.sender, verifyCurrentSeedConsent: c.consent
    });
    assert.equal(result.ok, false, c.label);
    assert.equal(tx.calls.length, 0, c.label);
  }
});

test('Y11: the transport call runs under a live one-shot send capability that is revoked when it returns', async () => {
  const b = yCompile(), p = b.probes[0], s = store();
  const observed = {};
  const tx = {
    authorizedSmtp: true, boundSender: 'tara@example.net',
    async sendOwnedSeed(x) {
      observed.key = x.reservationKey;
      observed.during = hasSendCapability(x.reservationKey, x);
      return { ok: true, accepted: true, messageId: 'provider-message-y11' };
    }
  };
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.status, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
  assert.equal(observed.during, true);
  assert.equal(hasSendCapability(observed.key), false);
});

test('Y11: the send capability is revoked even when the transport throws', async () => {
  const b = yCompile(), p = b.probes[0], s = store();
  const observed = {};
  const tx = {
    authorizedSmtp: true, boundSender: 'tara@example.net',
    async sendOwnedSeed(x) {
      observed.key = x.reservationKey;
      observed.during = hasSendCapability(x.reservationKey, x);
      throw new Error('network may have submitted');
    }
  };
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.status, 'SUBMISSION_OUTCOME_UNCERTAIN');
  assert.equal(observed.during, true);
  assert.equal(hasSendCapability(observed.key), false);
});

test('Y12: a messageId getter that throws after acceptance resolves as an uncertain receipt and still finalizes', async () => {
  const b = yCompile(), p = b.probes[0], s = store();
  const tx = {
    calls: 0, authorizedSmtp: true, boundSender: 'tara@example.net',
    async sendOwnedSeed() {
      this.calls += 1;
      return { ok: true, accepted: true, get messageId() { throw new Error('provider echo failed'); } };
    }
  };
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SUBMISSION_OUTCOME_UNCERTAIN');
  assert.equal(tx.calls, 1);
  assert.equal(s.finished.length, 1);
  assert.equal(s.finished[0].receipt.status, 'SUBMISSION_OUTCOME_UNCERTAIN');
});

test('Y13: a transport whose boundSender is a getter is refused before any claim', async () => {
  const b = yCompile(), p = b.probes[0], s = store();
  let reads = 0;
  const tx = {
    calls: [], authorizedSmtp: true,
    async sendOwnedSeed(x) { this.calls.push(x); return { ok: true, accepted: true, messageId: 'provider-message-y13' }; }
  };
  Object.defineProperty(tx, 'boundSender', {
    enumerable: true, get() { reads += 1; return reads === 1 ? 'tara@example.net' : 'dana@example.net'; }
  });
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.status, 'UBERWARM2_TRANSPORT_REQUIRED');
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('Y14: the batch row stores permissionExpiresAt as normalized ISO and the executor refuses a non-canonical stored value', async () => {
  const b = yCompile({ seeds: [{ ...Y_SEED, permissionExpiresAt: '2026-12-31T00:00:00Z' }, Y_SEED_B], probes: [yProbe('ubplacement_n1a')] });
  assert.equal(b.probes[0].permissionExpiresAt, '2026-12-31T00:00:00.000Z');
  const p = b.probes[0];
  const zoneless = yRedigest({ ...b, probes: [{ ...p, permissionExpiresAt: '2026-12-31T00:00:00' }] });
  const s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: zoneless, probeId: p.probeId, approval: ySigned(zoneless, p.probeId), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.equal(s.seen.size, 0);
  assert.equal(tx.calls.length, 0);
});

test('a caller-supplied now does not move the execution clock: a plan older than 45 minutes is refused', async () => {
  const b = yCompile(), p = b.probes[0], s = store(), tx = transport();
  // T1 is the time the old executor trusted. The wall clock is far past the 45-minute plan window.
  const result = await realExecuteSeedProbe({
    batch: b, probeId: p.probeId, approval: ySigned(b, p.probeId), approvalVerificationKey: KEY,
    store: s, transport: tx, now: new Date(T1.getTime()),
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('batch-expired'), result.reasonCodes.join(','));
  assert.equal(tx.calls.length, 0);
});
