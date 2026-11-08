/**
 * PR1377: zero-spend self-service outreach route evidence inventory.
 * NOT a legal opinion, license, permission bypass, approval, or send gate.
 * Uses official Egyptian PDPC guidance dated Jan 2026, see matching memo.
 * Never permits external effects, even when every field is caller-asserted true.
 */
export const EGYPT_ROUTE_SELF_SERVICE_SCHEMA='uberbond.eg.sender-route-self-service.v1';
export const EGYPT_PDPC_PUBLIC_SOURCE='https://www.pdpc.gov.eg/';
const ROUTES=['INBOUND_REQUESTED','EXISTING_CONTRACT_SERVICE_ONLY','CONSENTED_EDM','FOREIGN_CORPORATE_ROLE_NONPERSONAL','UNSOLICITED_PERSONAL'];
const TYPES=['EG','US','GB','AE','CA','OTHER','UNKNOWN'];
const assertBool=(x)=>typeof x==='boolean';
const reject=reason=>({ok:false,state:'INVALID_INPUT',reason,sendAuthority:false,
 legalClearance:false,providerCalls:0,spendingAuthorizedUsd:0,externalEffects:0});
/**
 * Natural-person personal data v. corporate role mailbox is a material scope
 * question. This INVENTORY does not pretend it has settled that question.
 */
export function evaluateEgyptSelfServiceRoute({
 route,recipientJurisdiction='UNKNOWN',edmSenderRole='SELF',
 sourceIdentityVerified=false,
 naturalPersonDataIncluded=true,
 purposeServiceOnly=false,
 requestEvidenceVerified=false,
 existingContractEvidenceVerified=false,
 explicitPriorConsentEvidenceVerified=false,
 edmForSelfPermitVerified=false,
 edmForOthersPermitVerified=false,
 outboundProviderTermsVerified=false,
 recipientLawEvidenceVerified=false,
 senderIdentityFooterVerified=false,
 freeOptOutVerified=false,
 suppressionRegisterVerified=false,
 threeYearConsentRecordKeepingVerified=false,
 personalDataScopeOfficiallyResolved=false,
 oldObservationStale=false
}={}){
 const bools=[sourceIdentityVerified,naturalPersonDataIncluded,purposeServiceOnly,
  requestEvidenceVerified,existingContractEvidenceVerified,
  explicitPriorConsentEvidenceVerified,edmForSelfPermitVerified,
  edmForOthersPermitVerified,outboundProviderTermsVerified,
  recipientLawEvidenceVerified,senderIdentityFooterVerified,
  freeOptOutVerified,suppressionRegisterVerified,
  threeYearConsentRecordKeepingVerified,personalDataScopeOfficiallyResolved,
  oldObservationStale];
 if(!ROUTES.includes(route)||!TYPES.includes(recipientJurisdiction)||
  !['SELF','OTHERS'].includes(edmSenderRole)||
  !bools.every(assertBool))
   return reject('route-jurisdiction-and-explicit-booleans-required');
 const blockers=[];
 const add=(test,code)=>{if(!test)blockers.push(code)};
 if(route==='INBOUND_REQUESTED'){
   add(requestEvidenceVerified,'AUTHENTIC_INBOUND_REQUEST_RECEIPT_NEEDED');
   add(sourceIdentityVerified,'COUNTERPARTY_IDENTITY_UNVERIFIED');
   add(purposeServiceOnly,'TRANSACTIONAL_SCOPE_MUST_NOT_BECOME_MARKETING');
   add(outboundProviderTermsVerified,'CHANNEL_TERMS_UNVERIFIED');
 }else if(route==='EXISTING_CONTRACT_SERVICE_ONLY'){
   add(existingContractEvidenceVerified,'EXISTING_CONTRACT_RECEIPT_NEEDED');
   add(sourceIdentityVerified,'COUNTERPARTY_IDENTITY_UNVERIFIED');
   add(purposeServiceOnly,'SERVICE_ONLY_NOT_PROMOTIONAL');
   add(outboundProviderTermsVerified,'CHANNEL_TERMS_UNVERIFIED');
 }else if(route==='CONSENTED_EDM'){
   add(sourceIdentityVerified,'IDENTITY_UNVERIFIED');
   add(explicitPriorConsentEvidenceVerified,'SUBJECT_EXPLICIT_PRIOR_CONSENT_MISSING');
   if(edmSenderRole==='SELF')add(edmForSelfPermitVerified,'EDM_FOR_SELF_PERMIT_NOT_VERIFIED');
   else add(edmForOthersPermitVerified,'EDM_FOR_OTHERS_PERMIT_NOT_VERIFIED');
   // The external sender may be the creator too; no third-party sender assumed.
   add(senderIdentityFooterVerified,'SENDER_IDENTITY_AND_PURPOSE_MISSING');
   add(freeOptOutVerified,'FREE_OPT_OUT_MISSING');
   add(suppressionRegisterVerified,'SUPPRESSION_LOG_MISSING');
   add(threeYearConsentRecordKeepingVerified,'THREE_YEAR_CONSENT_RECORDS_MISSING');
   add(outboundProviderTermsVerified,'CHANNEL_TERMS_UNVERIFIED');
   add(recipientLawEvidenceVerified,'RECIPIENT_RULES_UNVERIFIED');
 }else if(route==='FOREIGN_CORPORATE_ROLE_NONPERSONAL'){
   add(!naturalPersonDataIncluded,'NONPERSONAL_CORPORATE_ROLE_SCOPE_NOT_ESTABLISHED');
   add(personalDataScopeOfficiallyResolved,'SENDER_SIDE_SCOPE_NOT_OFFICIALLY_RESOLVED');
   add(sourceIdentityVerified,'ROLE_INBOX_SOURCE_UNVERIFIED');
   add(recipientJurisdiction!=='EG'&&recipientJurisdiction!=='UNKNOWN','FOREIGN_JURISDICTION_UNVERIFIED');
   add(recipientLawEvidenceVerified,'RECIPIENT_JURISDICTION_PERMISSION_UNVERIFIED');
   add(outboundProviderTermsVerified,'CHANNEL_TERMS_UNVERIFIED');
   add(senderIdentityFooterVerified,'SENDER_IDENTITY_FOOTER_UNVERIFIED');
   add(freeOptOutVerified,'FREE_OPT_OUT_UNVERIFIED');
   add(suppressionRegisterVerified,'SUPPRESSION_UNVERIFIED');
 }else{
   blockers.push('UNSOLICITED_PERSONAL_EDM_NOT_SUPPORTED_BY_THIS_ROUTE');
 }
 // A claimed date is not an independently observed page. Never approve stale.
 if(oldObservationStale)blockers.push('SAME_DAY_SOURCE_REOBSERVATION_REQUIRED');
 return {
  ok:true,schema:EGYPT_ROUTE_SELF_SERVICE_SCHEMA,route,recipientJurisdiction,edmSenderRole,
  state:blockers.length?'SELF_SERVICE_EVIDENCE_INCOMPLETE':'SELF_SERVICE_EVIDENCE_ASSEMBLED_UNAUTHENTICATED',
  blockers,
  nonmarketingServicePath:route==='INBOUND_REQUESTED'||route==='EXISTING_CONTRACT_SERVICE_ONLY',
  lawyerRequiredByThisInventory:false,
  lawyerWaiverNotARegulatoryAuthorization:true,
  regulator:'Egypt Personal Data Protection Center',
  regulatorSource:EGYPT_PDPC_PUBLIC_SOURCE,
  sendAuthority:false,legalClearance:false,providerCalls:0,
  spendingAuthorizedUsd:0,externalEffects:0,
  productionPreflightUnchanged:true,
  requiredIndependentChecks:[
   'EXAMINE_ACTUAL_SOURCE_AND_PERMISSION_DOCUMENTS',
   'CHECK_RECEIPT_AND_RELEVANT_RECIPIENT_LAW',
   'CHECK_CURRENT_EGYPTIAN_PDPC_SCOPE_AND_EDM_LICENSE_STATUS',
   'VERIFY_SOURCE_OBSERVATION_AT_SEND_TIME',
   'RUN_EXISTING_GOVERNED_PROSPECT_PREFLIGHT',
   'OBTAIN_EXACT_OWNER_AUTHORIZATION_BEFORE_ANY_SEND'
  ],
  note:'A questionnaire alone cannot authenticate consent, permits, a PDPC determination or the applicable rules. The existing send gate remains authoritative. An independently requested, strictly transactional reply is not a blanket marketing exemption.'
 };
}
