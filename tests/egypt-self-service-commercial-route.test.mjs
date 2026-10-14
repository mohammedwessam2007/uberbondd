import test from 'node:test';
import assert from 'node:assert/strict';
import {
 assessEgyptSelfServiceRoute as assess
} from '../src/egypt-self-service-commercial-route.mjs';
import {
 compileConsentReceipt,confirmConsentReceipt,revokeConsentReceipt
} from '../src/consent-receipt.mjs';

const at='2026-10-10T10:00:00.000Z';
const email='requester@example.com';
const secret='x'.repeat(40);
const claim=(wordingId)=>compileConsentReceipt({
 subjectEmail:email,wordingId,channel:'INBOUND_CONTENT',
 sourceRef:'unit-test-self-service',capturedAt:'2026-10-10T09:00:00.000Z',
 secret
});
const marketing=()=>{
 const init=claim('marketing-opt-in-v1');
 assert.equal(init.ok,true);
 const confirmed=confirmConsentReceipt({receipt:init.receipt,token:init.confirmationToken,
   secret,now:at});
 assert.equal(confirmed.ok,true);
 return {pending:init.receipt,active:confirmed.receipt};
};
const license={issuer:'EGYPT_PDPC',licenseClass:'EDM_FOR_SELF',
 licenseId:'synthetic-test-id',senderLegalIdentity:'Example Entity',
 issuerDocumentRef:'synthetic:official-reference-to-review',
 validFrom:'2026-01-01T00:00:00Z',validUntil:'2027-01-01T00:00:00Z'};

test('Reject unsolicited first-touch regardless of public address',()=>{
 const r=assess({purpose:'UNSOLICITED_COLD_MARKETING',recipientEmail:email,now:at});
 assert.equal(r.sendAuthority,false);
 assert.equal(r.state,'UNSOLICITED_MARKETING_NOT_SELF_SERVICE_CLEARED');
 assert.ok(r.blockers.includes('prior-explicit-marketing-consent-required'));
});
test('Requested report delivery succeeds only as source-evidence and never grants send authority',()=>{
 const receipt=claim('public-intake-v1').receipt;
 const r=assess({purpose:'INBOUND_REPORT_DELIVERY',recipientEmail:email,
  consentReceipts:[receipt],now:at});
 assert.equal(r.preliminaryEvidencePresent,true);
 assert.equal(r.state,'INBOUND_REQUEST_EVIDENCE_PRESENT');
 assert.equal(r.commercialPromotionPermitted,false);
 assert.equal(r.sendAuthority,false);
});
test('Service follow-up receipt cannot be borrowed from report delivery only',()=>{
 const r=assess({purpose:'REQUESTED_SERVICE_FOLLOW_UP',recipientEmail:email,
  consentReceipts:[claim('public-intake-v1').receipt],now:at});
 assert.equal(r.preliminaryEvidencePresent,false);
 assert.ok(r.blockers.includes('task-specific-valid-consent-evidence-required'));
});
test('Actual service follow-up opt-in supports evidence, never direct marketing authority',()=>{
 const r=assess({purpose:'REQUESTED_SERVICE_FOLLOW_UP',recipientEmail:email,
  consentReceipts:[claim('report-follow-up-v1').receipt],now:at});
 assert.equal(r.preliminaryEvidencePresent,true);
 assert.equal(r.commercialPromotionPermitted,false);
 assert.equal(r.sendAuthority,false);
});
test('Marketing pending double opt-in cannot qualify',()=>{
 const {pending}=marketing();
 const r=assess({purpose:'OPTED_IN_DIRECT_MARKETING',recipientEmail:email,
  consentReceipts:[pending],directMarketingLicense:license,now:at});
 assert.equal(r.preliminaryEvidencePresent,false);
 assert.ok(r.blockers.includes('consent-awaiting-double-opt-in-confirmation'));
});
test('Confirmed marketing opt-in without PDPC license record stays blocked',()=>{
 const {active}=marketing();
 const r=assess({purpose:'OPTED_IN_DIRECT_MARKETING',recipientEmail:email,
  consentReceipts:[active],now:at});
 assert.equal(r.preliminaryEvidencePresent,false);
 assert.ok(r.blockers.includes('egypt-pdpc-direct-marketing-authorization-evidence-required'));
});
test('Declared license cannot become authenticated legal permission by itself',()=>{
 const {active}=marketing();
 const r=assess({purpose:'OPTED_IN_DIRECT_MARKETING',recipientEmail:email,
  consentReceipts:[active],directMarketingLicense:license,
  evidenceAuthenticityVerified:true,now:at});
 assert.equal(r.preliminaryEvidencePresent,true);
 assert.equal(r.state,'OPT_IN_AND_DECLARED_LICENSE_EVIDENCE_PRESENT_NOT_SEND_READY');
 assert.equal(r.licenseAuthenticatedByThisModule,false);
 assert.equal(r.legalClearanceEstablished,false);
 assert.equal(r.sendAuthority,false);
 assert.ok(r.blockers.includes('independent-license-scope-and-sender-binding-review-required'));
});
test('Expired license evidence never enables marketing',()=>{
 const {active}=marketing();
 const r=assess({purpose:'OPTED_IN_DIRECT_MARKETING',recipientEmail:email,
  consentReceipts:[active],directMarketingLicense:{
    ...license,validUntil:'2026-10-09T09:00:00Z'},now:at});
 assert.equal(r.preliminaryEvidencePresent,false);
});
test('Recipient mismatch never borrows another persons consent',()=>{
 const r=assess({purpose:'INBOUND_REPORT_DELIVERY',
  recipientEmail:'other@example.com',consentReceipts:[claim('public-intake-v1').receipt],now:at});
 assert.equal(r.preliminaryEvidencePresent,false);
});
test('Revoked consent cannot support an approved followup',()=>{
 const receipt=claim('report-follow-up-v1').receipt;
 const revoked=revokeConsentReceipt({receipt,now:at});
 const r=assess({purpose:'REQUESTED_SERVICE_FOLLOW_UP',recipientEmail:email,
  consentReceipts:[revoked.receipt],now:'2026-10-10T10:10:00Z'});
 assert.equal(r.preliminaryEvidencePresent,false);
});
test('Invalid clock fails closed',()=>{
 for(const now of ['not-a-date',NaN,new Date(NaN)]){
  const r=assess({purpose:'INBOUND_REPORT_DELIVERY',recipientEmail:email,
    consentReceipts:[claim('public-intake-v1').receipt],now});
  assert.equal(r.state,'SELF_SERVICE_REQUIREMENTS_INCOMPLETE');
  assert.ok(r.blockers.includes('evaluation-clock-invalid'));
 }
});
test('Never performs provider calls, effects, or asserts clearance',()=>{
 const cases=[
  assess({purpose:'UNSOLICITED_COLD_MARKETING',recipientEmail:email,now:at}),
  assess({purpose:'INBOUND_REPORT_DELIVERY',recipientEmail:email,now:at}),
  assess({purpose:'OPTED_IN_DIRECT_MARKETING',recipientEmail:email,now:at})
 ];
 for(const r of cases){
  assert.equal(r.providerCalls,0);
  assert.equal(r.messagesSent,0);
  assert.equal(r.sendAuthority,false);
  assert.equal(r.legalClearanceEstablished,false);
 }
});
