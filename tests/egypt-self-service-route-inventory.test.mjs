import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEgyptSelfServiceRoute as classify} from '../src/egypt-self-service-route-inventory.mjs';
const validInbound={route:'INBOUND_REQUESTED',recipientJurisdiction:'US',sourceIdentityVerified:true,
 purposeServiceOnly:true,requestEvidenceVerified:true,outboundProviderTermsVerified:true};
const edm={route:'CONSENTED_EDM',recipientJurisdiction:'US',sourceIdentityVerified:true,
 explicitPriorConsentEvidenceVerified:true,edmForSelfPermitVerified:true,
 senderIdentityFooterVerified:true,freeOptOutVerified:true,suppressionRegisterVerified:true,
 threeYearConsentRecordKeepingVerified:true,outboundProviderTermsVerified:true,
 recipientLawEvidenceVerified:true};
test('fully documented inbound path is only an evidence inventory, never permission',()=>{
 const x=classify(validInbound);
 assert.equal(x.ok,true);assert.equal(x.blockers.length,0);
 assert.equal(x.sendAuthority,false);assert.equal(x.legalClearance,false);
 assert.equal(x.productionPreflightUnchanged,true);
});
test('even every claimed EDM checkbox produces NO permission',()=>{
 const x=classify(edm);
 assert.equal(x.state,'SELF_SERVICE_EVIDENCE_ASSEMBLED_UNAUTHENTICATED');
 assert.equal(x.sendAuthority,false);assert.equal(x.legalClearance,false);
 assert.equal(x.lawyerRequiredByThisInventory,false);
});
test('EDM without explicit prior consent is correctly refused as ready',()=>{
 const x=classify({...edm,explicitPriorConsentEvidenceVerified:false});
 assert.ok(x.blockers.includes('SUBJECT_EXPLICIT_PRIOR_CONSENT_MISSING'));
});
test('EDM without self marketing permit is incomplete even with consent',()=>{
 const x=classify({...edm,edmForSelfPermitVerified:false});
 assert.ok(x.blockers.includes('EDM_FOR_SELF_PERMIT_NOT_VERIFIED'));
});
test('third-party EDM sender requires EDM FOR OTHERS permit, not just self permit',()=>{
 const x=classify({...edm,edmSenderRole:'OTHERS',edmForOthersPermitVerified:false});
 assert.ok(x.blockers.includes('EDM_FOR_OTHERS_PERMIT_NOT_VERIFIED'));
 assert.equal(x.sendAuthority,false);
 const y=classify({...edm,edmSenderRole:'OTHERS',edmForOthersPermitVerified:true});
 assert.equal(y.blockers.length,0);assert.equal(y.legalClearance,false);
});
test('bogus sender role is rejected',()=>{
 assert.equal(classify({...edm,edmSenderRole:'UNKNOWN'}).ok,false);
});
test('EDM missing free optout and record keeping flags',()=>{
 const x=classify({...edm,freeOptOutVerified:false,threeYearConsentRecordKeepingVerified:false});
 assert.ok(x.blockers.includes('FREE_OPT_OUT_MISSING'));
 assert.ok(x.blockers.includes('THREE_YEAR_CONSENT_RECORDS_MISSING'));
});
test('named-person contact cannot masquerade as nonpersonal corporate role',()=>{
 const x=classify({route:'FOREIGN_CORPORATE_ROLE_NONPERSONAL',recipientJurisdiction:'US',
  naturalPersonDataIncluded:true,personalDataScopeOfficiallyResolved:true});
 assert.ok(x.blockers.includes('NONPERSONAL_CORPORATE_ROLE_SCOPE_NOT_ESTABLISHED'));
});
test('generic corporate role still needs official sender-scope determination',()=>{
 const x=classify({route:'FOREIGN_CORPORATE_ROLE_NONPERSONAL',recipientJurisdiction:'US',
  naturalPersonDataIncluded:false,personalDataScopeOfficiallyResolved:false});
 assert.ok(x.blockers.includes('SENDER_SIDE_SCOPE_NOT_OFFICIALLY_RESOLVED'));
 assert.equal(x.sendAuthority,false);
});
test('even fully supported non-personal role is not an automated permission',()=>{
 const x=classify({route:'FOREIGN_CORPORATE_ROLE_NONPERSONAL',recipientJurisdiction:'US',
  naturalPersonDataIncluded:false,personalDataScopeOfficiallyResolved:true,
  sourceIdentityVerified:true,recipientLawEvidenceVerified:true,
  outboundProviderTermsVerified:true,senderIdentityFooterVerified:true,
  freeOptOutVerified:true,suppressionRegisterVerified:true});
 assert.equal(x.blockers.length,0);assert.equal(x.sendAuthority,false);
});
test('no unsolicted personal marketing bypass',()=>{
 const x=classify({route:'UNSOLICITED_PERSONAL'});
 assert.ok(x.blockers.includes('UNSOLICITED_PERSONAL_EDM_NOT_SUPPORTED_BY_THIS_ROUTE'));
});
test('time freshness remains independent of legal route',()=>{
 const x=classify({...edm,oldObservationStale:true});
 assert.ok(x.blockers.includes('SAME_DAY_SOURCE_REOBSERVATION_REQUIRED'));
});
test('unsupported jurisdiction or malformed booleans fail closed',()=>{
 assert.equal(classify({route:'spam'}).ok,false);
 assert.equal(classify({...validInbound,sourceIdentityVerified:'true'}).ok,false);
 assert.equal(classify({...validInbound,recipientJurisdiction:'MARS'}).ok,false);
});
test('no legal bypass, API calls, spending, production effect in any route',()=>{
 for(const route of ['INBOUND_REQUESTED','EXISTING_CONTRACT_SERVICE_ONLY',
  'CONSENTED_EDM','FOREIGN_CORPORATE_ROLE_NONPERSONAL','UNSOLICITED_PERSONAL']){
  const x=classify({route});
  assert.equal(x.sendAuthority,false);assert.equal(x.providerCalls,0);
  assert.equal(x.spendingAuthorizedUsd,0);assert.equal(x.externalEffects,0);
 }
});
