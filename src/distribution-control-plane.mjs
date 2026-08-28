import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const DISTRIBUTION_CONTROL_PLANE_POLICY_VERSION = 'distribution-control-plane-1.0.0';
export const DISTRIBUTION_MOTIONS = Object.freeze([
  'OUTBOUND_EMAIL', 'PARTNER_WHITE_LABEL', 'PRODUCT_LED_DIAGNOSTIC', 'OWNED_CONTENT',
  'SOCIAL_PUBLIC', 'REFERRAL_EXPANSION', 'AGENT_ECOSYSTEM', 'COMMUNITY_DIRECTORY',
  'MARKETPLACE', 'PAID_MEDIA'
]);

const MAX_MOTIONS = 50;
const MAX_ALLOCATION = 0.50;
const MAX_EVIDENCE_AGE_DAYS = 90;
const SECRET_KEY = /(?:password|secret|token|authorization|cookie|credential|api[_-]?key|private[_-]?key)/i;
const RAW_PII_KEY = /(?:email|phone|address|fullname|firstname|lastname|messagebody|contentbody|rawcontent|recipient)/i;

function text(value, max = 240) { const s=String(value??'').trim(); return s && s.length<=max ? s:null; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function iso(value) { const s=text(value,80); if(!s)return null; const d=new Date(s); return Number.isFinite(d.getTime())?d.toISOString():null; }
function finite(value) { if (value == null || value === '') return null; const n=Number(value); return Number.isFinite(n)?n:null; }
function integer(value) { return Number.isSafeInteger(value)?value:null; }
function inspectForbidden(value,path='$',depth=0,seen=new WeakSet()) {
  if(depth>7)return[]; if(value&&typeof value==='object'){if(seen.has(value))return[];seen.add(value);} const out=[];
  if(!value||typeof value!=='object')return out;
  for(const [key,child] of Object.entries(value)){const p=`${path}.${key}`; if(SECRET_KEY.test(key)||RAW_PII_KEY.test(key))out.push(p); out.push(...inspectForbidden(child,p,depth+1,seen));}
  return [...new Set(out)].slice(0,40);
}
function fail(reasonCodes, extra={}) { return {ok:false,policyVersion:DISTRIBUTION_CONTROL_PLANE_POLICY_VERSION,status:'DISTRIBUTION_PLAN_DENIED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS},...extra}; }
function confidence(sampleSize){ if(sampleSize>=30)return 0.8; if(sampleSize>=10)return 0.5; if(sampleSize>=3)return 0.2; if(sampleSize>=1)return 0.05; return 0; }

export function normalizeDistributionMotion(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))return fail(['distribution-motion-object-required']);
  const id=text(input.id,120); const type=String(input.type??'').trim().toUpperCase(); const capabilityRef=text(input.capabilityRef,240);
  const configured=input.configured===true; const blocked=input.blocked===true; const evidence=input.evidence&&typeof input.evidence==='object'?input.evidence:{};
  const verifiedOutcomeCount=integer(evidence.verifiedOutcomeCount??0); const clearedPaymentCount=integer(evidence.clearedPaymentCount??0);
  const contribution=finite(evidence.contributionProfitPerOwnerMinuteCents); const measuredAt=iso(evidence.measuredAt);
  const quality=String(evidence.quality??'').trim().toUpperCase(); const reasonCodes=[];
  if(!id)reasonCodes.push('motion-id-required'); if(!DISTRIBUTION_MOTIONS.includes(type))reasonCodes.push('unknown-distribution-motion'); if(!capabilityRef)reasonCodes.push('capability-ref-required');
  if(verifiedOutcomeCount==null||verifiedOutcomeCount<0)reasonCodes.push('invalid-verified-outcome-count');
  if(clearedPaymentCount==null||clearedPaymentCount<0||clearedPaymentCount>verifiedOutcomeCount)reasonCodes.push('invalid-cleared-payment-count');
  if(contribution!=null&&quality!=='MEASURED_LOCAL_RECEIPTS')reasonCodes.push('economic-score-requires-measured-local-receipts');
  if(contribution!=null&&!measuredAt)reasonCodes.push('measured-at-required-for-economic-score');
  const forbidden=inspectForbidden(input); if(forbidden.length)reasonCodes.push('raw-pii-content-or-secret-prohibited');
  const motion={id,type,capabilityRef,configured,blocked,evidence:{verifiedOutcomeCount:verifiedOutcomeCount??0,clearedPaymentCount:clearedPaymentCount??0,contributionProfitPerOwnerMinuteCents:contribution,measuredAt,quality:quality||'NO_VERIFIED_OUTCOMES'},safety:{suppressionClear:input.safety?.suppressionClear===true,complaintClear:input.safety?.complaintClear===true,senderHealthClear:input.safety?.senderHealthClear===true},budgetAuthorityRef:text(input.budgetAuthorityRef,240),economicsProofRef:text(input.economicsProofRef,240),partnerAttributionRef:text(input.partnerAttributionRef,240)};
  return reasonCodes.length?fail(reasonCodes,{motion,prohibitedPaths:forbidden}):{ok:true,policyVersion:DISTRIBUTION_CONTROL_PLANE_POLICY_VERSION,motion,businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}};
}

function freshnessDays(measuredAt, now){ if(!measuredAt)return null; return Math.max(0,(new Date(now)-new Date(measuredAt))/86400000); }
function gateMotion(motion, now){
  const reasons=[]; if(motion.blocked)reasons.push('motion-explicitly-blocked'); if(!motion.configured)reasons.push('provider-or-channel-not-configured');
  if(motion.type==='OUTBOUND_EMAIL'&&(!motion.safety.suppressionClear||!motion.safety.complaintClear||!motion.safety.senderHealthClear))reasons.push('outbound-safety-gate-not-clear');
  if(motion.type==='PAID_MEDIA'){
    if(!motion.budgetAuthorityRef)reasons.push('paid-media-budget-authority-required'); if(!motion.economicsProofRef)reasons.push('paid-media-economics-proof-required');
    if(motion.evidence.clearedPaymentCount<3||motion.evidence.quality!=='MEASURED_LOCAL_RECEIPTS'||motion.evidence.contributionProfitPerOwnerMinuteCents==null)reasons.push('paid-media-requires-measured-positive-economics');
    if((motion.evidence.contributionProfitPerOwnerMinuteCents??-1)<=0)reasons.push('paid-media-requires-positive-contribution');
  }
  const age=freshnessDays(motion.evidence.measuredAt,now); if(age!=null&&age>MAX_EVIDENCE_AGE_DAYS)reasons.push('economic-evidence-stale');
  return {eligible:reasons.length===0,reasons,evidenceAgeDays:age};
}
function scoreMotion(motion){ const e=motion.evidence; if(e.quality!=='MEASURED_LOCAL_RECEIPTS'||e.clearedPaymentCount===0||e.contributionProfitPerOwnerMinuteCents==null)return null; return e.contributionProfitPerOwnerMinuteCents*confidence(e.clearedPaymentCount); }

export function compileDistributionPortfolio({ motions=[], now=new Date(), explorationSlots=2 }={}){
  const timestamp=iso(now); if(!timestamp)return fail(['valid-now-required']); if(!Array.isArray(motions)||motions.length===0||motions.length>MAX_MOTIONS)return fail(['bounded-motion-array-required']);
  const normalized=[]; const ids=new Set(); const errors=[];
  for(const input of motions){const result=normalizeDistributionMotion(input); if(!result.ok){errors.push({id:input?.id||null,reasonCodes:result.reasonCodes});continue;} if(ids.has(result.motion.id)){errors.push({id:result.motion.id,reasonCodes:['duplicate-motion-id']});continue;} ids.add(result.motion.id); normalized.push(result.motion);}
  if(errors.length)return fail(['invalid-distribution-motion'],{errors});
  const evaluated=normalized.map(motion=>{const gate=gateMotion(motion,timestamp); const measuredScore=gate.eligible?scoreMotion(motion):null; return {...motion,gate,measuredScore};});
  const measured=evaluated.filter(x=>x.gate.eligible&&x.measuredScore!=null&&x.measuredScore>0).sort((a,b)=>b.measuredScore-a.measuredScore||a.id.localeCompare(b.id));
  const exploratory=evaluated.filter(x=>x.gate.eligible&&x.measuredScore==null&&x.type!=='PAID_MEDIA').sort((a,b)=>a.id.localeCompare(b.id));
  const plan=[];
  if(measured.length){
    const scores=measured.map(x=>Math.max(0,x.measuredScore)); const total=scores.reduce((a,b)=>a+b,0); let remaining=1;
    measured.forEach((motion,index)=>{let share=index===measured.length-1?remaining:Math.min(MAX_ALLOCATION,total>0?scores[index]/total:0); share=Math.max(0,Math.min(MAX_ALLOCATION,share,remaining)); remaining-=share; plan.push({motionId:motion.id,type:motion.type,role:'EXPLOIT',allocationShare:Number(share.toFixed(4)),measuredScore:Number(motion.measuredScore.toFixed(2)),sampleConfidence:confidence(motion.evidence.clearedPaymentCount),externalAction:'DISABLED'});});
    const slots=Math.min(Math.max(0,Number.isInteger(explorationSlots)?explorationSlots:0),exploratory.length); if(remaining>0&&slots){const share=Math.min(MAX_ALLOCATION,remaining/slots); for(let i=0;i<slots;i++){const allocation=i===slots-1?remaining:share; plan.push({motionId:exploratory[i].id,type:exploratory[i].type,role:'EXPLORE',allocationShare:Number(allocation.toFixed(4)),measuredScore:null,sampleConfidence:0,externalAction:'DISABLED'}); remaining-=allocation;}}
  } else {
    const slots=Math.min(Math.max(0,Number.isInteger(explorationSlots)?explorationSlots:0),exploratory.length); if(slots){const share=Math.min(MAX_ALLOCATION,1/slots); for(let i=0;i<slots;i++)plan.push({motionId:exploratory[i].id,type:exploratory[i].type,role:'EXPLORE',allocationShare:Number(share.toFixed(4)),measuredScore:null,sampleConfidence:0,externalAction:'DISABLED'});}
  }
  const blockers=evaluated.filter(x=>!x.gate.eligible).map(x=>({motionId:x.id,type:x.type,reasonCodes:x.gate.reasons}));
  const maxShare=plan.reduce((m,p)=>Math.max(m,p.allocationShare),0); if(maxShare>MAX_ALLOCATION+1e-9)return fail(['distribution-concentration-cap-breached']);
  const identity={timestamp:null,motions:evaluated.map(x=>({id:x.id,type:x.type,configured:x.configured,blocked:x.blocked,evidence:x.evidence,safety:x.safety,budgetAuthorityRef:x.budgetAuthorityRef,economicsProofRef:x.economicsProofRef})),plan,blockers};
  return {ok:true,policyVersion:DISTRIBUTION_CONTROL_PLANE_POLICY_VERSION,status:plan.length?'DISTRIBUTION_PORTFOLIO_PREPARED_LOCAL_ONLY':'NO_ELIGIBLE_DISTRIBUTION_MOTION',timestamp,portfolioId:`dist_${digest(identity).slice(0,24)}`,objective:'MAXIMIZE_RISK_ADJUSTED_CLEARED_CONTRIBUTION_PROFIT_PER_FOUNDER_MINUTE',plan,blockers,evidenceRule:'Measured exploitation uses only MEASURED_LOCAL_RECEIPTS with cleared-payment count and contribution-profit-per-owner-minute; unproven channels may receive preparation-only exploration slots but never economic truth.',concentrationCap:MAX_ALLOCATION,authorization:{externalActions:'OWNER_OR_CANONICAL_CONSEQUENCE_GATE_REQUIRED',providerCalls:'DISABLED',messages:'DISABLED',spend:'DISABLED',publishing:'DISABLED'},businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}};
}

export function motionEvidenceFromCommercialLearning(summary, channelId, measuredAt = null) {
  if (!summary || summary.ok !== true || !Array.isArray(summary.groups)) return fail(['valid-commercial-learning-summary-required']);
  const id = text(channelId, 120);
  if (!id) return fail(['channel-id-required']);
  const matches = summary.groups.filter(group => String(group.channelId || '').trim() === id);
  if (matches.length > 1) return fail(['contradictory-commercial-learning-channel-groups'], { channelId: id });
  const group = matches[0];
  if (!group) {
    return { ok: true, policyVersion: DISTRIBUTION_CONTROL_PLANE_POLICY_VERSION, status: 'NO_VERIFIED_CHANNEL_ECONOMICS', evidence: { verifiedOutcomeCount: 0, clearedPaymentCount: 0, contributionProfitPerOwnerMinuteCents: null, measuredAt: null, quality: 'NO_VERIFIED_OUTCOMES' }, businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
  }
  const quality = String(group.quality || '').trim().toUpperCase();
  const verifiedOutcomeCount = integer(group.verifiedOutcomeCount);
  const clearedPaymentCount = integer(group.clearedPaymentCount);
  const contribution = finite(group.contributionProfitPerOwnerMinuteCents);
  if (verifiedOutcomeCount == null || verifiedOutcomeCount < 0 || clearedPaymentCount == null || clearedPaymentCount < 0 || clearedPaymentCount > verifiedOutcomeCount) {
    return fail(['invalid-commercial-learning-counts']);
  }
  if (quality !== 'MEASURED_LOCAL_RECEIPTS' || clearedPaymentCount === 0 || contribution == null) {
    return { ok: true, policyVersion: DISTRIBUTION_CONTROL_PLANE_POLICY_VERSION, status: 'NO_VERIFIED_CHANNEL_ECONOMICS', evidence: { verifiedOutcomeCount, clearedPaymentCount, contributionProfitPerOwnerMinuteCents: null, measuredAt: null, quality: quality || 'NO_VERIFIED_OUTCOMES' }, businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
  }
  const at = iso(measuredAt || summary.timestamp);
  if (!at) return fail(['measured-at-required-for-commercial-learning-bridge']);
  return { ok: true, policyVersion: DISTRIBUTION_CONTROL_PLANE_POLICY_VERSION, status: 'VERIFIED_CHANNEL_ECONOMICS_READY', evidence: { verifiedOutcomeCount, clearedPaymentCount, contributionProfitPerOwnerMinuteCents: contribution, measuredAt: at, quality: 'MEASURED_LOCAL_RECEIPTS' }, sourceLearningId: text(summary.learningId, 200), businessEffectAuthority: 'NONE', externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } };
}

export function evaluateReferralCommission({ referralAttributionRef, canonicalPaymentTruth }={}){
  const ref=text(referralAttributionRef,240); if(!ref)return fail(['referral-attribution-ref-required']);
  const truth=canonicalPaymentTruth&&typeof canonicalPaymentTruth==='object'?canonicalPaymentTruth:{};
  const cleared=truth.truthLevel==='CLEARED_PAYMENT'&&Number.isSafeInteger(truth.amountCents)&&truth.amountCents>0&&text(truth.providerEventId,240);
  return {ok:true,policyVersion:DISTRIBUTION_CONTROL_PLANE_POLICY_VERSION,status:cleared?'REFERRAL_COMMISSION_BASIS_PROVEN':'NO_REFERRAL_COMMISSION_BASIS',referralAttributionRef:ref,clearedPaymentRef:cleared?String(truth.providerEventId):null,commissionAuthority:'NONE_REQUIRES_SEPARATE_CONTRACT_AND_PAYMENT_PROCESS',businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}};
}
