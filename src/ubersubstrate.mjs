// UberSubstrate — evidence-weighted first-month outbound substrate planner.
//
// It does not choose a provider from marketing hype alone. A candidate can be
// cheap and high-density yet remain non-actionable if UberBond cannot prove a
// direct credential/auth path, provider-purpose fit, inbound reply access, or
// warm-up/reputation state.

import crypto from 'node:crypto';

export const UBERSUBSTRATE_VERSION='uberbond.ubersubstrate.v1';
const clean=(v,n=1000)=>String(v??'').trim().slice(0,n);
const finite=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

const EVIDENCE_RANK=Object.freeze({
  UNKNOWN:0,
  MARKETING_CLAIM:1,
  INDEPENDENT_PUBLIC_OBSERVATION:2,
  LIVE_PROBED_CONTRACT:3,
  OWNER_ACCOUNT_OBSERVED:4,
  EXECUTED_RUNTIME_RECEIPT:5
});
function evidenceLevel(value){
  const key=clean(value,80).toUpperCase();
  return Object.prototype.hasOwnProperty.call(EVIDENCE_RANK,key)?key:'UNKNOWN';
}
function ev(value){
  const level=evidenceLevel(value);
  return {level,rank:EVIDENCE_RANK[level]};
}
function boolEvidence(node={}){
  return node?.value===true&&ev(node?.evidence).rank>0;
}
function money(value){
  const n=finite(value);
  return n!=null&&n>=0?Math.round(n*100)/100:null;
}
function candidateCost(c={},budget){
  const monthly=money(c.monthlyUsd);
  const unit=money(c.unitMonthlyUsd);
  const unitSize=Math.max(1,Math.floor(finite(c.unitSize)||1));
  if(monthly!=null){
    return {model:'fixed',monthlyUsd:monthly,affordable:monthly<=budget,maxUnits:monthly<=budget?unitSize:0};
  }
  if(unit!=null&&unit>0){
    const count=Math.floor(budget/unit);
    return {model:'per-unit',monthlyUsd:count*unit,affordable:count>0,maxUnits:count*unitSize};
  }
  return {model:'unknown',monthlyUsd:null,affordable:false,maxUnits:0};
}
export function evaluateSubstrateCandidate(candidate={},{
  totalBudgetUsd=0,alreadyCommittedUsd=0,requireDirectCustody=true
}={}){
  const remaining=Math.max(0,(finite(totalBudgetUsd)||0)-(finite(alreadyCommittedUsd)||0));
  const cost=candidateCost(candidate,remaining);
  const outbound=boolEvidence(candidate.outboundTransport);
  const inbound=boolEvidence(candidate.inboundReplies);
  const warmup=boolEvidence(candidate.warmupIncluded)||boolEvidence(candidate.prewarmed);
  const direct=boolEvidence(candidate.directCredentialOrTokenCustody);
  const coldUse=boolEvidence(candidate.coldOutreachPositioning);
  const api=boolEvidence(candidate.apiControl);
  const terms=evidenceLevel(candidate.termsCompatibility?.evidence);
  const termsGreen=candidate.termsCompatibility?.value===true&&EVIDENCE_RANK[terms]>=EVIDENCE_RANK.OWNER_ACCOUNT_OBSERVED;
  const sendCapacityEvidence=evidenceLevel(candidate.safeSendCapacity?.evidence);
  const sendCapacity=finite(candidate.safeSendCapacity?.perDay);

  const blockers=[];
  if(!cost.affordable)blockers.push('budget');
  if(!outbound)blockers.push('outbound-transport-not-evidenced');
  if(!inbound)blockers.push('inbound-reply-access-not-evidenced');
  if(!warmup)blockers.push('warmup-or-prewarmed-capability-not-evidenced');
  if(requireDirectCustody&&!direct)blockers.push('direct-credential-or-token-custody-not-evidenced');
  if(!coldUse)blockers.push('cold-outreach-provider-positioning-not-evidenced');
  if(!api)blockers.push('api-control-not-evidenced');
  if(!termsGreen)blockers.push('current-terms-compatibility-not-owner-observed');
  if(sendCapacity==null||EVIDENCE_RANK[sendCapacityEvidence]<EVIDENCE_RANK.OWNER_ACCOUNT_OBSERVED)blockers.push('safe-daily-capacity-not-observed');

  const integrationReady=outbound&&inbound&&warmup&&(!requireDirectCustody||direct)&&api;
  const purchaseCandidate=cost.affordable&&integrationReady&&coldUse;
  const liveReady=purchaseCandidate&&termsGreen&&sendCapacity!=null&&EVIDENCE_RANK[sendCapacityEvidence]>=EVIDENCE_RANK.OWNER_ACCOUNT_OBSERVED;

  return Object.freeze({
    id:clean(candidate.id,160)||'unknown',
    provider:clean(candidate.provider,120)||null,
    product:clean(candidate.product,160)||null,
    status:liveReady?'LIVE_SUBSTRATE_EVIDENCED':purchaseCandidate?'PURCHASE_CANDIDATE_NEEDS_ACTIVATION_EVIDENCE':cost.affordable?'AFFORDABLE_BUT_INTEGRATION_UNPROVEN':'NOT_CURRENTLY_AFFORDABLE',
    budget:{totalUsd:money(totalBudgetUsd)||0,alreadyCommittedUsd:money(alreadyCommittedUsd)||0,remainingUsd:money(remaining)||0},
    cost,
    densityClaim:{
      maximumMailboxes:Math.max(0,Math.floor(finite(candidate.maximumMailboxes)||cost.maxUnits||0)),
      evidence:evidenceLevel(candidate.maximumMailboxesEvidence)
    },
    integration:{
      outbound,inbound,warmup,directCustody:direct,apiControl:api,coldOutreachPositioning:coldUse,
      termsCompatibility:termsGreen,
      safeSendCapacityPerDay:sendCapacity,
      safeSendCapacityEvidence:sendCapacityEvidence
    },
    blockers:[...new Set(blockers)],
    evidenceRefs:Array.isArray(candidate.evidenceRefs)?candidate.evidenceRefs.map(x=>clean(x,1000)).filter(Boolean):[],
    truthBoundary:'Mailbox count and vendor positioning are not safe-send capacity. LIVE requires owner-account terms evidence plus observed sending-capacity evidence.'
  });
}

export function compileFirstMonthSubstratePlan({
  totalBudgetUsd=30,alreadyCommittedUsd=8,candidates=[]
}={}){
  const evaluated=(Array.isArray(candidates)?candidates:[]).map(c=>evaluateSubstrateCandidate(c,{totalBudgetUsd,alreadyCommittedUsd}));
  const statusRank={
    LIVE_SUBSTRATE_EVIDENCED:4,
    PURCHASE_CANDIDATE_NEEDS_ACTIVATION_EVIDENCE:3,
    AFFORDABLE_BUT_INTEGRATION_UNPROVEN:2,
    NOT_CURRENTLY_AFFORDABLE:1
  };
  const ranked=[...evaluated].sort((a,b)=>
    (statusRank[b.status]||0)-(statusRank[a.status]||0)||
    Number(b.integration.directCustody)-Number(a.integration.directCustody)||
    Number(b.integration.warmup)-Number(a.integration.warmup)||
    (b.densityClaim.maximumMailboxes||0)-(a.densityClaim.maximumMailboxes||0)||
    (a.cost.monthlyUsd??Infinity)-(b.cost.monthlyUsd??Infinity)||
    a.id.localeCompare(b.id)
  );
  return Object.freeze({
    version:UBERSUBSTRATE_VERSION,
    status:ranked.some(x=>x.status==='LIVE_SUBSTRATE_EVIDENCED')?'LIVE_OPTION_EXISTS':
      ranked.some(x=>x.status==='PURCHASE_CANDIDATE_NEEDS_ACTIVATION_EVIDENCE')?'PURCHASE_CANDIDATE_EXISTS':
      'NO_FULLY_INTEGRABLE_PURCHASE_CANDIDATE',
    budget:{totalUsd:money(totalBudgetUsd)||0,alreadyCommittedUsd:money(alreadyCommittedUsd)||0,remainingUsd:money(Math.max(0,(finite(totalBudgetUsd)||0)-(finite(alreadyCommittedUsd)||0)))||0},
    candidates:ranked,
    preferredCandidateId:ranked[0]?.id||null,
    planDigest:`sha256:${sha(ranked)}`,
    truthBoundary:'Ranking is evidence-weighted integration readiness, not a deliverability promise. It never converts advertised mailbox density into a safe daily send estimate.'
  });
}
