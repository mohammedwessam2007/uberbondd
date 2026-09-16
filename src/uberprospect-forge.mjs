import crypto from 'node:crypto';

export const UBERPROSPECT_VERSION='uberbond.uberprospect.v1.1';
const clean=(v,max=2000)=>String(v??'').trim().slice(0,max);
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
export const UBERPROSPECT_OFFERS=Object.freeze([
  'LEAD_TO_BOOKING_LEAK_AUDIT',
  'AI_AGENT_RELEASE_GATE',
  'CLIENT_ROI_PROOF_SPRINT',
  'BILINGUAL_BOOKING_LEAK_AUDIT'
]);

export function compileUberProspectPortfolio({records=[],target=2000,perOfferTarget=500,now=new Date()}={}){
  const accepted=[]; const rejected=[]; const seen=new Set();
  for(const row of records||[]){
    const email=clean(row?.email,320).toLowerCase();
    const website=clean(row?.website,1000);
    const sourceUrl=clean(row?.sourceUrl,1000);
    const evidenceRef=clean(row?.evidenceRef||row?.verificationEvidenceRef,1200);
    const key=email||website;
    const reasons=[];
    if(!key) reasons.push('reachable-endpoint-required');
    if(!sourceUrl&&!evidenceRef) reasons.push('public-source-or-verification-evidence-required');
    if(row?.suppressed===true||row?.unsubscribed===true) reasons.push('suppressed-recipient');
    if(row?.safeForOutreach!==true) reasons.push('safe-for-outreach-required');
    if(row?.legalEligible!==true) reasons.push('legal-eligibility-required');
    if(key&&seen.has(key)) reasons.push('duplicate-recipient');
    if(reasons.length){ rejected.push({key:key||null,reasons}); continue; }
    seen.add(key);
    const offerId=UBERPROSPECT_OFFERS[accepted.length%UBERPROSPECT_OFFERS.length];
    accepted.push({recipientId:clean(row?.recipientId||`prospect_${sha(key).slice(0,20)}`,120),company:clean(row?.company,240),email:email||null,website:website||null,sourceUrl:sourceUrl||null,evidenceRef:evidenceRef||sourceUrl,offerId,safeForOutreach:true,legalEligible:true,suppressed:false,compiledAt:new Date(now).toISOString()});
    if(accepted.length>=target) break;
  }
  const laneCounts=Object.fromEntries(UBERPROSPECT_OFFERS.map(id=>[id,accepted.filter(x=>x.offerId===id).length]));
  const blockers=[];
  if(accepted.length<target) blockers.push('insufficient-governed-prospect-inventory');
  for(const id of UBERPROSPECT_OFFERS) if(laneCounts[id]<perOfferTarget) blockers.push(`${id.toLowerCase()}-inventory-shortfall`);
  return Object.freeze({ok:blockers.length===0,status:blockers.length?'UBERPROSPECT_WAIT_INVENTORY':'UBERPROSPECT_PORTFOLIO_READY',version:UBERPROSPECT_VERSION,target,perOfferTarget,acceptedCount:accepted.length,rejectedCount:rejected.length,laneCounts,blockers,records:accepted,portfolioDigest:sha(JSON.stringify(accepted.map(x=>({recipientId:x.recipientId,offerId:x.offerId,evidenceRef:x.evidenceRef})))),truthBoundary:'UberProspect builds only from supplied public/evidence-backed, legally eligible, unsuppressed, safe-for-outreach records. It never invents email addresses, consent, legal eligibility, or source evidence.'});
}
