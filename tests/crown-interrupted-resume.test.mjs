import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sealCrownCheckpoint } from '../src/crown-sealed-checkpoint.mjs';
import { recoverInterruptedCrownCheckpoint,validCrownResumeAuthority,RESUME_KEY,SOURCE_KEY,INTERRUPTED_RESUME_KEY,INTERRUPTED_GENERATION } from '../src/crown-resume-checkpoint.mjs';
import { verifyCrownProviderModel,SOL_CANONICAL_REVISION } from '../src/crown-model-identity.mjs';
import { runCrownAutoFinish } from '../scripts/infinite-opus-crown-autofinish.mjs';
const h=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const key='synthetic-fixture-encryption-key-not-real';
function fixture(){
 const tasks=[{id:'synthetic-t1',prompt:'SYNTHETIC TASK 1',rubric:['SYNTHETIC'],must_not:[]},{id:'synthetic-t2',prompt:'SYNTHETIC TASK 2',rubric:['SYNTHETIC'],must_not:[]}];
 const taskCommitment=h(tasks.map(t=>({id:t.id,promptHash:h(t.prompt),rubricHash:h(t.rubric),mustNotHash:h(t.must_not)})));
 const calls=[{taskId:tasks[0].id,model:'anthropic/claude-opus-5.5',id:'gen-1790892512-UbTWrlnGj57GXlT32paI',cost:.03676,providerName:'Amazon Bedrock',metaModel:'anthropic/claude-opus-5.5-20260921',answerHash:h('SYNTHETIC ANSWER'),promptHash:h(tasks[0].prompt),rubricHash:h(tasks[0].rubric)}];
 const answers={[tasks[0].id+'|anthropic/claude-opus-5.5']:'SYNTHETIC ANSWER'};
 const generationJournal=[{id:'gen-1790892485-fQko2TrlRCNPUJ3SD9EO',costUsd:.01053375},{id:calls[0].id,costUsd:.03676},{id:'gen-1790892555-BOCiTbz8qFX9HAnXIRR3',costUsd:.017744}];
 const state={status:'FAILED_NO_AUTOMATIC_RETRY',reason:'model-identity-drift:openai/gpt-6.1-sol-pro:openai/gpt-6.1-sol-pro-20260929',newSpendUsd:.06503775,taskCommitment,generationJournal,sealedEvidence:sealCrownCheckpoint({tasks,answers,calls},{key,binding:SOURCE_KEY+'|'+taskCommitment})};
 return {state,payload:{tasks,answers,calls}};
}
function interrupted(){
 const {state:originalState,payload}=fixture();
 const model='openai/gpt-6.1-sol-pro',observedModel=SOL_CANONICAL_REVISION;
 const generationJournal=[
 {id:'gen-1790900525-TFyAeL3TpSP6ZWMsspuj',model,observedModel,provider:'Azure',costUsd:.018610,status:'PROVIDER_RECONCILED_PENDING_EVIDENCE'},
 {id:'gen-1790900555-jEUGzgL7rKDIKYiOft6V',model:'anthropic/claude-opus-5.5',observedModel:'anthropic/claude-opus-5.5-20260921',provider:'Amazon Bedrock',costUsd:.026936,status:'PROVIDER_RECONCILED_PENDING_EVIDENCE'},
 {id:INTERRUPTED_GENERATION,model,observedModel,provider:'Azure',costUsd:.000001,reservedWorstCaseUsd:.1,status:'RECONCILED_BILL_ONLY_NO_RETAINED_ANSWER'}];
 for(const [i,r] of generationJournal.slice(0,2).entries()){
  const t=payload.tasks[i],answer='SYNTHETIC RETAINED ANSWER '+i;
  payload.answers[t.id+'|'+r.model]=answer;
  payload.calls.push({taskId:t.id,model:r.model,id:r.id,cost:r.costUsd,providerName:r.provider,metaModel:r.observedModel,answerHash:h(answer),promptHash:h(t.prompt),rubricHash:h(t.rubric)});
 }
 const state={status:'FAILED_NO_AUTOMATIC_RETRY',reason:'generation-reconciliation-required:'+INTERRUPTED_GENERATION,taskCommitment:originalState.taskCommitment,
  newSpendUsd:.11058475,generationJournal,financialReconciliation:{...generationJournal[2],semanticAuthority:'NONE',reconciledAt:'2026-10-02T01:00:00Z'},
  sealedEvidence:sealCrownCheckpoint(payload,{key,binding:RESUME_KEY+'|'+originalState.taskCommitment})};
 return {state,originalState,payload};
}
function quarantinedInterrupted(){
 const {state,originalState,payload}=interrupted();
 const third=state.generationJournal[2],known=third.costUsd;
 delete third.costUsd; delete third.observedModel; delete third.provider;
 third.status='UNKNOWN_CHARGE_MAX_RESERVE_QUARANTINED';third.actualCostUsd=null;third.conservativeLiabilityUsd=third.reservedWorstCaseUsd;third.metadataHttpStatus=404;third.semanticAuthority='NONE';
 state.newSpendUsd-=known;delete state.financialReconciliation;
 state.financialQuarantine={id:INTERRUPTED_GENERATION,status:third.status,model:third.model,actualCostUsd:null,conservativeLiabilityUsd:third.reservedWorstCaseUsd,metadataHttpStatus:404,semanticAuthority:'NONE',reconciliationPolicy:'RETAIN_MAX_PRECALL_RESERVE_UNTIL_PROVIDER_EVIDENCE_ARRIVES',quarantinedAt:'2026-10-07T00:00:00Z'};
 return {state,originalState,payload};
}
const authority=now=>({operation:'resume-existing-sealed-general-crown-evaluation',attemptKey:INTERRUPTED_RESUME_KEY,sourceKey:RESUME_KEY,maxIncrementalMicrousd:150000,maxTotalEvaluationMicrousd:450000,monthlyCapMicrousd:20000000,maxRemainingPaidCalls:2,evidenceRef:'owner-approved-two-missing-crown-edges-r3',authorizedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()});
const recoveredFinancialReceipt=()=>({
 schemaVersion:'uberbond.crown-financial-recovery.v1',
 status:'RECONCILED_INVALID_TOURNAMENT_EVIDENCE',
 callId:'sealed-call-06264df855de7eedeb12982dfad2909db0cdcfb0',
 generationId:'gen-1790807964-m6HWX42a5VtncUFVBpL1',
 actualMicrousd:11224,
 cancelledUndispatchedCallIds:['sealed-call-f66120a25e6c3904971db18c18be096b48457d23','sealed-call-1e9d0e3549707791fe40af7a15be2e84b76c8bec','sealed-call-60225eada977cb91f4c1d44960138ad0c31e7e12'],
 bindingMethod:'FORENSIC_SINGLE_DISPATCH_WINDOW',retainedExactBinding:false,
 providerRequestId:'req-1790807964-Ve3fJIrYt0PXl3LqGRb0',
 observedModel:'anthropic/claude-opus-5.5-20260921',providerIdentity:'Amazon Bedrock',
 evidenceRef:'docs/receipts/UBERMIND_CROWN_FINANCIAL_RECONSTRUCTION_2026-10-01.md',
 semanticAuthority:'NONE',oldHiddenTaskContaminated:true,oldAnswersUnavailable:true,
 reconciledAt:'2026-10-01T00:00:00Z'
});
test('reconciled interrupted state preserves three answers and exactly two missing edges',()=>{
 const {state,originalState}=interrupted(),p=recoverInterruptedCrownCheckpoint(state,{key,originalState});
 assert.equal(p.calls.length,3);assert.equal(p.maximumRemainingPaidCalls,2);assert.equal(p.priorBillingRows.length,6);assert.equal(p.inheritedSpendUsd,state.newSpendUsd);
});
test('max-reserve quarantine preserves unknown actual cost while making bounded continuation recoverable',()=>{
 const {state,originalState}=quarantinedInterrupted(),p=recoverInterruptedCrownCheckpoint(state,{key,originalState});
 assert.equal(p.calls.length,3);assert.equal(p.maximumRemainingPaidCalls,2);assert.equal(p.inheritedSpendUsd,state.newSpendUsd);
 assert.equal(p.uncertainChargeLiabilityUsd,state.generationJournal[2].reservedWorstCaseUsd);
 assert.equal(state.generationJournal[2].actualCostUsd,null);assert.equal(state.financialQuarantine.semanticAuthority,'NONE');
});
test('explicit reconciled zero charge is valid; absent charge is never zero',()=>{
 const {state,originalState}=interrupted();state.generationJournal[2].costUsd=0;state.financialReconciliation.costUsd=0;state.newSpendUsd-=.000001;
 assert.equal(recoverInterruptedCrownCheckpoint(state,{key,originalState}).maximumRemainingPaidCalls,2);
 delete state.generationJournal[2].costUsd;assert.throws(()=>recoverInterruptedCrownCheckpoint(state,{key,originalState}));
});
for(const change of ['uncertain','noReceipt','receiptCost','wrongProvider','wrongRevision','total','duplicateGeneration','missingReserve','overReserve'])test('refuses '+change+' before sealed reuse',()=>{
 const {state,originalState}=interrupted();
 if(change==='uncertain')state.generationJournal[2].status='DISPATCHED_UNRECONCILED';
 if(change==='noReceipt')delete state.financialReconciliation;
 if(change==='receiptCost')state.financialReconciliation.costUsd=0;
 if(change==='wrongProvider')state.generationJournal[0].provider='Other';
 if(change==='wrongRevision')state.generationJournal[0].observedModel='openai/gpt-6.1-sol-pro-20260930';
 if(change==='total')state.newSpendUsd=NaN;
 if(change==='duplicateGeneration')state.generationJournal[1].id=state.generationJournal[0].id;
 if(change==='missingReserve')delete state.generationJournal[2].reservedWorstCaseUsd;
 if(change==='overReserve')state.generationJournal[2].reservedWorstCaseUsd=.0000001;
 assert.throws(()=>recoverInterruptedCrownCheckpoint(state,{key,originalState}));
});
for(const change of ['answer','duplicatePair','missingAnswer','foreignTask','extraAnswer','unexpectedGrade'])test('refuses poisoned checkpoint '+change,()=>{
 const {state,originalState,payload}=interrupted();
 if(change==='answer')payload.answers['synthetic-t1|openai/gpt-6.1-sol-pro']='TAMPERED';
 if(change==='duplicatePair')payload.calls[1]={...payload.calls[0]};
 if(change==='missingAnswer')payload.calls.pop();
 if(change==='foreignTask')payload.tasks[1].prompt='OTHER TASK';
 if(change==='extraAnswer')payload.answers['unrequested']='TAMPERED';
 if(change==='unexpectedGrade')payload.gradeDoc={};
 state.sealedEvidence=sealCrownCheckpoint(payload,{key,binding:RESUME_KEY+'|'+state.taskCommitment});
 assert.throws(()=>recoverInterruptedCrownCheckpoint(state,{key,originalState}));
});
test('old permission cannot authorize interrupted retry; bounded new permission is mandatory',()=>{
 const now=Date.now(),a=authority(now);assert.equal(validCrownResumeAuthority(a,now),true);
 for(const change of [{maxRemainingPaidCalls:3},{maxIncrementalMicrousd:300001},{maxIncrementalMicrousd:0},{maxIncrementalMicrousd:1.5},{sourceKey:SOURCE_KEY},{evidenceRef:'owner-approved-missing-crown-edges-r2'},{expiresAt:new Date(now).toISOString()}])assert.equal(validCrownResumeAuthority({...a,...change},now),false);
});
test('unreconciled paid state refuses authorized retry with zero network calls and writes',async()=>{
 const {state,originalState}=interrupted();state.generationJournal[2].status='DISPATCHED_UNRECONCILED';
 const settings={[RESUME_KEY]:state,[SOURCE_KEY]:originalState};let writes=0,network=0;
 const store={transaction:async fn=>fn({getSettings:async()=>settings,setSetting:async()=>{writes++;}})};
 const original=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('must-not-dispatch');};
 try{await assert.rejects(runCrownAutoFinish({store,apiKey:'synthetic',checkpointKey:key,resumeAuthorization:authority(Date.now())}),/billing/);assert.equal(network,0);assert.equal(writes,0);}finally{globalThis.fetch=original;}
});

test('expired interrupted continuation permission performs no reads, writes or network calls',async()=>{
 const now=Date.now();let reads=0,writes=0,network=0;
 const store={transaction:async fn=>fn({getSettings:async()=>{reads++;return {};},setSetting:async()=>{writes++;}})};
 const original=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('must-not-dispatch');};
 try{
  const r=await runCrownAutoFinish({store,apiKey:'synthetic',checkpointKey:key,resumeAuthorization:{...authority(now),expiresAt:new Date(now-1000).toISOString()}});
  assert.equal(r.status,'EXPLICIT_MISSING_EDGE_RESUME_AUTHORITY_REQUIRED');assert.deepEqual([reads,writes,network],[0,0,0]);
 }finally{globalThis.fetch=original;}
});

test('corrupted durable historical financial recovery is refused without provider re-query or paid call',async()=>{
 const {state,originalState}=interrupted(),now=Date.now();
 const bad={...recoveredFinancialReceipt(),actualMicrousd:0};
 const settings={[SOURCE_KEY]:originalState,[RESUME_KEY]:state,infinite_opus_crown_autofinish_20261001_v7:{status:'FAILED_NO_AUTOMATIC_RETRY'},infinite_opus_crown_financial_recovery_20261001_r1:bad};
 let writes=0,network=0;
 const store={transaction:async fn=>fn({getSettings:async()=>settings,setSetting:async()=>{writes++;}})};
 const original=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('must-not-call-provider');};
 try{
  await assert.rejects(runCrownAutoFinish({store,apiKey:'synthetic',checkpointKey:key,resumeAuthorization:authority(now),paidAuthorization:{evidenceRef:'SYNTHETIC',month:new Date(now).toISOString().slice(0,7),maxMonthlyMicrousd:20000000,expiresAt:new Date(now+60000).toISOString(),crownRoutes:['openrouter:anthropic/claude-opus-5.5']}}),/existing-original-financial-recovery-refused/);
  assert.equal(writes,0);assert.equal(network,0);
 }finally{globalThis.fetch=original;}
});

test('reconciled continuation executes only missing Sol answer and grader, preserves three answers and refuses replay',async()=>{
 const {state,originalState}=interrupted(),now=Date.now();
 Object.assign(originalState.generationJournal[0],{model:'google/gemini-2.5-pro',observedModel:'google/gemini-2.5-pro',provider:'Google'});
 Object.assign(originalState.generationJournal[1],{model:'anthropic/claude-opus-5.5',observedModel:'anthropic/claude-opus-5.5-20260921',provider:'Amazon Bedrock'});
 Object.assign(originalState.generationJournal[2],{model:'openai/gpt-6.1-sol-pro',observedModel:'openai/gpt-6.1-sol-pro-20260929',provider:'Azure'});
 let settings={[SOURCE_KEY]:originalState,[RESUME_KEY]:state,infinite_opus_crown_autofinish_20261001_v7:{status:'FAILED_NO_AUTOMATIC_RETRY'},infinite_opus_crown_financial_recovery_20261001_r1:recoveredFinancialReceipt()};
 const store={transaction:async fn=>fn({getSettings:async()=>settings,setSetting:async(k,v)=>{settings[k]=v;}})};
 const original=globalThis.fetch,observed={},paid=[];
 globalThis.fetch=async(url,o={})=>{
  if(o.method==='POST'){
   const b=JSON.parse(o.body),id='synthetic-gen-'+(paid.length+1);paid.push(b);
   assert.equal(b.provider.zdr,true);assert.equal(b.provider.allow_fallbacks,false);assert.equal(b.provider.require_parameters,true);assert.equal(b.temperature,undefined);
   let answer='SYNTHETIC NEW ANSWER';
   if(b.model==='google/gemini-2.5-pro'){
    const input=JSON.parse(b.messages[1].content);
    answer=JSON.stringify({grades:input.tasks.flatMap(t=>['A','B'].map(candidate=>({task_id:t.id,candidate,quality_score:100,required_regressions:0,canonical_zero_loss:true,reason:'SYNTHETIC ONLY'})))});
   }
   observed[id]={id,model:b.model==='anthropic/claude-opus-5.5'?'anthropic/claude-opus-5.5-20260921':b.model==='openai/gpt-6.1-sol-pro'?SOL_CANONICAL_REVISION:b.model,provider_name:b.model==='anthropic/claude-opus-5.5'?'Amazon Bedrock':b.model==='openai/gpt-6.1-sol-pro'?'Azure':'Google',total_cost:.001,created_at:new Date(now).toISOString()};
   return {ok:true,text:async()=>JSON.stringify({id,choices:[{message:{content:answer},finish_reason:'stop'}]})};
  }
  if(String(url).endsWith('/key'))return {ok:true,json:async()=>({data:{limit:20,limit_reset:'monthly',limit_remaining:20}})};
  const id=new URL(url).searchParams.get('id');
  const old=[...originalState.generationJournal,...state.generationJournal].find(r=>r.id===id);
  const d=id==='gen-1790807964-m6HWX42a5VtncUFVBpL1'?{id,request_id:'req-1790807964-Ve3fJIrYt0PXl3LqGRb0',created_at:'2026-09-30T22:39:24.829Z',model:'anthropic/claude-opus-5.5-20260921',provider_name:'Amazon Bedrock',total_cost:.011224,native_tokens_prompt:681,native_tokens_completion:425}:old?{id,model:old.observedModel,provider_name:old.provider,total_cost:old.costUsd}:observed[id];
  return {ok:true,json:async()=>({data:d})};
 };
 const options={store,apiKey:'synthetic-private-key',checkpointKey:key,paidAuthorization:{evidenceRef:'SYNTHETIC',month:new Date(now).toISOString().slice(0,7),maxMonthlyMicrousd:20000000,expiresAt:new Date(now+60000).toISOString(),crownRoutes:['openrouter:anthropic/claude-opus-5.5']},resumeAuthorization:authority(now)};
 try{
  const r=await runCrownAutoFinish(options);
  assert.equal(r.status,'NON_OPUS_GENERAL_CROWN_WON');
  assert.deepEqual(paid.map(p=>p.model),['openai/gpt-6.1-sol-pro','google/gemini-2.5-pro']);
  assert.equal(settings[RESUME_KEY].status,'FAILED_NO_AUTOMATIC_RETRY');
  assert(Math.abs(settings[INTERRUPTED_RESUME_KEY].newSpendUsd-(state.newSpendUsd+.002))<1e-12);
  await runCrownAutoFinish(options);assert.equal(paid.length,2);
 }finally{globalThis.fetch=original;}
});
