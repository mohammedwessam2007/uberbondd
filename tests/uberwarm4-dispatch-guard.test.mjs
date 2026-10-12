import test from 'node:test';
import assert from 'node:assert/strict';
import {compileUberWarm4ReceiverProtection} from '../src/uberwarm4-receiver-protection.mjs';
import {compileUberWarm4DispatchGuard as guard} from '../src/uberwarm4-dispatch-guard.mjs';
const NOW='2026-10-12T20:00:00Z', sender='tara@sender.example',to='test@gmail.com',provider='GOOGLE_MX';
const mailboxes=[{address:sender},{address:'nadia@sender.example'},{address:'other@else.example'}];
const verifiers={verifyAuthenticatedEvent:()=>true,verifyRecipientProviderGroup:()=>true};
function r(kind='SMTP_TEMPFAIL',overrides={}) {
 return {eventId:'e1',kind,senderEmail:sender,recipientEmail:to,recipientProviderGroup:provider,
 occurredAt:'2026-10-12T19:58:00Z',receivingEvidenceRef:'provider:smtp:auth:1',
 smtpResponseCode:'421',enhancedStatusCode:'4.7.28',...overrides};
}
function report(events=[]){return compileUberWarm4ReceiverProtection({mailboxes,events,now:NOW,...verifiers})}
const verified={
 verifyReceiverReport:async()=>true,
 verifyRecipientProviderGroup:async()=>true,
 verifyExistingColdCap:async()=>true,
 verifyDurableSuppressionApplied:async()=>true,
 lookupCurrentRecipientSuppression:async()=>({verified:true,suppressed:false,ledgerEvidenceRef:'suppression-ledger:current'}),
 verifyLegalRecipientRoute:async()=>true,
 verifyCurrentOwnerSendAuthority:async()=>true
};
const call=(receiverReport,options={})=>guard({
 receiverReport,senderEmail:sender,recipientEmail:to,recipientProviderGroup:provider,
 declaredExistingColdCap:10,now:NOW,...verified,...options
});
test('a verified clean report allows only a bounded upper-limit advisory, no authority',async()=>{
 const v=await call(report([]));
 assert.equal(v.status,'CLEAR_TO_REEVALUATE_IN_EXISTING_DISPATCH');
 assert.equal(v.recommendedMaximumFirstTouches,10);
 assert.equal(v.dispatchAuthority,'NONE');
 assert.equal(v.messagesSent,0);
});
test('throttle on first sender blocks another sender of same domain to same provider',async()=>{
 const protectedReport=report([r()]);
 const v=await call(protectedReport,{senderEmail:'nadia@sender.example'});
 assert.equal(v.status,'HOLD');
 assert.equal(v.recommendedMaximumFirstTouches,0);
 assert.equal(v.affectedProvider,'GOOGLE_MX');
});
test('a Gmail throttle cannot be bypassed by relabeling recipient as Microsoft',async()=>{
 const v=await call(report([r()]),{
  recipientProviderGroup:'MICROSOFT_MX',verifyRecipientProviderGroup:async()=>false});
 assert.equal(v.status,'DENIED');
 assert.ok(v.reasonCodes.includes('recipient-mx-group-unverified'));
});
test('stale or forged receiver reports do not unlock cap',async()=>{
 const clean=report([]);
 assert.equal((await call({...clean,generatedAt:'2026-10-12T19:30:00Z'})).status,'DENIED');
 assert.equal((await call(clean,{verifyReceiverReport:async()=>false})).status,'DENIED');
});
test('a recipient permanently bounced by one sender is denied to the whole sending fleet',async()=>{
 const permanent=report([r('SMTP_PERMFAIL',{smtpResponseCode:'550',enhancedStatusCode:'5.1.1'})]);
 const v=await call(permanent,{senderEmail:'nadia@sender.example',verifyDurableNoRetryApplied:async()=>true});
 assert.equal(v.status,'DENIED');
 assert.ok(v.reasonCodes.includes('recipient-hard-bounced-unsubscribed-or-complained'));
});
test('missing durable reconciliation blocks all attempts after any suppression notice',async()=>{
 const p=report([r('UNSUBSCRIBE')]);
 const v=await call(p,{recipientEmail:'fresh@gmail.com',verifyDurableSuppressionApplied:async()=>false});
 assert.equal(v.status,'DENIED');
 assert.ok(v.reasonCodes.includes('global-feedback-suppression-not-durably-reconciled'));
});
test('current external suppression list cannot be replaced by a clean seed report',async()=>{
 const v=await call(report([]),{lookupCurrentRecipientSuppression:async()=>({
   verified:true,suppressed:true,ledgerEvidenceRef:'actual:suppression:1'
 })});
 assert.equal(v.status,'DENIED');
});
test('no legal permission, no owner approval or no actual capacity means no advisory',async()=>{
 const v=await call(report([]),{
   verifyLegalRecipientRoute:async()=>false,
   verifyCurrentOwnerSendAuthority:async()=>false,
   verifyExistingColdCap:async()=>false
 });
 assert.equal(v.status,'DENIED');
 assert.equal(v.recommendedMaximumFirstTouches,0);
 assert.equal(v.reasonCodes.length,3);
});
test('missing/throwing trusted callbacks fail closed',async()=>{
 const v=await call(report([]),{
   lookupCurrentRecipientSuppression:async()=>{throw Error('down')},
   verifyLegalRecipientRoute:undefined
 });
 assert.equal(v.status,'DENIED');
 assert.equal(v.dispatchAuthority,'NONE');
});
test('stale authority or a huge caller-supplied cap cannot inflate the capped advisory',async()=>{
 const v=await call(report([]),{declaredExistingColdCap:5000});
 assert.equal(v.status,'CLEAR_TO_REEVALUATE_IN_EXISTING_DISPATCH');
 assert.equal(v.recommendedMaximumFirstTouches,20);
 assert.equal(v.dispatchAuthority,'NONE');
});

test('permanent authentication failure does not poison recipient but blocks pending message replay',async()=>{
  const protectedReport=report([{
    ...r('SMTP_PERMFAIL',{smtpResponseCode:'550',enhancedStatusCode:'5.7.26'}), eventId:'blocked-message-a'
  }]);
  assert.equal(protectedReport.suppressionActions.length,0);
  assert.equal(protectedReport.messageNoRetryActions.length,1);
  const v=await call(protectedReport,{senderEmail:'nadia@sender.example',
    verifyDurableNoRetryApplied:async()=>false});
  assert.equal(v.status,'HOLD');
  assert.equal(v.dispatchAuthority,'NONE');
});
test('permanent non-address 5xx must be reconciled before another sender can proceed',async()=>{
  const p=report([r('SMTP_PERMFAIL',{smtpResponseCode:'550',
    enhancedStatusCode:'5.5.0'})]);
  const result=await call(p,{senderEmail:'nadia@sender.example'});
  assert.equal(result.status,'DENIED');
  assert.ok(result.reasonCodes.includes('permanent-message-no-retry-ledger-not-durable'));
  const ready=await call(p,{senderEmail:'nadia@sender.example',
    verifyDurableNoRetryApplied:async()=>true});
  assert.equal(ready.status,'CLEAR_TO_REEVALUATE_IN_EXISTING_DISPATCH');
});
