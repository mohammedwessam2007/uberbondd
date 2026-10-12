import test from 'node:test';
import assert from 'node:assert/strict';
import {compileUberWarm4ReceiverProtection as compile} from '../src/uberwarm4-receiver-protection.mjs';
const T='2026-10-12T20:00:00Z';
const mailboxes=[
  {address:'tara@sender.example'},
  {address:'nadia@sender.example'},
  {address:'partner@other.example'}
];
function receipt(kind='SMTP_TEMPFAIL',patch={}){
  return {eventId:'event-g-1',kind,senderEmail:'tara@sender.example',
    recipientEmail:'consenting@gmail.com',
    recipientProviderGroup:'GOOGLE_MX',
    occurredAt:'2026-10-12T19:58:00Z',
    receivingEvidenceRef:'trusted:smtp-receipt:1',
    smtpResponseCode:'421',enhancedStatusCode:'4.7.28',...patch};
}
const verified={verifyAuthenticatedEvent:()=>true,verifyRecipientProviderGroup:()=>true,verifyCompleteIncidentLedger:()=>true};
const run=(events,opts={})=>compile({mailboxes,events,now:T,...verified,...opts});
test('no evidence never implies a healthy or authorized fleet',()=>{
  const r=run([]);
  assert.equal(r.status,'OBSERVED_RECEIVER_FEEDBACK_COMPILED');
  assert.equal(r.acceptedEvidenceCount,0);
  assert.equal(r.coldSendAuthority,false);
  assert.equal(r.decisions.every(x=>x.coldSendAuthority===false),true);
});
test('one real Google 4.7.28 holds shared sender domain/recipient MX cohort',()=>{
  const r=run([receipt()]);
  assert.equal(r.acceptedEvidenceCount,1);
  assert.equal(r.blockedProviderGroups.length,2);
  const senderHold=r.blockedProviderGroups.find(x=>x.domain==='sender.example');
  assert.equal(senderHold.state,'HOLD');
  assert.equal(senderHold.recipientProviderGroup,'GOOGLE_MX');
  assert.equal(senderHold.reviewNotBefore,'2026-10-12T20:08:00.000Z');
  assert.equal(senderHold.automaticallyResumed,false);
  assert.equal(senderHold.permittedColdSendCap,0);
  assert.equal(r.blockedProviderGroups.some(x=>x.domain==='other.example'),true);
});
test('unknown external proof or spoofed MX provider produces no throttle authority',()=>{
  const r=compile({mailboxes,events:[receipt()],
    now:T,verifyAuthenticatedEvent:()=>false,verifyRecipientProviderGroup:()=>true,verifyCompleteIncidentLedger:()=>true});
  assert.equal(r.acceptedEvidenceCount,0);
  assert.equal(r.blockedProviderGroups.length,0);
  assert.ok(r.excludedEvidence[0].reasons.includes('trusted-receipt-authentication-required'));
  const s=run([receipt()],{verifyRecipientProviderGroup:()=>false});
  assert.equal(s.acceptedEvidenceCount,0);
});
test('a 5xx hard rejection preserves a specific no-retry suppression action',()=>{
  const r=run([receipt('SMTP_PERMFAIL',{smtpResponseCode:'550',enhancedStatusCode:'5.1.1'})]);
  assert.equal(r.suppressionActions.length,1);
  assert.equal(r.suppressionActions[0].recipientEmail,'consenting@gmail.com');
  assert.equal(r.suppressionActions[0].requiresDurableSuppression,true);
  assert.equal(r.blockedProviderGroups.length,0);
});
test('user spam complaint quarantines sender and provider, with recipient suppression',()=>{
  const r=run([receipt('USER_COMPLAINT')]);
  assert.equal(r.blockedProviderGroups[0].state,'QUARANTINE');
  assert.equal(r.decisions.find(m=>m.senderEmail==='tara@sender.example').state,'QUARANTINE');
  assert.equal(r.suppressionActions.length,1);
});
test('unsubscribe suppresses contact but does not pretend whole provider is bad',()=>{
  const r=run([receipt('UNSUBSCRIBE')]);
  assert.equal(r.suppressionActions[0].reasonCode,'confirmed-unsubscribe');
  assert.equal(r.blockedProviderGroups.length,0);
});
test('SMTP 5.7.26 auth rejection quarantines even if only one mailbox reports it',()=>{
  const r=run([receipt('SMTP_PERMFAIL',{smtpResponseCode:'550',enhancedStatusCode:'5.7.26'})]);
  assert.equal(r.blockedProviderGroups[0].state,'QUARANTINE');
  assert.equal(r.decisions.find(x=>x.senderEmail==='tara@sender.example').state,'QUARANTINE');
});
test('recovery receipt without verified authenticated matching incident never auto-clears',()=>{
  const first=receipt();
  const second=receipt('RECOVERY_VERIFIED',{
    eventId:'recovery-1',occurredAt:'2026-10-12T19:59:30Z',
    recoveryOfEventId:'event-g-1'
  });
  const noClear=run([first,second]);
  assert.equal(noClear.blockedProviderGroups[0].state,'HOLD');
  assert.equal(noClear.blockedProviderGroups.find(x=>x.domain==='sender.example').unresolvedIncidentIds.length,1);
  const verifiedRecovery=run([first,second],{verifyRecoveredCondition:()=>true});
  const sourceGroup=verifiedRecovery.blockedProviderGroups.find(x=>x.domain==='sender.example');
  assert.equal(sourceGroup.automaticallyResumed,false);
  assert.equal(sourceGroup.permittedColdSendCap,0);
  assert.equal(sourceGroup.recoveredEvidenceRequiresNewApproval,true);
  assert.equal(sourceGroup.unresolvedIncidentIds.length,0);
});
test('self-reported and replayed same event IDs cannot inflate evidence',()=>{
  const r=run([receipt(),receipt('SMTP_TEMPFAIL',{smtpResponseCode:'421'})]);
  assert.equal(r.acceptedEvidenceCount,1);
  assert.equal(r.excludedEvidence.length,1);
  assert.ok(r.excludedEvidence[0].reasons.includes('duplicate-or-missing-event-id'));
});
test('stale event, unrecognized kind and sender not in fleet are rejected',()=>{
  const r=run([
    receipt('SMTP_TEMPFAIL',{eventId:'old',occurredAt:'2026-09-01T00:00:00Z'}),
    receipt('CLICK',{eventId:'fake'}),
    receipt('SMTP_TEMPFAIL',{eventId:'stranger',senderEmail:'stranger@outside.example'})
  ]);
  assert.equal(r.acceptedEvidenceCount,0);
  assert.equal(r.excludedEvidence.length,3);
});
test('temporary failure with forged 5xx status is rejected',()=>{
  const r=run([receipt('SMTP_TEMPFAIL',{smtpResponseCode:'550'})]);
  assert.equal(r.acceptedEvidenceCount,0);
  assert.ok(r.excludedEvidence[0].reasons.includes('temporary-smtp-4xx-evidence-required'));
});
test('the receiver layer never sends, activates warming or buys add-ons',()=>{
  const r=run([receipt()]);
  assert.equal(r.sendsPerformed,0);
  assert.equal(r.effectsPerformed,0);
  assert.equal(r.paidWarmingAddedCents,0);
  assert.equal(r.coldSendAuthority,false);
});

test('authentication 5.7.26 is a domain failure, not proof recipient address is invalid',()=>{
  const r=run([receipt('SMTP_PERMFAIL',{smtpResponseCode:'550',enhancedStatusCode:'5.7.26'})]);
  assert.equal(r.blockedProviderGroups[0].state,'QUARANTINE');
  assert.equal(r.suppressionActions.length,0);
  assert.equal(r.messageNoRetryActions.length,1);
  assert.equal(r.messageNoRetryActions[0].requiresDurableNoRetryRecord,true);
});
test('ordinary mailbox-not-found 5xx both suppresses and blocks retransmission',()=>{
  const r=run([receipt('SMTP_PERMFAIL',{smtpResponseCode:'550',enhancedStatusCode:'5.1.1'})]);
  assert.equal(r.suppressionActions[0].reasonCode,'verified-invalid-or-disabled-recipient');
  assert.equal(r.messageNoRetryActions.length,1);
});

test('a clean-looking window without durable incident ledger proof is refused',()=>{
 const r=compile({mailboxes,events:[],now:T,
   verifyAuthenticatedEvent:()=>true,verifyRecipientProviderGroup:()=>true});
 assert.equal(r.status,'REFUSED');
 assert.ok(r.reasonCodes.includes('complete-durable-incident-ledger-required'));
 assert.equal(r.coldSendAuthority,false);
});

test('a Google shared-quota event holds other sender domains rather than evading by rotation',()=>{
 const r=run([receipt()]);
 assert.ok(r.blockedProviderGroups.some(x=>x.domain==='other.example'&&x.state==='HOLD'));
 assert.equal(r.blockedProviderGroups.every(x=>x.recipientProviderGroup==='GOOGLE_MX'),true);
});
