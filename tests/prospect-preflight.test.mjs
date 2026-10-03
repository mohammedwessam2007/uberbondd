import test from 'node:test';
import assert from 'node:assert/strict';
import { powerhouseRecord as record, POWERHOUSE_SLOTS as SLOTS, POWERHOUSE_ARTIFACT_REF as ARTIFACT } from './fixtures/outreach/powerhouse.fixture.mjs';
import { existsSync } from 'node:fs';
import { runProspectPreflight, repositoryArtifactExists, PREFLIGHT_STATES as P } from '../src/prospect-preflight.mjs';
import { freshPolicyRegistry } from './fixtures/outreach/global-green-lane.fixture.mjs';

const now = new Date('2026-10-02T21:00:00.000Z');
// Fresh policy evidence relative to `now`: the global route's freshness law is tested in its own suite.
const policyRegistry = freshPolicyRegistry(now);
const account = (slot, email) => ({ id: `acct-${slot}`, slot, email, provider: 'smtp-relay', connected: true, tokens: { enc: 'x' }, plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'ref' } });
const FINAL_IDENTITY = { legalBusinessSenderName: 'Example Operating LLC', authorizedPublicPostalAddress: '100 Example Street, Suite 4, Springfield, ST 00000', footerUseAuthorized: true };
const RESOLVED = { resolved: true, operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US', resolutionRef: 'counsel-memo-ref' };
const UNSUB = { unsubscribeUrl: 'https://uberbond.example/unsubscribe?t=sig', oneClickUnsubscribeUrl: 'https://uberbond.example/unsubscribe/one-click?t=sig' };

function memoryStore(data = {}, { failOn = [] } = {}) {
  const calls = [];
  const base = { suppressions: [], prospects: [], outboundReservations: [], outboundEvents: [], replies: [], messages: [], providerEvents: [], accounts: [account('smtp-1', 'a1@send.example'), account('smtp-2', 'a2@send.example'), account('smtp-3', 'a3@send.example')], senderHealth: [{ inbox: 'smtp-3', paused: true }], ...data };
  return {
    calls,
    async list(name) { calls.push(['list', name]); if (failOn.includes(name)) throw Object.assign(new Error('down'), { code: 'EDOWN' }); return structuredClone(base[name] || []); },
    async add() { calls.push(['WRITE', 'add']); throw new Error('write'); }, async patch() { calls.push(['WRITE', 'patch']); throw new Error('write'); },
    async update() { calls.push(['WRITE', 'update']); throw new Error('write'); }, async remove() { calls.push(['WRITE', 'remove']); throw new Error('write'); }
  };
}
// The artifact check is injected here (the real repository check has its own test below), so these suites run in the mutation war's sandbox, which has no artifacts/ directory.
const presentArtifacts = new Set([ARTIFACT]);
const artifactExists = ref => presentArtifacts.has(ref);
const run = (patch = {}, storeData, storeOpts) => runProspectPreflight({ store: memoryStore(storeData, storeOpts), record: record(), slots: SLOTS, artifactRef: ARTIFACT, artifactExists, now, policyRegistry, ...patch });
const all = { identity: FINAL_IDENTITY, senderSide: RESOLVED, unsubscribe: UNSUB, campaign: { campaignId: 'camp_1' } };

test('placeholder identity: BLOCKED_IDENTITY with the exact codes, a visible winner, no digest, zero authority', async () => {
  const r = await run();
  assert.equal(r.state, P.BLOCKED_IDENTITY);
  assert.ok(r.blockerCodes.includes('legal-business-sender-name-placeholder-or-missing'));
  assert.ok(r.blockerCodes.includes('authorized-public-postal-address-placeholder-or-missing'));
  assert.equal(r.effectPackage.finalEffectDigest, null);
  assert.equal(r.message.winner.id, 'FULL');
  assert.equal(r.sendAuthority, false);
  assert.equal(r.readOnly, true);
  assert.equal(r.contactHistory.status, 'CLEAN');
  assert.equal(r.intake.provenance, 'RUNTIME_RECEIPT');
  assert.equal(r.coldRoute.selfAuthorizing, false);
  assert.equal(r.coldRoute.envelopeOk, true);
});

test('identity final but sender-side legal hold unresolved: BLOCKED_LEGAL_AUTHORITY', async () => {
  const r = await run({ identity: FINAL_IDENTITY, unsubscribe: UNSUB, campaign: { campaignId: 'c' } });
  assert.equal(r.state, P.BLOCKED_LEGAL_AUTHORITY);
  assert.ok(r.blockerCodes.includes('sender-side-legal-authority-hold-unresolved'));
  assert.equal(r.effectPackage.finalEffectDigest, null);
});

test('every fact final: READY_FOR_AUTHORIZATION mints the digest, allocates a non-quarantined sender, and STILL carries no authority', async () => {
  const r = await run(all);
  assert.equal(r.state, P.READY_FOR_AUTHORIZATION);
  assert.match(r.effectPackage.finalEffectDigest, /^[a-f0-9]{64}$/);
  assert.notEqual(r.sender.slot, 'smtp-3', 'quarantined ordinal 3 is never allocated');
  assert.equal(r.sendAuthority, false);
  assert.equal(r.externalEffectAuthority, 'NONE');
  assert.equal(r.externalEffects, 0);
  assert.deepEqual(r.blockerCodes, []);
});

test('only per-prospect draft-time facts left: READY_PENDING_DRAFT_TIME_FACTS with no digest', async () => {
  const r = await run({ ...all, unsubscribe: {} });
  assert.equal(r.state, P.READY_PENDING_DRAFT_TIME_FACTS);
  assert.equal(r.effectPackage.finalEffectDigest, null);
  assert.deepEqual(r.draftTimeFacts, ['signed-unsubscribe-urls-not-created']);
});

test('a real production hit is DO_NOT_SEND and cannot be overridden by a clean manual attestation in the record', async () => {
  for (const data of [{ suppressions: [{ value: 'hello@mypowerhouse.group' }] }, { suppressions: [{ value: 'mypowerhouse.group' }] }, { outboundReservations: [{ recipientEmail: 'hello@mypowerhouse.group', status: 'sent' }] }, { replies: [{ from: 'hello@mypowerhouse.group' }] }]) {
    const rec = record();
    rec.contactHistory = { repoAndHistorySearched: true, runtimeSuppressionSearched: true, runtimeProspectAndOutboundSearched: true, hit: false };
    const r = await run({ ...all, record: rec }, data);
    assert.equal(r.state, P.DO_NOT_SEND, JSON.stringify(data));
    assert.ok(r.blockerCodes.includes('prior-contact-or-suppression-runtime-ledger-hit'));
    assert.equal(r.message, undefined, 'no message work after a hit');
  }
});

test('a failed or partial ledger read is BLOCKED_CONTACT_HISTORY, never clean', async () => {
  for (const name of ['suppressions', 'prospects', 'outboundReservations', 'outboundEvents', 'replies']) {
    const r = await run(all, {}, { failOn: [name] });
    assert.equal(r.state, P.BLOCKED_CONTACT_HISTORY, name);
    assert.ok(r.blockerCodes.includes(`required-collection-unreadable:${name}`));
  }
  const noStore = await runProspectPreflight({ store: null, record: record(), slots: SLOTS, artifactRef: ARTIFACT, artifactExists, now, policyRegistry, ...all });
  assert.equal(noStore.state, P.BLOCKED_CONTACT_HISTORY);
});

test('incomplete or rejected evidence maps to BLOCKED_EXTERNAL_FACT or DO_NOT_SEND with the intake reasons', async () => {
  const noExcerpt = record(); delete noExcerpt.recipient.excerpt;
  const a = await run({ ...all, record: noExcerpt });
  assert.equal(a.state, P.BLOCKED_EXTERNAL_FACT);
  assert.ok(a.blockerCodes.includes('recipient-verbatim-excerpt-missing'));
  const privacy = record(); privacy.recipient.publishedRole = 'PRIVACY_ONLY';
  const b = await run({ ...all, record: privacy });
  assert.equal(b.state, P.DO_NOT_SEND);
  const negative = record(); negative.negativeRecipientSignals = [{ kind: 'NO_VENDOR_SOLICITATION' }];
  assert.equal((await run({ ...all, record: negative })).state, P.DO_NOT_SEND);
  assert.equal((await run({ ...all, record: null })).state, P.BLOCKED_EXTERNAL_FACT);
});

test('stale recipient evidence fails closed (7-day maximum): the router gate fires before the cold-route envelope check', async () => {
  const stale = record(); stale.recipient.observedAt = '2026-09-20T00:00:00.000Z';
  const r = await run({ ...all, record: stale });
  assert.equal(r.state, P.BLOCKED_EXTERNAL_FACT);
  assert.ok(r.blockerCodes.includes('contact-source-missing:contact-source-evidence-stale'));
  assert.equal(r.globalRoute.green, false);
});

test('sender health: no eligible mailbox, or only paused/quarantined mailboxes, is BLOCKED_SENDER_HEALTH', async () => {
  const none = await run(all, { accounts: [] });
  assert.equal(none.state, P.BLOCKED_SENDER_HEALTH);
  const paused = await run(all, { senderHealth: [{ inbox: 'smtp-1', paused: true }, { inbox: 'smtp-2', paused: true }, { inbox: 'smtp-3', paused: true }] });
  assert.equal(paused.state, P.BLOCKED_SENDER_HEALTH);
  const imapOnly = await run(all, { accounts: [{ id: 'g', slot: 'g1', email: 'g@x.example', provider: 'gmail-api', connected: true, tokens: {} }] });
  assert.equal(imapOnly.state, P.BLOCKED_SENDER_HEALTH, 'a non-smtp-relay account is never the smtp-relay sender');
  const tokenless = await run(all, { accounts: [{ ...account('smtp-9', 'n@x.example'), tokens: null }] });
  assert.equal(tokenless.state, P.BLOCKED_SENDER_HEALTH);
});

test('the artifact must exist: a missing or path-traversing artifact reference is DO_NOT_SEND', async () => {
  for (const ref of ['', 'artifacts/outreach/does-not-exist.md', '../package.json', '/etc/passwd', 'src/store.mjs', 'artifacts/../package.json', 'https://example.com/x']) {
    const r = await run({ ...all, artifactRef: ref });
    assert.equal(r.state, P.DO_NOT_SEND, ref);
    assert.ok(r.blockerCodes.includes('described-artifact-not-prepared') || r.blockerCodes.some(c => c.includes('artifact')), ref);
  }
  assert.equal(repositoryArtifactExists('artifacts/../package.json'), false);
  assert.equal(repositoryArtifactExists('/etc/passwd'), false);
  assert.equal(repositoryArtifactExists('src/store.mjs'), false);
});

test('the real repository artifact check accepts the committed sample artifact', { skip: !existsSync(new URL('../artifacts/outreach/', import.meta.url)) }, () => {
  assert.equal(repositoryArtifactExists(ARTIFACT), true);
});

test('the preflight is strictly read-only: only list() is ever called on the store, for any outcome', async () => {
  for (const variant of [all, {}, { ...all, record: null }]) {
    const store = memoryStore();
    await runProspectPreflight({ store, record: record(), slots: SLOTS, artifactRef: ARTIFACT, artifactExists, now, policyRegistry, ...variant });
    assert.ok(store.calls.every(([kind]) => kind === 'list'), JSON.stringify(store.calls.filter(([k]) => k !== 'list')));
  }
});

test('the preflight is deterministic and idempotent for identical inputs', async () => {
  const a = await run(all);
  const b = await run(all);
  assert.equal(a.effectPackage.finalEffectDigest, b.effectPackage.finalEffectDigest);
  assert.equal(a.contactHistory.receiptDigest, b.contactHistory.receiptDigest);
});
