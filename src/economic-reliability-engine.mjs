import crypto from 'node:crypto';
import { buildEconomicDependencyComponents, validateEconomicRouteDependencyReceipt } from './economic-route-dependency.mjs';

export const ECONOMIC_RELIABILITY_VERSION='uberbond.economic-reliability.v1.2';
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
  const founderMinutes=Math.max(0,num(raw.founderMinutes));
  const timeToCashMinutes=Math.max(0,num(raw.timeToCashMinutes));
  const eligible=Boolean(routeId&&failureDomain&&p!=null&&evidenceRefs.length&&calibrationRefs.length&&raw.policyCleared===true&&raw.executableNow===true);
  const dependencyValidation=eligible?validateEconomicRouteDependencyReceipt(raw.dependencyReceipt,routeId):{ok:false,reasonCodes:['structural-route-eligibility-required-first']};
  const reliabilityEligible=eligible&&dependencyValidation.ok;
  return {routeId,failureDomain,successProbabilityLowerBound:p,evidenceRefs,calibrationRefs,dependencyReceipt:dependencyValidation.ok?dependencyValidation.receipt:null,dependencyReasonCodes:dependencyValidation.reasonCodes||[],founderMinutes,timeToCashMinutes,policyCleared:raw.policyCleared===true,executableNow:raw.executableNow===true,eligible,reliabilityEligible};
}

function conservativeGroupProbability(members,index){
  const best=[...members].sort((a,b)=>b.successProbabilityLowerBound-a.successProbabilityLowerBound||a.routeId.localeCompare(b.routeId))[0];
  return {
    groupId:`dependency-component:${index}`,
    successProbabilityLowerBound:best?.successProbabilityLowerBound??0,
    representativeRouteId:best?.routeId??null,
    memberRouteIds:members.map(x=>x.routeId),
    law:'ANY_SHARED_CRITICAL_DEPENDENCY_COLLAPSES_ROUTES_INTO_ONE_CORRELATED_COMPONENT; ONLY_THE_STRONGEST_CALIBRATED_LOWER_BOUND_COUNTS'
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
  const dependencyWithheld=eligible.filter(x=>!x.reliabilityEligible).map(x=>({routeId:x.routeId,reasonCodes:x.dependencyReasonCodes.length?x.dependencyReasonCodes:['valid-structured-dependency-receipt-required']}));

  const dependencyGraph=buildEconomicDependencyComponents(reliabilityEligible);
  const groups=dependencyGraph.components.map(conservativeGroupProbability);
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
    dependencyWithheldCount:dependencyWithheld.length,
    independenceWithheldCount:dependencyWithheld.length,
    independentFailureDomainCount:groups.length,
    groups,
    sharedDependencyEdges:dependencyGraph.sharedEdges,
    residualZeroProbability,
    successProbability,
    targetReached,
    status:targetReached?'ECONOMIC_RELIABILITY_11_NINES_EVIDENCE_THRESHOLD_REACHED':'ECONOMIC_RELIABILITY_TARGET_NOT_YET_PROVEN',
    rejected,
    dependencyWithheld,
    independenceWithheld:dependencyWithheld,
    truthBoundary:'This is a conservative evidence-backed lower-bound model, not a guarantee. Routes without fresh calibration or a valid structured dependency receipt contribute zero. Any shared critical demand, buyer, distribution, payment, fulfillment, platform, or provider dependency collapses routes into one correlated component. Reaching the numeric threshold does not itself prove cleared money; provider-origin settlement evidence remains required.'
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
