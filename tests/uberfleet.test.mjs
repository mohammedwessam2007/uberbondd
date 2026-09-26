import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEncryptedSmtpAccount, openSmtpAccountCredential, selectFleetMailbox, dispatchSmtpFleetAccount } from '../src/uberfleet.mjs';

const KEY='a'.repeat(64);
function built(slot='s1',email='a@example.com'){
  return buildEncryptedSmtpAccount({
    slot,email,host:'smtp.example.com',username:email,password:'secret',
    sendingDomainId:'d1',sendingMailboxId:'m1',sendingWorkspaceId:'w1',
    routeEvidenceRef:'receipt:r1',routeAuthorized:true,termsCompatible:true
  },KEY);
}
test('SMTP mailbox credentials persist encrypted and are recoverable only with the key',()=>{
  const r=built();
  assert.equal(r.ok,true);
  assert.equal(JSON.stringify(r.account).includes('secret'),false);
  assert.equal(openSmtpAccountCredential(r.account,KEY).password,'secret');
  assert.throws(()=>openSmtpAccountCredential(r.account,'b'.repeat(64)));
});
test('fleet allocation preserves a healthy sticky sender',()=>{
  const a=built('s1','a@example.com').account;
  const b=built('s2','b@example.com').account;
  const r=selectFleetMailbox({prospectId:'p1',currentSlot:'s2',accounts:[a,b],provider:'smtp-relay'});
  assert.equal(r.ok,true); assert.equal(r.slot,'s2');
});
test('fleet allocation avoids paused senders and balances observed usage',()=>{
  const a={...built('s1','a@example.com').account,currentDailyCap:10};
  const b={...built('s2','b@example.com').account,currentDailyCap:10};
  const r=selectFleetMailbox({
    prospectId:'p1',accounts:[a,b],provider:'smtp-relay',
    senderHealth:[{inbox:'s1',paused:true}],
    outboundEvents:[{inbox:'s2',eventType:'sent',occurredAt:'2026-09-26T10:00:00Z'}],
    date:new Date('2026-09-26T12:00:00Z')
  });
  assert.equal(r.slot,'s2');
});
test('SMTP dispatch maps confirmed provider receipt without exposing password',async()=>{
  const account=built().account;
  const r=await dispatchSmtpFleetAccount({
    account,encryptionKey:KEY,message:{to:'b@example.com',subject:'x',body:'y'},
    transportFactory:()=>({ok:true,send:async()=>({confirmed:true,providerReceiptId:'smtp250:abc',messageId:'<m@x>'})})
  });
  assert.equal(r.classification,'ACCEPTED');
  assert.equal(r.providerReferenceId,'smtp250:abc');
  assert.equal(JSON.stringify(r).includes('secret'),false);
});
