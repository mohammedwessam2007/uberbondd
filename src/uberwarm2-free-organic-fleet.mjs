/**
 * UberWarm free organic fleet: admission and pacing for REAL eligible mail.
 * Reuses paid-for Winnr transport without enabling its $0.60/mailbox warmer.
 * Pure and effect-free. A dispatch adapter MUST independently recheck its
 * recipient, sender-health, suppression and scoped owner authority before send.
 * This module never simulates replies, opens, engagement, or Inbox placement.
 */
export const FREE_ORGANIC_FLEET_VERSION='uberbond.uberwarm2-free-organic-fleet.v1';
const EMAIL=/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const iso=x=>{if(typeof x!=='string')return null;const n=Date.parse(x);return Number.isFinite(n)&&new Date(n).toISOString()===x?n:null;};
const nInt=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const unique=a=>new Set(a).size===a.length;
const refused=(why)=>Object.freeze({version:FREE_ORGANIC_FLEET_VERSION,ok:false,status:'FREE_FLEET_REFUSED',reasonCodes:[why],observed:0,unpaid:0,eligible:0,proposed:[],providerSubmissions:0,spendUsd:0,externalEffectAuthority:'NONE'});
/**
 * Only produces recipient-specific plans. Consent/recipient evidence is REQUIRED
 * for this owner-controlled correspondence lane. Other direct B2B outbound
 * lives in its own separately governed campaign policy, never this lane.
 */
export function compileFreeOrganicFleet({mailboxes,domains,paidWarming=[],consentingRecipients=[],suppressedRecipients=[],senderEvidence=[],now=new Date(),days=14,dayIndex=0,maxPerSenderPerDay=2}={}) {
  if(!Array.isArray(mailboxes)||!Array.isArray(domains)||!Array.isArray(paidWarming)||!Array.isArray(consentingRecipients)||!Array.isArray(suppressedRecipients)||!Array.isArray(senderEvidence))return refused('complete-typed-sources-required');
  if(mailboxes.length>1000||domains.length>1000||paidWarming.length>1000||consentingRecipients.length>10000||suppressedRecipients.length>10000||senderEvidence.length>1000)return refused('inventory-exceeds-bounds');
  const t=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(t)||!nInt(days,1,45)||!nInt(dayIndex,0,44)||!nInt(maxPerSenderPerDay,1,3))return refused('invalid-clock-or-policy');
  const ownedDomains=new Map();
  for(const d of domains){const name=String(d?.name||'').toLowerCase();if(!name||ownedDomains.has(name))return refused('ambiguous-domains');ownedDomains.set(name,d?.status==='complete');}
  const paid=new Set(), seen=new Set(),stop=new Set(),health=new Map();
  for(const r of paidWarming){const x=(r?.full_address||r?.email||'').toLowerCase();if(!EMAIL.test(x)||paid.has(x))return refused('ambiguous-paid-warming');paid.add(x);}
  for(const r of suppressedRecipients){if(typeof r!=='string'||!EMAIL.test(r)||r!==r.toLowerCase())return refused('invalid-suppression');stop.add(r);}
  for(const r of senderEvidence){const x=r?.email;if(typeof x!=='string'||!EMAIL.test(x)||health.has(x))return refused('ambiguous-sender-clearance');health.set(x,r);}
  const fleet=[];
  for(const m of mailboxes){const address=m?.full_address||m?.email;
    if(typeof address!=='string'||address!==address.toLowerCase()||!EMAIL.test(address)||seen.has(address))return refused('ambiguous-mailbox-identity');
    seen.add(address);const domain=address.split('@')[1];if(!ownedDomains.has(domain))return refused('orphan-mailbox-domain');
    const paidHere=paid.has(address), providerActive=m.status==='active',domainReady=ownedDomains.get(domain)===true;
    const attestation=health.get(address),clear=attestation?.senderCleared===true&&attestation?.signed===true&&attestation?.quarantined===false&&attestation?.paused===false&&iso(attestation.observedAt)!==null&&t-iso(attestation.observedAt)>=0&&t-iso(attestation.observedAt)<=300000;
    fleet.push(Object.freeze({address,domain,paidHere,providerActive,domainReady,independentlyCleared:clear}));
  }
  if([...paid].some(x=>!seen.has(x)))return refused('unknown-paid-sender');
  const unpaid=fleet.filter(x=>!x.paidHere);
  const consent=[];
  for(const r of consentingRecipients){const e=r?.email;if(typeof e!=='string'||!EMAIL.test(e)||r?.consentToCorrespond!==true||r?.ownerControlled!==true||!r?.evidenceRef||iso(r?.expiresAt)===null||iso(r.expiresAt)<=t||stop.has(e))continue;
    if(r?.senderScope!=='*' && !Array.isArray(r?.senderScope))continue;
    consent.push(r);
  }
  const selected=[];let eligible=0;
  for(const sender of unpaid){if(!sender.independentlyCleared||!sender.providerActive||!sender.domainReady)continue;eligible++;
    const pool=consent.filter(r=>r.senderScope==='*'||r.senderScope.includes(sender.address));
    // Round robin across eligible, distinct recipients; no same recipient used
    // twice in one compiled day. No fake human reply assumptions.
    for(const r of pool){if(selected.length>=maxPerSenderPerDay*Math.max(1,eligible))break;if(selected.some(x=>x.recipient===r.email))continue;
      selected.push({sender:sender.address,recipient:r.email,recipientEvidenceRef:r.evidenceRef,dayIndex,operatorAction:'REVERIFY_AND_REQUEST_INDIVIDUAL_DISPATCH_APPROVAL',authority:'PLAN_ONLY'});break;
    }
  }
  const pending=unpaid.length-eligible;
  return Object.freeze({version:FREE_ORGANIC_FLEET_VERSION,ok:true,status:eligible?'FREE_FLEET_EVIDENCE_PLAN_ONLY':'FREE_FLEET_SENDER_EVIDENCE_REQUIRED',observed:fleet.length,paidWarmingMailboxes:paid.size,unpaid:unpaid.length,eligible,pendingSenderEvidence:pending,qualifyingConsentRecords:consent.length,proposed:Object.freeze(selected),dayIndex,days,maxPerSenderPerDay,plannedDailyRampCeiling:Math.min(maxPerSenderPerDay,1+Math.floor(dayIndex/7)),providerSubmissions:0,verifiedPlacements:0,spendUsd:0,externalEffectAuthority:'NONE',warning:'No real warming or send authority is established by this report. Paid Winnr network is not replicated.'});
}
