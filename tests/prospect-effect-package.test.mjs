import test from 'node:test';
import assert from 'node:assert/strict';
import { powerhouseRecord, POWERHOUSE_SLOTS as SLOTS } from './fixtures/outreach/powerhouse.fixture.mjs';
import { compileProspectVerification } from '../src/prospect-verification-intake.mjs';
import { compileContactHistory } from '../src/prospect-contact-history.mjs';
import { runProspectMessageTournament } from '../src/prospect-message-tournament.mjs';
import { compileEffectPackage, EFFECT_PACKAGE_STATES as S, isPlaceholder } from '../src/prospect-effect-package.mjs';

const now = new Date('2026-10-02T21:00:00.000Z');
const ok = rows => ({ ok: true, rows });
function context(readsPatch = {}) {
  const record = powerhouseRecord();
  record.contactHistoryReceipt = compileContactHistory({ email: record.recipient.email, reads: { suppressions: ok([]), prospects: ok([]), outboundReservations: ok([]), outboundEvents: ok([]), replies: ok([]), messages: ok([]), providerEvents: ok([]), ...readsPatch }, now });
  const intake = compileProspectVerification(record, { now, contactHistoryTrust: { inProcess: true } });
  const tournament = runProspectMessageTournament({ intake, record, slots: SLOTS, artifactPrepared: true, now });
  return { record, intake, tournament };
}
const FINAL_IDENTITY = { legalBusinessSenderName: 'Example Operating LLC', authorizedPublicPostalAddress: '100 Example Street, Suite 4, Springfield, ST 00000', footerUseAuthorized: true };
const SENDER = { ok: true, slot: 'smtp-1', provider: 'smtp-relay', quarantined: false };
const UNSUB = { unsubscribeUrl: 'https://uberbond.example/unsubscribe?t=sig', oneClickUnsubscribeUrl: 'https://uberbond.example/unsubscribe/one-click?t=sig' };
const RESOLVED = { resolved: true, operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US', resolutionRef: 'counsel-memo-ref' };
const pack = (patch = {}, ctx = context()) => compileEffectPackage({ intake: ctx.intake, tournament: ctx.tournament, campaign: { campaignId: 'camp_1' }, now, ...patch });

test('placeholder detection treats the literal placeholders, bracket tokens and blanks as non-final', () => {
  for (const v of ['', ' ', 'LEGAL_BUSINESS_SENDER_NAME', 'AUTHORIZED_PUBLIC_POSTAL_ADDRESS', '<address>', '[street]', '{addr}', 'TBD', 'N/A', 'Name LEGAL_BUSINESS_SENDER_NAME Inc', 'Acme [city]']) assert.equal(isPlaceholder(v), true, JSON.stringify(v));
  assert.equal(isPlaceholder('100 Example Street, Suite 4, Springfield, ST 00000'), false);
  assert.equal(isPlaceholder('Example Operating LLC'), false);
});

test('with identity and legal authority missing: READY_EXCEPT_IDENTITY_AND_AUTHORITY, no digest, placeholders visible, zero authority', () => {
  const p = pack();
  assert.equal(p.state, S.READY_EXCEPT_IDENTITY_AND_AUTHORITY);
  assert.equal(p.readyExceptIdentityAndLegalAuthority, true);
  assert.equal(p.finalEffectDigest, null);
  assert.equal(p.placeholdersPresent, true);
  assert.ok(p.preview.body.includes('LEGAL_BUSINESS_SENDER_NAME'));
  assert.ok(p.preview.body.includes('AUTHORIZED_PUBLIC_POSTAL_ADDRESS'));
  assert.equal(p.sendAuthority, false);
  assert.equal(p.externalEffectAuthority, 'NONE');
  assert.equal(p.maxEffects, 1);
  assert.ok(p.finalEffectDigestWithheldBecause.includes('legal-business-sender-name-placeholder-or-missing'));
  assert.doesNotMatch(JSON.stringify(p), /"finalEffectDigest":"[a-f0-9]{64}"/);
  assert.deepEqual(p.ownerOrLegalHolds, { identity: true, legalAuthority: true });
});

test('real identity but sender-side legal hold unresolved: READY_EXCEPT_AUTHORITY and still no digest', () => {
  const p = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB });
  assert.equal(p.state, S.READY_EXCEPT_AUTHORITY);
  assert.equal(p.finalEffectDigest, null);
  assert.ok(p.blockers.some(b => b.code === 'sender-side-legal-authority-hold-unresolved'));
});

test('identity final, authority unresolved, sender and unsubscribe missing: authority takes precedence, the rest are runtime/draft-time facts', () => {
  const p = pack({ identity: FINAL_IDENTITY });
  assert.equal(p.state, S.READY_EXCEPT_AUTHORITY);
  assert.deepEqual(p.runtimeAtSendBlockers.sort(), ['sender-allocation-runtime-read-required', 'signed-unsubscribe-urls-not-created']);
  assert.equal(p.machineResolvableBlockerCount, 0);
});

test('everything final: READY_FOR_AUTHORIZATION mints exactly one digest, bound to every participant, and is still zero-authority', () => {
  const p = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED });
  assert.equal(p.state, S.READY_FOR_AUTHORIZATION);
  assert.match(p.finalEffectDigest, /^[a-f0-9]{64}$/);
  assert.equal(p.sendAuthority, false);
  assert.deepEqual(p.finalEffectDigestWithheldBecause, []);
  assert.ok(p.preview.body.includes('This is a commercial message from Example Operating LLC.'));
  assert.ok(p.preview.body.includes(FINAL_IDENTITY.authorizedPublicPostalAddress));
  assert.ok(p.preview.body.includes(UNSUB.unsubscribeUrl));
  for (const v of Object.values(p.participantsFinal)) assert.equal(v, true);
});

test('the digest binds every participant: changing any one participating fact changes it', () => {
  const base = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED }).finalEffectDigest;
  const variants = [
    { identity: { ...FINAL_IDENTITY, legalBusinessSenderName: 'Different LLC' } },
    { identity: { ...FINAL_IDENTITY, authorizedPublicPostalAddress: '200 Other Road, Springfield, ST 11111' } },
    { sender: { ...SENDER, slot: 'smtp-2' } },
    { unsubscribe: { ...UNSUB, unsubscribeUrl: 'https://uberbond.example/unsubscribe?t=other' } },
    { campaign: { campaignId: 'camp_2' } },
    { provider: 'smtp-relay-b', sender: { ...SENDER, provider: 'smtp-relay-b' } }
  ];
  for (const patch of variants) {
    const p = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED, ...patch });
    assert.notEqual(p.finalEffectDigest, base, JSON.stringify(Object.keys(patch)));
  }
  const ctx = context();
  const edited = { ...ctx, tournament: { ...ctx.tournament, winner: { ...ctx.tournament.winner, body: `${ctx.tournament.winner.body} ` + 'x' } } };
  assert.notEqual(pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED }, edited).finalEffectDigest, base);
});

test('placeholders can never produce a production-ready digest, even when everything else is final', () => {
  for (const identity of [
    { ...FINAL_IDENTITY, legalBusinessSenderName: 'LEGAL_BUSINESS_SENDER_NAME' },
    { ...FINAL_IDENTITY, authorizedPublicPostalAddress: 'AUTHORIZED_PUBLIC_POSTAL_ADDRESS' },
    { ...FINAL_IDENTITY, authorizedPublicPostalAddress: '<street address here>' },
    { ...FINAL_IDENTITY, footerUseAuthorized: false },
    { ...FINAL_IDENTITY, authorizedPublicPostalAddress: 'short' }
  ]) {
    const p = pack({ identity, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED });
    assert.equal(p.finalEffectDigest, null, JSON.stringify(identity));
    assert.equal(p.state, S.READY_EXCEPT_IDENTITY);
  }
});

test('quarantined, missing, wrong-provider senders and non-https unsubscribe URLs block the digest', () => {
  for (const patch of [
    { sender: { ...SENDER, quarantined: true } },
    { sender: null },
    { sender: { ok: false } },
    { sender: { ...SENDER, provider: 'other' } },
  ]) {
    const p = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED, ...patch });
    assert.equal(p.finalEffectDigest, null, JSON.stringify(patch));
    assert.equal(p.state, S.READY_EXCEPT_SENDER);
  }
  // Missing, non-https or half-supplied unsubscribe URLs are draft-time facts: the digest stays withheld.
  for (const unsubscribe of [{}, { unsubscribeUrl: 'http://insecure.example/u', oneClickUnsubscribeUrl: 'https://uberbond.example/o' }, { unsubscribeUrl: 'https://uberbond.example/u' }]) {
    const p = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe, senderSide: RESOLVED });
    assert.equal(p.finalEffectDigest, null, JSON.stringify(unsubscribe));
    assert.equal(p.state, S.READY_PENDING_DRAFT_TIME_FACTS);
    assert.deepEqual(p.runtimeAtSendBlockers, ['signed-unsubscribe-urls-not-created']);
  }
});

test('an unresolved or half-resolved sender-side authority never counts as resolved', () => {
  for (const senderSide of [{}, { resolved: false }, { ...RESOLVED, resolutionRef: '' }, { ...RESOLVED, controllerJurisdiction: '' }]) {
    const p = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide });
    assert.equal(p.finalEffectDigest, null);
    assert.equal(p.state, S.READY_EXCEPT_AUTHORITY);
  }
});

test('a prospect without runtime contact history is READY_EXCEPT_RUNTIME_HISTORY, and a hit or failed read never reaches a digest', () => {
  const failed = context({ suppressions: { ok: false, error: 'x' } });
  const p = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED }, failed);
  assert.equal(p.state, S.READY_EXCEPT_RUNTIME_HISTORY);
  assert.equal(p.finalEffectDigest, null);
  const hit = context({ replies: ok([{ id: 'r', from: 'hello@mypowerhouse.group' }]) });
  assert.equal(pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED }, hit).finalEffectDigest, null);
  assert.equal(pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED }, { intake: null, tournament: null }).state, S.READY_EXCEPT_RUNTIME_HISTORY);
});

test('a tournament DO_NOT_SEND leaves the package PREPARED with no digest', () => {
  const ctx = context();
  const p = pack({ identity: FINAL_IDENTITY, sender: SENDER, unsubscribe: UNSUB, senderSide: RESOLVED }, { intake: ctx.intake, tournament: { status: 'DO_NOT_SEND', winner: null } });
  assert.equal(p.state, S.PREPARED);
  assert.equal(p.finalEffectDigest, null);
});

test('downstream states are mapped to their existing canonical owners, not re-implemented here', () => {
  const p = pack();
  assert.deepEqual(Object.keys(p.downstreamStateOwners), ['APPROVED', 'DISPATCHED', 'RECONCILED']);
  assert.match(p.downstreamStateOwners.APPROVED, /outreach-governance/);
  assert.equal(Object.keys(S).includes('APPROVED'), false);
});
