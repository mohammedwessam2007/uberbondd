import test from 'node:test';
import assert from 'node:assert/strict';
import {
 recover890FounderIdeaUniverse,compileUberMindEvidenceFlywheel
} from '../src/ubermind-890-evidence-flywheel.mjs';
import {runUberMind890ProofCycle} from '../scripts/ubermind-890-evidence-cycle.mjs';

const source=()=>recover890FounderIdeaUniverse();
const H='a'.repeat(64),G='b'.repeat(64);
const observation=(i,o={})=>({
 taskClass:'FRONTIER_OPEN_ENDED_REASONING',
 taskFingerprint:i.toString(16).padStart(64,'0'),
 candidateLane:'JEV_SHADOW',candidateQuality:90,referenceQuality:90,
 candidateCostMicrousd:1,referenceCostMicrousd:10,
 sourceDigest:G,qualityContractHash:H,
 independent:true,blinded:true,
 candidateProviderReceiptRef:'fixture:candidate:'+i,
 referenceProviderReceiptRef:'fixture:reference:'+i,
 independentEvaluatorReceiptRef:'fixture:evaluator:'+i,...o
});
test('complete literal universe 890/890 ten SHA-validated shards with material donor lineage',()=>{
 const r=source();
 assert.equal(r.ok,true);assert.equal(r.scannedIdeas,890);
 assert.equal(r.shardsVerified,10);assert.equal(r.uniqueOrdinals,890);
 assert.equal(r.verifiedDonors.length,13);
 assert.ok(r.verifiedDonors.find(x=>x.id==='founder-moonshot-0877'));
 assert.equal(r.sourceEntries[624].literalTitle,'THE ONTOLOGICAL SINGULARITY');
 assert.equal(r.sourceEntries[682].literalTitle,'THE ONTOLOGICAL SINGULARITY');
});
test('historical E1 proof remains separated from 0 independent frontier comparisons',()=>{
 const result=runUberMind890ProofCycle();
 assert.equal(result.ok,true);
 assert.equal(result.founderIdeasVerified,890);
 assert.equal(result.shardDigestsVerified,10);
 assert.equal(result.actualIndependentFrontierHoldoutsInCycle,0);
 assert.equal(result.global33333xConfirmed,false);
 assert.equal(result.paidCallsPerformed,0);
});
test('missing external evidence never produces a 33333x global claim',()=>{
 const report=compileUberMindEvidenceFlywheel({
  founderCorpus:source(),
  observations:[],
  expectedTaskClasses:['BOUNDED_PUBLIC_JEV_DECISIONS'],
  cumulativeActualAllInMicrousd:30_000_000,
  realReferenceBaselineMicrousd:1_000_000_000_000
 });
 assert.equal(report.ok,true);
 assert.equal(report.verifiedAllInCostFactor,null);
 assert.equal(report.status,'PARK_UNTIL_NEW_INDEPENDENT_EVIDENCE');
 assert.equal(report.taskClassReports[0].evidenceEligibleForManualReview,false);
 assert.equal(report.taskClassReports[0].blockers.includes('RECEIPT_CUSTODY_NOT_VERIFIED'),true);
});
test('repeated task fingerprint rejected even if the reference receipts differ',()=>{
 const a=observation(1),b=observation(1,{referenceProviderReceiptRef:'fixture:other'});
 const r=compileUberMindEvidenceFlywheel({founderCorpus:source(),observations:[a,b]});
 assert.equal(r.ok,false);assert.equal(r.reason,'duplicate-holdout-fingerprint');
});
test('quality regression is surfaced and no task-class admission is minted',()=>{
 const r=compileUberMindEvidenceFlywheel({founderCorpus:source(),observations:[
  observation(1,{candidateQuality:80,referenceQuality:90})
 ],verifiedIndependentReceipts:true});
 assert.equal(r.ok,true);assert.equal(r.taskClassReports[0].observedRegressions,1);
 assert.ok(r.taskClassReports[0].blockers.includes('OBSERVED_QUALITY_REGRESSION'));
 assert.equal(r.generalCrownAuthority,'NONE');
});
test('two historical-style blind wins yield no statistical generality',()=>{
 const r=compileUberMindEvidenceFlywheel({founderCorpus:source(),observations:[
  observation(1),observation(2)
 ],verifiedIndependentReceipts:false});
 assert.equal(r.ok,true);assert.equal(r.taskClassReports[0].independentFingerprintCount,2);
 assert.ok(r.taskClassReports[0].wilson95NonRegressionLowerBound<.5);
 assert.equal(r.taskClassReports[0].evidenceEligibleForManualReview,false);
});
test('even 73 self-declared wins do not certify provider evidence without custody',()=>{
 const r=compileUberMindEvidenceFlywheel({founderCorpus:source(),
  observations:Array.from({length:73},(_,i)=>observation(i+1)),
  verifiedIndependentReceipts:false});
 assert.equal(r.ok,true);
 assert.ok(r.taskClassReports[0].wilson95NonRegressionLowerBound>=.95);
 assert.equal(r.taskClassReports[0].evidenceEligibleForManualReview,false);
 assert.equal(r.status,'PARK_UNTIL_NEW_INDEPENDENT_EVIDENCE');
});
test('a custody-attested candidate can only reach external-audit status, never self-admission',()=>{
 const r=compileUberMindEvidenceFlywheel({founderCorpus:source(),
  observations:Array.from({length:73},(_,i)=>observation(i+1)),
  verifiedIndependentReceipts:true,
  cumulativeActualAllInMicrousd:30_000_000,
  realReferenceBaselineMicrousd:1_000_000_000_000});
 assert.equal(r.ok,true);
 assert.equal(r.taskClassReports[0].evidenceEligibleForManualReview,true);
 assert.equal(r.status,'EVIDENCE_THRESHOLD_MET_REQUIRES_EXTERNAL_AUDIT');
 assert.equal(r.generalCrownAuthority,'NONE');
 assert.equal(r.qualityAuthority,'NONE');
 assert.equal(r.externalAuditRequired,true);
});
test('invalid receipts and malformed numeric price refuse without spent effects',()=>{
 const r=compileUberMindEvidenceFlywheel({founderCorpus:source(),
  observations:[observation(1,{candidateCostMicrousd:-1})]});
 assert.equal(r.ok,false);assert.equal(r.spendAuthorized,false);
 assert.equal(r.paidCallsPerformed,0);
});
test('no-idea or partial corpus inputs fail closed',()=>{
 const r=compileUberMindEvidenceFlywheel({founderCorpus:{ok:true,scannedIdeas:4}});
 assert.equal(r.ok,false);assert.equal(r.reason,'verified-full-founder-890-required');
});

test('distinct task fingerprints cannot launder one reused candidate provider receipt into many independent rows',()=>{
 const a=observation(1),b=observation(2,{
  candidateProviderReceiptRef:a.candidateProviderReceiptRef
 });
 const out=compileUberMindEvidenceFlywheel({founderCorpus:source(),
   observations:[a,b],verifiedIndependentReceipts:true});
 assert.equal(out.ok,false);
 assert.equal(out.reason,'replayed-provider-or-evaluator-receipt');
 assert.equal(out.qualityAuthority,'NONE');
});

test('distinct task fingerprints cannot reuse same frontier bill or blinded grader receipt',()=>{
 const a=observation(1);
 for(const field of ['referenceProviderReceiptRef','independentEvaluatorReceiptRef']){
  const b=observation(2,{[field]:a[field]});
  const out=compileUberMindEvidenceFlywheel({founderCorpus:source(),
    observations:[a,b],verifiedIndependentReceipts:true});
  assert.equal(out.ok,false,field);
  assert.equal(out.reason,'replayed-provider-or-evaluator-receipt');
 }
});

test('aggregated safe input microusd overflow refuses instead of fabricating factor',()=>{
 const max=Number.MAX_SAFE_INTEGER;
 for(const field of ['candidateCostMicrousd','referenceCostMicrousd']){
  const a=observation(1,{[field]:max}),b=observation(2,{[field]:max});
  const out=compileUberMindEvidenceFlywheel({founderCorpus:source(),
   observations:[a,b],verifiedIndependentReceipts:true,
   cumulativeActualAllInMicrousd:30_000_000,
   realReferenceBaselineMicrousd:1_000_000_000_000});
  assert.equal(out.ok,false,field);
  assert.equal(out.reason,'aggregate-provider-cost-out-of-safe-range');
  assert.equal(out.qualityAuthority,'NONE');
 }
});

test('non-replayed independent rows still enter manual review only after thresholds',()=>{
 const out=compileUberMindEvidenceFlywheel({founderCorpus:source(),
  observations:Array.from({length:73},(_,i)=>observation(i+1)),
  verifiedIndependentReceipts:true,
  cumulativeActualAllInMicrousd:30_000_000,
  realReferenceBaselineMicrousd:1_000_000_000_000});
 assert.equal(out.ok,true);
 assert.equal(out.status,'EVIDENCE_THRESHOLD_MET_REQUIRES_EXTERNAL_AUDIT');
 assert.equal(out.generalCrownAuthority,'NONE');
});

test('invalid clock does not crash deterministic evidence accounting',()=>{
 const out=compileUberMindEvidenceFlywheel({founderCorpus:source(),
  observations:[observation(1)],now:'invalid-date'});
 assert.equal(out.ok,true);
 assert.equal(out.assessedAt,null);
 assert.equal(out.generalCrownAuthority,'NONE');
});
