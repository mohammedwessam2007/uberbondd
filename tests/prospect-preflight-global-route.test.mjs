import test from 'node:test';
import assert from 'node:assert/strict';
import { powerhouseRecord, POWERHOUSE_SLOTS as SLOTS, POWERHOUSE_ARTIFACT_REF as ARTIFACT } from './fixtures/outreach/powerhouse.fixture.mjs';
import { runProspectPreflight, PREFLIGHT_STATES as P } from '../src/prospect-preflight.mjs';
import { createRegistryAdapterRegistry } from '../src/company-registry-adapter.mjs';
import { createPolicyEvidenceRegistry } from '../src/global-policy-evidence.mjs';
import { freshPolicyRegistry, registryFound, registryStatus, mergeDeep } from './fixtures/outreach/global-green-lane.fixture.mjs';

const now = new Date('2026-10-02T21:00:00.000Z');
const policyRegistry = freshPolicyRegistry(now);
const account = (slot, email) => ({ id: `acct-${slot}`, slot, email, provider: 'smtp-relay', connected: true, tokens: { enc: 'x' }, plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'ref' } });
const FINAL_IDENTITY = { legalBusinessSenderName: 'Example Operating LLC', authorizedPublicPostalAddress: '100 Example Street, Suite 4, Springfield, ST 00000', footerUseAuthorized: true };
const RESOLVED = { resolved: true, operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US', resolutionRef: 'counsel-memo-ref' };
const UNSUB = { unsubscribeUrl: 'https://uberbond.example/unsubscribe?t=sig', oneClickUnsubscribeUrl: 'https://uberbond.example/unsubscribe/one-click?t=sig' };
const all = { identity: FINAL_IDENTITY, senderSide: RESOLVED, unsubscribe: UNSUB, campaign: { campaignId: 'camp_1' } };

function store(data = {}) {
  const calls = [];
  const base = { suppressions: [], prospects: [], outboundReservations: [], outboundEvents: [], replies: [], messages: [], providerEvents: [], accounts: [account('smtp-1', 'a1@send.example'), account('smtp-2', 'a2@send.example')], senderHealth: [], ...data };
  return { calls, async list(name) { calls.push(['list', name]); return structuredClone(base[name] || []); }, async add() { throw new Error('write'); }, async patch() { throw new Error('write'); }, async update() { throw new Error('write'); }, async remove() { throw new Error('write'); } };
}
const ukRecord = (over = {}) => mergeDeep(powerhouseRecord(), {
  company: 'Acme Widgets', hqCountry: 'GB',
  legalEntity: { legalName: 'Acme Widgets Ltd', companyNumber: '12345678', formText: 'Acme Widgets Ltd, registered in England and Wales, company number 12345678' },
  recipient: { email: 'info@acme-widgets.co.uk', excerpt: 'Acme Widgets Ltd - General enquiries: info@acme-widgets.co.uk.', sourceUrl: 'https://www.acme-widgets.co.uk/contact/' },
  website: 'https://www.acme-widgets.co.uk/',
  ...over
});
const stubAdapter = (result, calls = []) => createRegistryAdapterRegistry([{ registryId: 'UK_COMPANIES_HOUSE', jurisdictions: ['GB'], zeroCost: true, async resolve(q) { calls.push(q); return typeof result === 'function' ? result(q) : result; } }]);
const artifactExists = ref => ref === ARTIFACT;
const run = (patch = {}, data) => runProspectPreflight({ store: store(data), record: powerhouseRecord(), slots: SLOTS, artifactRef: ARTIFACT, artifactExists, now, policyRegistry, ...patch });

test('US corporate Powerhouse fixture still reaches READY_FOR_AUTHORIZATION through the global route with a route digest bound in; zero authority, zero effects', async () => {
  const r = await run(all);
  assert.equal(r.state, P.READY_FOR_AUTHORIZATION, JSON.stringify(r.blockerCodes));
  assert.equal(r.globalRoute.routeClass, 'US_CANSPAM_GREEN');
  assert.equal(r.effectPackage.routeBound, true);
  assert.equal(r.sendAuthority, false);
  assert.equal(r.externalEffectAuthority, 'NONE');
  assert.equal(r.oneButton.display, 'GREEN ROUTE FOUND');
  assert.equal(r.oneButton.automaticSendAuthority, false);
});

test('GB candidate with registry-verified active Ltd: global green route via the stub adapter, a registry read is reported, no governed cold envelope exists, and no send authority', async () => {
  const lookups = [];
  const r = await run({ ...all, record: ukRecord(), registryAdapters: stubAdapter(registryFound(now), lookups) });
  assert.equal(lookups.length, 1);
  assert.equal(r.registryLookups[0].status, 'FOUND');
  assert.equal(r.externalReads, 1);
  assert.equal(r.externalEffects ?? 0, 0);
  assert.equal(r.globalRoute.routeClass, 'CORPORATE_GREEN', JSON.stringify(r.blockerCodes));
  assert.equal(r.coldRoute.status, 'NO_GOVERNED_COLD_ROUTE_ENVELOPE_FOR_JURISDICTION');
  assert.equal(r.coldRoute.selfAuthorizing, false);
  assert.equal(r.sendAuthority, false);
  assert.equal(r.oneButton.activationBlocked, true);
});

test('GB without any registry adapter, or with a registry mismatch, is not green and carries no digest', async () => {
  const none = await run({ ...all, record: ukRecord() });
  assert.notEqual(none.state, P.READY_FOR_AUTHORIZATION);
  assert.equal(none.effectPackage?.finalEffectDigest ?? null, null);
  const bad = await run({ ...all, record: ukRecord(), registryAdapters: stubAdapter(registryFound(now, { name: 'Different Company Ltd', companyNumber: '99999999' })) });
  assert.notEqual(bad.state, P.READY_FOR_AUTHORIZATION);
  assert.equal(bad.effectPackage?.finalEffectDigest ?? null, null);
  const unavailable = await run({ ...all, record: ukRecord(), registryAdapters: stubAdapter(registryStatus('UNAVAILABLE')) });
  assert.notEqual(unavailable.state, P.READY_FOR_AUTHORIZATION);
});

test('a throwing registry adapter fails closed and is reported as a registry lookup, never as clearance', async () => {
  const r = await run({ ...all, record: ukRecord(), registryAdapters: stubAdapter(() => { throw new Error('boom'); }) });
  assert.notEqual(r.state, P.READY_FOR_AUTHORIZATION);
  assert.equal(r.registryLookups.length, 1);
});

test('missing or stale policy evidence is BLOCKED_POLICY_REFRESH with exact rule ids, a visible provisional class and no digest', async () => {
  const r = await run({ ...all, policyRegistry: createPolicyEvidenceRegistry({ rows: [], now }) });
  assert.equal(r.state, P.BLOCKED_POLICY_REFRESH);
  assert.ok(r.policyRefreshRequired.some(x => x.ruleId === 'recipient:US:can-spam-b2b-email'));
  assert.equal(r.effectPackage?.finalEffectDigest ?? null, null);
  assert.equal(r.oneButton.display, 'POLICY REFRESH REQUIRED');
  assert.equal(r.sendAuthority, false);
});

test('typed route states: a non-green but known route is BLOCKED_ROUTE; a suppression hit stays DO_NOT_SEND', async () => {
  const eg = await run({ ...all, record: powerhouseRecord(), policyRegistry, globalRoute: {} , senderSide: RESOLVED, store: store() , record: mergeDeep(powerhouseRecord(), { hqCountry: 'DE', recipient: { jurisdiction: 'DE' } }) });
  assert.ok([P.BLOCKED_ROUTE, P.BLOCKED_EXTERNAL_FACT, P.DO_NOT_SEND].includes(eg.state), eg.state);
  assert.notEqual(eg.state, P.READY_FOR_AUTHORIZATION);
  const supp = await run(all, { suppressions: [{ value: 'mypowerhouse.group' }] });
  assert.equal(supp.state, P.DO_NOT_SEND);
});

test('the route is bound into the effect digest: changing any bound route fact changes the digest and the verification detects it', async () => {
  const a = await run(all);
  const b = await run({ ...all, record: mergeDeep(powerhouseRecord(), { recipient: { excerpt: 'Also available to non-clients – just email hello@mypowerhouse.group for general business enquiries!' } }) });
  assert.equal(a.state, P.READY_FOR_AUTHORIZATION);
  assert.equal(b.state, P.READY_FOR_AUTHORIZATION, JSON.stringify(b.blockerCodes));
  assert.notEqual(a.effectPackage.finalEffectDigest, b.effectPackage.finalEffectDigest);
  const rebound = await run({ ...all, policyRegistry: freshPolicyRegistry(now, { override: { 'recipient:US:can-spam-b2b-email': { evidenceHash: 'a'.repeat(64) } } }) });
  assert.equal(rebound.state, P.READY_FOR_AUTHORIZATION);
  assert.notEqual(rebound.effectPackage.finalEffectDigest, a.effectPackage.finalEffectDigest, 'identical message and sender, different route policy evidence: the digest must differ');
  const again = await run(all);
  assert.equal(again.effectPackage.finalEffectDigest, a.effectPackage.finalEffectDigest, 'deterministic');
});

test('read-only: only list() on the store; registry reads are external reads, not effects', async () => {
  const s = store();
  await runProspectPreflight({ store: s, record: ukRecord(), slots: SLOTS, artifactRef: ARTIFACT, artifactExists, now, policyRegistry, registryAdapters: stubAdapter(registryFound(now)), ...all });
  assert.ok(s.calls.every(([kind]) => kind === 'list'));
});
