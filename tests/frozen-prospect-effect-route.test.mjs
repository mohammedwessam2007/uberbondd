import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';
import { powerhouseRecord, POWERHOUSE_SLOTS, POWERHOUSE_ARTIFACT_REF } from './fixtures/outreach/powerhouse.fixture.mjs';
const token = 'frozen-effect-http-test-admin-0000000000000';
let handler, dir, request;
test.before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frozen-effect-http-'));
  Object.assign(process.env, { PROCESS_ROLE: 'web', STORE_BACKEND: 'json', DATA_DIR: dir, NODE_ENV: 'test', ADMIN_TOKEN: token, APP_BASE_URL: 'https://control.example', UNSUBSCRIBE_SECRET: 'frozen-effect-route-secret-0000000000000000' });
  const store = new Store(dir); await store.init();
  await store.add('campaigns', { id: 'camp', approved: true, autoSend: false });
  await store.add('accounts', { id: 'smtp', slot: 'smtp-1', email: 'sender@send.example', provider: 'smtp-relay', connected: true, tokens: { enc: 'x' }, plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'fixture' } });
  await store.setSetting('businessIdentity', { legalName: 'Operating LLC', postalAddress: '100 Example Business Street, City', senderName: 'Sender | Operating', company: 'Operating' });
  const record = powerhouseRecord(); const observedAt = new Date(Date.now()-3600000).toISOString();
  record.recipient.observedAt = observedAt; record.clientEvidence.observation.observedAt = observedAt;
  record.invitationEvidence = [{ sourceUrl: record.recipient.sourceUrl, capturedAt: observedAt, pageContext: 'PARTNERSHIP_OPPORTUNITIES', excerpt: 'PARTNERSHIP OPPORTUNITIES. Agency partners, send us proposals for client reporting and renewal.' }];
  record.offerRoute.rationale = 'Agency partnership proposals for client ROI and renewal reporting.';
  request = { freezeEffect: true, record, slots: POWERHOUSE_SLOTS, artifactRef: POWERHOUSE_ARTIFACT_REF, identity: { legalBusinessSenderName: 'Operating LLC', authorizedPublicPostalAddress: '100 Example Business Street, City', displaySenderName: 'Sender | Operating', company: 'Operating', footerUseAuthorized: true }, senderSide: { resolved: true, operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US', resolutionRef: 'fixture' }, campaign: { campaignId: 'camp', effectExpiresAt: new Date(Date.now()+3600000).toISOString() } };
  ({ requestHandler: handler } = await import('../server-core.mjs'));
});
test.after(async () => { await rm(dir, { recursive: true, force: true }); });
async function call(body, credentials = token) {
  const res = { body: '', writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
  await handler({ method: 'POST', url: '/api/prospect-preflight', headers: credentials ? { authorization: `Bearer ${credentials}` } : {}, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }, res);
  return { status: res.status, result: JSON.parse(res.body) };
}
test('HTTP freezing is protected, durable, idempotent and revalidation accepts only exact digest', async () => {
  assert.equal((await call(request, null)).status, 401);
  assert.equal((await call({ ...request, identity: { ...request.identity, authorizedPublicPostalAddress: 'Other address' } })).status, 409);
  const a = await call(request); assert.equal(a.status, 200);
  assert.equal(a.result.state, 'READY_FOR_AUTHORIZATION', JSON.stringify(a.result));
  assert.equal(a.result.frozenEffect.stored, true); assert.equal(a.result.readOnly, false);
  const digest = a.result.frozenEffect.digest;
  const saved = new Store(dir); await saved.init(); assert.equal((await saved.getSettings())[`frozenProspectEffect:${digest}`].digest, digest);
  const b = await call({ frozenEffectDigest: digest });
  assert.equal(b.result.validation?.valid, true, JSON.stringify(b.result));
  assert.equal(b.result.effectPackage.finalEffectDigest, digest);
  assert.equal(b.result.effectPackage.preview.body, a.result.effectPackage.preview.body);
  assert.equal(b.result.readOnly, true); assert.equal(b.result.sendAuthority, false);
  const replay = await call(request); assert.equal(replay.result.effectPackage.finalEffectDigest, digest);
  assert.equal((await call({ frozenEffectDigest: digest, identity: request.identity })).status, 400);
  assert.equal((await call({ frozenEffectDigest: 'f'.repeat(64) })).result.ok, false);
  assert.deepEqual(await saved.list('outboundReservations'), []); assert.deepEqual(await saved.list('outboundEvents'), []);
});
