import crypto from 'node:crypto';

export const DISTRIBUTION_OS_POLICY_VERSION='distribution-os-1.0.0';
export const DISTRIBUTION_CHANNELS=Object.freeze([
  'COLD_OUTREACH','PARTNER_REFERRAL','AFFILIATE','LIFECYCLE_EMAIL','SMS_WHATSAPP','VOICE','SOCIAL_ORGANIC','CONTENT_SEO','COMMUNITY','MARKETPLACE','CREATOR_PARTNERSHIP','EARNED_MEDIA','PAID_MEDIA','PRODUCT_LED'
]);
export const TRUSTED_ECONOMIC_RECEIPT_CLASSES=Object.freeze(['CLEARED_PAYMENT','CLEARED_REFUND_ADJUSTMENT','ACCEPTED_DELIVERY','VERIFIED_RENEWAL']);
const PERSON_TARGETED=new Set(['COLD_OUTREACH','LIFECYCLE_EMAIL','SMS_WHATSAPP','VOICE','CREATOR_PARTNERSHIP']);
const ZERO_EFFECTS=Object.freeze({providerCalls:0,messages:0,purchases:0,deployments:0,credentialChanges:0,dnsChanges:0,productionMutations:0,spendCents:0});
const SENSITIVE_KEYS=/(?:email|phone|recipient|destination|message|content|body|text|address|fullname|password|secret|token|authorization|cookie|credential|api[_-]?key|raw(?:payload|body|value|customer|lead))/i;
const SAFE_REFERENCE_KEYS=new Set(['offerRef','audienceRef','contentRef','authorityReceiptRef','consentEvidenceRef','suppressionCheckRef','platformPolicyRef','economicReceiptRef','attributionReceiptRef','experimentRef','channelPolicyRef','sourceEvidenceRef']);
const MAX_CANDIDATES=100;

function clone(v){return structuredClone(v);}
function text(v,max=240){const s=String(v??'').trim();return s&&s.length<=max?s:null;}
function iso(v){const s=text(v,80);if(!s)return null;const d=new Date(s);return Number.isFinite(d.getTime())?d.toISOString():null;}
function digest(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function invalid(reasonCodes,extra={}){return {ok:false,policyVersion:DISTRIBUTION_OS_POLICY_VERSION,reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',spendAuthority:'NONE',externalEffectLedger:clone(ZERO_EFFECTS),...extra};}
function sensitiveKeys(value,depth=0,seen=new WeakSet()){if(!value||typeof value!=='object'||depth>7)return[];if(seen.has(value))return[];seen.add(value);const out=[];for(const[k,c]of Object.entries(value)){if(SENSITIVE_KEYS.test(k)&&!SAFE_REFERENCE_KEYS.has(k))out.push(k);if(c&&typeof c==='object')out.push(...sensitiveKeys(c,depth+1,seen));}return[...new Set(out)].slice(0,30);}
function num(v,min=0,max=Number.MAX_SAFE_INTEGER){return Number.isFinite(v)&&v>=min&&v<=max?v:null;}
function currency(v){const s=String(v??'').trim().toUpperCase();return /^[A-Z]{3}$/.test(s)?s:null;}
function requiredRoute(channel){
  if(channel==='COLD_OUTREACH')return 'CANONICAL_OUTREACH_ENGINE';
  if(['LIFECYCLE_EMAIL','SMS_WHATSAPP','VOICE','SOCIAL_ORGANIC'].includes(channel))return 'CANONICAL_OMNICHANNEL_CONSEQUENCE_GATE';
  if(['PARTNER_REFERRAL','AFFILIATE'].includes(channel))return 'CANONICAL_REFERRAL_PARTNER_LEDGER';
  return 'PLAN_ONLY_NO_EXTERNAL_EFFECT';
}

function normalizeEconomicEvidence(evidence,asOf){
  if(evidence==null)return {ok:true,evidence:null,economicScore:0};
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))return invalid(['economic-evidence-object-required']);
  const observedAt=iso(evidence.observedAt);
  const receiptClass=String(evidence.receiptClass??'').trim().toUpperCase();
  const economicReceiptRef=text(evidence.economicReceiptRef,240);
  const attributionReceiptRef=text(evidence.attributionReceiptRef,240);
  const attributionStatus=String(evidence.attributionStatus??'').trim().toUpperCase();
  const cur=currency(evidence.currency);
  const clearedContributionCents=num(evidence.clearedContributionCents,0,1_000_000_000_000);
  const founderMinutes=num(evidence.founderMinutes,0.01,1_000_000);
  const confidence=num(evidence.confidence,0,1);
  const reasons=[];
  if(!observedAt)reasons.push('economic-observed-at-required');
  if(observedAt && new Date(observedAt).getTime()>new Date(asOf).getTime()+300000)reasons.push('future-dated-economic-evidence');
  if(observedAt && new Date(asOf).getTime()-new Date(observedAt).getTime()>90*86400000)reasons.push('stale-economic-evidence');
  if(!TRUSTED_ECONOMIC_RECEIPT_CLASSES.includes(receiptClass))reasons.push('trusted-economic-receipt-class-required');
  if(!economicReceiptRef)reasons.push('economic-receipt-ref-required');
  if(!attributionReceiptRef)reasons.push('attribution-receipt-ref-required');
  if(attributionStatus!=='CONFIRMED')reasons.push('confirmed-attribution-required');
  if(!cur)reasons.push('currency-required');
  if(clearedContributionCents==null)reasons.push('cleared-contribution-cents-required');
  if(founderMinutes==null)reasons.push('founder-minutes-required');
  if(confidence==null||confidence<0.5)reasons.push('economic-confidence-too-low');
  if(reasons.length)return invalid(reasons);
  const normalized={observedAt,receiptClass,economicReceiptRef,attributionReceiptRef,attributionStatus,currency:cur,clearedContributionCents,founderMinutes,confidence};
  return {ok:true,evidence:normalized,economicScore:(clearedContributionCents/founderMinutes)*confidence};
}

function normalizeCandidate(input,asOf){
  if(!input||typeof input!=='object'||Array.isArray(input))return invalid(['distribution-candidate-object-required']);
  const candidateId=text(input.candidateId,160);
  const channel=String(input.channel??'').trim().toUpperCase();
  const offerRef=text(input.offerRef,240);const audienceRef=text(input.audienceRef,240);const channelPolicyRef=text(input.channelPolicyRef,240);
  const routeClass=String(input.routeClass??'').trim().toUpperCase();
  const policyEligible=input.policyEligible===true; const reputationHealthy=input.reputationHealthy!==false; const saturation=num(input.saturation,0,1);
  const authorityReceiptRef=input.authorityReceiptRef==null?null:text(input.authorityReceiptRef,240);
  const consentEvidenceRef=input.consentEvidenceRef==null?null:text(input.consentEvidenceRef,240);
  const suppressionCheckRef=input.suppressionCheckRef==null?null:text(input.suppressionCheckRef,240);
  const platformPolicyRef=input.platformPolicyRef==null?null:text(input.platformPolicyRef,240);
  const complaintOrSuppressionSignal=input.complaintOrSuppressionSignal===true;
  const expectedFounderMinutes=num(input.expectedFounderMinutes,0.01,1_000_000);
  const maxPlannedSpendCents=num(input.maxPlannedSpendCents??0,0,1_000_000_000);
  const reasons=[];
  if(!candidateId)reasons.push('candidate-id-required');if(!DISTRIBUTION_CHANNELS.includes(channel))reasons.push('unsupported-distribution-channel');if(!offerRef)reasons.push('offer-ref-required');if(!audienceRef)reasons.push('audience-ref-required');if(!channelPolicyRef)reasons.push('channel-policy-ref-required');
  const expectedRoute=DISTRIBUTION_CHANNELS.includes(channel)?requiredRoute(channel):null;if(expectedRoute&&routeClass!==expectedRoute)reasons.push('canonical-route-class-required');
  if(!policyEligible)reasons.push('channel-policy-ineligible');if(!reputationHealthy)reasons.push('reputation-unhealthy');if(complaintOrSuppressionSignal)reasons.push('complaint-or-suppression-veto');if(saturation==null)reasons.push('saturation-required');if(saturation!=null&&saturation>=0.95)reasons.push('channel-saturated');
  if(PERSON_TARGETED.has(channel)){if(!authorityReceiptRef)reasons.push('authority-receipt-ref-required-for-person-targeted-channel');if(!suppressionCheckRef)reasons.push('suppression-check-ref-required-for-person-targeted-channel');}
  if(['SMS_WHATSAPP','VOICE','LIFECYCLE_EMAIL'].includes(channel)&&!consentEvidenceRef)reasons.push('consent-evidence-ref-required-for-channel');
  if(['SOCIAL_ORGANIC','COMMUNITY','MARKETPLACE','CREATOR_PARTNERSHIP','EARNED_MEDIA','PAID_MEDIA'].includes(channel)&&!platformPolicyRef)reasons.push('platform-policy-ref-required');
  if(channel==='PAID_MEDIA'&&maxPlannedSpendCents<=0)reasons.push('paid-media-plan-budget-required');
  if(expectedFounderMinutes==null)reasons.push('expected-founder-minutes-required');
  const prohibited=sensitiveKeys(input);if(prohibited.length)reasons.push('raw-pii-content-or-secret-prohibited');
  const econ=normalizeEconomicEvidence(input.economicEvidence,asOf);if(!econ.ok)reasons.push(...econ.reasonCodes);
  const candidate={candidateId,channel,offerRef,audienceRef,channelPolicyRef,routeClass,policyEligible,reputationHealthy,saturation,authorityReceiptRef,consentEvidenceRef,suppressionCheckRef,platformPolicyRef,expectedFounderMinutes,maxPlannedSpendCents,economicEvidence:econ.ok?econ.evidence:null,executionAuthority:'NONE',sendAuthority:'NONE',publicationAuthority:'NONE',spendAuthority:'NONE'};
  if(reasons.length)return invalid(reasons,{candidate,prohibitedKeys:prohibited});
  const saturationFactor=1-saturation;
  const economicScore=econ.economicScore*saturationFactor;
  return {ok:true,candidate,economicScore};
}

export function compileDistributionPortfolio(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))return invalid(['distribution-portfolio-object-required']);
  const asOf=iso(input.asOf);const explorationEnabled=input.explorationEnabled===true;const maxChannels=Number.isSafeInteger(input.maxChannels)&&input.maxChannels>=1&&input.maxChannels<=20?input.maxChannels:null;
  const reasons=[];if(!asOf)reasons.push('as-of-required');if(maxChannels==null)reasons.push('max-channels-out-of-bounds');if(!Array.isArray(input.candidates))reasons.push('candidates-array-required');else if(input.candidates.length===0||input.candidates.length>MAX_CANDIDATES)reasons.push('candidate-count-out-of-bounds');
  const prohibited=sensitiveKeys(input);if(prohibited.length)reasons.push('raw-pii-content-or-secret-prohibited');if(reasons.length)return invalid(reasons,{prohibitedKeys:prohibited});
  const valid=[];const rejected=[];for(const raw of input.candidates){const n=normalizeCandidate(raw,asOf);if(!n.ok){rejected.push({candidateId:text(raw?.candidateId,160),reasonCodes:n.reasonCodes});continue;}valid.push(n);}
  const currencies=[...new Set(valid.map(v=>v.candidate.economicEvidence?.currency).filter(Boolean))];if(currencies.length>1)return invalid(['mixed-economic-currencies-require-separate-portfolios'],{currencies});
  const attributionOwners=new Map();const duplicateAttribution=[];for(const v of valid){const ref=v.candidate.economicEvidence?.attributionReceiptRef;if(!ref)continue;if(attributionOwners.has(ref))duplicateAttribution.push({attributionReceiptRef:ref,candidateIds:[attributionOwners.get(ref),v.candidate.candidateId]});else attributionOwners.set(ref,v.candidate.candidateId);}
  if(duplicateAttribution.length)return invalid(['duplicate-economic-attribution-receipt'],{duplicateAttribution});
  const ranked=valid.map(v=>{
    const hasTrustedEconomics=!!v.candidate.economicEvidence;
    const explorationEligible=!hasTrustedEconomics&&explorationEnabled;
    const score=hasTrustedEconomics?v.economicScore:(explorationEligible?-(v.candidate.expectedFounderMinutes):Number.NEGATIVE_INFINITY);
    return {...v.candidate,hasTrustedEconomics,explorationEligible,score};
  }).filter(v=>Number.isFinite(v.score)).sort((a,b)=>b.score-a.score||a.expectedFounderMinutes-b.expectedFounderMinutes||a.candidateId.localeCompare(b.candidateId));
  const selected=ranked.slice(0,maxChannels);
  const plan={schemaVersion:'distribution-portfolio-plan-1.0.0',asOf,currency:currencies[0]||null,explorationEnabled,maxChannels,selected:selected.map(v=>({...v,score:Number(v.score.toFixed(6))})),rejected,objective:'risk-adjusted cleared contribution profit per founder minute',businessEffectAuthority:'NONE',sendAuthority:'NONE',publicationAuthority:'NONE',spendAuthority:'NONE',providerCallAuthority:'NONE'};
  plan.planId=`dist_plan_${digest(plan).slice(0,32)}`;
  return {ok:true,policyVersion:DISTRIBUTION_OS_POLICY_VERSION,status:selected.length?'DISTRIBUTION_PORTFOLIO_PREPARED_LOCAL_ONLY':'NO_ELIGIBLE_DISTRIBUTION_CHANNEL',plan,businessEffectAuthority:'NONE',spendAuthority:'NONE',externalEffectLedger:clone(ZERO_EFFECTS)};
}

export function compareDistributionOutcomes({left,right,asOf=new Date().toISOString()}={}){
  const l=normalizeEconomicEvidence(left,iso(asOf));const r=normalizeEconomicEvidence(right,iso(asOf));if(!l.ok||!r.ok)return invalid(['trusted-economic-evidence-required-for-comparison'],{leftReasons:l.reasonCodes||[],rightReasons:r.reasonCodes||[]});
  if(l.evidence.currency!==r.evidence.currency)return invalid(['mixed-economic-currencies-not-comparable']);
  return {ok:true,winner:l.economicScore===r.economicScore?'TIE':l.economicScore>r.economicScore?'LEFT':'RIGHT',leftScore:l.economicScore,rightScore:r.economicScore,businessEffectAuthority:'NONE',externalEffectLedger:clone(ZERO_EFFECTS)};
}
