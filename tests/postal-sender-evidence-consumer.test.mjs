import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPostalSenderEvidence,
  consumePostalSenderEvidence
} from '../src/omnia-v9/integrations/providers/postal-sender-evidence-consumer.mjs';

function dnsEvent(overrides={}) {
  return {
    provider:'postal',
    authenticated:true,
    quarantineReason:null,
    eligibleForSenderEvidence:true,
    eligibleForReconciliation:false,
    lifecycle:'DNS_ERROR',
    domain:'outreach.example.test',
    occurrenceKey:'postal:dns-1',
    occurredAt:'2026-09-02T00:00:00.000Z',
    provenance:'AUTHENTICATED_POSTAL_WEBHOOK',
    dns:{spfStatus:'OK',dkimStatus:'INVALID',mxStatus:'MISSING',returnPathStatus:'OK',dkimErrorDigest:'d'.repeat(64)},
    ...overrides
  };
}

function memoryStore(accounts=[]) {
  const events=[];
  const pauses=[];
  return {
    events, pauses,
    async list(key){ assert.equal(key,'accounts'); return accounts; },
    async recordOutboundEvent(event){ events.push(structuredClone(event)); return {paused:false}; },
    async setSenderPaused(inbox,paused,reason){ pauses.push({inbox,paused,reason}); return {inbox,paused,pauseReason:reason}; }
  };
}

test('only authenticated quarantined-free DNS sender evidence is admissible',()=>{
  assert.equal(classifyPostalSenderEvidence(dnsEvent()).ok,true);
  assert.equal(classifyPostalSenderEvidence(dnsEvent({authenticated:false})).ok,false);
  assert.equal(classifyPostalSenderEvidence(dnsEvent({quarantineReason:'MALFORMED'})).ok,false);
  assert.equal(classifyPostalSenderEvidence(dnsEvent({eligibleForSenderEvidence:false})).ok,false);
  assert.equal(classifyPostalSenderEvidence(dnsEvent({eligibleForReconciliation:true})).ok,false);
  assert.equal(classifyPostalSenderEvidence(dnsEvent({lifecycle:'SENT'})).ok,false);
});

test('matching connected sender slots are paused using the canonical sender-health API',async()=>{
  const store=memoryStore([
    {slot:'A',email:'hello@outreach.example.test',connected:true},
    {slot:'B',email:'ops@other.example.test',connected:true},
    {slot:'C',email:'cold@outreach.example.test',connected:false}
  ]);
  const result=await consumePostalSenderEvidence({event:dnsEvent(),store});
  assert.equal(result.ok,true);
  assert.deepEqual(result.pausedInboxes,['A']);
  assert.deepEqual(store.pauses,[{inbox:'A',paused:true,reason:'postal-domain-dns-error'}]);
  assert.equal(store.events.length,1);
  assert.equal(store.events[0].eventType,'sender_dns_error');
  assert.equal(store.events[0].detail.domain,'outreach.example.test');
  assert.equal(store.events[0].detail.dns.dkimErrorDigest,'d'.repeat(64));
  assert.equal(Object.hasOwn(store.events[0].detail,'rawBody'),false);
});

test('negative sender evidence never manufactures readiness or unpauses a sender',async()=>{
  const store=memoryStore([{slot:'A',domain:'outreach.example.test',connected:true}]);
  await consumePostalSenderEvidence({event:dnsEvent({dns:{spfStatus:'OK',dkimStatus:'OK',mxStatus:'OK',returnPathStatus:'OK'}}),store});
  assert.equal(store.pauses.length,1);
  assert.equal(store.pauses[0].paused,true);
  assert.equal(store.pauses.some(item=>item.paused===false),false);
});

test('unmatched authenticated DNS evidence causes no sender mutation',async()=>{
  const store=memoryStore([{slot:'A',email:'hello@different.example',connected:true}]);
  const result=await consumePostalSenderEvidence({event:dnsEvent(),store});
  assert.equal(result.status,'NO_MATCHING_SENDER');
  assert.deepEqual(store.events,[]);
  assert.deepEqual(store.pauses,[]);
});

test('message lifecycle evidence cannot reach the sender-health mutation path',async()=>{
  const store=memoryStore([{slot:'A',email:'hello@outreach.example.test',connected:true}]);
  const result=await consumePostalSenderEvidence({event:dnsEvent({eligibleForSenderEvidence:false,eligibleForReconciliation:true,lifecycle:'BOUNCED'}),store});
  assert.equal(result.ok,false);
  assert.deepEqual(store.events,[]);
  assert.deepEqual(store.pauses,[]);
});
