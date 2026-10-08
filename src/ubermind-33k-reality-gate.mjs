import crypto from 'node:crypto';
export const UBERMIND_33K_REALITY_GATE='uberbond.ubermind-33k-reality-gate.v1';
const ID=/^[A-Za-z0-9_.:/-]{1,160}$/;
const SHA=/^(?:sha256:)?[a-f0-9]{64}$/;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function evaluateReferenceCapacityModel({model,sourceUrl,observedAt,
 contextTokens,maxOutputTokens,inputUsdPerMillion,outputUsdPerMillion}={}){
 if(!ID.test(model??'')||typeof sourceUrl!=='string'||!sourceUrl.startsWith('https://')||
  !Number.isFinite(Date.parse(observedAt))||
  !integer(contextTokens)||!integer(maxOutputTokens)||contextTokens<1||
  maxOutputTokens>contextTokens||maxOutputTokens<1||
  !finite(inputUsdPerMillion)||!finite(outputUsdPerMillion))
  return {ok:false,status:'MODEL_CATALOG_CAPACITY_UNVERIFIED'};
 // This is an upper bound per API request, subject to the particular model's
 // declared hard maximum output and context. It is NOT an achievable real
 // workload, a verified cheapest eligible route, nor paid market evidence.
 const outputAtBound=outputUsdPerMillion>inputUsdPerMillion?maxOutputTokens:0;
 const inputAtBound=contextTokens-outputAtBound;
 const maximalUsd=(inputAtBound*inputUsdPerMillion+
   outputAtBound*outputUsdPerMillion)/1_000_000;
 const mathematicalMinRequests=Math.max(1,Math.ceil(1_000_000/maximalUsd));
 return {ok:true,status:'MODELED_SINGLE_REQUEST_REFERENCE_CAPACITY_ONLY',
  model,sourceUrl,observedAt,contextTokens,maxOutputTokens,
  theoreticalMaxDirectUsdPerRequest:maximalUsd,
  minimumDistinctReferenceRequestsFor1mUsd:mathematicalMinRequests,
  assumptions:'Every hypothetical request saturates model hard token limits at un-discounted declared tariff. Real tasks, batching, prompt and response caching, provider discounts, price validity and customer demand are not asserted.',
  modeledOnly:true,independentProviderReceiptsObserved:0,
  target33333xVerified:false};
}
const refuse=(reasons,meta={})=>({schemaVersion:UBERMIND_33K_REALITY_GATE,
 ok:false,status:'UBERMIND_33333X_NOT_EMPIRICALLY_VERIFIED',reasons:[...new Set(reasons)],
 empiricalMultiplier:null,
 target33333xConfirmed:false,independentAuditAdmission:'NONE',
 providerInferenceCallsPerformed:0,externalEffectAuthority:'NONE',...meta});
/**
 * Strict admission PRECHECK, not a self-authenticating verifier. Real positive
 * admission requires a separate, independent external audit of this bundle.
 * Caller-provided flags, signatures without a trust pin, or raw ledger sums
 * can NEVER self-promote this function to a 33k result.
 */
export function audit33kEvidencePrerequisites({
 taskClass=null,period=null,observedExecutions=[],
 independentQualityReceipts=[],independentProviderBills=[],
 independentlyCertifiedCheapestReference=null,
 independentlyReconciledAllInMicrousd=null,
 claimedDirectReferenceMicrousd=null,
 productionCustomerDemandReceipts=[],benchmarkIsSynthetic=false
}={}){
 const reasons=[];
 if(!ID.test(taskClass??''))reasons.push('BOUNDED_TASK_CLASS_REQUIRED');
 if(!/^\d{4}-\d{2}$/.test(period??''))reasons.push('PRODUCTION_PERIOD_REQUIRED');
 if(!Array.isArray(observedExecutions)||observedExecutions.length===0)
   reasons.push('NO_AUTHENTICATED_FINISHED_WORK');
 if(!Array.isArray(independentQualityReceipts)||independentQualityReceipts.length===0)
   reasons.push('INDEPENDENT_PAIRED_QUALITY_RECEIPTS_MISSING');
 if(!Array.isArray(independentProviderBills)||independentProviderBills.length===0)
   reasons.push('REAL_PROVIDER_BILLING_AND_ROUTE_RECEIPTS_MISSING');
 if(!independentlyCertifiedCheapestReference?.externalAuditorId||
   !independentlyCertifiedCheapestReference?.marketTimestamp||
   !independentlyCertifiedCheapestReference?.cacheBatchAndRetryDiscountAudit)
   reasons.push('CHEAPEST_ELIGIBLE_REFERENCE_MARKET_AUDIT_MISSING');
 if(!integer(independentlyReconciledAllInMicrousd)||independentlyReconciledAllInMicrousd<1)
   reasons.push('PRODUCTION_ALL_IN_COST_RECONCILIATION_MISSING');
 if(!integer(claimedDirectReferenceMicrousd)||claimedDirectReferenceMicrousd<1)
   reasons.push('REAL_REFERENCE_WORK_COUNTERFACTUAL_MISSING');
 if(!Array.isArray(productionCustomerDemandReceipts)||!productionCustomerDemandReceipts.length)
   reasons.push('REAL_DISTINCT_WORK_DEMAND_MISSING');
 if(benchmarkIsSynthetic)reasons.push('SYNTHETIC_BENCHMARK_NOT_REAL_DEMAND');
 // Never import synthetic task clones, duplicate IDs or replayed proofs as
 // independent units of value. Task IDs alone are not custody evidence.
 const seen=new Set();
 if(Array.isArray(observedExecutions))for(const x of observedExecutions){
   if(!ID.test(x?.executionId??'')||!SHA.test(x?.taskFingerprint??'')||
      !ID.test(x?.qualityContractId??'')||
      !Number.isFinite(Date.parse(x?.completedAt??''))||
      seen.has(x.taskFingerprint)||x.synthetic===true||x.simulated===true){
       reasons.push('DUPLICATE_SYNTHETIC_OR_UNBOUND_EXECUTION');
       break;
   }
   seen.add(x.taskFingerprint);
 }
 const actual=independentlyReconciledAllInMicrousd;
 const reference=claimedDirectReferenceMicrousd;
 const computedRatio=integer(actual)&&actual>0&&integer(reference)&&reference>0
  ?reference/actual:null;
 const mathsMeets=computedRatio!==null&&computedRatio>=33333.333333333336&&
  actual<=30_000_000&&reference>=1_000_000_000_000;
 if(!mathsMeets)reasons.push('REAL_33333X_ARITHMETIC_THRESHOLD_NOT_MET');
 // Deliberately refuse external trust promotion. Provider/auditor receipts
 // passed as bare user-supplied JSON have NOT been authenticated. A pinned
 // independent signed-audit system must be added before real admission.
 reasons.push('EXTERNAL_INDEPENDENT_CRYPTOGRAPHIC_AUDIT_NOT_PERFORMED');
 return refuse(reasons,{
  inputsPassingStructuralPrecheck:reasons.length===1,
  untrustedComputedRatioForAuditOnly:computedRatio,
  arithmeticThresholdWouldBeMet:mathsMeets,
  admittedIndependentWorkCount:0,
  observedUntrustedExecutionRows:Array.isArray(observedExecutions)?observedExecutions.length:null,
  auditInputDigest:hash({taskClass,period,observedExecutions,independentQualityReceipts,
   independentProviderBills,independentlyCertifiedCheapestReference,
   independentlyReconciledAllInMicrousd,claimedDirectReferenceMicrousd,
   productionCustomerDemandReceipts,benchmarkIsSynthetic}),
  externalAuditorPublicKeyPinned:false,
  truthBoundary:'No user/repository-supplied boolean or raw estimated ledger can certify 33,333x. Requires independently pinned signed external audit of authentic distinct work, paired frontier quality, cheapest legitimately available direct reference and reconciled all-in costs. A real $1M reference on a real <=$30 spend period remains unobserved.'
 });
}
