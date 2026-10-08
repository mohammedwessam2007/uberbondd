import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const UBERMIND_FLYWHEEL_SCHEMA='uberbond.ubermind-evidence-flywheel.v1';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const h=x=>'sha256:'+sha(JSON.stringify(x));
const HEX=/^[a-f0-9]{64}$/;
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:/-]{1,180}$/.test(x);
const donorBindings=Object.freeze([
 {ordinal:15,title:'THE UNCERTAINTY ENGINE',role:'prioritize missing information, not cheap answers'},
 {ordinal:45,title:'THE INTELLIGENCE CHEMISTRY',role:'compose verified cognitive primitives'},
 {ordinal:56,title:'THE HYPOTHESIS ECONOMY',role:'allocate bounded experiments by falsifiable value'},
 {ordinal:57,title:'THE PROOF ECONOMY',role:'capitalize reusable exact proofs'},
 {ordinal:58,title:'THE ERROR ECONOMY',role:'reward failure detection before costly deployment'},
 {ordinal:59,title:'THE PREDICTION ACCOUNTING SYSTEM',role:'reconcile dated predictions against observed outcomes'},
 {ordinal:60,title:'THE CIVILIZATIONAL MEMORY',role:'preserve provenance and failed branches'},
 {ordinal:226,title:'THE INTELLIGENCE COMPOUND-INTEREST ENGINE',role:'reinvest saved compute into further verification'},
 {ordinal:229,title:'THE DISCOVERY OF UNIVERSAL LEVERAGE',role:'target bottlenecks shared across task classes'},
 {ordinal:445,title:'THE REALITY PROFILER',role:'measure actual token, provider, and founder cost'},
 {ordinal:652,title:'THE SELF-MODELING SYSTEM',role:'maintain uncertainty model and evidence freshness'},
 {ordinal:653,title:'THE SELF-FALSIFYING SYSTEM',role:'actively search for regressions and counterexamples'},
 {ordinal:877,title:'THE RECURSION PROOF SYSTEM',role:'prevent self-improving loops from changing invariant gates'}
]);

/** Load and SHA-validate every immutable shard; never claim 890 scanned unless
 * every original ordinal and its nonempty source body is present. */
export function recover890FounderIdeaUniverse({root=process.cwd()}={}){
 const dir=path.join(root,'artifacts/research/founder-moonshot-literal-corpus');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 if(manifest.corpus?.expectedCount!==890||manifest.shards?.length!==10||
    manifest.corpus?.ordinalStart!==1||manifest.corpus?.ordinalEnd!==890)
   throw Error('founder-890-manifest-invalid');
 const entries=[];
 for(const shard of manifest.shards){
   const bytes=fs.readFileSync(path.join(dir,shard.path));
   if(sha(bytes)!==shard.sha256||bytes.length!==shard.bytes)
     throw Error('founder-890-shard-digest-mismatch:'+shard.path);
   const contents=JSON.parse(bytes.toString('utf8'));
   if(contents.entryCount!==shard.entryCount||contents.entries?.length!==shard.entryCount)
     throw Error('founder-890-shard-entry-count-invalid');
   entries.push(...contents.entries);
 }
 if(entries.length!==890||entries.some((row,index)=>
   row.ordinal!==index+1||typeof row.literalTitle!=='string'||!row.literalTitle||
   typeof row.literalBodyMarkdown!=='string'||!row.literalBodyMarkdown||
   row.evidenceClass!=='DIRECT_PROJECT_TRANSCRIPT_EXACT_EXTRACTION'))
   throw Error('founder-890-incomplete-or-unordered');
 for(const binding of donorBindings){
   if(entries[binding.ordinal-1].literalTitle!==binding.title)
     throw Error('donor-original-title-changed:'+binding.ordinal);
 }
 return {ok:true,status:'FOUNDER_890_FULL_LITERAL_UNIVERSE_VERIFIED',
   sourceSha256:manifest.source.sha256,canonicalEntriesSha256:manifest.corpus.canonicalEntriesSha256,
   scannedIdeas:890,uniqueOrdinals:890,shardsVerified:10,
   verifiedDonors:donorBindings.map(d=>({
      id:'founder-moonshot-'+String(d.ordinal).padStart(4,'0'),
      title:d.title,donation:d.role,sourceLineStart:entries[d.ordinal-1].sourceLineStart
   })),
   allOriginalIdeasRemainAddressable:true,verifiedHashClass:'TEN_SHARD_SOURCE_BYTES',
   sourceEntries:entries};
}
const refuse=(reason)=>({ok:false,status:'UBERMIND_FLYWHEEL_EVIDENCE_REFUSED',reason,
  paidCallsPerformed:0,spendAuthorized:false,qualityAuthority:'NONE'});
function validObservation(row){
 return row&&safeId(row.taskClass)&&HEX.test(row.taskFingerprint)&&
   row.independent===true&&row.blinded===true&&
   ['CROWN_REFERENCE','JEV_SHADOW','CERTIFIED_EXACT'].includes(row.candidateLane)&&
   Number.isInteger(row.candidateQuality)&&row.candidateQuality>=0&&row.candidateQuality<=100&&
   Number.isInteger(row.referenceQuality)&&row.referenceQuality>=0&&row.referenceQuality<=100&&
   Number.isSafeInteger(row.candidateCostMicrousd)&&row.candidateCostMicrousd>=0&&
   Number.isSafeInteger(row.referenceCostMicrousd)&&row.referenceCostMicrousd>0&&
   safeId(row.candidateProviderReceiptRef)&&safeId(row.referenceProviderReceiptRef)&&
   safeId(row.independentEvaluatorReceiptRef)&&HEX.test(row.qualityContractHash)&&
   HEX.test(row.sourceDigest);
}
function wilsonLower(wins,total){
 if(total===0)return null;
 const z=1.96,p=wins/total,z2=z*z,denom=1+z2/total;
 return Math.max(0,(p+z2/(2*total)-z*Math.sqrt(p*(1-p)/total+z2/(4*total*total)))/denom);
}
/** Output is an evidence assessment and next-data plan, never a model Crown
 * promotion. Source receipts may be supplied by an independent custodian;
 * syntactic receipts alone do NOT prove real provider billing or blinding. */
export function compileUberMindEvidenceFlywheel({
 founderCorpus=null,observations=[],expectedTaskClasses=[],
 cumulativeActualAllInMicrousd=null,realReferenceBaselineMicrousd=null,
 verifiedIndependentReceipts=false,now=Date.now()
}={}){
 if(!founderCorpus?.ok||founderCorpus.scannedIdeas!==890||
   !Array.isArray(founderCorpus.verifiedDonors)||founderCorpus.verifiedDonors.length!==donorBindings.length)
   return refuse('verified-full-founder-890-required');
 if(!Array.isArray(observations)||observations.length>20000||
   !Array.isArray(expectedTaskClasses)||expectedTaskClasses.length>250||
   !expectedTaskClasses.every(safeId)||new Set(expectedTaskClasses).size!==expectedTaskClasses.length)
   return refuse('bounded-task-classes-required');
 const fingerprints=new Set();
 for(const row of observations){
   if(!validObservation(row))return refuse('invalid-independent-observation');
   const key=row.taskFingerprint;
   if(fingerprints.has(key))return refuse('duplicate-holdout-fingerprint');
   fingerprints.add(key);
 }
 const classes=new Map(expectedTaskClasses.map(x=>[x,[]]));
 for(const row of observations){
   if(!classes.has(row.taskClass))classes.set(row.taskClass,[]);
   classes.get(row.taskClass).push(row);
 }
 const taskClassReports=[...classes].map(([taskClass,rows])=>{
   const successes=rows.filter(r=>r.candidateQuality>=r.referenceQuality).length;
   const candidateCostMicrousd=rows.reduce((a,r)=>a+r.candidateCostMicrousd,0);
   const referenceCostMicrousd=rows.reduce((a,r)=>a+r.referenceCostMicrousd,0);
   const lower=wilsonLower(successes,rows.length);
   const measuredSampleCostFactor=candidateCostMicrousd>0
     ?referenceCostMicrousd/candidateCostMicrousd:null;
   const evidenceEligible=rows.length>=73&&
     successes===rows.length&&lower>=.95&&
     verifiedIndependentReceipts===true&&measuredSampleCostFactor!==null;
   return {taskClass,independentFingerprintCount:rows.length,
     observedNonRegressionCount:successes,observedRegressions:rows.length-successes,
     wilson95NonRegressionLowerBound:lower,
     observedCandidateMicrousd:candidateCostMicrousd,
     observedReferenceMicrousd:referenceCostMicrousd,
     measuredSampleCostFactor,
     evidenceEligibleForManualReview:evidenceEligible,
     blockers:[
       ...(!rows.length?['NO_HOLDOUTS']:[]),
       ...(rows.length<73?['INSUFFICIENT_DISTINCT_HOLDOUTS']:[]),
       ...(successes!==rows.length?['OBSERVED_QUALITY_REGRESSION']:[]),
       ...(verifiedIndependentReceipts!==true?['RECEIPT_CUSTODY_NOT_VERIFIED']:[]),
       ...(candidateCostMicrousd===0?['NO_OBSERVED_PAID_CANDIDATE_COST']:[])
     ]
   };
 }).sort((a,b)=>a.independentFingerprintCount-b.independentFingerprintCount||
   a.taskClass.localeCompare(b.taskClass));
 const allIn=Number.isSafeInteger(cumulativeActualAllInMicrousd)&&cumulativeActualAllInMicrousd>0?cumulativeActualAllInMicrousd:null;
 const reference=Number.isSafeInteger(realReferenceBaselineMicrousd)&&realReferenceBaselineMicrousd>0?realReferenceBaselineMicrousd:null;
 const ratio=allIn&&reference&&verifiedIndependentReceipts===true?reference/allIn:null;
 const target=ratio!==null&&ratio>=33333.333333&&
   taskClassReports.length>0&&taskClassReports.every(x=>x.evidenceEligibleForManualReview);
 return {ok:true,schemaVersion:UBERMIND_FLYWHEEL_SCHEMA,
   status:target?'EVIDENCE_THRESHOLD_MET_REQUIRES_EXTERNAL_AUDIT':
     'PARK_UNTIL_NEW_INDEPENDENT_EVIDENCE',
   assessedAt:new Date(now).toISOString(),
   originalFounderIdeasScanned:890,
   donorMechanismCount:founderCorpus.verifiedDonors.length,
   donorIdeaIds:founderCorpus.verifiedDonors.map(x=>x.id),
   observedDistinctHoldouts:fingerprints.size,
   taskClassReports,
   actualAllInMicrousd:allIn,verifiedRealReferenceBaselineMicrousd:reference,
   verifiedAllInCostFactor:ratio,
   aspirationalMultiplier:33333.333333,
   externalAuditRequired:true,
   generalCrownAuthority:'NONE',qualityAuthority:'NONE',
   spendAuthorized:false,paidCallsPerformed:0,
   nextWork:taskClassReports.filter(x=>!x.evidenceEligibleForManualReview)
     .map(x=>({taskClass:x.taskClass,
       distinctAdditionalHoldoutsFor73:Math.max(0,73-x.independentFingerprintCount),
       prioritize:'INDEPENDENT_BLINDED_HOLDOUT_AND_REAL_RECEIPT',
       noAutomaticSpend:true})),
   recordDigest:h({observations,expectedTaskClasses,allIn,reference,
      corpus:founderCorpus.canonicalEntriesSha256}),
   truthBoundary:'This is a deterministic evidence/accounting evaluator. Donor IDs are source lineage, not realized moonshots. Self-report receipt strings are not independent verification. 33,333x can never be claimed without independently authenticated matching quality/reference costs and an external audit.'
 };
}
