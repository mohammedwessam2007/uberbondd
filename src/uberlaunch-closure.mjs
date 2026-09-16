import crypto from 'node:crypto';

export const UBERLAUNCH_CLOSURE_VERSION='uberbond.uberlaunch-closure.v1';
const clean=(v,max=2000)=>String(v??'').trim().slice(0,max);
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

export function compileUberLaunchClosure({dns={},postal={},mailCell={},prospects={},runtime={},monthlyTarget=100000,initialTranche=2000,now=new Date()}={}){
  const blockers=[];
  const ready={
    uberDns:dns?.status==='UBERDNS_APPLIED_PROVIDER_CONFIRMED'||dns?.publicVerified===true,
    uberPostal:postal?.status==='UBERPOSTAL_IDENTITY_READY',
    uberMailCell:['UBERDOSO_DNS_PUBLICATION_PACKET_READY','UBERDOSO_HOST_READY__POSTAL_BOOT_AND_DKIM_REQUIRED','CONTABO_MAIL_CELL_PTR_UPDATE_ACCEPTED'].includes(String(mailCell?.status||'')),
    uberProspect:prospects?.status==='UBERPROSPECT_PORTFOLIO_READY',
    uberRuntime:runtime?.observedHealthy===true&&Boolean(clean(runtime?.evidenceRef,1000))
  };
  if(!ready.uberDns) blockers.push('uberdns-live-public-authentication-required');
  if(!ready.uberPostal) blockers.push('uberpostal-founder-authorized-identity-required');
  if(!ready.uberMailCell) blockers.push('ubermailcell-physical-host-and-dkim-frontier-required');
  if(!ready.uberProspect) blockers.push('uberprospect-governed-inventory-required');
  if(!ready.uberRuntime) blockers.push('uberruntime-observed-healthy-receipt-required');
  const state=blockers.length?'UBERLAUNCH_WAIT_EXTERNAL_REALITY':'UBERLAUNCH_CLOSURE_READY_FOR_EXISTING_CERTIFICATE_GATE';
  const receipt={version:UBERLAUNCH_CLOSURE_VERSION,state,monthlyTarget:Number(monthlyTarget),initialTranche:Number(initialTranche),ready,blockers,compiledAt:new Date(now).toISOString(),evidenceRefs:[dns?.evidenceRef,postal?.identity?.evidenceRef,mailCell?.evidenceRef||mailCell?.receipt?.authorizationEvidenceRef,prospects?.portfolioDigest,runtime?.evidenceRef].filter(Boolean)};
  return Object.freeze({ok:blockers.length===0,status:state,receipt,receiptDigest:sha(JSON.stringify(receipt)),truthBoundary:'UberLaunch closes only the missing external-reality atoms and then hands control back to the existing per-recipient launch/certificate gates. It does not bypass warm-up, legal eligibility, suppression, provider terms, spend authority, or founder authority.'});
}
