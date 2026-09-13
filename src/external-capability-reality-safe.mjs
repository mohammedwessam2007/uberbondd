import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SAFE_EXTERNAL_CAPABILITY_GAPS=Object.freeze([
  'live-cross-platform-public-research-adapters',
  'messaging-provider-redundancy',
  'live-payment-settlement-or-recovery',
  'independent-deployment-provider',
  'credential-custody',
  'sovereign-identity'
]);
const clone=v=>structuredClone(v);
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,n=1000)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const arr=v=>Array.isArray(v)?v:[];
const unique=v=>[...new Set(arr(v).map(x=>text(x,240)).filter(Boolean))];
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:clone(ZERO_EXTERNAL_EFFECTS),...extra});
function fresh(value,now,maxAgeDays=90){const d=new Date(value),n=new Date(now);if(!Number.isFinite(d.getTime())||!Number.isFinite(n.getTime()))return false;const age=(n-d)/86400000;return age>=0&&age<=maxAgeDays;}
function common(r,now){const reasons=[];if(!r||typeof r!=='object'||Array.isArray(r))return ['receipt-object-required'];if(!SAFE_EXTERNAL_CAPABILITY_GAPS.includes(r.id))reasons.push('recognized-gap-id-required');if(r.synthetic!==false)reasons.push('non-synthetic-evidence-required');if(!fresh(r.observedAt,now))reasons.push('fresh-observed-at-required');if(unique(r.evidenceRefs).length===0)reasons.push('evidence-references-required');return reasons;}
function validate(r,now){const reasons=common(r,now);switch(r?.id){
case 'live-cross-platform-public-research-adapters': {const good=arr(r.adapters).filter(x=>x&&typeof x==='object'&&x.live===true&&x.policyCompliant===true&&x.publicDataObserved===true&&text(x.platform,120)&&text(x.receiptRef,1000));if(new Set(good.map(x=>String(x.platform).toLowerCase())).size<2)reasons.push('two-live-policy-compliant-platforms-required');break;}
case 'messaging-provider-redundancy': {const good=arr(r.paths).filter(x=>x&&typeof x==='object'&&x.authorized===true&&x.live===true&&x.canaryObserved===true&&text(x.providerId,160)&&text(x.senderIdentityRef,1000)&&text(x.deliveryReceiptRef,1000));if(new Set(good.map(x=>String(x.providerId).toLowerCase())).size<2)reasons.push('two-independent-authorized-live-messaging-paths-required');break;}
case 'live-payment-settlement-or-recovery': if(String(r.environment||'').toUpperCase()!=='LIVE')reasons.push('live-environment-required');if(r.settlementObserved!==true&&r.recoveryObserved!==true)reasons.push('settlement-or-recovery-observation-required');if(!text(r.providerIdentity,240)||!text(r.providerReceiptRef,1000))reasons.push('provider-and-receipt-required');break;
case 'independent-deployment-provider': if(r.distinctPhysicalProvider!==true)reasons.push('distinct-physical-provider-required');if(r.exactReleaseBootObserved!==true)reasons.push('exact-release-boot-required');if(r.cutoverObserved!==true)reasons.push('actual-cutover-required');if(r.rollbackObserved!==true)reasons.push('actual-rollback-required');if(!text(r.providerIdentity,240)||!text(r.releaseDigest,240))reasons.push('provider-and-release-identity-required');break;
case 'credential-custody': {const factors=unique(r.factorTypes),domains=unique(r.custodyDomains);if(r.ownerEnrollmentObserved!==true)reasons.push('observed-owner-enrollment-required');if(!Number.isInteger(r.threshold)||r.threshold<2)reasons.push('threshold-at-least-two-required');if(factors.length<2)reasons.push('two-factor-types-required');if(domains.length<2)reasons.push('two-custody-domains-required');break;}
case 'sovereign-identity': if(r.ownerConsentObserved!==true)reasons.push('owner-consent-required');if(r.livenessObserved!==true)reasons.push('liveness-required');if(r.recoveryRehearsalObserved!==true)reasons.push('recovery-rehearsal-required');if(r.sameIdentityConfirmed!==true)reasons.push('same-identity-confirmation-required');break;
default: break;}return [...new Set(reasons)];}

export function evaluateSafeExternalCapabilityReality({receipts=[],now=new Date()}={}){
  const byId=new Map();for(const r of arr(receipts)){if(SAFE_EXTERNAL_CAPABILITY_GAPS.includes(r?.id)&&!byId.has(r.id))byId.set(r.id,r);}
  const verdicts=SAFE_EXTERNAL_CAPABILITY_GAPS.map(id=>{const receipt=byId.get(id);const reasonCodes=receipt?validate(receipt,now):['receipt-not-observed'];const closed=reasonCodes.length===0;return{id,closed,status:closed?'EXTERNAL_CAPABILITY_REALITY_PROVEN':'EXTERNAL_CAPABILITY_REALITY_OPEN',reasonCodes,receiptDigest:receipt?`sha256:${hash(receipt)}`:null};});
  const closedIds=verdicts.filter(v=>v.closed).map(v=>v.id),openIds=verdicts.filter(v=>!v.closed).map(v=>v.id);
  return envelope({ok:true,status:openIds.length?'SAFE_EXTERNAL_CAPABILITY_REALITY_PARTIAL':'SAFE_EXTERNAL_CAPABILITY_REALITY_COMPLETE',closedCount:closedIds.length,openCount:openIds.length,closedIds,openIds,verdicts,verdictDigest:`sha256:${hash(verdicts)}`,truthBoundary:'ONLY CUT-SPECIFIC FRESH NON-SYNTHETIC REALITY RECEIPTS MAY CLOSE THESE SAFE EXTERNAL CAPABILITY GAPS. THIS VERIFIER CREATES NO PROVIDER, OWNER, PAYMENT, DEPLOYMENT, MESSAGE, OR IDENTITY EVIDENCE.'});
}
