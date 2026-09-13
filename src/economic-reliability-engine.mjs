import crypto from 'node:crypto';

export const ECONOMIC_RELIABILITY_VERSION='uberbond.economic-reliability.v1.1';
export const TARGET_SUCCESS_PROBABILITY=0.99999999999;
export const TARGET_ZERO_MONEY_PROBABILITY=1-TARGET_SUCCESS_PROBABILITY;

const arr=v=>Array.isArray(v)?v:[];
const text=(v,max=300)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const prob=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=1?n:null;};
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const hash=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

function normalizeRoute(raw={}){
  const routeId=text(raw.routeId,180);
  const p=prob(raw.successProbabilityLowerBound);
  const failureDomain=text(raw.failureDomain,180);
  const evidenceRefs=arr(raw.evidenceRefs).map(v=>text(v,1000)).filter(Boolean);
  const calibrationRefs=arr(raw.calibrationRefs).map(v=>text(v,1000)).filter(Boolean);
  const independenceEvidenceRefs=arr(raw.independenceEvidenceRefs).map(v=>text(v,1000)).filter(Boolean);
  const founderMinutes=Math.max(0,num(raw.founderMinutes));
  const timeToCashMinutes=Math.max(0,num(raw.timeToCashMinutes));
  const eligible=Boolean(routeId&&failureDomain&&p!=null&&evidenceRefs.length&&calibrationRefs.length&&raw.policyCleared===true&&raw.executableNow===true);
  const reliabilityEligible=eligible&&independenceEvidenceRefs.length>0;
  return {routeId,failureDomain,successProbabilityLowerBound:p,evidenceRefs,calibrationRefs,independenceEvidenceRefs,founderMinutes,timeToCashMinutes,policyCleared:raw.policyCleared===true,executableNow:raw.executableNow===true,eligible,reliabilityEligible};
}

function groupRoutes(routes=[]){
  const groups=new Map();
  for(const route of routes){
    if(!route.reliabilityEligible) continue;
    const key=`domain:${route.failureDomain}`;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(route);
  }
  return [...groups.entries()].map(([groupId,members])=>({groupId,members}));
}

function conservativeGroupProbability(group){
  const best=[...group.members].sort((a,b)=>b.successProbabilityLowerBound-a.successProbabilityLowerBound||a.routeId.localeCompare(b.routeId))[0];
  return {
    groupId:group.groupId,
    successProbabilityLowerBound:best?.successProbabilityLowerBound??0,
    representativeRouteId:best?.routeId??null,
    memberRouteIds:group.members.map(x=>x.routeId),
    law:'WITHIN_A_FAILURE_DOMAIN_ASSUME_PERFECT_CORRELATION; ONLY_THE_BEST_EVIDENCE_BACKED_LOWER_BOUND_COUNTS'
  };
}

export function evaluateEconomicReliability({routes=[]}={}){
  const normalized=arr(routes).map(normalizeRoute);
  const eligible=normalized.filter(x=>x.eligible);
  const reliabilityEligible=normalized.filter(x=>x.reliabilityEligible);
  const rejected=normalized.filter(x=>!x.eligible).map(x=>({routeId:x.routeId,reasonCodes:[
    !x.routeId?'route-id-required':null,
    !x.failureDomain?'failure-domain-required':null,
    x.successProbabilityLowerBound==null?'valid-probability-lower-bound-required':null,
    !x.evidenceRefs.length?'route-evidence-required':null,
    !x.calibrationRefs.length?'probability-calibration-evidence-required':null,
    !x.policyCleared?'policy-clearance-required':null,
    !x.executableNow?'route-not-executable-now':null
  ].filter(Boolean)}));
  const independenceWithheld=eligible.filter(x=>!x.reliabilityEligible).map(x=>({routeId:x.routeId,reasonCodes:['independence-evidence-required-before-reliability-contribution']}));

  const groups=groupRoutes(reliabilityEligible).map(conservativeGroupProbability);
  let logResidual=0;
  for(const group of groups){
    const failure=Math.max(Number.MIN_VALUE,1-group.successProbabilityLowerBound);
    logResidual+=Math.log(failure);
  }
  const residualZeroProbability=groups.length?Math.exp(logResidual):1;
  const successProbability=1-residualZeroProbability;
  const targetReached=residualZeroProbability<=TARGET_ZERO_MONEY_PROBABILITY;
  const receipt={
    schemaVersion:ECONOMIC_RELIABILITY_VERSION,
    targetSuccessProbability:TARGET_SUCCESS_PROBABILITY,
    targetZeroMoneyProbability:TARGET_ZERO_MONEY_PROBABILITY,
    eligibleRouteCount:eligible.length,
    reliabilityContributingRouteCount:reliabilityEligible.length,
    rejectedRouteCount:rejected.length,
    independenceWithheldCount:independenceWithheld.length,
    independentFailureDomainCount:groups.length,
    groups,
    residualZeroProbability,
    successProbability,
    targetReached,
    status:targetReached?'ECONOMIC_RELIABILITY_11_NINES_EVIDENCE_THRESHOLD_REACHED':'ECONOMIC_RELIABILITY_TARGET_NOT_YET_PROVEN',
    rejected,
    independenceWithheld,
    truthBoundary:'This is a conservative evidence-backed lower-bound model, not a guarantee. Routes without calibration are excluded. Routes without independence evidence contribute zero to the reliability proof. Within an evidenced failure domain, repeated attempts are treated as perfectly correlated and only the strongest calibrated lower bound counts. Reaching the numeric threshold does not itself prove cleared money; provider-origin settlement evidence remains required.'
  };
  return {...receipt,receiptDigest:hash(receipt)};
}

export function rankReliabilityActions({routes=[]}={}){
  const normalized=arr(routes).map(normalizeRoute).filter(x=>x.reliabilityEligible);
  return normalized.map(route=>{
    const p=route.successProbabilityLowerBound;
    const reliabilityGain=-Math.log(Math.max(Number.MIN_VALUE,1-p));
    const burden=Math.max(1,route.founderMinutes+route.timeToCashMinutes/60);
    return {routeId:route.routeId,failureDomain:route.failureDomain,reliabilityGain:+reliabilityGain.toFixed(12),burden:+burden.toFixed(6),gainPerBurden:+(reliabilityGain/burden).toFixed(12)};
  }).sort((a,b)=>b.gainPerBurden-a.gainPerBurden||a.routeId.localeCompare(b.routeId));
}
