import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {compileCognitionEconomicPerimeter,TYPINGMIND_KEY_LIMIT_USD,LEGACY_DIRECT_TYPINGMIND_KEY_LIMIT_USD} from '../src/cognition-economic-perimeter.mjs';

const h=x=>'sha256:'+crypto.createHash('sha256').update(String(x)).digest('hex');
const run=(script,args=[])=>spawnSync(process.execPath,[script,...args],{cwd:path.resolve(new URL('..',import.meta.url).pathname),encoding:'utf8',env:{PATH:process.env.PATH,TZ:'UTC'}});

test('canonical economic perimeter uses no direct TypingMind inference key while preserving legacy fallback constant',()=>{
 assert.equal(TYPINGMIND_KEY_LIMIT_USD,0);
 assert.equal(LEGACY_DIRECT_TYPINGMIND_KEY_LIMIT_USD,8);
 const canonical=compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:20,memberGuardrailUsd:28,guardrailScope:'MEMBER_ALL_KEYS',purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[],limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true});
 assert.equal(canonical.ok,true);
 assert.equal(canonical.plan.typingMindKeyLimitUsd,0);
 assert.equal(canonical.plan.aggregateKeyLimitsUsd,20);
 assert.equal(canonical.plan.cockpitArchitecture,'UBERBOND_GATEWAY_ONLY');
 assert.equal(canonical.plan.worstCaseAllInUsd,21.1);
 const legacy=compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:20,typingMindKeyLimitUsd:8,memberGuardrailUsd:28,guardrailScope:'MEMBER_ALL_KEYS',purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[],limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true});
 assert.equal(legacy.ok,true);
 assert.equal(legacy.plan.cockpitArchitecture,'DIRECT_PROVIDER_COCKPIT_COMPATIBILITY');
});

test('runtime authorization mint requires explicit current owner approval and performs no spend',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ub-auth-')),input=path.join(dir,'in.json'),output=path.join(dir,'out.json');
 fs.writeFileSync(input,JSON.stringify({schemaVersion:'uberbond.infinite-opus.runtime-authorization-request.v1',ownerApproved:true,authorizationId:'owner-auth-test-1234',month:new Date().toISOString().slice(0,7),maximumMonthlySpendUsd:20,expiresAt:new Date(Date.now()+3600000).toISOString(),crownRoutes:['openrouter:anthropic/claude-opus-5.5'],externalEffects:[]}));
 const r=run('scripts/infinite-opus-runtime-authorization-mint.mjs',['--input',input,'--output',output]);
 assert.equal(r.status,0,r.stderr);
 const receipt=JSON.parse(fs.readFileSync(output,'utf8'));
 assert.equal(receipt.maxMonthlyMicrousd,20_000_000);assert.deepEqual(receipt.crownRoutes,['openrouter:anthropic/claude-opus-5.5']);
 assert.equal(r.stdout.includes('spendPerformed'),true);
});

test('sealed tournament evidence can mint Crown admission only after real-call evidence contract is supplied',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ub-crown-')),tin=path.join(dir,'tournament-in.json'),tout=path.join(dir,'tournament.json'),cin=path.join(dir,'call.json'),cout=path.join(dir,'admission.json');
 const tasks=[{taskId:'g1',role:'GENERAL_CROWN',qualityDimensions:['correctness'],sealedExpectedRef:'sealed://g1'},{taskId:'g2',role:'GENERAL_CROWN',qualityDimensions:['correctness'],sealedExpectedRef:'sealed://g2'}];
 const candidates=[{model:'anthropic/claude-opus-5.5',roles:['GENERAL_CROWN']},{model:'openai/gpt-6.1-sol-pro',roles:['GENERAL_CROWN']}];
 const observations=[];
 for(const t of tasks){
  observations.push({taskId:t.taskId,model:'anthropic/claude-opus-5.5',role:'GENERAL_CROWN',hiddenTask:true,providerBillObserved:true,modelIdentityVerified:true,requiredRegressions:0,sealedTrialRef:'sealed-trial://opus/'+t.taskId,canonicalZeroLossCertified:true,qualityScore:1,costUsd:.01});
  observations.push({taskId:t.taskId,model:'openai/gpt-6.1-sol-pro',role:'GENERAL_CROWN',hiddenTask:true,providerBillObserved:true,modelIdentityVerified:true,requiredRegressions:0,sealedTrialRef:'sealed-trial://sol/'+t.taskId,canonicalZeroLossCertified:true,qualityScore:.9,costUsd:.005});
 }
 fs.writeFileSync(tin,JSON.stringify({schemaVersion:'uberbond.infinite-opus.crown-tournament-evidence.v1',sealedCustodianIndependent:true,rawHiddenPromptsExposedToOptimizer:false,plaintextAnswersExposedBeforeEvaluation:false,candidateSnapshotHash:h('snapshot'),hiddenTasks:tasks,candidates,budgetAuthorizationRef:'owner-auth-test-1234',observations}));
 let r=run('scripts/infinite-opus-crown-tournament-adjudicate.mjs',['--input',tin,'--output',tout]);
 assert.equal(r.status,0,r.stderr);
 const tournament=JSON.parse(fs.readFileSync(tout,'utf8'));
 assert.equal(tournament.generalCrown.model,'anthropic/claude-opus-5.5');
 fs.writeFileSync(cin,JSON.stringify({schemaVersion:'uberbond.infinite-opus.crown-call-evidence.v1',providerCallId:'gen-real-1',exactModelId:'anthropic/claude-opus-5.5',providerIdentity:'Anthropic',routeIdentity:'openrouter:auto-provider-zdr-deny-required-parameters-v1',taskClassRole:'GENERAL_CROWN',promptProgramHash:h('prompt'),semanticInputHash:h('input'),qualityContractHash:h('quality'),sourceDependencyHashes:[h('source')],evidenceReferences:['provider://generation/gen-real-1'],outputHash:h('output'),timestamp:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),budgetAuthorizationRef:'owner-auth-test-1234',costReceiptRef:'provider://bill/gen-real-1',modelCallabilityReceiptRef:'provider://callability/gen-real-1',revalidationPolicy:'EXPIRE_OR_SUCCESSION',actualCostMicrousd:1000,providerBillObserved:true,modelIdentityVerified:true,modelCallabilityVerified:true}));
 r=run('scripts/infinite-opus-crown-admission-mint.mjs',['--tournament',tout,'--call-evidence',cin,'--output',cout]);
 assert.equal(r.status,0,r.stderr);
 const admission=JSON.parse(fs.readFileSync(cout,'utf8'));
 assert.equal(admission.exactModelId,'anthropic/claude-opus-5.5');assert.equal(admission.taskClassRole,'GENERAL_CROWN');assert.equal(admission.sideEffectAuthority,'NONE');
});

test('Crown admission mint rejects tampered tournament receipt',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ub-tamper-')),t=path.join(dir,'t.json'),c=path.join(dir,'c.json');
 fs.writeFileSync(t,JSON.stringify({schemaVersion:'uberbond.infinite-opus.crown-tournament-receipt.v1',receiptHash:h('wrong'),generalCrown:{model:'anthropic/claude-opus-5.5'},adjudicationStatus:'TASK_CLASS_CROWN_CANDIDATE_EVIDENCE_READY',sealedTrialRefs:['a','b']}));
 fs.writeFileSync(c,'{}');
 const r=run('scripts/infinite-opus-crown-admission-mint.mjs',['--tournament',t,'--call-evidence',c]);
 assert.notEqual(r.status,0);assert.match(r.stderr,/tournament-receipt-integrity/);
});
