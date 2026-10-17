import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2LivePreflight } from '../src/uberwarm2-smtp-seed-bridge.mjs';
const at = Date.parse('2026-10-16T00:00:00.000Z');
const email = 'owned@example.net';
const base = () => ({ email, observedAt: new Date(at).toISOString(), evidenceRef: 'protected-observation:test' });
const sender = () => ({ ...base(), authenticationStatus: 'AUTHENTICATED', dnsAuthenticated: true,
  transportAuthorized: true, providerPolicyCompatible: true, paused: false, quarantined: false, placementQuarantine: false });
const seed = () => ({ ...base(), ownerControlled: true, receiveReady: true, consentToTest: true,
  withdrawn: false, suppressed: false, consentEvidenceRef: 'verified-consent:test', probeIds: ['probe-1'],
  permissionExpiresAt: new Date(at + 600000).toISOString() });
const make = extra => createUberWarm2LivePreflight({ clock: () => at, ...extra });
test('missing protected suppliers cannot clear either preflight', async () => {
  const p = make();
  assert.equal(await p.verifyCurrentSenderHealth(email, at), false);
  assert.equal(await p.verifyCurrentSeedConsent(email, 'probe-1', at), false);
});
test('current protected observations bind exact identities and probe consent', async () => {
  const p = make({ readSenderHealth: async () => [sender()], readSeedConsent: async () => [seed()] });
  assert.equal(await p.verifyCurrentSenderHealth(email, at), true);
  assert.equal(await p.verifyCurrentSeedConsent(email, 'probe-1', at), true);
  assert.equal(await p.verifyCurrentSeedConsent(email, 'probe-2', at), false);
  assert.equal(await p.verifyCurrentSenderHealth('other@example.net', at), false);
});
test('fresh supplier read observes holds and consent withdrawal without rebinding', async () => {
  const s = sender(), r = seed(); let reads = 0;
  const p = make({ readSenderHealth: async () => { reads++; return [s]; }, readSeedConsent: async () => [r] });
  assert.equal(await p.verifyCurrentSenderHealth(email, at), true);
  s.quarantined = true;
  assert.equal(await p.verifyCurrentSenderHealth(email, at), false);
  assert.equal(reads, 2);
  assert.equal(await p.verifyCurrentSeedConsent(email, 'probe-1', at), true);
  r.withdrawn = true;
  assert.equal(await p.verifyCurrentSeedConsent(email, 'probe-1', at), false);
});
test('stale, future, duplicate, missing flags and provider errors fail closed', async () => {
  for (const rows of [[{ ...sender(), observedAt: new Date(at - 300001).toISOString() }],
    [{ ...sender(), observedAt: new Date(at + 1).toISOString() }], [sender(), sender()],
    [{ ...sender(), paused: undefined }], [{ ...sender(), evidenceRef: '' }]]) {
    assert.equal(await make({ readSenderHealth: async () => rows }).verifyCurrentSenderHealth(email, at), false);
  }
  const p = make({ readSenderHealth: async () => { throw Error('private-provider-error'); } });
  assert.equal(await p.verifyCurrentSenderHealth(email, at), false);
});
test('latency, expiry, unreadable clocks and expanded freshness bounds cannot clear', async () => {
  const p = createUberWarm2LivePreflight({ clock: () => at + 600001,
    readSenderHealth: async () => [sender()], readSeedConsent: async () => [seed()] });
  assert.equal(await p.verifyCurrentSenderHealth(email, at), false);
  assert.equal(await p.verifyCurrentSeedConsent(email, 'probe-1', at), false);
  assert.equal(await make({ maxAgeMs: 300001, readSenderHealth: async () => [sender()] }).verifyCurrentSenderHealth(email, at), false);
  assert.equal(await make({ clock: () => NaN, readSenderHealth: async () => [sender()] }).verifyCurrentSenderHealth(email, at), false);
});
test('live consent expiry is checked after the supplier await, independently of observation age', async () => {
  for (const expiry of [at, at - 1, at + 50]) {
    const p = make({ clock: () => at + 100, readSeedConsent: async () => [{
      ...seed(), permissionExpiresAt: new Date(expiry).toISOString()
    }] });
    assert.equal(await p.verifyCurrentSeedConsent(email, 'probe-1', at), false);
  }
});
test('supplier getter is snapshotted once and a noncloneable proxy is denied', async () => {
  const s = sender(); let reads = 0;
  Object.defineProperty(s, 'quarantined', { enumerable: true, get() { reads++; return reads === 1; } });
  assert.equal(await make({ readSenderHealth: async () => [s] }).verifyCurrentSenderHealth(email, at), false);
  assert.equal(reads, 1);
  assert.equal(await make({ readSenderHealth: async () => [new Proxy(sender(), {})] }).verifyCurrentSenderHealth(email, at), false);
});
