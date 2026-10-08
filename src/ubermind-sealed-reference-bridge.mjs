import crypto from 'node:crypto';
export const SEALED_MEASURED_BRIDGE_SCHEMA='uberbond.sealed-measured-reference-bridge.v1';
const h=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const digest=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);
const score=x=>Number.isFinite(x)&&x>=0&&x<=100;
const cost=x=>Number.isFinite(x)&&x>=0&&x<10000;
const unsupported=(reason)=>({
 ok:false,status:'HISTORICAL_SEALED_PAIR_IMPORT_REFUSED',reason,
 historicDistinctTaskCount:null,independentlyAuthenticatedHoldoutsAdded:0,
 inferenceCallsPerformed:0,spendAuthorized:false,semanticAuthority:'NONE'
});
/** Review the durable adjudication *summary* without opening sealed prompts.
 * Historic results can guide what to test next but cannot become freshly
 * independently authenticated provider + blind-grader proof.
 */
export function summarizeHistoricalSealedReference(row){
 if(!row||row.status!=='MEASURED_SOL_DOMINATES_OPUS_REFERENCE_ON_ALL_SEALED_TASKS'||
   row.ok!==true||row.taskCount!==2||row.strictSameOrBetterEveryTask!==true||
   row.sourceAttemptKey!=='infinite_opus_crown_resume_20261002_r3'||
   !Array.isArray(row.perTask)||row.perTask.length!==2)
   return unsupported('exact-two-task-durable-measured-reference-required');
 const seen=new Set();let solTotal=0,opusTotal=0,failures=0;
 const hashes=[];
 for(const x of row.perTask){
   if(!digest(x.taskIdHash)||seen.has(x.taskIdHash)||
      !score(x.sol?.qualityScore)||!score(x.opus?.qualityScore)||
      !Number.isInteger(x.sol.requiredRegressions)||x.sol.requiredRegressions!==0||
      !Number.isInteger(x.opus.requiredRegressions)||x.opus.requiredRegressions<0||
      x.sol.canonicalZeroLoss!==true||
      !cost(x.sol.costUsd)||!cost(x.opus.costUsd)||
      x.sol.costUsd<=0||x.opus.costUsd<=0||
      x.sol.qualityScore<x.opus.qualityScore||
      x.solSameOrBetter!==true)
      return unsupported('separate-task-blind-quality-or-bill-invalid');
   seen.add(x.taskIdHash);hashes.push(x.taskIdHash);
   solTotal+=x.sol.costUsd;opusTotal+=x.opus.costUsd;
   failures+=x.opus.requiredRegressions;
 }
 if(!cost(row.opusCandidateCostUsd)||!cost(row.solCandidateCostUsd)||
    Math.abs(opusTotal-row.opusCandidateCostUsd)>0.000001||
    Math.abs(solTotal-row.solCandidateCostUsd)>0.000001||
    !cost(row.evaluatorCostUsd)||row.evaluatorCostUsd<=0)
   return unsupported('measured-paired-cost-or-grader-bill-mismatch');
 const factor=opusTotal/solTotal;
 if(!Number.isFinite(row.measuredCandidateCostCompressionFactor)||
    Math.abs(factor-row.measuredCandidateCostCompressionFactor)>0.000002)
   return unsupported('measured-cost-compression-inconsistent');
 const receipt={schemaVersion:SEALED_MEASURED_BRIDGE_SCHEMA,ok:true,
   status:'HISTORICAL_TWO_TASK_MEASURED_REFERENCE_SUMMARY_IMPORTED_AUDIT_PENDING',
   historicDistinctTaskCount:2,
   historicTaskHashes:hashes.sort(),
   observedSolNonRegressions:2,observedOpusRequiredRegressions:failures,
   solCandidateCostUsd:solTotal,opusReferenceCostUsd:opusTotal,
   evaluatorCostUsd:row.evaluatorCostUsd,
   candidateOnlyFactor:factor,
   proofInclusiveFactor:opusTotal/(solTotal+row.evaluatorCostUsd),
   independentlyAuthenticatedHoldoutsAdded:0,
   sealedPayloadsOpened:false,providerMetadataQueried:false,
   individualProviderReceiptIdsInSummary:false,
   sourceAttemptKey:row.sourceAttemptKey,
   evidenceClass:'HISTORIC_SEALED_ADJUDICATION_SUMMARY__NOT_NEW_PROVIDER_CUSTODY',
   inferenceCallsPerformed:0,spendAuthorized:false,semanticAuthority:'NONE',
   crownAdmission:'NONE',
   truthBoundary:'Two sealed blind-task results were already reconciled by the original historical runtime. This bridge checks stored summary consistency but cannot independently reopen original sealed prompts/provider invoices. Zero fresh fully authenticated frontier holdouts are minted.'};
 return {...receipt,sourceSummaryDigest:h(receipt)};
}
