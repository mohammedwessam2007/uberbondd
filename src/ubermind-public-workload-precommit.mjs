import crypto from 'node:crypto';

export const WORKLOAD_INTAKE_SCHEMA='uberbond.ubermind-public-workload-precommit.v1';
const sha=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const valid=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:/-]{1,180}$/.test(x);
const digest=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);
const refuse=(why,details={})=>({ok:false,status:'WORKLOAD_INTAKE_REFUSED',
 reason:why,providerCallsPerformed:0,spendAuthorized:false,...details});

export function precommitPublicWorkload({campaignId,asOf,taskRows=[]}={}){
 if(!valid(campaignId)||!Number.isFinite(Date.parse(asOf))||
   !Array.isArray(taskRows)||!taskRows.length||taskRows.length>4096)
   return refuse('bounded-dated-campaign-required');
 const names=new Set(),fingerprints=new Set(),items=[];
 for(const row of taskRows){
   if(!valid(row?.taskId)||names.has(row.taskId)||
     !valid(row.taskClass)||!digest(row.taskContentDigest)||
     fingerprints.has(row.taskContentDigest)||
     typeof row.sourceUrl!=='string'||
     !/^https:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+$/.test(row.sourceUrl)||
     row.dataClass!=='PUBLIC'||row.sourcePubliclyAccessible!==true||
     !Number.isFinite(Date.parse(row.sourceObservedAt))||
     Date.parse(row.sourceObservedAt)>Date.parse(asOf))
     return refuse('public-source-provenance-or-distinctness-unverified');
   names.add(row.taskId);fingerprints.add(row.taskContentDigest);
   items.push({taskId:row.taskId,taskClass:row.taskClass,
      taskContentDigest:row.taskContentDigest,sourceUrl:row.sourceUrl,
      sourceObservedAt:row.sourceObservedAt,
      permissionForProviderBenchmarkReuseVerified:row.externalConsentVerified===true,
      // A public issue may already have been discussed in prior chats.
      // Its precommitment does not independently prove fresh holdout status.
      independentOriginAuditStatus:'PENDING',
      independentlySealedBeforeInference:false,
      blindedBeforeCandidateRun:false,
      externalQualityJudgment:'NOT_OBSERVED',
      providerBilling:'NOT_OBSERVED',
      economicAuthority:'NONE'});
 }
 const commitment=sha({campaignId,asOf,items});
 return {ok:true,schemaVersion:WORKLOAD_INTAKE_SCHEMA,
   status:'PUBLIC_DISTINCT_TASK_MANIFEST_PRECOMMITTED_ORIGIN_AUDIT_PENDING',
   campaignId,asOf,taskCount:items.length,manifestDigest:commitment,
   items,precommittedExistingPublicTasks:items.length,
   independentFreshHoldoutsAdmitted:0,qualityPairedSamplesAdmitted:0,
   empiricalMultiplier:null,
   global33333xConfirmed:false,providerCallsPerformed:0,spendAuthorized:false,
   truthBoundary:'This manifest binds public, distinct task fingerprints and source identifiers. It does not prove each issue was novel, externally consented outside the given source declaration, sealed from models, independently graded, or comparable to billed frontier inference. No task enters empirical multiplier accounting from this precommit.'};
}

export function reviewPairedWorkloadSubmission({manifest,records=[]}={}){
 if(!manifest?.ok||manifest.schemaVersion!==WORKLOAD_INTAKE_SCHEMA||
   !Array.isArray(records)||records.length>manifest.taskCount)
   return refuse('valid-precommit-and-bounded-pairs-required');
 const submitted=new Map();
 for(const r of records){
   const t=manifest.items.find(x=>x.taskId===r?.taskId);
   if(!t||submitted.has(r.taskId)||r.taskContentDigest!==t.taskContentDigest||
      !digest(r.candidateOutputDigest)||!digest(r.frontierOutputDigest)||
      r.candidateOutputDigest===r.frontierOutputDigest||
      !valid(r.graderReceiptRef)||!valid(r.candidateProviderReceiptRef)||
      !valid(r.frontierProviderReceiptRef)||
      !Number.isSafeInteger(r.candidateMicrousd)||r.candidateMicrousd<0||
      !Number.isSafeInteger(r.frontierMicrousd)||r.frontierMicrousd<0)
     return refuse('pair-digest-or-receipt-binding-invalid');
   submitted.set(r.taskId,r);
 }
 return {ok:true,status:'PAIRED_WORKLOAD_RECEIPTS_STAGED_FOR_INDEPENDENT_AUDIT',
   taskCount:manifest.taskCount,pairedSubmissions:submitted.size,
   missingPairs:manifest.taskCount-submitted.size,
   independentQualityVerified:0,
   providerInvoicesIndependentlyAuthenticated:0,
   cheapestEligibleReferenceIndependentlyAudited:false,
   allInMonthlyCostReconciled:false,
   empiricallyAdmittedSamples:0,empiricalMultiplier:null,
   global33333xConfirmed:false,providerCallsPerformed:0,spendAuthorized:false,
   truthBoundary:'Pair rows are untrusted submissions. Claimed grader/provider IDs and costs require independent verification against protected original external records, blinding and quality contracts, and all-in spending. They cannot become quality samples or a multiplier merely by being present.'};
}
