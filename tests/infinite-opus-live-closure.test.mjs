import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {compileCognitionEconomicPerimeter,reconcileChannels} from '../src/cognition-economic-perimeter.mjs';
import {issueCrownAdmissionReceipt,verifyCrownAdmissionReceipt} from '../src/crown-admission.mjs';
import {closeInterpretation} from '../src/interpretation-closure.mjs';
import {verifyRenderedSurface} from '../src/proof-carrying-renderer.mjs';
import {partialEvaluateSemanticProgram,verifySpecialization,buildVerifiedSemanticEGraph,selectActiveBoundaryCases,microcodeVerdict} from '../src/semantic-reuse-foundry.mjs';
import {createOpenRouterGovernedAdapter} from '../src/openrouter-governed-adapter.mjs';
import {cognitionRouteInventory} from '../src/cognition-route-inventory.mjs';
import {enhanceAudit} from '../src/ai.mjs';
import {COGNITION_PERIMETER_ADMISSION} from '../src/cognition-transport-guard.mjs';
import {createUnifiedCognitionLedger,appendCognitionEvent,cognitionLedgerSummary} from '../src/unified-cognition-ledger.mjs';
import {buildInfiniteOpusScoreboard} from '../src/infinite-opus-scoreboard.mjs';
import {validateSemanticProgram} from '../src/semantic-isa-v2.mjs';
import {compileCrownTournament,adjudicateCrownTournament} from '../src/crown-tournament.mjs';
import {planCrownSuccession,applySuccession} from '../src/crown-succession.mjs';
import {buildRecurrenceMap} from '../src/recurrence-map.mjs';
const h=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');

test('economic perimeter closes at 20 runtime + 8 cockpit under $30 all-in planning envelope',()=>{
 const r=compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:20,typingMindKeyLimitUsd:8,accountGuardrailUsd:28,purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[],limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true});
 assert.equal(r.ok,true); assert.equal(r.plan.crownReserveUsd,15); assert.ok(r.plan.worstCaseAllInUsd<30);
});
test('two keys cannot exceed aggregate $28 and stray paid routes fail closed',()=>{
 assert.equal(compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:20,typingMindKeyLimitUsd:9,accountGuardrailUsd:28,purchaseFeeRate:.055,limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:true}).ok,false);
 assert.equal(compileCognitionEconomicPerimeter({runtimeKeyLimitUsd:20,typingMindKeyLimitUsd:8,accountGuardrailUsd:28,purchaseFeeRate:.055,otherPaidKeyLimitsUsd:[1],limitReset:'monthly',includeByokInLimits:true,legacySpendRoutesBlocked:false}).ok,false);
});
test('delayed or mismatched provider usage holds global capacity',()=>{
 assert.equal(reconcileChannels({runtimeUsageUsd:1,typingMindUsageUsd:2,providerAccountUsageUsd:3,unsettled:['call']}).status,'UNCERTAIN_CHARGES_HOLD_CAPACITY');
 assert.equal(reconcileChannels({runtimeUsageUsd:1,typingMindUsageUsd:2,providerAccountUsageUsd:4,unsettled:[]}).status,'PROVIDER_ACCOUNT_RECONCILIATION_MISMATCH');
 assert.equal(reconcileChannels({runtimeUsageUsd:1,typingMindUsageUsd:2,providerAccountUsageUsd:3,unsettled:[]}).ok,true);
});
test('Crown admission refuses forged or incomplete provider answers',()=>{
 const base={providerCallId:'gen-1',exactModelId:'anthropic/claude-opus-5.5',providerIdentity:'Anthropic',routeIdentity:'openrouter:auto',taskClassRole:'GENERAL_CROWN',promptProgramHash:h('p'),semanticInputHash:h('i'),qualityContractHash:h('q'),sourceDependencyHashes:[h('s')],evidenceReferences:['e1'],outputHash:h('o'),timestamp:'2026-09-30T00:00:00Z',expiresAt:'2026-10-01T00:00:00Z',budgetAuthorizationRef:'auth1',costReceiptRef:'bill1',modelCallabilityReceiptRef:'callability1',revalidationPolicy:'EXPIRE_OR_SUCCESSION',authorizationStatus:'AUTHORIZED_FOR_THIS_CALL',actualCostMicrousd:500,sideEffectAuthority:'NONE',providerBillObserved:true,modelIdentityVerified:true,roleTournamentEvidenceRef:'tour1'};
 const r=issueCrownAdmissionReceipt(base); assert.equal(r.ok,true); assert.equal(verifyCrownAdmissionReceipt(r.receipt,{now:Date.parse('2026-09-30T01:00:00Z'),expected:{exactModelId:base.exactModelId}}).ok,true);
 const forged={...r.receipt,exactModelId:'other/model'}; assert.equal(verifyCrownAdmissionReceipt(forged,{now:Date.parse('2026-09-30T01:00:00Z')}).ok,false);
 assert.equal(issueCrownAdmissionReceipt({...base,providerBillObserved:false}).ok,false);
});
test('natural-language parser agreement is not semantic authority and omitted constraint forces Crown',()=>{
 const raw=h('do X but never Y'),p={goal:'X',claims:[],constraints:['never Y'],requiredOutputs:['result'],sideEffects:[],ambiguities:[],uncertainties:[]};
 assert.equal(closeInterpretation({rawTaskHash:raw,parses:[p,p]}).status,'INTERPRETATION_AGREEMENT_NOT_AUTHORITY');
 const p2={...p,constraints:[]};assert.equal(closeInterpretation({rawTaskHash:raw,parses:[p,p2]}).status,'INTERPRETATION_CROWN_REQUIRED');
 const c=closeInterpretation({rawTaskHash:raw,parses:[p,p2],crownResolution:{semanticAuthority:'CURRENT_TASK_CLASS_CROWN',rawTaskHash:raw,program:p,authorityReceiptHash:h('r'),preserved:['never Y'],omitted:[],ambiguitiesResolved:['constraint omission']}});assert.equal(c.ok,true);
});
test('renderer cannot add claim or number and reverse parser needs authority',()=>{
 const env={claims:['A'],numbers:['7'],citations:['s1'],constraints:['no B']};
 assert.equal(verifyRenderedSurface({semanticEnvelope:env,rendered:'A 7',reverseParse:env}).status,'REVERSE_PARSE_AUTHORITY_REQUIRED');
 assert.equal(verifyRenderedSurface({semanticEnvelope:env,rendered:'A 8',reverseParse:{...env,numbers:['8']},reverseParseAdmission:{qualityType:'DETERMINISTIC_EXACT_PARSER'}}).ok,false);
 assert.equal(verifyRenderedSurface({semanticEnvelope:env,rendered:'A 7',reverseParse:env,reverseParseAdmission:{qualityType:'DETERMINISTIC_EXACT_PARSER'}}).ok,true);
});
test('partial evaluation refuses drift and preserves residual obligations',()=>{
 const p={programId:'p1',qualityContractHash:h('q'),invalidators:['source-change'],obligations:[{id:'stable'},{id:'novel'}]};
 const s=partialEvaluateSemanticProgram(p,{stable:7});assert.equal(s.residual.length,1);assert.equal(verifySpecialization({program:p,specialized:s,stableBindings:{stable:7}}).ok,true);assert.equal(verifySpecialization({program:p,specialized:s,stableBindings:{stable:8}}).ok,false);
});
test('semantic e-graph merges only proof-backed rewrites, never similarity',()=>{
 const ex=[{id:'a',text:'same idea'},{id:'b',text:'same idea'},{id:'c',text:'other'}];
 const none=buildVerifiedSemanticEGraph({expressions:ex,rewriteReceipts:[]});assert.equal(Object.values(none.classes).some(x=>x.length>1),false);
 const yes=buildVerifiedSemanticEGraph({expressions:ex,rewriteReceipts:[{id:'r',from:'a',to:'b',verifierPassed:true,authority:'E2_VERIFIED_TRANSFORMATION',proofHash:h('proof')}]});assert.equal(Object.values(yes.classes).some(x=>x.length===2),true);
});
test('active boundary picks high-information uncertified cases without authority',()=>{
 const r=selectActiveBoundaryCases([{id:'a',informationGain:1,disagreement:1,certified:false},{id:'b',informationGain:5,disagreement:2,certified:false},{id:'c',informationGain:99,disagreement:99,certified:true}],{maxCases:1});assert.deepEqual(r.selected,['b']);assert.equal(r.semanticAuthority,'NONE');
 assert.equal(microcodeVerdict(['LOAD_FACT','CHECK_CONSTRAINT']).ok,true);assert.equal(microcodeVerdict(['INVENT_SEMANTICS']).ok,false);
});
test('OpenRouter adapter verifies key policy, model, usage, generation bill and never echoes key',async()=>{
 const secret='sk-or-v1-supersecret-do-not-log';let n=0;
 const responses=[
  {status:200,body:{data:{label:'runtime',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}}},
  {status:200,body:{id:'gen-1',model:'anthropic/claude-opus-5.5',choices:[{message:{role:'assistant',content:'OK'}}],usage:{cost:.001,prompt_tokens:10,completion_tokens:2,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}}},
  {status:200,body:{data:{provider_name:'Anthropic',model:'anthropic/claude-opus-5.5',total_cost:.001,tokens_prompt:10,tokens_completion:2}}},
  {status:200,body:{data:{label:'runtime',limit:20,limit_remaining:19.999,usage_monthly:.001,limit_reset:'monthly'}}}
 ];
 const fetchImpl=async(url,opts={})=>{assert.ok(String(opts.headers?.Authorization??'').includes(secret));if(String(url).includes('/chat/completions')){const body=JSON.parse(opts.body);assert.equal(body.provider.zdr,true);assert.equal(body.provider.data_collection,'deny');}const x=responses[n++];return {ok:x.status<300,status:x.status,text:async()=>JSON.stringify(x.body)};};
 const a=createOpenRouterGovernedAdapter({apiKeyProvider:async()=>secret,fetchImpl,expectedKeyLimitUsd:20,cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION});
 const r=await a.execute({model:'anthropic/claude-opus-5.5',messages:[{role:'user',content:'reply OK'}],maxTokens:4});assert.equal(r.ok,true);assert.equal(r.semanticAuthority,'NONE');assert.ok(!JSON.stringify(r).includes(secret));
});
test('OpenRouter wrong-model response is refused and not Crown authority',async()=>{
 const seq=[{data:{label:'runtime',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}},{id:'g',model:'wrong/model',choices:[],usage:{cost:.001}}];let i=0;
 const a=createOpenRouterGovernedAdapter({apiKeyProvider:async()=> 'sk-or-v1-xxxxxxxxxxxxxxxx',expectedKeyLimitUsd:20,cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(seq[i++])})});
 const r=await a.execute({model:'anthropic/claude-opus-5.5',messages:[{role:'user',content:'x'}],maxTokens:1});assert.equal(r.status,'OPENROUTER_WRONG_MODEL_SERVED');
});

test('cash-metered route inventory has no unclassified budget bypass',()=>{
 const inventory=cognitionRouteInventory();
 assert.equal(inventory.globalBudgetClaimAllowed,true);
 assert.equal(inventory.routes.filter(r=>r.cashMetered===true && !String(r.status).startsWith('GOVERNED') && r.status!=='FAIL_CLOSED_WITHOUT_ADMISSION').length,0);
});
test('legacy pipeline AI refuses direct paid inference without perimeter admission',async()=>{
 await assert.rejects(()=>enhanceAudit({provider:'openai',openaiKey:'not-used'}, {id:'p'}, {combinedText:''}, []), /cognition-economic-perimeter-admission-required/);
});

test('unified ledger separates cash, plan, credits, donated compute and compression without double counting',()=>{
 let l=createUnifiedCognitionLedger({month:'2026-09'});
 const base={task_id:'t',provider_route:'route',timestamp:'2026-09-30T00:00:00Z',authorization_ref:'auth',billing_month:'2026-09',input_tokens:1,output_tokens:1};
 l=appendCognitionEvent(l,{...base,channel_id:'runtime',call_id:'c1',provider:'openrouter',model:'m',cost_class:'CASH_API_SPEND',actual_cost_usd:0.01,platform_fee_usd:0});
 l=appendCognitionEvent(l,{...base,channel_id:'chatgpt-plan',call_id:'c2',provider:'openai-plan',model:'plan',cost_class:'PLAN_INCLUDED_COGNITION',actual_cost_usd:0});
 l=appendCognitionEvent(l,{...base,channel_id:'compiler',call_id:'c3',provider:'deterministic',model:'none',cost_class:'ALGORITHMIC_COMPRESSION',actual_cost_usd:0});
 const summary=cognitionLedgerSummary(l);assert.equal(summary.actualAllInUsd,0.01);assert.equal(summary.byClass.PLAN_INCLUDED_COGNITION.events,1);assert.equal(summary.doubleCountingPrevented,true);
});
test('automatic scoreboard keeps unknown evidence unknown',()=>{
 const s=buildInfiniteOpusScoreboard({runtimeSnapshot:{budget:{todaySpentMicrousd:0,crownEscrowRemainingMicrousd:15000000},metrics:{}},globalLedgerSummary:{actualAllInUsd:0}});
 assert.equal(s.TODAY_AI_SPEND,0);assert.equal(s.CROWN_ESCROW_REMAINING,15);assert.equal(s.GENERAL_CROWN,'UNKNOWN');assert.equal(s.REFERENCE_COMPRESSION_FACTOR,'UNKNOWN');
});

test('verified typed compiler can amortize interpretation while cheap parse agreement alone cannot',()=>{
 const raw=h('repeatable typed task');
 const program={goal:'sum',claims:[],constraints:['integers only'],requiredOutputs:['total'],sideEffects:[],ambiguities:[],uncertainties:[]};
 const r=closeInterpretation({rawTaskHash:raw,parses:[program,program],typedCompilerCertificate:{authority:'E2_VERIFIED_TRANSFORMATION',rawTaskHash:raw,compilerHash:h('compiler'),program,proofRef:'test-proof',preserved:['integers only'],omitted:[]}});
 assert.equal(r.ok,true);assert.equal(r.status,'INTERPRETATION_TYPED_COMPILER_CLOSED');
});
test('semantic ISA rejects unknown opcodes and side-effect smuggling',()=>{
 assert.equal(validateSemanticProgram([{op:'LOAD_FACT',sideEffectAuthority:'NONE'},{op:'CHECK_CONSTRAINT',sideEffectAuthority:'NONE'}]).ok,true);
 assert.equal(validateSemanticProgram([{op:'INVENT_FACT',sideEffectAuthority:'NONE'}]).ok,false);
 assert.equal(validateSemanticProgram([{op:'LOAD_FACT',sideEffectAuthority:'SEND_EMAIL'}]).ok,false);
});
test('Crown tournament is blind, zero-regression and role-specific',()=>{
 const plan=compileCrownTournament({candidateSnapshotHash:h('snapshot'),hiddenTasks:[{taskId:'h1',role:'GENERAL_CROWN',qualityDimensions:['accuracy']},{taskId:'h2',role:'GENERAL_CROWN',qualityDimensions:['accuracy']}],candidates:[{model:'a',roles:['GENERAL_CROWN']},{model:'b',roles:['GENERAL_CROWN']}],budgetAuthorizationRef:'auth'});
 assert.equal(plan.ok,true);assert.equal(plan.plan.blindEvaluation,true);
 const out=adjudicateCrownTournament({plan:plan.plan,observations:[
  {role:'GENERAL_CROWN',model:'a',hiddenTask:true,providerBillObserved:true,modelIdentityVerified:true,requiredRegressions:0,sealedTrialRef:'sealed:test',canonicalZeroLossCertified:true,qualityScore:1,costUsd:.1},
  {role:'GENERAL_CROWN',model:'a',hiddenTask:true,providerBillObserved:true,modelIdentityVerified:true,requiredRegressions:0,sealedTrialRef:'sealed:test',canonicalZeroLossCertified:true,qualityScore:1,costUsd:.1},
  {role:'GENERAL_CROWN',model:'b',hiddenTask:true,providerBillObserved:true,modelIdentityVerified:true,requiredRegressions:0,sealedTrialRef:'sealed:test',canonicalZeroLossCertified:true,qualityScore:.9,costUsd:.01},
  {role:'GENERAL_CROWN',model:'b',hiddenTask:true,providerBillObserved:true,modelIdentityVerified:true,requiredRegressions:0,sealedTrialRef:'sealed:test',canonicalZeroLossCertified:true,qualityScore:.9,costUsd:.01}
 ]});assert.equal(out.roles.GENERAL_CROWN.incumbent,'a');
});
test('Crown succession changes only roles backed by current admitted Crown receipts',()=>{
 const p=planCrownSuccession({currentRoles:{GENERAL_CROWN:'a'},marketCandidates:[{model:'b',callability:'VERIFIED',freshness:'CURRENT',roles:['GENERAL_CROWN']}],trigger:'NEW_MODEL_RELEASE',compiledCapital:[{assetId:'x',status:'VALID_FOR_CURRENT_TYPED_SCOPE',crownRevision:'a'}]});
 assert.equal(p.status,'SUCCESSION_TOURNAMENT_REQUIRED');
 const no=applySuccession({currentRoles:{GENERAL_CROWN:'a'},tournamentRoles:{GENERAL_CROWN:'b'},admissionReceipts:{}});assert.equal(no.roles.GENERAL_CROWN,'a');
 const yes=applySuccession({currentRoles:{GENERAL_CROWN:'a'},tournamentRoles:{GENERAL_CROWN:'b'},admissionReceipts:{GENERAL_CROWN:{semanticAuthority:'CURRENT_TASK_CLASS_CROWN',exactModelId:'b'}}});assert.equal(yes.roles.GENERAL_CROWN,'b');assert.equal(yes.decompileCompiledCapital,true);
});
test('recurrence map exposes real fanout without claiming semantic equivalence from similarity',()=>{
 const rows=[
  {id:'1',taskClass:'research',driftClass:'LOW',obligation:{op:'verify',x:1},claim:'A',sourceDependencies:['s'],verificationStep:'v'},
  {id:'2',taskClass:'research',driftClass:'LOW',obligation:{op:'verify',x:1},claim:'A',sourceDependencies:['s'],verificationStep:'v'},
  {id:'3',taskClass:'coding',driftClass:'HIGH',obligation:{op:'verify',x:2},claim:'A-ish',sourceDependencies:['t'],verificationStep:'v2'}
 ];const r=buildRecurrenceMap(rows);assert.equal(r.dimensions.obligation.maxFanout,2);assert.equal(r.priorityDomains[0].taskClass,'research');
});

test('OpenRouter privacy policy cannot be loosened by a caller',async()=>{
 const a=createOpenRouterGovernedAdapter({apiKeyProvider:async()=> 'sk-or-v1-xxxxxxxxxxxxxxxx',expectedKeyLimitUsd:20,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify({data:{label:'runtime',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}})})});
 await assert.rejects(()=>a.execute({model:'m',messages:[{role:'user',content:'x'}],maxTokens:1,providerPolicy:{zdr:false,data_collection:'allow'}}),/privacy-policy-cannot-loosen/);
});
