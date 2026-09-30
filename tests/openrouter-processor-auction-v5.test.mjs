import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chooseSolEffort, vectorizeJevQuestions, selectProcessorPlan, processorRolesFromConfig,
  estimateDirectOpusUsd, estimateSolThenOpusAcceptUsd, estimateCompressedFrontierUsd,
  chooseFreshFrontierPath, buildGenericJevControlQuestions } from '../src/openrouter-processor-auction-v5.mjs';

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
    {id:'relevance',type:'Noul'},
    {id:'route',type:'Choice'},
    {id:'relevance',type:'Noul'}
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

test('generic Jev control tensor separates execution-shape judgments instead of one vague router label',()=>{
  const q=buildGenericJevControlQuestions();
  assert.equal(q.task_shape.type,'choice');
  assert.equal(q.source_compression_value.type,'score');
  assert.equal(q.independent_challenge.type,'noul');
  assert.equal(q.hard_reasoning.type,'score');
  assert.equal(q.crown_necessity.type,'noul');
});
