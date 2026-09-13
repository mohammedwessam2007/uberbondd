import { compileUniversalWealthPortfolio } from './universal-wealth-engine.mjs';
import { evaluateEconomicReliability, rankReliabilityActions } from './economic-reliability-engine.mjs';

export const ECONOMIC_RELIABILITY_WEALTH_BRIDGE_VERSION='uberbond.economic-reliability-wealth-bridge.v1.1';

const arr=v=>Array.isArray(v)?v:[];
const num=v=>Number.isFinite(Number(v))?Number(v):null;

function reliabilityRouteFromCandidate(candidate={}){
  const p=num(candidate.successProbabilityLowerBound);
  return {
    routeId:candidate.id,
    failureDomain:candidate.failureDomain,
    regimeId:candidate.regimeId||null,
    successProbabilityLowerBound:p,
    evidenceRefs:arr(candidate.evidenceRefs),
    calibrationRefs:arr(candidate.calibrationRefs),
    dependencyReceipt:candidate.dependencyReceipt&&typeof candidate.dependencyReceipt==='object'?structuredClone(candidate.dependencyReceipt):null,
    policyCleared:candidate.policyCleared===true,
    executableNow:candidate.executableNow===true,
    founderMinutes:candidate.founderMinutes,
    timeToCashMinutes:num(candidate.timeToCashMinutes)??Math.max(0,(num(candidate.timeToCashDays)??0)*1440)
  };
}

export function compileReliabilityFirstWealthPortfolio({candidates=[],maxCanaries=5,maxCapitalAtRisk=0}={}){
  const wealth=compileUniversalWealthPortfolio({candidates,maxCanaries:maxCanaries*4,maxCapitalAtRisk});
  const eligibleCandidateIds=new Set(wealth.evaluated.filter(x=>x.eligible).map(x=>x.candidateId));
  const routes=arr(candidates).filter(x=>eligibleCandidateIds.has(x.id)).map(reliabilityRouteFromCandidate);
  const reliability=evaluateEconomicReliability({routes});
  const reliabilityRanking=rankReliabilityActions({routes});
  const byId=new Map(wealth.evaluated.map(x=>[x.candidateId,x]));
  const canaries=reliabilityRanking
    .filter(x=>byId.get(x.routeId)?.eligible)
    .slice(0,Math.max(0,Number(maxCanaries)||0))
    .map(x=>x.routeId);
  return {
    schemaVersion:ECONOMIC_RELIABILITY_WEALTH_BRIDGE_VERSION,
    status:reliability.targetReached?'WEALTH_RELIABILITY_TARGET_REACHED':'WEALTH_RELIABILITY_TARGET_NOT_PROVEN',
    canaries,
    reliability,
    wealth,
    selectionLaw:'PRIMARY_OBJECTIVE_MINIMIZES_FRESH_EVIDENCE_BACKED_ZERO_MONEY_PROBABILITY_AFTER_SHARED_DEPENDENCY_COLLAPSE; EXPECTED_CONTRIBUTION_REMAINS_A_FEASIBILITY_AND_VALUE_GATE',
    externalEffectAuthority:'NONE',
    capitalDeploymentAuthority:'NONE',
    truthBoundary:'Reliability ranking cannot create execution authority, customer demand, settlement, or money. Only wealth-eligible candidates enter the reliability tournament, and only calibrated executable routes with valid dependency receipts can reduce the modeled zero-money probability.'
  };
}
