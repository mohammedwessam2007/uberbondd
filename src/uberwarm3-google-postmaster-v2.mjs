/**
 * Read-only Google Postmaster Tools v2 compliance adapter.
 * Official endpoint: GET /v2/domains/{domain}/complianceStatus
 * Requires separately granted Google postmaster.traffic.readonly OAuth.
 * No domain verification mutation, message send or DNS write.
 */
export const UBERWARM3_GOOGLE_POSTMASTER_V2_VERSION = 'uberbond.uberwarm3-google-postmaster-v2.v1';
const host='https://gmailpostmastertools.googleapis.com';
const domainOk=v=>typeof v==='string'&&v.length<254&&
  /^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v)&&!v.includes('..');
const c=(v,n=300)=>String(v??'').trim().slice(0,n);
const deny=(status,reasons)=>({ok:false,status,reasonCodes:reasons,providerCalls:0,externalEffectAuthority:'NONE'});
const allowedStates=new Set(['COMPLIANT','NEEDS_WORK']);
const requirements=new Set([
 'SPF','DKIM','SPF_AND_DKIM','DMARC_POLICY','DMARC_ALIGNMENT',
 'MESSAGE_FORMATTING','DNS_RECORDS','ENCRYPTION','USER_REPORTED_SPAM_RATE',
 'ONE_CLICK_UNSUBSCRIBE','HONOR_UNSUBSCRIBE'
]);
export function normalizePostmasterV2Compliance({domain,response={},observedAt=new Date(),receiptId=''}={}) {
  const normalizedDomain=c(domain,253).toLowerCase();
  if(!domainOk(normalizedDomain)||!response||typeof response!=='object'||
      response.name!==`domains/${normalizedDomain}/complianceStatus`)
    return deny('UBERWARM3_POSTMASTER_RESPONSE_REFUSED',['exact-domain-resource-mismatch']);
  const data=response.complianceData;
  if(!data||typeof data!=='object')
    return {ok:true,status:'NO_DATA',domain:normalizedDomain,checks:[],missingData:true,
      authenticatedSource:'GMAIL_POSTMASTER_V2',sourceReceipt:c(receiptId,300)||null,
      sendsPerformed:0,truthBoundary:'Postmaster API did not return compliance rows; missing is not a pass.'};
  const checks=[],seen=new Set(),errors=[];
  const rows=Array.isArray(data.rowData)?data.rowData:[];
  for(const raw of rows){
    const requirement=c(raw?.requirement,80);
    const status=c(raw?.status?.status,80);
    if(!requirements.has(requirement)||!allowedStates.has(status)||seen.has(requirement)){
      errors.push('invalid-duplicate-or-unknown-compliance-row');continue
    }
    seen.add(requirement);checks.push({requirement,status});
  }
  if(errors.length)return deny('UBERWARM3_POSTMASTER_RESPONSE_REFUSED',errors);
  const failures=checks.filter(x=>x.status==='NEEDS_WORK').map(x=>x.requirement);
  const verdict=data.deliverabilityStatusVerdict;
  const reason=c(verdict?.reason,100)||null;
  const state=c(verdict?.state?.status,100)||null;
  const timestamp=new Date(observedAt);
  if(!Number.isFinite(timestamp.getTime()))return deny('UBERWARM3_POSTMASTER_RESPONSE_REFUSED',['invalid-observation-time']);
  return Object.freeze({
    ok:true,status:failures.length?'NEEDS_WORK':checks.length?'OBSERVED_COMPLIANCE':'NO_DATA',
    domain:normalizedDomain,checks,failures,missingData:checks.length===0,
    deliverabilityVerdict:allowedStates.has(state)?state:null,
    deliverabilityReason:reason,
    lowVolumeEvidenceInsufficient:reason==='MESSAGE_VOLUME_LOW'||checks.length===0,
    observedAt:timestamp.toISOString(),
    authenticatedSource:'GMAIL_POSTMASTER_V2',
    sourceReceipt:c(receiptId,300)||null,
    inferredSpamRate: null,
    independentInboxPlacements: 0,
    sendsPerformed:0,
    truthBoundary:'Google domain-level compliance is not an exact sender inbox-placement measurement; low volume and omitted rows remain unknown.'
  });
}
export function createUberWarm3GooglePostmasterReader({
  accessToken='',authorized=false,verifiedDomains=[],fetchImpl,now=()=>new Date()
}={}) {
  const token=String(accessToken||'');
  const domains=new Set((Array.isArray(verifiedDomains)?verifiedDomains:[])
    .map(v=>c(v,253).toLowerCase()).filter(domainOk));
  const configured=authorized===true&&token.length>15&&domains.size>0&&typeof fetchImpl==='function';
  return {
    configured,version:UBERWARM3_GOOGLE_POSTMASTER_V2_VERSION,
    async readCompliance(domain) {
      const d=c(domain,253).toLowerCase();
      if(!configured)return deny('UBERWARM3_POSTMASTER_NOT_AUTHORIZED',['read-only-oauth-owner-authorization-required']);
      if(!domains.has(d))return deny('UBERWARM3_POSTMASTER_DOMAIN_DENIED',['verified-domain-allowlist-required']);
      const url=`${host}/v2/domains/${encodeURIComponent(d)}/complianceStatus`;
      let response;
      try {
        response=await fetchImpl(url,{
          method:'GET',
          headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}
        });
      }catch{return deny('UBERWARM3_POSTMASTER_READ_UNCERTAIN',['transport-error-no-result'])}
      if(response?.ok!==true)return deny('UBERWARM3_POSTMASTER_READ_DENIED',[response?.status===403?'google-permission-denied':
        response?.status===404?'verified-domain-not-found':'google-api-unavailable']);
      let data;try{data=await response.json()}catch{
        return deny('UBERWARM3_POSTMASTER_RESPONSE_REFUSED',['invalid-provider-json'])}
      return normalizePostmasterV2Compliance({
        domain:d,response:data,observedAt:now(),receiptId:`google-postmaster-v2:domain:${d}`
      });
    }
  };
}
