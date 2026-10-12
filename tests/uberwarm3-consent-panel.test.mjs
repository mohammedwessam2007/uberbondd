import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberWarm3ConsentingPanel,compileUberWarm3PanelAssignments
} from '../src/uberwarm3-consent-panel.mjs';
const T=new Date('2026-10-12T18:00:00Z');
const participant=(id,provider,extra={})=>({
  email:id+'@example.net',provider,participantOrganizationId:'org-'+id,
  independentParticipant:true,optedIn:true,authenticatedConsentReceipt:true,
  consentEvidenceRef:'verified-consent:participant-'+id,
  allowedPurposes:['TRANSPARENT_DELIVERY_DIAGNOSTIC'],
  receiveReady:true,
  consentGrantedAt:'2026-10-01T00:00:00Z',
  consentExpiresAt:'2026-11-01T00:00:00Z',...extra
});
test('no preexisting external participants or network reputation are invented',()=>{
 const r=compileUberWarm3ConsentingPanel({records:[],now:T});
 assert.equal(r.realParticipantCount,0);
 assert.equal(r.networkCount,0);
 assert.equal(r.eligibleForTwoProviderTests,false);
 assert.equal(r.messagesSent,0);
});
test('positive engagement automation and spam rescue are refused even with consent',()=>{
 const r=compileUberWarm3ConsentingPanel({records:[
  participant('a','GOOGLE',{automaticReplyConsent:true}),
  participant('b','MICROSOFT',{autoSpamRescue:true})
 ],now:T});
 assert.equal(r.members.length,0);
 assert.equal(r.excluded.length,2);
});
test('consent expiry, withdrawn consent, missing authenticated evidence and no scope block membership',()=>{
 const r=compileUberWarm3ConsentingPanel({records:[
  participant('a','GOOGLE',{optedOut:true}),
  participant('b','GOOGLE',{consentExpiresAt:'2026-10-01T00:00:00Z'}),
  participant('c','GOOGLE',{authenticatedConsentReceipt:false}),
  participant('d','MICROSOFT',{allowedPurposes:['PROMOTIONAL_SPAM']}),
  participant('e','YAHOO',{suppressed:true})
 ],now:T});
 assert.equal(r.members.length,0);
 assert.equal(r.excluded.length,5);
});
test('two explicitly consenting independent providers become available only as a plan',()=>{
 const p=compileUberWarm3ConsentingPanel({records:[
  participant('google','GOOGLE'),participant('microsoft','MICROSOFT')
 ],now:T});
 assert.equal(p.eligibleForTwoProviderTests,true);
 const r=compileUberWarm3PanelAssignments({
   panel:p,senders:[{address:'sender@uberbond.test',authenticated:true}],now:T});
 assert.equal(r.assignments.length,2);
 assert.equal(r.assignments.every(a=>a.authority==='PLAN_ONLY'),true);
 assert.equal(r.assignments.every(a=>a.sendAuthorized===false),true);
 assert.equal(r.potentialIndependentProviderCoverage.length,2);
});
test('participant seeds are never reused across sender slots in one assignment',()=>{
 const panel=compileUberWarm3ConsentingPanel({records:[
  participant('google','GOOGLE'),participant('microsoft','MICROSOFT')
 ],now:T});
 const r=compileUberWarm3PanelAssignments({panel,senders:[
  {address:'one@uberbond.test',authenticated:true},
  {address:'two@uberbond.test',authenticated:true}
 ],now:T});
 assert.equal(r.assignments.length,2);
 assert.equal(new Set(r.assignments.map(x=>x.recipientAddress)).size,2);
});
test('seven-day cool-off is honored and quarantined senders are excluded',()=>{
 const panel=compileUberWarm3ConsentingPanel({records:[
  participant('google','GOOGLE',{lastTestAt:'2026-10-10T00:00:00Z'}),
  participant('microsoft','MICROSOFT')
 ],now:T});
 const r=compileUberWarm3PanelAssignments({panel,senders:[
  {address:'one@uberbond.test',authenticated:true,quarantined:true},
  {address:'two@uberbond.test',authenticated:true}
 ],now:T});
 assert.equal(r.assignments.length,1);
 assert.equal(r.assignments[0].recipientProvider,'MICROSOFT');
});
