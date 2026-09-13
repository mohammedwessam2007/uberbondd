import { calibrateEconomicRoute, compileReliabilityRouteFromCalibration } from './economic-route-calibration.mjs';
import { evaluateEconomicReliability, TARGET_ZERO_MONEY_PROBABILITY } from './economic-reliability-engine.mjs';
import { planEconomicReliabilityExpansion } from './economic-reliability-expansion-planner.mjs';
import { validateEconomicRouteDependencyReceipt } from './economic-route-dependency.mjs';

export const ECONOMIC_RELIABILITY_CONTROL_LOOP_VERSION='uberbond.economic-reliability-control-loop.v1.3';

const arr=v=>Array.isArray(v)?v:[];
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

function routeShell(raw={}){
  return {
    routeId:text(raw.routeId,180),
    failureDomain:text(raw.failureDomain,180),
    regimeId:text(raw.regimeId,180),
    routeEvidenceRefs:arr(raw.routeEvidenceRefs||raw.evidenceRefs),
    dependencyReceipt:raw.dependencyReceipt&&typeof raw.dependencyReceipt==='object'?structuredClone(raw.dependencyReceipt):null,
    policyCleared:raw.policyCleared===true,
    executableNow:raw.executableNow===true,
    founderMinutes:Math.max(0,finite(raw.founderMinutes)??0),
    timeToCashMinutes:Math.max(0,finite(raw.timeToCashMinutes)??0),
    minTrials:Math.max(1,Math.floor(finite(raw.minTrials)??20)),
    maxTrialAgeMs:Math.max(1,finite(raw.maxTrialAgeMs)??30*24*60*60*1000)
  };
}

function calibrationFor(shell,trials,now){
  return calibrateEconomicRoute({routeId:shell.routeId,failureDomain:shell.failureDomain,regimeId:shell.regimeId,trials,minTrials:shell.minTrials,maxTrialAgeMs:shell.maxTrialAgeMs,now});
}

function evidenceRequestFor({shell,calibration,bound}){
  if(!shell.routeId||!shell.failureDomain||!shell.regimeId){
    return {type:'REPAIR_ROUTE_IDENTITY',routeId:shell.routeId||null,failureDomain:shell.failureDomain||null,regimeId:shell.regimeId||null,reasonCodes:['route-id-failure-domain-and-regime-required']};
  }
  const dependency=validateEconomicRouteDependencyReceipt(shell.dependencyReceipt,shell.routeId);
  if(!dependency.ok){
    return {type:'BUILD_EVIDENCED_DEPENDENCY_FINGERPRINT',routeId:shell.routeId,failureDomain:shell.failureDomain,regimeId:shell.regimeId,reasonCodes:dependency.reasonCodes||['structured-dependency-receipt-required']};
  }
  if(!shell.policyCleared){
    return {type:'RESOLVE_POLICY_CLEARANCE',routeId:shell.routeId,failureDomain:shell.failureDomain,regimeId:shell.regimeId,reasonCodes:['policy-clearance-required']};
  }
  if(!shell.executableNow){
    return {type:'CLOSE_EXECUTION_DEPENDENCIES',routeId:shell.routeId,failureDomain:shell.failureDomain,regimeId:shell.regimeId,reasonCodes:['route-not-executable-now']};
  }
  if(!calibration.calibrated){
    const needed=Math.max(0,calibration.minTrials-calibration.completedTrials);
    return {type:'COLLECT_FRESH_PROVIDER_READBACK_TRIALS',routeId:shell.routeId,failureDomain:shell.failureDomain,regimeId:shell.regimeId,completedTrials:calibration.completedTrials,minTrials:calibration.minTrials,additionalCompletedTrialsRequired:needed,staleOrFutureTrials:calibration.staleOrFutureTrials,reasonCodes:['fresh-current-regime-calibration-insufficient']};
  }
  if(bound?.ok) return {type:'EXECUTE_CALIBRATED_ROUTE_CANARY',routeId:shell.routeId,failureDomain:shell.failureDomain,regimeId:shell.regimeId,successProbabilityLowerBound:bound.route.successProbabilityLowerBound,reasonCodes:['reliability-target-not-yet-reached']};
  return {type:'REPAIR_ROUTE_ADMISSION',routeId:shell.routeId,failureDomain:shell.failureDomain,regimeId:shell.regimeId,reasonCodes:bound?.reasonCodes||['route-not-admissible']};
}

function domainsNeededAtProbability({currentResidual,p,target=TARGET_ZERO_MONEY_PROBABILITY}){
  const q=finite(currentResidual),prob=finite(p),goal=finite(target);
  if(q==null||prob==null||goal==null||q<=goal) return 0;
  if(prob<=0||prob>=1) return prob>=1?1:null;
  const denominator=Math.log(1-prob);
  if(!Number.isFinite(denominator)||denominator>=0) return null;
  return Math.max(0,Math.ceil(Math.log(goal/q)/denominator));
}

export function runEconomicReliabilityControlLoop({activeRoutes=[],candidateRoutes=[],trials=[],maxAdditions=32,now=new Date()}={}){
  const allShells=[...arr(activeRoutes),...arr(candidateRoutes)].map(routeShell);
  const activeIds=new Set(arr(activeRoutes).map(r=>text(r?.routeId,180)).filter(Boolean));
  const records=[];const activeBound=[];const candidateBound=[];const evidenceRequests=[];

  for(const shell of allShells){
    const calibration=calibrationFor(shell,trials,now);
    const bound=compileReliabilityRouteFromCalibration({calibration,routeEvidenceRefs:shell.routeEvidenceRefs,dependencyReceipt:shell.dependencyReceipt,policyCleared:shell.policyCleared,executableNow:shell.executableNow,founderMinutes:shell.founderMinutes,timeToCashMinutes:shell.timeToCashMinutes});
    records.push({shell,calibration,bound});
    if(bound.ok){if(activeIds.has(shell.routeId)) activeBound.push(bound.route); else candidateBound.push(bound.route);}
    evidenceRequests.push(evidenceRequestFor({shell,calibration,bound}));
  }

  const reliability=evaluateEconomicReliability({routes:activeBound});
  const expansion=planEconomicReliabilityExpansion({activeRoutes:activeBound,candidateRoutes:candidateBound,maxAdditions});
  const selectedIds=new Set(expansion.selectedAdditions.map(x=>x.routeId));
  const prioritizedRequests=[];
  for(const selected of expansion.selectedAdditions){
    prioritizedRequests.push({type:'ACTIVATE_SELECTED_ORTHOGONAL_ROUTE',routeId:selected.routeId,failureDomain:selected.failureDomain,residualBefore:selected.residualBefore,residualAfter:selected.residualAfter,gainPerBurden:selected.gainPerBurden,reasonCodes:['highest-marginal-evidence-backed-zero-money-risk-reduction']});
  }
  for(const req of evidenceRequests){if(selectedIds.has(req.routeId)&&req.type==='EXECUTE_CALIBRATED_ROUTE_CANARY') continue;prioritizedRequests.push(req);}

  const strongestProbability=Math.max(0,...candidateBound.map(r=>r.successProbabilityLowerBound),...activeBound.map(r=>r.successProbabilityLowerBound));
  const shortfall={residualZeroProbability:reliability.residualZeroProbability,targetZeroMoneyProbability:TARGET_ZERO_MONEY_PROBABILITY,strongestObservedRouteLowerBound:strongestProbability,additionalIndependentDomainsAtStrongestObservedLowerBound:domainsNeededAtProbability({currentResidual:reliability.residualZeroProbability,p:strongestProbability})};
  const targetReached=reliability.targetReached;
  return {
    schemaVersion:ECONOMIC_RELIABILITY_CONTROL_LOOP_VERSION,status:targetReached?'ECONOMIC_RELIABILITY_MODEL_THRESHOLD_REACHED':'ECONOMIC_RELIABILITY_WORK_REMAINS',targetReached,reliability,expansion,
    calibrations:records.map(({shell,calibration})=>({routeId:shell.routeId,failureDomain:shell.failureDomain,regimeId:shell.regimeId,calibration})),
    nextActions:targetReached?[]:prioritizedRequests,shortfall,externalEffectAuthority:'NONE',moneyAuthority:'NONE',
    controlLaw:'IDENTITY -> EVIDENCED_DEPENDENCY_FINGERPRINT -> POLICY_CLEARANCE -> EXECUTABLE_RAIL -> FRESH_CURRENT_REGIME_PROVIDER_READBACK_CALIBRATION -> COLLAPSE_SHARED_FAILURE_FACTORS -> EVALUATE_RESIDUAL_ZERO_MONEY_PROBABILITY -> SELECT_HIGHEST_MARGINAL_ORTHOGONAL_ROUTE -> REPEAT',
    truthBoundary:'MODEL_THRESHOLD_REACHED means only that the conservative fresh-regime evidence model is at or below the configured zero-money probability target. Impossible or unauthorized routes are repaired before trial collection. Shared critical dependencies collapse routes together. This is not a guarantee and is not evidence that money cleared in the current window. This loop creates no messaging, spend, customer, payment, deployment, or execution authority.'
  };
}

export { domainsNeededAtProbability };
