import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileUberWarm2SovereignLiveObservation as inspect} from '../src/uberwarm2-sovereign-live-observer.mjs';
import {compileOperationalSnapshot} from '../src/uberwarm2-operational-journal.mjs';
const domains = [{domain:'founder.example',dns_status:'complete'}];
const fleet = Array.from({length:53},(_,i)=>({username:`mail${i}`,domain:'founder.example',status:'active'}));

test('53 observed provider active accounts engage free UberWarm math but never become eligible senders',()=>{
  const r=inspect({mailboxes:fleet,domains,now:'2026-10-18T19:40:00Z'});
  assert.equal(r.status,'SOVEREIGN_CONTROL_MONITORING_ACTIVE');
  assert.equal(r.fleetMailboxes,53); assert.equal(r.providerReportedActive,53);
  assert.equal(r.providerDnsReadyDomains,1); assert.equal(r.providerDnsUnreadyDomains,0);
  assert.equal(r.states.BLOCKED,53); assert.equal(r.recommendedColdDailyCap,0);
  assert.equal(r.admittedToSend,0); assert.equal(r.inboxPlacements,0);
  assert.equal(r.messagesSent,0); assert.equal(r.spendCents,0);
  assert.equal(r.monitoringActive,true); assert.equal(r.sendingActive,false);
  assert.equal(JSON.stringify(r).includes('mail0@'),false);
  assert.equal(r.providerWarmupAddonRequired,false);
});
test('empty, incomplete, invalid inventory cannot imply warming active',()=>{
  for (const data of [undefined,{}, {mailboxes:[],domains}, {mailboxes:fleet,domains:[]},
    {mailboxes:fleet,domains,now:'invalid'}]) {
    const r=inspect(data);
    assert.equal(r.monitoringActive,false); assert.equal(r.admittedToSend,0);
  }
});
test('duplicate and wrong-domain rows cause hold, never extra capacity',()=>{
  const rows=[fleet[0],{...fleet[0],status:'active'}, {username:'pwn',domain:'alien.example',status:'active'}];
  const r=inspect({mailboxes:rows,domains});
  assert.equal(r.status,'SOVEREIGN_CONTROL_IDENTITY_HOLD');
  assert.equal(r.duplicateIdentity,1); assert.equal(r.unverifiedMailboxIdentity,1);
  assert.equal(r.states.BLOCKED,1); assert.equal(r.admittedToSend,0);
});
test('paused mailbox stays held; provider status cannot assert health or consent',()=>{
  const r=inspect({mailboxes:[{...fleet[0],status:'paused',signed:true,consentToTest:true}],domains});
  assert.equal(r.states.QUARANTINED,1); assert.equal(r.admittedToSend,0);
});
test('operational journal only persists redacted aggregate control state',()=>{
  const r=inspect({mailboxes:fleet,domains});
  const snap=compileOperationalSnapshot({source:'a'.repeat(40),observedAt:new Date().toISOString(),
    sends:0,runtimeReady:false,sendAuthority:'NONE',status:'BLOCKED_FOR_SENDING',
    provider:{sovereignControl:{...r,email:'private@example.com',token:'secret'}}});
  assert.equal(snap.sovereignControl.fleetMailboxes,53);
  assert.equal(snap.sovereignControl.admittedToSend,0);
  assert.equal(snap.sovereignControl.sendingActive,false);
  assert.equal(JSON.stringify(snap).includes('secret'),false);
  assert.equal(JSON.stringify(snap).includes('private@example.com'),false);
});
test('Docker production image includes new sovereign module and its pure reputation compiler',()=>{
  const s=readFileSync(new URL('../Dockerfile.uberwarm-read-monitor',import.meta.url),'utf8');
  assert.match(s,/COPY src\/uberwarm-reputation-lab\.mjs src\/uberwarm2-sovereign-live-observer\.mjs/);
});

test('missing, stale, or negative vendor DNS status quarantines rather than admitting Active mailboxes', () => {
  for (const dns_status of [undefined, null, '', 'pending', 'failed', 'mismatch']) {
    const r = inspect({mailboxes:fleet,domains:[{domain:'founder.example',dns_status}]});
    assert.equal(r.status,'SOVEREIGN_CONTROL_PROVIDER_DNS_HOLD');
    assert.equal(r.providerReportedActive,53);
    assert.equal(r.providerDnsReadyDomains,0);
    assert.equal(r.providerDnsUnreadyDomains,1);
    assert.equal(r.mailboxesWithProviderDnsHold,53);
    assert.equal(r.states.QUARANTINED,53);
    assert.equal(r.admittedToSend,0);
    assert.equal(r.messagesSent,0);
  }
});

test('independently reported domain DNS risk holds only its fleet and never proves DKIM alignment', () => {
  const observation = inspect({
    mailboxes:[fleet[0],{username:'other',domain:'uncertain.example',status:'active'}],
    domains:[...domains,{domain:'uncertain.example',status:'complete',dns_status:'pending'}]
  });
  assert.equal(observation.providerDnsReadyDomains,1);
  assert.equal(observation.providerDnsUnreadyDomains,1);
  assert.equal(observation.mailboxesWithProviderDnsHold,1);
  assert.equal(observation.states.BLOCKED,1);
  assert.equal(observation.states.QUARANTINED,1);
  assert.equal(observation.recommendedColdDailyCap,0);
  assert.equal(observation.admittedToSend,0);
  const stored = compileOperationalSnapshot({source:'a'.repeat(40),observedAt:new Date().toISOString(),
    sends:0,runtimeReady:false,sendAuthority:'NONE',status:'BLOCKED_FOR_SENDING',
    provider:{sovereignControl:observation}});
  assert.equal(stored.sovereignControl.status,'SOVEREIGN_CONTROL_PROVIDER_DNS_HOLD');
  assert.equal(stored.sovereignControl.mailboxesWithProviderDnsHold,1);
  assert.equal(stored.sovereignControl.sendingActive,false);
  assert.equal(JSON.stringify(stored).includes('other@uncertain.example'),false);
});
