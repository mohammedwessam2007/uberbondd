import { calibrateEconomicRoute, compileReliabilityRouteFromCalibration } from './economic-route-calibration.mjs';
import { evaluateEconomicReliability, TARGET_ZERO_MONEY_PROBABILITY } from './economic-reliability-engine.mjs';
import { planEconomicReliabilityExpansion } from './economic-reliability-expansion-planner.mjs';

export const ECONOMIC_RELIABILITY_CONTROL_LOOP_VERSION='uberbond.economic-reliability-control-loop.v1';

const arr=v=>Array.isArray(v)?v:[];
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

function routeShell(raw={}){
  return {
    routeId:text(raw.routeId,180),
    failureDomain:text(raw.failureDomain,180),
    routeEvidenceRefs:arr(raw.routeEvidenceRefs||raw.evidenceRefs),
    independenceEvidenceRefs:arr(raw.independenceEvidenceRefs),
    policyCleared:raw.policyCleared===true,
    executableNow:raw.executableNow===true,
    founderMinutes:Math.max(0,finite(raw.founderMinutes)??0),
    timeToCashMinutes:Math.max(0,finite(raw.timeToCashMinutes)??0),
    minTrials:Math.max(1,Math.floor(finite(raw.minTrials)??20))
  };
}

function calibrationFor(shell,trials){
  return calibrateEconomicRoute({
    routeId:shell.routeId,
    failureDomain:shell.failureDomain,
    trials,
    minTrials:shell.minTrials
  });
}

function evidenceRequestFor({shell,calibration,bound}){
  if(!shell.routeId||!shell.failureDomain){
    return {type:'REPAIR_ROUTE_IDENTITY',routeId:shell.routeId||null,failureDomain:shell.failureDomain||null,reasonCodes:['route-id-and-failure-domain-required']};
  }
  if(!calibration.calibrated){
    const needed=Math.max(0,calibration.minTrials-calibration.completedTrials);
    return {
      type:'COLLECT_PROVIDER_READBACK_TRIALS',routeId:shell.routeId,failureDomain:shell.failureDomain,
      completedTrials:calibration.completedTrials,minTrials:calibration.minTrials,additionalCompletedTrialsRequired:needed,
      reasonCodes:['route-calibration-insufficient']
    };
  }
  if(!shell.independenceEvidenceRefs.length){
    return {type:'PROVE_FAILURE_DOMAIN_INDEPENDENCE',routeId:shell.routeId,failureDomain:shell.failureDomain,reasonCodes:['independence-evidence-required']};
  }
  if(!shell.policyCleared){
    return {type:'RESOLVE_POLICY_CLEARANCE',routeId:shell.routeId,failureDomain:shell.failureDomain,reasonCodes:['policy-clearance-required']};
  }
  if(!shell.executableNow){
    return {type:'CLOSE_EXECUTION_DEPENDENCIES',routeId:shell.routeId,failureDomain:shell.failureDomain,reasonCodes:['route-not-executable-now']};
  }
  if(bound?.ok){
    return {type:'EXECUTE_CALIBRATED_ROUTE_CANARY',routeId:shell.routeId,failureDomain:shell.failureDomain,successProbabilityLowerBound:bound.route.successProbabilityLowerBound,reasonCodes:['reliability-target-not-yet-reached']};
  }
  return {type:'REPAIR_ROUTE_ADMISSION',routeId:shell.routeId,failureDomain:shell.failureDomain,reasonCodes:bound?.reasonCodes||['route-not-admissible']};
}

function domainsNeededAtProbability({currentResidual,p,target=TARGET_ZERO_MONEY_PROBABILITY}){
  const q=finite(currentResidual),prob=finite(p),goal=finite(target);
  if(q==null||prob==null||goal==null||q<=goal) return 0;
  if(prob<=0||prob>=1) return prob>=1?1:null;
  const denominator=Math.log(1-prob);
  if(!Number.isFinite(denominator)||denominator>=0) return null;
  return Math.max(0,Math.ceil(Math.log(goal/q)/denominator));
}

export function runEconomicReliabilityControlLoop({activeRoutes=[],candidateRoutes=[],trials=[],maxAdditions=32}={}){
  const allShells=[...arr(activeRoutes),...arr(candidateRoutes)].map(routeShell);
  const activeIds=new Set(arr(activeRoutes).map(r=>text(r?.routeId,180)).filter(Boolean));
  const records=[];
  const activeBound=[];
  const candidateBound=[];
  const evidenceRequests=[];

  for(const shell of allShells){
    const calibration=calibrationFor(shell,trials);
    const bound=compileReliabilityRouteFromCalibration({
      calibration,
      routeEvidenceRefs:shell.routeEvidenceRefs,
      independenceEvidenceRefs:shell.independenceEvidenceRefs,
      policyCleared:shell.policyCleared,
      executableNow:shell.executableNow,
      founderMinutes:shell.founderMinutes,
      timeToCashMinutes:shell.timeToCashMinutes
    });
    const record={shell,calibration,bound};
    records.push(record);
    if(bound.ok){
      if(activeIds.has(shell.routeId)) activeBound.push(bound.route);
      else candidateBound.push(bound.route);
    }
    const request=evidenceRequestFor({shell,calibration,bound});
    if(request.type!=='EXECUTE_CALIBRATED_ROUTE_CANARY'||!activeIds.has(shell.routeId)) evidenceRequests.push(request);
  }

  const reliability=evaluateEconomicReliability({routes:activeBound});
  const expansion=planEconomicReliabilityExpansion({activeRoutes:activeBound,candidateRoutes:candidateBound,maxAdditions});
  const selectedIds=new Set(expansion.selectedAdditions.map(x=>x.routeId));

  const prioritizedRequests=[];
  for(const selected of expansion.selectedAdditions){
    prioritizedRequests.push({
      type:'ACTIVATE_SELECTED_ORTHOGONAL_ROUTE',routeId:selected.routeId,failureDomain:selected.failureDomain,
      residualBefore:selected.residualBefore,residualAfter:selected.residualAfter,gainPerBurden:selected.gainPerBurden,
      reasonCodes:['highest-marginal-evidence-backed-zero-money-risk-reduction']
    });
  }
  for(const req of evidenceRequests){
    if(selectedIds.has(req.routeId)&&req.type==='EXECUTE_CALIBRATED_ROUTE_CANARY') continue;
    prioritizedRequests.push(req);
  }

  const strongestProbability=Math.max(0,...candidateBound.map(r=>r.successProbabilityLowerBound),...activeBound.map(r=>r.successProbabilityLowerBound));
  const shortfall={
    residualZeroProbability:reliability.residualZeroProbability,
    targetZeroMoneyProbability:TARGET_ZERO_MONEY_PROBABILITY,
    strongestObservedRouteLowerBound:strongestProbability,
    additionalIndependentDomainsAtStrongestObservedLowerBound:domainsNeededAtProbability({currentResidual:reliability.residualZeroProbability,p:strongestProbability})
  };

  const targetReached=reliability.targetReached;
  return {
    schemaVersion:ECONOMIC_RELIABILITY_CONTROL_LOOP_VERSION,
    status:targetReached?'ECONOMIC_RELIABILITY_MODEL_THRESHOLD_REACHED':'ECONOMIC_RELIABILITY_WORK_REMAINS',
    targetReached,
    reliability,
    expansion,
    calibrations:records.map(({shell,calibration})=>({routeId:shell.routeId,failureDomain:shell.failureDomain,calibration})),
    nextActions:targetReached?[]:prioritizedRequests,
    shortfall,
    externalEffectAuthority:'NONE',
    moneyAuthority:'NONE',
    controlLaw:'CALIBRATE_FROM_PROVIDER_READBACK -> REQUIRE_INDEPENDENCE_EVIDENCE -> EVALUATE_RESIDUAL_ZERO_MONEY_PROBABILITY -> SELECT_HIGHEST_MARGINAL_ORTHOGONAL_ROUTE -> REQUEST_NEXT_EVIDENCE_OR_EXECUTION_STEP -> REPEAT',
    truthBoundary:'MODEL_THRESHOLD_REACHED means only that the conservative evidence model is at or below the configured zero-money probability target. It is not a guarantee and is not evidence that money was actually cleared in the current window. Cleared cash still requires provider-origin settlement evidence. This loop creates no messaging, spend, customer, payment, deployment, or execution authority.'
  };
}

export { domainsNeededAtProbability };
