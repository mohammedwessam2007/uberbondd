import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chooseSolEffort, vectorizeJevQuestions, selectProcessorPlan, processorRolesFromConfig,
  estimateDirectOpusUsd, estimateSolThenOpusAcceptUsd, estimateCompressedFrontierUsd, estimateFusedMimoFrontierUsd, estimateJevControlUsd,
  chooseFreshFrontierPath, buildGenericJevControlQuestions, estimateWriterThenCrownAcceptUsd,
  cheapestPossibleWriterLowerBound, chooseAdaptiveCandidateWriter, shouldRunIndependentCritic,
  estimateIndependentCriticSurchargeUsd, estimateRouteWithCacheUsd, estimateDirectCrownUsd } from '../src/openrouter-processor-auction-v5.mjs';

const cfg=JSON.parse(fs.readFileSync(new URL('../config/openrouter-processor-fabric-v5.json',import.meta.url),'utf8'));

test('processor fabric binds every model to a distinct structural role',()=>{
  const r=processorRolesFromConfig(cfg);
  assert.equal(r.control,'typesafe/jev-1.13');
  assert.equal(r.bandwidth,'xiaomi/mimo-v2.6-flash');
  assert.equal(r.divergent,'deepseek/deepseek-v4.1-flash');
  assert.equal(r.builder,'openai/gpt-6.1-sol');
  assert.equal(r.hardResidual,'openai/gpt-6.1-sol-pro');
  assert.equal(r.crown,'anthropic/claude-opus-5.5');
});

test('Jev vectorizes multiple typed control questions over one shared state',()=>{
  const qs=vectorizeJevQuestions([
    {id:'relevance',type:'noul'},
    {id:'route',type:'choice'},
    {id:'relevance',type:'noul'}
  ]);
  assert.equal(qs.length,2);
  const p=selectProcessorPlan({
    boundedDecision:true,sharedStateTokens:12000,typedQuestions:qs,jevCertified:true,
    requiredQuality:'Q_CERTIFIED_BOUNDED',requiresOpenEndedProse:false
  });
  assert.equal(p.lane,'JEV_CERTIFIED');
  assert.equal(p.plan[0].mode,'MULTI_QUESTION_SHARED_STATE');
  assert.equal(p.crownRequired,false);
});

test('valid E0-E4 bypasses all generative processors',()=>{
  const p=selectProcessorPlan({equivalenceClass:'E4',proofVerified:true,dependenciesCurrent:true});
  assert.equal(p.lane,'EXACT_COMPILED');
  assert.equal(p.plan.length,1);
  assert.equal(p.plan[0].processor,'CODE_OR_E0_E4');
});

test('direct Opus wins when preprocessing would cost at least as much as direct Crown',()=>{
  const p=selectProcessorPlan({requiredQuality:'Q_FRONTIER',estimatedDirectOpusUsd:.02,estimatedPreworkUsd:.025});
  assert.equal(p.lane,'DIRECT_CROWN');
  assert.equal(p.plan.at(-1).processor,'OPUS_5_5');
});

test('source-heavy multimodal task uses MiMo bandwidth before Sol and Opus',()=>{
  const p=selectProcessorPlan({sourceHeavy:true,multimodal:true,inputTokens:200000,needsConstructiveAnswer:true,requiredQuality:'Q_FRONTIER'});
  assert.equal(p.plan[0].processor,'MIMO_V2_6_FLASH');
  assert.equal(p.plan.some(x=>x.processor==='GPT_6_1_SOL'),true);
  assert.equal(p.plan.at(-1).processor,'CLAUDE_OPUS_5_5');
});

test('independent challenge and agentic diversity are distinct branches, not duplicated generic critics',()=>{
  const p=selectProcessorPlan({independentChallenge:true,longHorizonToolLoop:true,needsConstructiveAnswer:false});
  assert.deepEqual(p.plan.map(x=>x.processor),['DEEPSEEK_V4_1_FLASH','GLM_5_3_FLASH']);
});

test('Sol reasoning effort scales before Pro is admitted',()=>{
  assert.equal(chooseSolEffort({complexity:'low'}),'low');
  assert.equal(chooseSolEffort({complexity:'high'}),'high');
  assert.equal(chooseSolEffort({complexity:'very_high'}),'xhigh');
  assert.equal(chooseSolEffort({stakes:'high'}),'max');

  const noPro=selectProcessorPlan({needsConstructiveAnswer:true,complexity:'very_high',requiredQuality:'Q_FRONTIER'});
  assert.equal(noPro.plan.some(x=>x.processor==='GPT_6_1_SOL_PRO'),false);
  assert.equal(noPro.plan.find(x=>x.processor==='GPT_6_1_SOL').reasoningEffort,'xhigh');

  const pro=selectProcessorPlan({needsConstructiveAnswer:true,solResidualUnresolved:true,solEffortAttempted:'max',expectedErrorCost:'high',requiredQuality:'Q_FRONTIER'});
  assert.equal(pro.plan.some(x=>x.processor==='GPT_6_1_SOL_PRO'),true);
});

test('Opus remains delta Crown rather than routine prose generator',()=>{
  const p=selectProcessorPlan({needsConstructiveAnswer:true,requiredQuality:'Q_FRONTIER',finalSemanticAuthorityRequired:true});
  const crown=p.plan.at(-1);
  assert.equal(crown.processor,'CLAUDE_OPUS_5_5');
  assert.equal(crown.mode,'CROWN_DELTA_REVIEW');
  assert.deepEqual(crown.outputProtocol,['ACCEPT','PATCH','REWRITE','UNRESOLVED']);
});


test('fresh path cost geometry can prefer direct Opus for input-heavy short-output work',()=>{
  const r=chooseFreshFrontierPath({inputTokens:100000,expectedOutputTokens:1000});
  assert.equal(r.selected.path,'DIRECT_OPUS');
  assert.ok(estimateDirectOpusUsd({freshInputTokens:100000,outputTokens:1000}) <
            estimateSolThenOpusAcceptUsd({inputTokens:100000,builderOutputTokens:1000}));
});

test('Sol draft plus Opus ACCEPT can beat direct Opus for short-input long-output work',()=>{
  const r=chooseFreshFrontierPath({inputTokens:1000,expectedOutputTokens:5000});
  assert.equal(r.selected.path,'SOL_THEN_OPUS_ACCEPT');
});

test('MiMo compression path is considered only when source anchors and lossless contract exist',()=>{
  const denied=chooseFreshFrontierPath({inputTokens:200000,expectedOutputTokens:2500,compressedEvidenceTokens:5000});
  assert.equal(denied.compressionEligible,false);
  assert.equal(denied.candidates.some(x=>x.path==='MIMO_COMPRESS_SOL_DEEPSEEK_OPUS'),false);

  const allowed=chooseFreshFrontierPath({
    inputTokens:200000,expectedOutputTokens:2500,compressedEvidenceTokens:5000,
    compressionLosslessContract:true,sourceAnchorsRetained:true
  });
  assert.equal(allowed.compressionEligible,true);
  assert.equal(allowed.selected.path,'MIMO_COMPRESS_SOL_DEEPSEEK_OPUS');
  const c=estimateCompressedFrontierUsd({originalInputTokens:200000,compressedEvidenceTokens:5000,builderOutputTokens:2500,redTeamOutputTokens:300});
  assert.ok(c < estimateDirectOpusUsd({freshInputTokens:200000,outputTokens:2500}));
});

test('fused MiMo evidence+candidate path removes the separate Sol builder without removing Crown authority',()=>{
  const oldPath=estimateCompressedFrontierUsd({
    originalInputTokens:200000,compressedEvidenceTokens:5000,builderOutputTokens:2500,redTeamOutputTokens:300
  });
  const fused=estimateFusedMimoFrontierUsd({
    originalInputTokens:200000,compressedEvidenceTokens:5000,candidateOutputTokens:2500,redTeamOutputTokens:300
  });
  assert.equal(oldPath,0.096851);
  assert.equal(fused,0.062551);
  assert.ok(fused<oldPath);
  assert.ok(0.85/fused>13.58);
  const chosen=chooseFreshFrontierPath({
    inputTokens:200000,expectedOutputTokens:2500,compressedEvidenceTokens:5000,
    redTeamOutputTokens:300,compressionLosslessContract:true,sourceAnchorsRetained:true
  });
  assert.equal(chosen.selected.path,'MIMO_FUSED_EVIDENCE_CANDIDATE_DEEPSEEK_OPUS');
});

test('accepted canonical path uses output-token surgery for RedTeam PASS instead of 300 prose tokens',()=>{
  const verbose=estimateFusedMimoFrontierUsd({
    originalInputTokens:200000,compressedEvidenceTokens:5000,candidateOutputTokens:2500,redTeamOutputTokens:300
  });
  const compact=estimateFusedMimoFrontierUsd({
    originalInputTokens:200000,compressedEvidenceTokens:5000,candidateOutputTokens:2500,redTeamOutputTokens:6
  });
  assert.equal(verbose,0.062551);
  assert.equal(compact,0.06122212);
  assert.ok(compact<verbose);
  assert.ok(0.85/compact>13.88);
});

test('JEV can omit low-value independent critic while Opus Crown remains mandatory',()=>{
  const withCritic=estimateFusedMimoFrontierUsd({
    originalInputTokens:200000,compressedEvidenceTokens:5000,candidateOutputTokens:2500,redTeamOutputTokens:6,
    includeIndependentCritic:true
  });
  const withoutCritic=estimateFusedMimoFrontierUsd({
    originalInputTokens:200000,compressedEvidenceTokens:5000,candidateOutputTokens:2500,redTeamOutputTokens:6,
    includeIndependentCritic:false
  });
  assert.equal(withCritic,0.06122212);
  assert.equal(withoutCritic,0.06022);
  assert.ok(withoutCritic<withCritic);
  assert.ok(0.85/withoutCritic>14.11);
});

test('JEV control-plane cost is counted in all-in path economics',()=>{
  const jev=estimateJevControlUsd({sharedStateTokens:1000});
  assert.equal(jev,0.000042);
  const path=estimateFusedMimoFrontierUsd({
    originalInputTokens:200000,compressedEvidenceTokens:5000,candidateOutputTokens:2500,
    redTeamOutputTokens:6,includeIndependentCritic:false
  })+jev;
  assert.equal(path,0.060262);
  assert.ok(0.85/path>14.10);
});

test('generic Jev control tensor separates execution-shape judgments instead of one vague router label',()=>{
  const q=buildGenericJevControlQuestions();
  assert.equal(q.task_shape.type,'choice');
  assert.equal(q.source_compression_value.type,'score');
  assert.equal(q.independent_challenge.type,'noul');
  assert.equal(q.hard_reasoning.type,'score');
  assert.equal(q.crown_necessity.type,'noul');
});


const route=(model,input,output,cache=null)=>({model,inputUsdPerMillion:input,outputUsdPerMillion:output,cacheReadUsdPerMillion:cache});
const crownRoute=route('anthropic/claude-opus-5.5',4,20,.2);
const mimoRoute=route('xiaomi/mimo-v2.6-flash',.14,.28,.0028);
const deepseekRoute=route('deepseek/deepseek-v4.1-flash',.13,.52,.0026);
const solRoute=route('openai/gpt-6.1-sol',2,10,.1);

test('theoretical writer lower bound proves when JEV/prework cannot beat direct Crown',()=>{
  const low=cheapestPossibleWriterLowerBound({
    writerRoutes:[mimoRoute,deepseekRoute,solRoute],crownRoute,inputTokens:100000,candidateOutputTokens:100
  });
  assert.equal(low.model,'xiaomi/mimo-v2.6-flash');
  assert.ok(low.usd>estimateDirectOpusUsd({freshInputTokens:100000,outputTokens:100}));
});

test('JEV task shape selects MiMo for source-heavy cheap candidate writing',()=>{
  const d=chooseAdaptiveCandidateWriter({
    jevAnswers:{task_shape:{choice:'source_heavy'},hard_reasoning:{score:0}},
    availableRoutes:{mimo:mimoRoute,deepseek:deepseekRoute,sol:solRoute},
    crownRoute,inputTokens:10000,candidateOutputTokens:3000
  });
  assert.equal(d.selected.id,'mimo');
  assert.ok(d.selected.usd<estimateWriterThenCrownAcceptUsd({writerRoute:solRoute,crownRoute,inputTokens:10000,candidateOutputTokens:3000}));
});

test('JEV coding shape uses DeepSeek cheap writer before Sol when reasoning is not hard',()=>{
  const d=chooseAdaptiveCandidateWriter({
    jevAnswers:{task_shape:{choice:'coding'},hard_reasoning:{score:1}},
    availableRoutes:{mimo:mimoRoute,deepseek:deepseekRoute,sol:solRoute},
    crownRoute,inputTokens:4000,candidateOutputTokens:2500
  });
  assert.equal(d.selected.id,'deepseek');
});

test('hard residual refuses cheap writer and selects Sol',()=>{
  const d=chooseAdaptiveCandidateWriter({
    jevAnswers:{task_shape:{choice:'research'},hard_reasoning:{score:2}},
    availableRoutes:{mimo:mimoRoute,deepseek:deepseekRoute,sol:solRoute},
    crownRoute,inputTokens:4000,candidateOutputTokens:2500
  });
  assert.equal(d.selected.id,'sol');
});

test('independent critic requires high Jev value and a different lineage',()=>{
  assert.equal(shouldRunIndependentCritic({jevAnswers:{independent_challenge:{noul:.9}},selectedWriterModel:'xiaomi/mimo-v2.6-flash'}),true);
  assert.equal(shouldRunIndependentCritic({jevAnswers:{independent_challenge:{noul:.4}},selectedWriterModel:'xiaomi/mimo-v2.6-flash'}),false);
  assert.equal(shouldRunIndependentCritic({jevAnswers:{independent_challenge:{noul:.9}},selectedWriterModel:'deepseek/deepseek-v4.1-flash'}),false);
});

test('critic surcharge includes both critic inference and extra Crown input',()=>{
  const x=estimateIndependentCriticSurchargeUsd({
    criticRoute:deepseekRoute,crownRoute,inputTokens:10000,candidateOutputTokens:3000,criticOutputTokens:500
  });
  assert.ok(x>0);
  assert.ok(x<.02);
});


test('observed cache receipts change path economics using current route cache tariffs',()=>{
  const fresh=estimateRouteWithCacheUsd({route:crownRoute,inputTokens:100000,cachedInputTokens:0,outputTokens:1000});
  const warm=estimateRouteWithCacheUsd({route:crownRoute,inputTokens:100000,cachedInputTokens:90000,outputTokens:1000});
  assert.ok(warm<fresh);
  assert.equal(estimateDirectCrownUsd({crownRoute,inputTokens:100000,cachedInputTokens:90000,outputTokens:1000}),warm);
});

test('writer lower bound honors per-model warm cache rather than assuming every input is fresh',()=>{
  const cold=cheapestPossibleWriterLowerBound({
    writerRoutes:[mimoRoute,deepseekRoute,solRoute],crownRoute,inputTokens:100000,candidateOutputTokens:5000
  });
  const warm=cheapestPossibleWriterLowerBound({
    writerRoutes:[mimoRoute,deepseekRoute,solRoute],crownRoute,inputTokens:100000,candidateOutputTokens:5000,
    cachedInputByModel:{'deepseek/deepseek-v4.1-flash':100000}
  });
  assert.ok(warm.usd<=cold.usd);
});
