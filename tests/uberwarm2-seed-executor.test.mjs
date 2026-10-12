import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePlacementProbePlan, compilePlacementReport } from '../src/uberplacement.mjs';
import {
  compileUberWarm2SeedBatch, executeUberWarm2SeedProbe as rawExecuteSeedProbe,
  compileUberWarm2ReceivedEvidence, createUberWarm2SeedApprovalProof
} from '../src/uberwarm2-seed-executor.mjs';

const KEY = 'test-only-never-production-seed-approval-hmac-key-2026';
const executeUberWarm2SeedProbe = args => rawExecuteSeedProbe({
  ...args,verifyCurrentSenderHealth: async()=>true,
  verifyCurrentSeedConsent: async()=>true
});
const T = new Date('2026-10-12T18:00:00.000Z');
const T1 = new Date('2026-10-12T18:02:00.000Z');
const T2 = new Date('2026-10-12T18:03:00.000Z');
const senders = [
  { mailboxId: 'tara', address: 'tara@example.net', authenticationStatus: 'AUTHENTICATED', paused: false },
  { mailboxId: 'dana', address: 'dana@example.net', authenticationStatus: 'AUTHENTICATED', paused: true }
];
const seeds = [
  { email: 'owned-seed@gmail.com', ownerControlled: true, receiveReady: true, consentToTest: true, consentEvidenceRef: 'owner-test-agreement:g' },
  { email: 'owned-seed@outlook.com', ownerControlled: true, receiveReady: true, consentToTest: true, consentEvidenceRef: 'owner-test-agreement:m' },
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
function approval(b) {
  const entry = {
    granted: true, grantedBy: 'founder', expiresAt: '2026-10-12T19:00:00Z',
    scopes: ['uberwarm2:owner-controlled-seed-test'],
    batchDigest: b.batchDigest, evidenceRef: 'owner-authorized-fixture'
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
    calls,
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
