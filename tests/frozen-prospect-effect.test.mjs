import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFrozenProspectEffect, validateFrozenProspectEffect } from '../src/frozen-prospect-effect.mjs';
import { runProspectPreflight } from '../src/prospect-preflight.mjs';
import { powerhouseRecord, POWERHOUSE_SLOTS, POWERHOUSE_ARTIFACT_REF } from './fixtures/outreach/powerhouse.fixture.mjs';
import { freshPolicyRegistry } from './fixtures/outreach/global-green-lane.fixture.mjs';

const at = new Date('2026-10-02T21:00:00Z');
const secret = 'frozen-effect-test-secret-'.repeat(3);
function fixture() {
  const data = { accounts: [{ id: 'smtp', slot: 'smtp-1', email: 'sender@send.example', provider: 'smtp-relay', connected: true, tokens: { enc: 'x' }, plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'ref' } }], senderHealth: [], suppressions: [], prospects: [], outboundReservations: [], outboundEvents: [], replies: [], messages: [], providerEvents: [] };
  const settings = {}; let writes = 0; let tokenCalls = 0;
  const store = { async list(name) { return structuredClone(data[name] || []); }, async getSettings() { return structuredClone(settings); }, async setSetting(k,v) { writes++; settings[k] = structuredClone(v); }, async transaction(fn) { return fn(store); } };
  const input = { freezeEffect: true, prepareEffect: true, record: powerhouseRecord(), slots: POWERHOUSE_SLOTS, artifactRef: POWERHOUSE_ARTIFACT_REF, identity: { legalBusinessSenderName: 'Operating LLC', displaySenderName: 'Sender | Operating', company: 'Operating', authorizedPublicPostalAddress: '100 Example Business Street, City', footerUseAuthorized: true }, senderSide: { resolved: true, operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US', resolutionRef: 'fixture-counsel' }, campaign: { campaignId: 'camp', effectExpiresAt: new Date(+at + 3600000).toISOString() } };
  const identity = { legalName: input.identity.legalBusinessSenderName, postalAddress: input.identity.authorizedPublicPostalAddress, senderName: input.identity.displaySenderName, company: input.identity.company };
  input.record.invitationEvidence = [{ sourceUrl: input.record.recipient.sourceUrl, capturedAt: at.toISOString(), pageContext: 'PARTNERSHIP_OPPORTUNITIES', excerpt: 'PARTNERSHIP OPPORTUNITIES. Agency partners, send us proposals for client reporting and renewal.' }];
  input.record.offerRoute.rationale = 'Agency partnership proposals for client ROI and renewal reporting.';
  const campaign = { id: 'camp' };
  const run = (request, internal) => runProspectPreflight({ ...request, store, artifactExists: () => true, policyRegistry: freshPolicyRegistry(at), unsubscribeFactory: () => { tokenCalls++; return { unsubscribeUrl: `https://control.example/unsubscribe?token=${tokenCalls}`, oneClickUnsubscribeUrl: `https://control.example/api/public/unsubscribe?token=${tokenCalls}` }; }, ...internal });
  const prepare = () => prepareFrozenProspectEffect({ store, input, secret, run, now: at, identity, campaign });
  const validate = (digest, extra = {}) => validateFrozenProspectEffect({ store, digest, secret, run, now: new Date(+at + 60000), identity, campaign, ...extra });
  return { data, settings, store, input, run, identity, campaign, prepare, validate, writes: () => writes, tokenCalls: () => tokenCalls };
}

test('frozen execution validation preserves digest, receipt, token and exact payload across new clean reads', async () => {
  const f = fixture(); const prepared = await f.prepare();
  assert.equal(prepared.state, 'READY_FOR_AUTHORIZATION', JSON.stringify(prepared));
  const digest = prepared.effectPackage.finalEffectDigest; const writes = f.writes();
  for (let n = 1; n <= 3; n++) {
    const current = await f.validate(digest, { now: new Date(+at + n * 60000) });
    assert.equal(current.validation?.valid, true, JSON.stringify(current));
    assert.equal(current.effectPackage.finalEffectDigest, digest);
    assert.deepEqual(current.effectPackage.participants, prepared.effectPackage.participants);
    assert.equal(current.effectPackage.preview.body, prepared.effectPackage.preview.body);
    assert.notEqual(current.contactHistory.receiptDigest, prepared.contactHistory.receiptDigest);
    assert.equal(current.contactHistory.boundReceiptDigest, prepared.contactHistory.receiptDigest);
    assert.equal(current.readOnly, true); assert.equal(current.sendAuthority, false);
  }
  assert.equal(f.writes(), writes); assert.equal(f.tokenCalls(), 1);
  const replay = await f.prepare(); assert.equal(replay.effectPackage.finalEffectDigest, digest); assert.equal(f.tokenCalls(), 1);
});

for (const collection of ['suppressions', 'outboundReservations', 'outboundEvents', 'replies', 'providerEvents']) test(`fresh ${collection} hit invalidates without replacing the frozen package`, async () => {
  const f = fixture(); const p = await f.prepare(); const digest = p.effectPackage.finalEffectDigest;
  const email = f.input.record.recipient.email;
  f.data[collection].push({ id: 'hit', email, recipientEmail: email, from: email, leadEmail: email, value: email, status: 'uncertain', type: 'bounce', event: 'bounce' });
  const result = await f.validate(digest);
  assert.notEqual(result.validation?.valid, true, JSON.stringify(result));
  assert.equal(f.tokenCalls(), 1);
});

test('read failure, paused sender, expired effect, changed owner identity and missing campaign fail closed', async () => {
  const f = fixture(); const p = await f.prepare(); const digest = p.effectPackage.finalEffectDigest;
  assert.equal((await f.validate(digest, { now: new Date(+at+3600000) })).blockerCodes[0], 'effect-expired');
  assert.equal((await f.validate(digest, { identity: { ...f.identity, postalAddress: 'Changed street' } })).blockerCodes[0], 'protected-identity-changed');
  assert.equal((await f.validate(digest, { campaign: null })).blockerCodes[0], 'campaign-lineage-changed');
  f.data.senderHealth.push({ inbox: 'smtp-1', paused: true });
  assert.notEqual((await f.validate(digest)).validation?.valid, true);
  f.data.senderHealth.length = 0;
  const list = f.store.list; f.store.list = async name => { if(name === 'suppressions') throw new Error('down'); return list(name); };
  assert.notEqual((await f.validate(digest)).validation?.valid, true);
});

for (const [label, mutate] of [
  ['recipient', s => { s.input.record.recipient.email = 'other@company.example'; }],
  ['message', s => { s.result.effectPackage.participants.body += ' changed'; }],
  ['route', s => { s.result.effectPackage.participants.route.routeClass = 'OTHER'; }],
  ['unsubscribe', s => { s.result.effectPackage.participants.footerAndUnsubscribe.unsubUrl = 'https://evil.example/'; }],
  ['cap', s => { s.result.effectPackage.maxEffects = 2; }]
]) test(`snapshot ${label} mutation cannot inherit authorization`, async () => {
  const f = fixture(); const p = await f.prepare(); const digest = p.effectPackage.finalEffectDigest;
  mutate(f.settings[`frozenProspectEffect:${digest}`]);
  assert.equal((await f.validate(digest)).blockerCodes[0], 'frozen-effect-snapshot-unavailable-or-tampered');
});

test('current canonical route, payload, policy or sender mutation is refused even with an authentic snapshot', async () => {
  const f = fixture(); const p = await f.prepare(); const digest = p.effectPackage.finalEffectDigest;
  for (const field of ['body', 'sender', 'route', 'provider']) {
    const run = async (request, internal) => { const r = await f.run(request, internal); r.effectPackage.finalEffectDigest = 'b'.repeat(64); return r; };
    assert.equal((await f.validate(digest, { run })).blockerCodes[0], 'material-effect-binding-changed', field);
  }
  await assert.rejects(f.validate(digest, { secret: 'short' }), /secret-unavailable/);
});
