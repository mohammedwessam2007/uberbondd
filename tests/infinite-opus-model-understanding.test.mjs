import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileModelUnderstanding, noRetestAuthority, estimateModelTariffMicrousd, modelPriorForTask, chooseAnalyticLane } from '../src/infinite-opus-model-understanding.mjs';

const config=()=>JSON.parse(fs.readFileSync(new URL('../config/infinite-opus-model-understanding.json',import.meta.url),'utf8'));
const now=Date.parse('2026-09-30T13:00:00Z');

test('model understanding is fresh non-authoritative prior, never Crown authority',()=>{
 const r=compileModelUnderstanding(config(),{now});
 assert.equal(r.semanticAuthority,'NONE');
 assert.equal(r.crownPromotionAllowed,false);
 assert.equal(r.empiricalEquivalenceClaimAllowed,false);
 assert.ok(r.profiles.length>=5);
});

test('E0-E4 current proof removes repeated model-vs-model quality retest requirement',()=>{
 for(const c of ['E0','E1','E2','E3','E4']){
   const r=noRetestAuthority({equivalenceClass:c,proofVerified:true,dependenciesCurrent:true,compositionVerified:true});
   assert.equal(r.ok,true);assert.equal(r.qualityRetestRequired,false);
 }
 for(const c of ['E5','E6']) assert.equal(noRetestAuthority({equivalenceClass:c,proofVerified:true,dependenciesCurrent:true}).ok,false);
 assert.equal(noRetestAuthority({equivalenceClass:'E4',proofVerified:true,dependenciesCurrent:false}).ok,false);
});

test('tariff arithmetic can be exact about posted rates without pretending to know provider bill',()=>{
 const registry=compileModelUnderstanding(config(),{now});
 const sol=registry.profiles.find(x=>x.model==='openai/gpt-6.1-sol');
 const r=estimateModelTariffMicrousd({profile:sol,freshInputTokens:100000,cachedInputTokens:100000,billedOutputTokens:10000});
 assert.equal(r.ok,true);assert.equal(r.microusd,310000);assert.equal(r.exactActualBill,false);
 const long=estimateModelTariffMicrousd({profile:sol,freshInputTokens:300000,cachedInputTokens:0,billedOutputTokens:10000});
 assert.equal(long.inputMultiplier,2);assert.equal(long.outputMultiplier,1.5);
});

test('unknown billed output prevents fake exact cost even when list prices are known',()=>{
 const registry=compileModelUnderstanding(config(),{now});
 const pro=registry.profiles.find(x=>x.model==='openai/gpt-6.1-sol-pro');
 assert.equal(estimateModelTariffMicrousd({profile:pro,freshInputTokens:1000}).status,'OUTPUT_TOKEN_USAGE_OR_CEILING_REQUIRED');
 assert.equal(estimateModelTariffMicrousd({profile:pro,freshInputTokens:1000,maxOutputTokens:100}).status,'MAX_OUTPUT_TOKEN_TARIFF_CEILING');
});

test('standard Sol is preferred prior for routine coding over Pro without claiming quality authority',()=>{
 const registry=compileModelUnderstanding(config(),{now});
 const p=modelPriorForTask({registry,model:'openai/gpt-6.1-sol-pro',task:{taskClass:'ROUTINE_CODING',qualityClass:'Q_PREPARATION'}});
 assert.ok(p.reasons.some(x=>x.includes('STANDARD_SOL_PRIOR_PREFERRED')));
 assert.equal(p.semanticAuthority,'NONE');
});

test('MiMo unattended tool loops require a bounded call cap in the routing prior',()=>{
 const registry=compileModelUnderstanding(config(),{now});
 const bad=modelPriorForTask({registry,model:'xiaomi/mimo-v2.6-flash',task:{unattendedToolLoop:true}});
 assert.equal(bad.ok,false);
 const good=modelPriorForTask({registry,model:'xiaomi/mimo-v2.6-flash',task:{unattendedToolLoop:true,boundedToolCallCap:true}});
 assert.equal(good.ok,true);
});

test('analytic lane sends proven recurrence to E0-E4 and novel frontier semantics upward',()=>{
 const registry=compileModelUnderstanding(config(),{now});
 const exact=chooseAnalyticLane({registry,task:{equivalenceClass:'E4',proofVerified:true,dependenciesCurrent:true},candidateModels:['xiaomi/mimo-v2.6-flash']});
 assert.equal(exact.lane,'E0_E4_BY_CONSTRUCTION');assert.equal(exact.model,null);assert.equal(exact.empiricalModelTestRequired,false);
 const frontier=chooseAnalyticLane({registry,task:{qualityClass:'Q_FRONTIER'},candidateModels:['openai/gpt-6.1-sol','anthropic/claude-opus-5.5']});
 assert.equal(frontier.lane,'CROWN_PAGE_FAULT');assert.equal(frontier.empiricalModelTestRequired,true);assert.equal(frontier.semanticAuthority,'NONE');
});


test('expired tariff freshness does not erase structural model understanding',()=>{
 const r=compileModelUnderstanding(config(),{now:Date.parse('2026-10-02T13:00:00Z')});
 assert.equal(r.economicsFresh,false);
 assert.ok(r.profiles.some(x=>x.model==='openai/gpt-6.1-sol-pro'));
 assert.equal(r.semanticAuthority,'NONE');
});
