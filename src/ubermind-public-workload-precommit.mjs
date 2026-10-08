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
 const names=new Set(),fingerprints=new Set(),sources=new Set(),items=[];
 for(const row of taskRows){
   if(!valid(row?.taskId)||names.has(row.taskId)||
     !valid(row.taskClass)||!digest(row.taskContentDigest)||
     fingerprints.has(row.taskContentDigest)||sources.has(row.sourceUrl)||
     typeof row.sourceUrl!=='string'||
     !/^https:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+$/.test(row.sourceUrl)||
     row.dataClass!=='PUBLIC'||row.sourcePubliclyAccessible!==true||
     !Number.isFinite(Date.parse(row.sourceObservedAt))||
     Date.parse(row.sourceObservedAt)>Date.parse(asOf))
     return refuse('public-source-provenance-or-distinctness-unverified');
   names.add(row.taskId);fingerprints.add(row.taskContentDigest);sources.add(row.sourceUrl);
   items.push({taskId:row.taskId,taskClass:row.taskClass,
      taskContentDigest:row.taskContentDigest,sourceUrl:row.sourceUrl,
      sourceObservedAt:row.sourceObservedAt,
      // Caller-supplied consent flags are claims, NEVER third-party verification.
      permissionForProviderBenchmarkReuseVerified:false,
      submitterClaimsExternalConsent:row.externalConsentVerified===true,
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

/** A content hash is a tamper-evident local commitment, NOT a trusted
 * signature, third-party source witness, or independent consent proof. The
 * paired staging boundary must re-derive it rather than trusting \`ok:true\`.
 */
export function verifyPublicWorkloadManifest(manifest){
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
    manifest.ok!==true||manifest.schemaVersion!==WORKLOAD_INTAKE_SCHEMA||
    manifest.status!=='PUBLIC_DISTINCT_TASK_MANIFEST_PRECOMMITTED_ORIGIN_AUDIT_PENDING'||
    !valid(manifest.campaignId)||typeof manifest.asOf!=='string'||
    !Number.isFinite(Date.parse(manifest.asOf))||
    !Array.isArray(manifest.items)||manifest.items.length<1||
    manifest.items.length>4096||manifest.taskCount!==manifest.items.length||
    manifest.precommittedExistingPublicTasks!==manifest.taskCount||
    manifest.independentFreshHoldoutsAdmitted!==0||
    manifest.qualityPairedSamplesAdmitted!==0||
    manifest.empiricalMultiplier!==null||manifest.global33333xConfirmed!==false||
    manifest.providerCallsPerformed!==0||manifest.spendAuthorized!==false||
    !digest(manifest.manifestDigest))return false;
 const allowedManifestFields=new Set(['ok','schemaVersion','status','campaignId',
  'asOf','taskCount','manifestDigest','items','precommittedExistingPublicTasks',
  'independentFreshHoldoutsAdmitted','qualityPairedSamplesAdmitted',
  'empiricalMultiplier','global33333xConfirmed','providerCallsPerformed',
  'spendAuthorized','truthBoundary']);
 if(Object.keys(manifest).some(k=>!allowedManifestFields.has(k)))return false;
 const ids=new Set(),hashes=new Set(),sources=new Set();
 const allowedItemFields=new Set(['taskId','taskClass','taskContentDigest',
  'sourceUrl','sourceObservedAt','permissionForProviderBenchmarkReuseVerified',
  'submitterClaimsExternalConsent','independentOriginAuditStatus',
  'independentlySealedBeforeInference','blindedBeforeCandidateRun',
  'externalQualityJudgment','providerBilling','economicAuthority']);
 for(const item of manifest.items){
   if(!item||typeof item!=='object'||Array.isArray(item)||
      Object.keys(item).some(k=>!allowedItemFields.has(k))||
      !valid(item.taskId)||ids.has(item.taskId)||
      !valid(item.taskClass)||!digest(item.taskContentDigest)||
      hashes.has(item.taskContentDigest)||
      typeof item.sourceUrl!=='string'||sources.has(item.sourceUrl)||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+$/.test(item.sourceUrl)||
      typeof item.sourceObservedAt!=='string'||
      !Number.isFinite(Date.parse(item.sourceObservedAt))||
      Date.parse(item.sourceObservedAt)>Date.parse(manifest.asOf)||
      item.permissionForProviderBenchmarkReuseVerified!==false||
      (item.submitterClaimsExternalConsent!==undefined&&
       typeof item.submitterClaimsExternalConsent!=='boolean')||
      item.independentOriginAuditStatus!=='PENDING'||
      item.independentlySealedBeforeInference!==false||
      item.blindedBeforeCandidateRun!==false||
      item.externalQualityJudgment!=='NOT_OBSERVED'||
      item.providerBilling!=='NOT_OBSERVED'||
      item.economicAuthority!=='NONE')return false;
   ids.add(item.taskId);hashes.add(item.taskContentDigest);sources.add(item.sourceUrl);
 }
 try{return manifest.manifestDigest===sha({campaignId:manifest.campaignId,
    asOf:manifest.asOf,items:manifest.items});}
 catch{return false;}
}

export function reviewPairedWorkloadSubmission({manifest,records=[]}={}){
 if(!verifyPublicWorkloadManifest(manifest)||
   !Array.isArray(records)||records.length>manifest.taskCount)
   return refuse('valid-precommit-and-bounded-pairs-required');
 const submitted=new Map(),itemById=new Map(manifest.items.map(x=>[x.taskId,x]));
 const allowedPairFields=new Set(['taskId','taskContentDigest',
  'candidateOutputDigest','frontierOutputDigest','graderReceiptRef',
  'candidateProviderReceiptRef','frontierProviderReceiptRef',
  'candidateMicrousd','frontierMicrousd']);
 for(const r of records){
   const t=itemById.get(r?.taskId);
   if(!t||Object.keys(r).some(k=>!allowedPairFields.has(k))||
      submitted.has(r.taskId)||r.taskContentDigest!==t.taskContentDigest||
      !digest(r.candidateOutputDigest)||!digest(r.frontierOutputDigest)||
      r.candidateOutputDigest===r.frontierOutputDigest||
      !valid(r.graderReceiptRef)||!valid(r.candidateProviderReceiptRef)||
      !valid(r.frontierProviderReceiptRef)||
      !Number.isSafeInteger(r.candidateMicrousd)||r.candidateMicrousd<0||
      !Number.isSafeInteger(r.frontierMicrousd)||r.frontierMicrousd<0)
     return refuse('pair-digest-or-receipt-binding-invalid');
   // Bind only validated receipt fields; never stringify arbitrary submitter metadata.
   submitted.set(r.taskId,{taskId:r.taskId,taskContentDigest:r.taskContentDigest,
     candidateOutputDigest:r.candidateOutputDigest,
     frontierOutputDigest:r.frontierOutputDigest,
     graderReceiptRef:r.graderReceiptRef,
     candidateProviderReceiptRef:r.candidateProviderReceiptRef,
     frontierProviderReceiptRef:r.frontierProviderReceiptRef,
     candidateMicrousd:r.candidateMicrousd,frontierMicrousd:r.frontierMicrousd});
 }
 return {ok:true,status:'PAIRED_WORKLOAD_RECEIPTS_STAGED_FOR_INDEPENDENT_AUDIT',
   taskCount:manifest.taskCount,manifestDigest:manifest.manifestDigest,
   pairedSubmissionDigest:sha([...submitted].sort(([a],[b])=>a.localeCompare(b))),
   pairedSubmissions:submitted.size,
   missingPairs:manifest.taskCount-submitted.size,
   independentQualityVerified:0,
   providerInvoicesIndependentlyAuthenticated:0,
   cheapestEligibleReferenceIndependentlyAudited:false,
   allInMonthlyCostReconciled:false,
   empiricallyAdmittedSamples:0,empiricalMultiplier:null,
   global33333xConfirmed:false,providerCallsPerformed:0,spendAuthorized:false,
   truthBoundary:'Pair rows are untrusted submissions. Claimed grader/provider IDs and costs require independent verification against protected original external records, blinding and quality contracts, and all-in spending. They cannot become quality samples or a multiplier merely by being present.'};
}
