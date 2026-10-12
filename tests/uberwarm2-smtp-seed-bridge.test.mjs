import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2SmtpSeedBridge } from '../src/uberwarm2-smtp-seed-bridge.mjs';
const ACCOUNT = {
  email: 'tara@example.net', sendingMailboxId: 'tara', connected: true,
  tokens: { encrypted: true },
  smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'winnr-support:authorized-test',
    host: 'smtp.test.invalid', secure: true, port: 465 }
};
const SEEDS = [{
  email: 'owned-seed@gmail.com', ownerControlled: true, receiveReady: true,
  consentToTest: true, consentEvidenceRef: 'owner-approval:1'
}];
const reservationKey = 'uberwarm2-seed:' + 'a'.repeat(64);
const PROBE = {
  from: 'tara@example.net', to: 'owned-seed@gmail.com',
  probeId: 'test-probe-1', reservationKey,
  permittedPurpose: 'OWNER_CONTROLLED_PLACEMENT_PROBE',
  subject: 'UberBond permitted mailbox delivery test',
  body: 'Owner-authorized delivery and inbox-placement test. No reply or other action is requested. Reference: test-probe-1'
};
function build(overrides = {}) {
  const calls = [];
  const bridge = createUberWarm2SmtpSeedBridge({
    account: { ...ACCOUNT, ...(overrides.account || {}) },
    allowedSeeds: overrides.allowedSeeds ?? SEEDS,
    encryptionKey: 'test-only-key',
    credentialReader: () => ({username: 'encrypted-decoded-user', password:'never-export'}),
    transportFactory: () => ({
      ok:true,
      async send(v) { calls.push(v); return {confirmed:true,messageId:v.messageId}; }
    })
  });
  return {bridge, calls};
}
test('SMTP seed bridge requires encrypted account, authorized provider route and consenting seeds', () => {
  assert.equal(build({account:{connected:false}}).bridge.ok, false);
  assert.equal(build({account:{smtpRoute:{authorized:false}}}).bridge.ok, false);
  assert.equal(build({allowedSeeds:[]}).bridge.ok, false);
  assert.equal(build({allowedSeeds:[{email:'someone@gmail.com',receiveReady:true}]}).bridge.ok,false);
});
test('SMTP seed bridge refuses recipient substitution, impersonation and non-probe payload', async () => {
  const {bridge,calls} = build();
  assert.equal(bridge.ok,true);
  assert.equal((await bridge.sendOwnedSeed({...PROBE,to:'prospect@business.com'})).ok,false);
  assert.equal((await bridge.sendOwnedSeed({...PROBE,from:'hijack@example.net'})).ok,false);
  assert.equal((await bridge.sendOwnedSeed({...PROBE,body:'Click here to buy'})).ok,false);
  assert.equal((await bridge.sendOwnedSeed({...PROBE,permittedPurpose:'CAMPAIGN'})).ok,false);
  assert.equal(calls.length,0);
});
test('SMTP seed bridge creates one authorized, correlated and transparent test submission', async () => {
  const {bridge,calls} = build();
  const r = await bridge.sendOwnedSeed(PROBE);
  assert.equal(r.ok,true);
  assert.equal(r.accepted,true);
  assert.equal(r.status,'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN');
  assert.equal(calls.length,1);
  assert.equal(calls[0].from,ACCOUNT.email);
  assert.equal(calls[0].to,SEEDS[0].email);
  assert.match(calls[0].messageId,/^<uw2-[a-f0-9]{32}@example.net>$/);
});
