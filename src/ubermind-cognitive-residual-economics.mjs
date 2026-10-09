import {calculateOpus55SameModelCostFloor} from './ubermind-opus-quality-cost-floor.mjs';

export const UBERMIND_COGNITIVE_RESIDUAL_SCHEMA='uberbond.ubermind.fidelity-first-residual.v1';
const units=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000;
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1000000;
const price=n=>Number(n.toFixed(9));
const rejected=reason=>({ok:false,status:'UBERMIND_FIDELITY_SCENARIO_REFUSED',
 reason,paidInferencePerformed:0,acceptedQualityEquivalentWorkObserved:false,
 externalEffectAuthority:'NONE'});
/**
 * A planning model, NOT a producer of certified-reuse receipts.
 * Exact reuse is assumed only. A runtime must check real proof contracts
 * before skipping any frontier call, and may not promote this scenario.
 * Keep all unproved unsolved work on the identical high-end Opus model.
 */
export function calculateUberMindFidelityPortfolio({
 taskUnits=10,assumedProofCertifiedReuseUnits=5,
 inputTokensPerTask=100000,outputTokensPerTask=20000,
 cacheWrite5mTokensPerRemainingTask=10000,
 cacheReadTokensPerRemainingTask=70000,
 assumedValidCachePrefix=true,batchPermitted=true,
 maximumAcceptableDelayMinutes=4320,
 batchServiceDeadlineMinutes=4320,
 separateVerificationBudgetUsd=.2,
 extraToolAndFailureBudgetUsd=0,
 monthlyClaudeProUsd=20
}={}){
 const counts={taskUnits,assumedProofCertifiedReuseUnits,
  inputTokensPerTask,outputTokensPerTask,
  cacheWrite5mTokensPerRemainingTask,cacheReadTokensPerRemainingTask,
  maximumAcceptableDelayMinutes,batchServiceDeadlineMinutes};
 if(Object.values(counts).some(n=>!units(n)&&!(n>10000&&
    Number.isSafeInteger(n)&&n<=1000000))||
    taskUnits<1||assumedProofCertifiedReuseUnits>taskUnits||
    inputTokensPerTask+outputTokensPerTask>1000000||
    outputTokensPerTask>128000||
    cacheWrite5mTokensPerRemainingTask+cacheReadTokensPerRemainingTask>inputTokensPerTask||
    typeof assumedValidCachePrefix!=='boolean'||typeof batchPermitted!=='boolean'||
    !finite(separateVerificationBudgetUsd)||!finite(extraToolAndFailureBudgetUsd)||
    !finite(monthlyClaudeProUsd))
  return rejected('finite-bounded-integer-geometry-and-verified-eligibility-inputs-required');
 const remaining=taskUnits-assumedProofCertifiedReuseUnits;
 const baseline=price((taskUnits*inputTokensPerTask*4+
   taskUnits*outputTokensPerTask*20)/1000000);
 let residualOpus=0,route='CERTIFIED_REUSE_ASSUMED_ALL';
 let floorReceipt=null;
 if(remaining>0){
   const receipt=calculateOpus55SameModelCostFloor({
    totalInputTokens:remaining*inputTokensPerTask,
    totalOutputTokens:remaining*outputTokensPerTask,
    requestCount:remaining,
    maxInputTokensPerRequest:inputTokensPerTask,
    maxOutputTokensPerRequest:outputTokensPerTask,
    cacheWrite5mTokens:remaining*cacheWrite5mTokensPerRemainingTask,
    cacheReadTokens:remaining*cacheReadTokensPerRemainingTask,
    verifiedSamePrefix:assumedValidCachePrefix,
    batchPermitted,maximumAcceptableDelayMinutes,
    batchServiceDeadlineMinutes:batchServiceDeadlineMinutes
   });
   if(!receipt.ok)return rejected('residual-opus-route-not-admitted:'+receipt.reason);
   residualOpus=receipt.lowestConditionalCandidate.modeledUsd;
   route=receipt.lowestConditionalCandidate.route;
   floorReceipt={
    inputTokens:receipt.inputTokens,outputTokens:receipt.outputTokens,
    modeledRoute:route,batchAdmittedToScenario:receipt.batchAdmittedToScenario,
    cacheAdmittedToScenario:receipt.cacheAdmittedToScenario,
    providerCallsPerformed:0,actualProviderInvoiceObserved:false
   };
 }
 const modeledAllIn=price(residualOpus+separateVerificationBudgetUsd+
   extraToolAndFailureBudgetUsd);
 const modeledSavings=price(baseline-modeledAllIn);
 return {
  ok:true,status:'UBERMIND_ASSUMED_FIDELITY_PORTFOLIO_ONLY',
  sourceSchema:UBERMIND_COGNITIVE_RESIDUAL_SCHEMA,
  taskUnits,assumedProofCertifiedReuseUnits,
  independentlyCertifiedReuseUnitsObserved:null,
  frontierResidualTaskUnits:remaining,
  exactSourceProofRequiredForEverySkippedTask:true,
  baselineOpusSynchronousUsd:baseline,
  remainingSameOpusInferenceUsd:residualOpus,
  modeledAdditionalVerificationBudgetUsd:separateVerificationBudgetUsd,
  modeledAdditionalToolAndFailureBudgetUsd:extraToolAndFailureBudgetUsd,
  modeledConditionalCostUsd:modeledAllIn,
  modeledConditionalDifferenceUsd:modeledSavings,
  modeledConditionalReductionPercent:baseline>0?
    price(100*modeledSavings/baseline):null,
  selectedSameModelRoute:route,residualRouteReceipt:floorReceipt,
  actualPaidProviderChargeUsd:null,actualQualityMatchedSavingsUsd:null,
  actualCurrentClaudeProUsage:null,
  monthlyClaudeProSubscriptionUsd:monthlyClaudeProUsd,
  cashCostIfNoSeparatelyPaidInferenceUsd:monthlyClaudeProUsd,
  cashSavingsVersusSameSubscriptionUsd:0,
  paidInferencePerformed:0,
  independentlyMatchedFrontierQualityObserved:false,
  externalEffectAuthority:'NONE',
  truthBoundary:'Scenario math only: assumed reuse must be independently certified per task; cache requires real write/read receipts and route eligibility; batch must satisfy deadline and features. Remaining novel tasks retain Opus 5.5. Assumed verification/tools charges are budget inputs, not observed actual expenses. No Pro entitlement or paid API call is created.'
 };
}