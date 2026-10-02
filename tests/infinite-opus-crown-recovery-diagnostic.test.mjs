import test from 'node:test';import assert from 'node:assert/strict';import {readCrownRecoveryMetadata} from '../scripts/infinite-opus-crown-recovery-diagnostic.mjs';
import crypto from 'node:crypto';import {sealCrownCheckpoint} from '../src/crown-sealed-checkpoint.mjs';import {SOURCE_KEY,RESUME_KEY} from '../src/crown-resume-checkpoint.mjs';
test('continuation diagnostic verifies encrypted answers without exposing payloads',async()=>{
 const key='SYNTHETIC CHECKPOINT KEY LONG ENOUGH',old=process.env.TOKEN_ENCRYPTION_KEY;process.env.TOKEN_ENCRYPTION_KEY=key;
 const hash=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
 const tasks=[1,2].map(n=>({id:'t'+n,prompt:'PRIVATE SYNTHETIC PROMPT '+n,rubric:['PRIVATE RUBRIC'],must_not:[]}));
 const commitment=hash(tasks.map(t=>({id:t.id,promptHash:hash(t.prompt),rubricHash:hash(t.rubric),mustNotHash:hash(t.must_not)}))),answers={};
 const calls=[['t1','anthropic/claude-opus-5.5'],['t1','openai/gpt-6.1-sol-pro'],['t2','anthropic/claude-opus-5.5']].map(([taskId,model])=>{const t=tasks.find(t=>t.id===taskId),answer='PRIVATE SYNTHETIC ANSWER '+model;answers[taskId+'|'+model]=answer;return {taskId,model,answerHash:hash(answer),promptHash:hash(t.prompt),rubricHash:hash(t.rubric),metaModel:model==='anthropic/claude-opus-5.5'?'anthropic/claude-opus-5.5-20260921':'openai/gpt-6.1-sol-pro-20260929',providerName:model==='anthropic/claude-opus-5.5'?'Amazon Bedrock':'Azure'};});
 const settings={[SOURCE_KEY]:{taskCommitment:commitment},[RESUME_KEY]:{taskCommitment:commitment,sealedEvidence:sealCrownCheckpoint({tasks,answers,calls},{key,binding:RESUME_KEY+'|'+commitment})}};
 const store={transaction:async fn=>fn({getSettings:async()=>settings})};
 try{let out=await readCrownRecoveryMetadata(store);assert.equal(out.continuationCheckpoint.retainedCandidateAnswers,3);assert.equal(out.continuationCheckpoint.missingCandidateAnswers,1);assert.equal(out.continuationCheckpoint.missingEvaluatorCalls,1);assert.equal(out.continuationCheckpoint.privateInterruptedResponsePresent,false);assert(!JSON.stringify(out).includes('PRIVATE SYNTHETIC'));
  settings[RESUME_KEY].taskCommitment+='tampered';out=await readCrownRecoveryMetadata(store);assert.equal(out.continuationCheckpoint.status,'CONTINUATION_CHECKPOINT_NOT_VERIFIED');assert(!JSON.stringify(out).includes('PRIVATE SYNTHETIC'));
 }finally{if(old===undefined)delete process.env.TOKEN_ENCRYPTION_KEY;else process.env.TOKEN_ENCRYPTION_KEY=old;}
});
test('read-only diagnostic retains reconciliation fields and never sealed data',async()=>{
 let writes=0,reads=0;const s={infiniteOpusRuntimeV1:{ledger:{month:'2026-10',calls:[{callId:'sealed-call-1',status:'DISPATCHED',model:'anthropic/claude-opus-5.5',actualMicrousd:null,prompt:'HIDDEN_PROMPT',response:'HIDDEN_ANSWER',id:'Bearer secret'}]},archivedLedgers:{'2026-09':{calls:[{callId:'old',status:'DISPATCHED'}]}}},infinite_opus_crown_autofinish_20261001_v7:{status:'FAILED_NO_AUTOMATIC_RETRY',tasks:[{prompt:'HIDDEN_PROMPT'}],answers:{one:'HIDDEN_ANSWER'},taskCommitment:'sha256:abc',lastGeneration:{id:'gen-real-123',costUsd:.01}},OPENROUTER_API_KEY:'sk-secret'};
 const store={transaction:async fn=>fn({getSettings:async()=>{reads++;return s;},setSetting:async()=>{writes++;throw Error('write forbidden')}})};
 const out=await readCrownRecoveryMetadata(store);assert.equal(reads,1);assert.equal(writes,0);assert.equal(out.providerCallsPerformed,0);const raw=JSON.stringify(out);assert.ok(!/HIDDEN_|sk-secret|Bearer secret/.test(raw));assert.equal(out.states.infiniteOpusRuntimeV1.metadata.archivedLedgers['2026-09'].calls[0].callId,'old');assert.equal(out.states.infinite_opus_crown_autofinish_20261001_v7.metadata.lastGeneration.id,'gen-real-123');
});
test('older Crown inventory exposes metadata and field presence without hidden content',async()=>{
 const settings={legacySealedCrownTrial:{tasks:[{prompt:'DO_NOT_EXPOSE'}],answers:{a:'DO_NOT_EXPOSE'},privateEvidenceRef:'DO_NOT_EXPOSE',status:'FAILED',sealedEvidence:{schemaVersion:'uberbond.sealed-crown-checkpoint.v1',ciphertext:'DO_NOT_EXPOSE'}},CROWN_SECRET:'DO_NOT_EXPOSE',infiniteOpusRuntimeV1:{receipts:[{kind:'CROWN_DISPATCH',callId:'sealed-call-1',observedAt:123,prompt:'DO_NOT_EXPOSE'}]}};
 const out=await readCrownRecoveryMetadata({transaction:async fn=>fn({getSettings:async()=>settings})});
 assert.equal(out.inventory.length,1);assert.equal(out.inventory[0].encryptedCheckpointPresent,true);assert.equal(out.inventory[0].privateEvidencePointerPresent,true);assert.equal(out.states.infiniteOpusRuntimeV1.metadata.receipts[0].observedAt,123);assert.ok(!JSON.stringify(out).includes('DO_NOT_EXPOSE'));assert.ok(!JSON.stringify(out).includes('CROWN_SECRET'));
});
