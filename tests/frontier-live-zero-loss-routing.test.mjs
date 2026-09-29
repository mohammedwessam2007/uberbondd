import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import { compileSealedArchitectureTrial } from '../src/apex-sealed-tournament.mjs';
import { prepareFreshApexCampaign } from '../src/apex-fresh-campaign.mjs';
import { certifyCampaignFrontierCrown, validateCampaignFrontierCrownCertificate } from '../src/frontier-crown.mjs';
import { buildLiveFrontierBenchmarkFromSealedTrial } from '../src/frontier-cognitive-admission.mjs';
import { ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST } from '../src/absolute-frontier-quality-invariant.mjs';

const SUITE='live-zero-loss-routing-v1';
const FROZEN_AT='2026-09-29T01:00:00.000Z';
const COMMITTED_AT='2026-09-29T01:01:00.000Z';
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
function profile(id,model){return {id,provider:'anthropic',model,revision:'rev-1'};}
function subject(p){return {profileId:p.id,provider:p.provider,model:p.model,revision:p.revision,exclusiveCognitiveSubject:true};}
function architecture(id,klass,spend=1){
  return {
    architectureId:id,architectureClass:klass,architectureRevision:'r1',architectureSourceRef:`source://${id}`,
    architectureFrozenAt:FROZEN_AT,topologyRef:`topology://${id}`,contextPolicyRef:'context://exact',
    verifierPolicyRef:'verifier://independent',promptContractRef:'prompt://frontier',executionModeRef:'SEALED_TEST',
    jevMode:'NONE',deterministicCrystallization:false,trialSpendCeilingUsd:spend,evidencePrerequisites:[],
    modelRequirements:[{candidateId:`model-${id}`,role:'REASONER',reasoningSettingRef:'frontier:max',pricingModeRef:'SEALED_TEST',count:1,transportClass:'ANY_VERIFIED'}]
  };
}
function campaignPlan(){
  return prepareFreshApexCampaign({
    campaignId:'live-zero-loss-routing-campaign',suiteVersion:SUITE,taskClass:'general',minimumTaskCount:20,architectureFrozenAt:FROZEN_AT,
    qualityFloorPolicy:{mode:'LEXICOGRAPHIC_FRONTIER_FIRST',frontierBaselineArchitectureId:'baseline',maxQualityDelta:0,absoluteQualityPolicyDigest:ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,requireNoWorseFalsePositiveUpperBound:true},
    budgetPolicy:{normalization:'COMMON_CEILING',maxMeanCostUsd:1,maxMeanLatencyMs:10000,maxMeanFounderMinutes:1,maxTotalCampaignSpendUsd:2},
    custodianPolicy:{rawStorage:'OUTSIDE_REPOSITORY',evaluatorIndependenceRequired:true,architectureFreezeBeforeCommitmentRequired:true,freshGenerationRequired:true,previouslyEvaluatedItemReuseAllowed:false},
    architectures:[architecture('baseline','INCUMBENT',1),architecture('safe','CHALLENGER',1)]
  });
}
function runs(rows,{wrongIndexes=[],costUsd=0.02,prefix='run'}={}){
  const wrong=new Set(wrongIndexes);
  return rows.map((task,i)=>({taskId:task.taskId,runId:`${prefix}-${i}`,evidenceRef:`runtime://${prefix}/${i}`,observedAt:OBSERVED_AT,response:wrong.has(i)?`wrong-${i+1}`:`answer-${i+1}`,costUsd,latencyMs:1000+i,founderMinutes:0.001,verifierIndependent:true,holdoutPromptExposedToOptimizer:false,modelJudgedOwnIdentityMarkedAnswer:false}));
}
function trialFromRoster({rosterEntry,p,rows,wrongIndexes,costUsd,processScore=1}){
  return compileSealedArchitectureTrial({
    architectureId:rosterEntry.architectureId,architectureClass:rosterEntry.architectureClass,
    architectureDigest:rosterEntry.architectureDigest,architectureRevision:rosterEntry.architectureRevision,
    architectureSourceRef:rosterEntry.architectureSourceRef,architectureFrozenAt:rosterEntry.architectureFrozenAt,
    benchmarkSubject:subject(p),taskClass:'general',suiteVersion:SUITE,corpusDigest:corpusDigest(rows),
    sealedManifest:rows,holdoutCommitment:commitment(rows),runs:runs(rows,{wrongIndexes,costUsd,prefix:rosterEntry.architectureId}),
    processScore,processEvidenceRef:`review://${rosterEntry.architectureId}`,verifierId:'independent-verifier',architectureDesignerId:'architecture-builder'
  });
}
function externalCandidateTrial({id,p,rows,wrongIndexes,costUsd,processScore=1}){
  return compileSealedArchitectureTrial({
    architectureId:id,architectureClass:'CHALLENGER',architectureDigest:digest({id,revision:'r1'}),
    architectureRevision:'r1',architectureSourceRef:`source://${id}`,architectureFrozenAt:FROZEN_AT,
    benchmarkSubject:subject(p),taskClass:'general',suiteVersion:SUITE,corpusDigest:corpusDigest(rows),
    sealedManifest:rows,holdoutCommitment:commitment(rows),runs:runs(rows,{wrongIndexes,costUsd,prefix:id}),
    processScore,processEvidenceRef:`review://${id}`,verifierId:'independent-verifier',architectureDesignerId:'architecture-builder'
  });
}

test('Crown is canonical, fresh and bound to every architecture in the precommitted roster',()=>{
  const plan=campaignPlan();
  assert.equal(plan.ok,true,JSON.stringify(plan));
  const rows=manifest();
  const baseline=trialFromRoster({rosterEntry:plan.architectureRoster.find(x=>x.architectureId==='baseline'),p:profile('baseline-profile','opus-baseline'),rows,wrongIndexes:[18,19],costUsd:0.02});
  const safe=trialFromRoster({rosterEntry:plan.architectureRoster.find(x=>x.architectureId==='safe'),p:profile('safe-profile','safe-reviewed'),rows,wrongIndexes:[18,19],costUsd:0.03});
  const crown=certifyCampaignFrontierCrown({campaignPlan:plan,trials:[baseline,safe]});
  assert.equal(crown.ok,true,JSON.stringify(crown));
  assert.equal(crown.certificate.baselineArchitectureId,'baseline');
  assert.equal(validateCampaignFrontierCrownCertificate(crown.certificate).ok,true);
  assert.equal(validateCampaignFrontierCrownCertificate({...crown.certificate}).ok,false);
});

test('same aggregate score with swapped errors cannot mint live routing authority',()=>{
  const plan=campaignPlan();
  const rows=manifest();
  const baselineProfile=profile('baseline-profile','opus-baseline');
  const baseline=trialFromRoster({rosterEntry:plan.architectureRoster.find(x=>x.architectureId==='baseline'),p:baselineProfile,rows,wrongIndexes:[18,19],costUsd:0.02});
  const safe=trialFromRoster({rosterEntry:plan.architectureRoster.find(x=>x.architectureId==='safe'),p:profile('safe-profile','safe-reviewed'),rows,wrongIndexes:[18,19],costUsd:0.03});
  const crown=certifyCampaignFrontierCrown({campaignPlan:plan,trials:[baseline,safe]});
  assert.equal(crown.ok,true,JSON.stringify(crown));

  const swappedProfile=profile('swapped-profile','cheap-swapped');
  const swapped=externalCandidateTrial({id:'swapped',p:swappedProfile,rows,wrongIndexes:[17,19],costUsd:0.001});
  assert.equal(baseline.statistics.verifiedSuccessRate,swapped.statistics.verifiedSuccessRate);
  const out=buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial:swapped,profile:swappedProfile,taskClasses:['general'],
    frontierCrownCertificate:crown.certificate,baselineSealedTrial:baseline,now:new Date()
  });
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('paired-zero-loss-against-frontier-baseline-required'));
});

test('identical paired outcomes at lower cost can mint Crown-bound zero-loss routing authority',()=>{
  const plan=campaignPlan();
  const rows=manifest();
  const baselineProfile=profile('baseline-profile','opus-baseline');
  const baseline=trialFromRoster({rosterEntry:plan.architectureRoster.find(x=>x.architectureId==='baseline'),p:baselineProfile,rows,wrongIndexes:[18,19],costUsd:0.02});
  const safe=trialFromRoster({rosterEntry:plan.architectureRoster.find(x=>x.architectureId==='safe'),p:profile('safe-profile','safe-reviewed'),rows,wrongIndexes:[18,19],costUsd:0.03});
  const crown=certifyCampaignFrontierCrown({campaignPlan:plan,trials:[baseline,safe]});
  const candidateProfile=profile('candidate-profile','cheap-candidate');
  const candidate=externalCandidateTrial({id:'candidate',p:candidateProfile,rows,wrongIndexes:[18,19],costUsd:0.001});

  const baselineBenchmark=buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial:baseline,profile:baselineProfile,taskClasses:['general'],frontierCrownCertificate:crown.certificate,now:new Date()
  });
  assert.equal(baselineBenchmark.ok,true,JSON.stringify(baselineBenchmark));
  assert.equal(baselineBenchmark.benchmark.absoluteFrontierBaseline,true);

  const out=buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial:candidate,profile:candidateProfile,taskClasses:['general'],
    frontierCrownCertificate:crown.certificate,baselineSealedTrial:baseline,now:new Date()
  });
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.benchmark.absoluteFrontierBaseline,false);
  assert.equal(out.benchmark.pairedZeroLossCertified,true);
  assert.equal(out.benchmark.frontierBaselineArchitectureId,'baseline');
  assert.equal(out.benchmark.baselineSealedTrialReceiptDigest,baseline.receiptDigest);
  assert.match(out.benchmark.pairedZeroLossCertificationDigest,/^[a-f0-9]{64}$/);
});

test('no single pairwise dominator means no Crown and caller cannot nominate a baseline',()=>{
  const plan=campaignPlan();
  const rows=manifest();
  const baselineProfile=profile('baseline-profile','a-model');
  const baseline=trialFromRoster({rosterEntry:plan.architectureRoster.find(x=>x.architectureId==='baseline'),p:baselineProfile,rows,wrongIndexes:[18,19],costUsd:0.02});
  const safe=trialFromRoster({rosterEntry:plan.architectureRoster.find(x=>x.architectureId==='safe'),p:profile('safe-profile','b-model'),rows,wrongIndexes:[17,19],costUsd:0.01});
  const crown=certifyCampaignFrontierCrown({campaignPlan:plan,trials:[baseline,safe]});
  assert.equal(crown.ok,false);
  assert.equal(crown.status,'FRONTIER_CROWN_REQUIRES_COUNCIL_SYNTHESIS');

  const fake=buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial:baseline,profile:baselineProfile,taskClasses:['general'],now:new Date()
  });
  assert.equal(fake.ok,false);
  assert.ok(fake.reasonCodes.includes('canonical-frontier-crown-certificate-required'));
});

test('a sealed trial with the right ID but wrong frozen architecture identity cannot enter Crown review',()=>{
  const plan=campaignPlan();
  const rows=manifest();
  const baselineEntry=plan.architectureRoster.find(x=>x.architectureId==='baseline');
  const safeEntry=plan.architectureRoster.find(x=>x.architectureId==='safe');
  const baseline=trialFromRoster({rosterEntry:baselineEntry,p:profile('baseline-profile','a-model'),rows,wrongIndexes:[18,19],costUsd:0.02});
  const forgedEntry={...safeEntry,architectureDigest:'f'.repeat(64)};
  const forged=trialFromRoster({rosterEntry:forgedEntry,p:profile('safe-profile','b-model'),rows,wrongIndexes:[18,19],costUsd:0.03});
  assert.equal(forged.ok,true);
  const crown=certifyCampaignFrontierCrown({campaignPlan:plan,trials:[baseline,forged]});
  assert.equal(crown.ok,false);
  assert.ok(crown.reasonCodes.some(code=>code.includes('sealed-architecture-does-not-match-precommitted-identity')));
});
