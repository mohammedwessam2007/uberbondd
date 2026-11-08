/**
 * Egypt self-service commercial channel PREPARATION, not permission to send.
 * Uses the existing consent evidence genome; cannot defeat sender legal hold.
 * Egypt PDPL 151/2020 art 17-18 and Regulations 816/2025 art 18 require
 * applicable direct-marketing consent, records and relevant license/permit.
 * No law firm or outside counsel is intrinsically required by this module.
 * Pure, offline, zero provider calls / external effects.
 */
import { consentRelationshipFor } from './consent-receipt.mjs';

export const EGYPT_SELF_SERVICE_ROUTE_VERSION='uberbond.egypt-self-service-route.v1';
export const EGYPT_SELF_SERVICE_ROUTES=Object.freeze([
 'INBOUND_REPORT_DELIVERY','REQUESTED_SERVICE_FOLLOW_UP',
 'OPTED_IN_DIRECT_MARKETING','UNSOLICITED_COLD_MARKETING'
]);
const unresolved=(codes,extra={})=>({
 version:EGYPT_SELF_SERVICE_ROUTE_VERSION,
 preliminaryEvidencePresent:false,
 legalClearanceEstablished:false,
 sourceCodeSendAuthority:false,
 sendAuthority:false,
 providerCalls:0,messagesSent:0,paidLegalAdviceRequired:false,
 state:'SELF_SERVICE_REQUIREMENTS_INCOMPLETE',
 blockers:[...new Set(codes)],...extra
});
const str=(x,max=240)=>typeof x==='string'?x.trim().slice(0,max):'';
const isTime=(x)=>Number.isFinite(Date.parse(x));
export function assessEgyptSelfServiceRoute({
 purpose,recipientEmail,consentReceipts=[],now=new Date(),
 directMarketingLicense=null,
 evidenceAuthenticityVerified=false
}={}){
 const route=str(purpose,60);
 const at=new Date(now);
 if(!Number.isFinite(at.getTime()))return unresolved(['evaluation-clock-invalid']);
 if(!EGYPT_SELF_SERVICE_ROUTES.includes(route))
   return unresolved(['recognized-route-purpose-required']);
 if(!str(recipientEmail,320)||!String(recipientEmail).includes('@'))
   return unresolved(['recipient-email-required']);
 if(route==='UNSOLICITED_COLD_MARKETING')
   return unresolved(['prior-explicit-marketing-consent-required',
      'direct-marketing-regulatory-authorization-required'],
     {state:'UNSOLICITED_MARKETING_NOT_SELF_SERVICE_CLEARED'});
 const requestedPurpose={
  INBOUND_REPORT_DELIVERY:'REPORT_DELIVERY',
  REQUESTED_SERVICE_FOLLOW_UP:'SERVICE_FOLLOW_UP',
  OPTED_IN_DIRECT_MARKETING:'MARKETING_EMAIL'
 }[route];
 const relation=consentRelationshipFor({
  receipts:consentReceipts,recipientEmail,purpose:requestedPurpose,now:at
 });
 if(!relation.ok)return unresolved(['task-specific-valid-consent-evidence-required',
    ...(relation.reasonCodes??[])],{consentPurpose:requestedPurpose});
 if(route!=='OPTED_IN_DIRECT_MARKETING'){
  // A requested service reply is not permission for unrelated promotion.
  return {
    ...unresolved(['sender-and-provider-policy-check-still-required']),
    state:'INBOUND_REQUEST_EVIDENCE_PRESENT',
    preliminaryEvidencePresent:true,
    consentPurpose:requestedPurpose,
    relationshipEvidenceRef:relation.relationshipEvidenceRef,
    commercialPromotionPermitted:false
  };
 }
 const l=directMarketingLicense;
 const fields=l&&typeof l==='object'&&!Array.isArray(l)&&
  l.issuer==='EGYPT_PDPC'&&l.licenseClass==='EDM_FOR_SELF'&&
  str(l.licenseId,120)&&str(l.senderLegalIdentity,240)&&
  str(l.issuerDocumentRef,500)&&
  isTime(l.validFrom)&&isTime(l.validUntil)&&
  Date.parse(l.validFrom)<=at.getTime()&&
  Date.parse(l.validUntil)>at.getTime();
 if(!fields)return unresolved(['egypt-pdpc-direct-marketing-authorization-evidence-required'],
   {consentPurpose:requestedPurpose,relationshipEvidenceRef:relation.relationshipEvidenceRef});
 const blockers=evidenceAuthenticityVerified===true?
 ['independent-license-scope-and-sender-binding-review-required',
  'provider-recipient-suppression-and-current-send-gate-required']:
 ['direct-marketing-license-authenticity-not-verified'];
 return {
  ...unresolved(blockers),preliminaryEvidencePresent:true,
  state:'OPT_IN_AND_DECLARED_LICENSE_EVIDENCE_PRESENT_NOT_SEND_READY',
  consentPurpose:requestedPurpose,
  relationshipEvidenceRef:relation.relationshipEvidenceRef,
  licenseEvidenceRef:str(l.issuerDocumentRef,500),
  licenseAuthenticatedByThisModule:false
 };
}
