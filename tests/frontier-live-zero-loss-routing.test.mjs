import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import { compileSealedArchitectureTrial } from '../src/apex-sealed-tournament.mjs';
import { buildLiveFrontierBenchmarkFromSealedTrial } from '../src/frontier-cognitive-admission.mjs';

const SUITE='live-zero-loss-routing-v1';
const COMMITTED_AT='2026-09-29T01:00:00.000Z';
const FROZEN_AT='2026-09-29T01:01:00.000Z';
const OBSERVED_AT='2026-09-29T01:02:00.000Z';

const stable=value=>Array.isArray(value)?value.map(stable):(!value||typeof value!=='object'?value:Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])));
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const rawDigest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');

function manifest(count=20){
  return Array.from({length:count},(_,i)=>{
    const taskId=`task-${String(i+1).padStart(3,'0')}`;
    return {taskId,family:'REASONING',tier:'SEALED_HOLDOUT',difficulty:0.8,answerDigest:sealedAnswerDigest({suiteVersion:SUITE,taskId,answer:`answer-${i+1}`})};
  });
}
function manifestDigest(rows){return digest(rows.map(r=>({taskId:r.taskId,family:r.family,tier:r.tier,difficulty:r.difficulty,answerDigest:r.answerDigest})));}
function corpusDigest(rows){return rawDigest(JSON.stringify(rows.map(r=>[r.taskId,r.family,r.tier,r.answerDigest])));}
function commitment(rows){
  return {commitmentRef:`holdout://${manifestDigest(rows)}`,committedAt:COMMITTED_AT,sourceFreezeRef:'source-freeze://zero-loss-routing',evaluatorRef:'evaluator://independent',suiteVersion:SUITE,corpusDigest:corpusDigest(rows),manifestDigest:manifestDigest(rows),taskCount:rows.length,rawHoldoutsStoredInRepository:false,optimizerAccessBeforeEvaluation:false,candidateAccessBeforeEvaluation:false,plaintextAnswersExposedBeforeEvaluation:false,evaluatorIndependent:true};
}
function profile(id,model){
  return {id,provider:'anthropic',model,revision:'rev-1'};
}
function subject(p){return {profileId:p.id,provider:p.provider,model:p.model,revision:p.revision,exclusiveCognitiveSubject:true};}
function runs(rows,{wrongIndexes=[],costUsd=0.02,prefix='run'}={}){
  const wrong=new Set(wrongIndexes);
  return rows.map((task,i)=>({taskId:task.taskId,runId:`${prefix}-${i}`,evidenceRef:`runtime://${prefix}/${i}`,observedAt:OBSERVED_AT,response:wrong.has(i)?`wrong-${i+1}`:`answer-${i+1}`,costUsd,latencyMs:1000+i,founderMinutes:0.001,verifierIndependent:true,holdoutPromptExposedToOptimizer:false,modelJudgedOwnIdentityMarkedAnswer:false}));
}
function trial({id,architectureClass,p,rows,wrongIndexes,costUsd,processScore=1}){
  return compileSealedArchitectureTrial({
    architectureId:id,architectureClass,
    architectureDigest:digest({id,revision:'r1'}),architectureRevision:'r1',architectureSourceRef:`source://${id}`,
    architectureFrozenAt:FROZEN_AT,benchmarkSubject:subject(p),taskClass:'general',suiteVersion:SUITE,corpusDigest:corpusDigest(rows),
    sealedManifest:rows,holdoutCommitment:commitment(rows),runs:runs(rows,{wrongIndexes,costUsd,prefix:id}),
    processScore,processEvidenceRef:`review://${id}`,verifierId:'independent-verifier',architectureDesignerId:'architecture-builder'
  });
}

test('equal aggregate score with swapped errors cannot mint a live routing benchmark',()=>{
  const rows=manifest();
  const baselineProfile=profile('baseline-profile','opus-baseline');
  const candidateProfile=profile('candidate-profile','cheap-candidate');
  const baseline=trial({id:'baseline',architectureClass:'INCUMBENT',p:baselineProfile,rows,wrongIndexes:[18,19],costUsd:0.02});
  const swapped=trial({id:'swapped',architectureClass:'CHALLENGER',p:candidateProfile,rows,wrongIndexes:[17,19],costUsd:0.001});
  assert.equal(baseline.ok,true,JSON.stringify(baseline));
  assert.equal(swapped.ok,true,JSON.stringify(swapped));
  assert.equal(baseline.statistics.verifiedSuccessRate,swapped.statistics.verifiedSuccessRate);

  const baseBenchmark=buildLiveFrontierBenchmarkFromSealedTrial({sealedTrial:baseline,profile:baselineProfile,taskClasses:['general'],frontierBaseline:true,now:new Date(OBSERVED_AT)});
  assert.equal(baseBenchmark.ok,true,JSON.stringify(baseBenchmark));
  assert.equal(baseBenchmark.benchmark.absoluteFrontierBaseline,true);

  const candidateBenchmark=buildLiveFrontierBenchmarkFromSealedTrial({sealedTrial:swapped,profile:candidateProfile,taskClasses:['general'],baselineSealedTrial:baseline,now:new Date(OBSERVED_AT)});
  assert.equal(candidateBenchmark.ok,false);
  assert.ok(candidateBenchmark.reasonCodes.includes('paired-zero-loss-against-frontier-baseline-required'));
  assert.ok(candidateBenchmark.reasonCodes.includes('paired-task-regression-detected'));
});

test('identical paired outcomes at lower cost can mint zero-loss routing authority against the exact baseline',()=>{
  const rows=manifest();
  const baselineProfile=profile('baseline-profile','opus-baseline');
  const candidateProfile=profile('candidate-profile','cheap-candidate');
  const baseline=trial({id:'baseline',architectureClass:'INCUMBENT',p:baselineProfile,rows,wrongIndexes:[18,19],costUsd:0.02});
  const candidate=trial({id:'candidate',architectureClass:'CHALLENGER',p:candidateProfile,rows,wrongIndexes:[18,19],costUsd:0.001});
  assert.equal(baseline.ok,true,JSON.stringify(baseline));
  assert.equal(candidate.ok,true,JSON.stringify(candidate));

  const out=buildLiveFrontierBenchmarkFromSealedTrial({sealedTrial:candidate,profile:candidateProfile,taskClasses:['general'],baselineSealedTrial:baseline,now:new Date(OBSERVED_AT)});
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.benchmark.absoluteFrontierBaseline,false);
  assert.equal(out.benchmark.pairedZeroLossCertified,true);
  assert.equal(out.benchmark.frontierBaselineArchitectureId,'baseline');
  assert.equal(out.benchmark.frontierCandidateArchitectureId,'candidate');
  assert.equal(out.benchmark.baselineSealedTrialReceiptDigest,baseline.receiptDigest);
  assert.match(out.benchmark.pairedZeroLossCertificationDigest,/^[a-f0-9]{64}$/);
});
