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
  assert.equal(r.providerCallAttempted,true);
  assert.equal(r.effectBoundaryCrossed,true);
  assert.equal(JSON.stringify(r).includes('secret'),false);
});
test('SMTP transport setup rejection is explicit proof the provider boundary was not crossed',async()=>{
  let sends=0;
  const r=await dispatchSmtpFleetAccount({
    account:built().account,encryptionKey:KEY,message:{to:'b@example.com'},
    transportFactory:()=>({ok:false,reasonCodes:['smtp-route-not-ready'],send:async()=>{sends++;}})
  });
  assert.equal(r.classification,'REJECTED');
  assert.equal(r.providerCallAttempted,false);
  assert.equal(r.effectBoundaryCrossed,false);
  assert.equal(sends,0);
});
test('SMTP response without a provider receipt does not prove the effect boundary',async()=>{
  const r=await dispatchSmtpFleetAccount({
    account:built().account,encryptionKey:KEY,message:{to:'b@example.com'},
    transportFactory:()=>({ok:true,send:async()=>({confirmed:false,messageId:'<unknown@x>'})})
  });
  assert.equal(r.classification,'UNCERTAIN');
  assert.equal(r.providerCallAttempted,null);
  assert.equal(r.effectBoundaryCrossed,null);
});

test('SMTP pre-network throw cannot manufacture a crossed provider boundary',async()=>{
  const r=await dispatchSmtpFleetAccount({account:built().account,encryptionKey:KEY,message:{to:'b@example.com'},
    transportFactory:()=>({ok:true,send:async()=>{throw new Error('invalid MIME before network');}})});
  assert.equal(r.classification,'UNCERTAIN');
  assert.equal(r.providerCallAttempted,null);
  assert.equal(r.effectBoundaryCrossed,null);
});
