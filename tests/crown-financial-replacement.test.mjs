import test from 'node:test';
import assert from 'node:assert/strict';
import { createCognitionLedger, reserveCognitionCall, markCognitionDispatched } from '../src/cognition-ledger.mjs';
import { reconcileOriginalCrownFinancialState, validateOriginalGeneration, ORIGINAL_CLAIM, ORIGINAL_CALL, ORIGINAL_GENERATION, UNDISPATCHED, RECOVERY_KEY } from '../scripts/infinite-opus-crown-financial-recovery.mjs';
import { validReplacementAuthority, REPLACEMENT_KEY } from '../src/crown-replacement-authority.mjs';
import { runCrownAutoFinish } from '../scripts/infinite-opus-crown-autofinish.mjs';
const meta={id:ORIGINAL_GENERATION,request_id:'req-1790807964-Ve3fJIrYt0PXl3LqGRb0',created_at:'2026-09-30T22:39:24.829Z',model:'anthropic/claude-opus-5.5-20260921',provider_name:'Amazon Bedrock',total_cost:.011224,native_tokens_prompt:681,native_tokens_completion:425};
const auth={operation:'replacement-sealed-general-crown-evaluation',attemptKey:REPLACEMENT_KEY,maxIncrementalMicrousd:450000,monthlyCapMicrousd:20000000,evidenceRef:'owner-finish-it-all-20261001T215158Z',historicalBillingEvidenceRef:'docs/receipts/UBERMIND_CROWN_BILLING_RECOVERY_2026-10-01.json',authorizedAt:'2026-10-01T21:51:58Z',expiresAt:'2026-10-02T00:00:00Z'};
function fixture(){
 let ledger=createCognitionLedger({month:'2026-09',monthlyCapMicrousd:20000000});
 for(const callId of [ORIGINAL_CALL,...UNDISPATCHED]){
  ledger=reserveCognitionCall(ledger,{callId,taskId:callId===ORIGINAL_CALL?'sealed-paid-0-0-805bb7d11651df598fcb':callId,model:'anthropic/claude-opus-5.5',provider:'openrouter',role:'CROWN',qualityClass:'GENERAL_CROWN',cacheState:'MISS',ceilingMicrousd:73277},'2026-09-30').ledger;
 }
 ledger=markCognitionDispatched(ledger,ORIGINAL_CALL,'2026-09-30');
 let settings={infiniteOpusRuntimeV1:{ledger,version:5,receipts:[]},[ORIGINAL_CLAIM]:{status:'CLAIMED',snapshotHash:'sha256:cdaaf3398ee5c78f5e95b44bd45325b3545464aefb8ff3616a4aae97345dcafa'},infinite_opus_crown_autofinish_20261001_v7:{status:'FAILED_NO_AUTOMATIC_RETRY'}};
 const store={transaction:async fn=>{let draft=structuredClone(settings);const result=await fn({getSettings:async()=>draft,setSetting:async(k,v)=>{draft[k]=v;}});settings=draft;return result;}};
 return {store,get:()=>settings};
}
test('financial-only reconstruction records charge, provenance and cancels only undispatched calls',async()=>{
 const f=fixture();const r=await reconcileOriginalCrownFinancialState({store:f.store,generationMetadata:meta});
 assert.equal(r.status,'RECONCILED_INVALID_TOURNAMENT_EVIDENCE');assert.equal(r.retainedExactBinding,false);assert.equal(r.semanticAuthority,'NONE');
 const l=f.get().infiniteOpusRuntimeV1.ledger;
 assert.equal(l.calls[0].actualMicrousd,11224);assert.equal(l.calls[0].status,'SETTLED');
 assert(l.calls.slice(1).every(c=>c.status==='RELEASED'));
 assert.equal(f.get().infinite_opus_crown_autofinish_20261001_v7.status,'FAILED_NO_AUTOMATIC_RETRY');
 const before=JSON.stringify(f.get());await reconcileOriginalCrownFinancialState({store:f.store,generationMetadata:meta});assert.equal(JSON.stringify(f.get()),before);
});
for(const [field,value]of Object.entries({id:'gen-other',request_id:'req-other',created_at:'2026-09-30T22:39:25Z',model:'anthropic/claude-opus-5.5-20260922',provider_name:'Other',total_cost:0,native_tokens_prompt:680,native_tokens_completion:424})){
 test('refuse changed provider observation '+field,()=>assert.throws(()=>validateOriginalGeneration({...meta,[field]:value})));
}
test('dispatched secondary call cannot be released and entire transaction stays unchanged',async()=>{
 const f=fixture(); f.get().infiniteOpusRuntimeV1.ledger.calls[1].status='DISPATCHED';let before=JSON.stringify(f.get());
 await assert.rejects(reconcileOriginalCrownFinancialState({store:f.store,generationMetadata:meta}),/undispatched/);
 assert.equal(JSON.stringify(f.get()),before);
});
test('wrong original claim cannot settle observed costs against guessed call',async()=>{
 const f=fixture();f.get()[ORIGINAL_CLAIM].snapshotHash='sha256:wrong';
 await assert.rejects(reconcileOriginalCrownFinancialState({store:f.store,generationMetadata:meta}),/claim/);assert.equal(f.get()[RECOVERY_KEY],undefined);
});
test('replacement authority is exact, bounded, time-valid and cannot become monthly consent',()=>{
 const now=Date.parse('2026-10-01T22:00:00Z');assert.equal(validReplacementAuthority(auth,now),true);
 for(const a of [{...auth,maxIncrementalMicrousd:450001},{...auth,monthlyCapMicrousd:20000001},{...auth,evidenceRef:'made-up'},{...auth,attemptKey:'old-v7'},{...auth,authorizedAt:'2026-10-02T00:00:00Z'}])assert.equal(validReplacementAuthority(a,now),false);
 assert.equal(validReplacementAuthority(auth,Date.parse(auth.expiresAt)),false);
});
test('invalid replacement consent dispatches nothing',async()=>{
 const f=fixture();const r=await runCrownAutoFinish({store:f.store,apiKey:'test-only-key',replacementAuthorization:{...auth,maxIncrementalMicrousd:999999}});
 assert.equal(r.status,'EXPLICIT_REPLACEMENT_AUTHORITY_REQUIRED');assert.equal(r.providerCallsPerformed,0);
});

test('existing replacement claim prevents all metadata and inference retries',async()=>{
 const f=fixture();f.get()[REPLACEMENT_KEY]={status:'RUNNING'};const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error('network-must-not-run');};
 try{const r=await runCrownAutoFinish({store:f.store,apiKey:'fixture-private-key',checkpointKey:'x'.repeat(32),paidAuthorization:{evidenceRef:'oct',month:'2026-10',maxMonthlyMicrousd:20000000,expiresAt:'2026-11-01T00:00:00Z',crownRoutes:['openrouter:anthropic/claude-opus-5.5']},replacementAuthorization:auth});
 assert.equal(r.status,'AUTOFINISH_ALREADY_ATTEMPTED_NO_RETRY');}finally{globalThis.fetch=original;}
});
test('protected reserve refusal happens before any paid dispatch',async()=>{
 const f=fixture();const original=globalThis.fetch;let paid=0;
 globalThis.fetch=async(url,options)=>{
 if(options?.method==='POST'){paid++;throw Error('paid-must-not-run');}
 return {ok:true,json:async()=>({data:String(url).includes('/generation')?meta:{limit:20,limit_reset:'monthly',limit_remaining:15}})};
 };
 try{const r=await runCrownAutoFinish({store:f.store,apiKey:'fixture-private-key',checkpointKey:'x'.repeat(32),paidAuthorization:{evidenceRef:'oct',month:'2026-10',maxMonthlyMicrousd:20000000,expiresAt:'2026-11-01T00:00:00Z',crownRoutes:['openrouter:anthropic/claude-opus-5.5']},replacementAuthorization:auth});
 assert.equal(r.status,'KEY_CAP_OR_PROTECTED_CROWN_RESERVE_REFUSED');assert.equal(paid,0);
 assert.equal(f.get()[RECOVERY_KEY].retainedExactBinding,false);}finally{globalThis.fetch=original;}
});
test('concurrent replacement triggers claim one paid attempt and preserve failed state',async()=>{
 const f=fixture();let chain=Promise.resolve();const inner=f.store.transaction;
 f.store.transaction=fn=>{const job=chain.then(()=>inner(fn));chain=job.catch(()=>{});return job;};
 const original=globalThis.fetch;let paid=0;
 globalThis.fetch=async(url,options)=>{
 if(options?.method==='POST'){paid++;throw Error('fixture-single-dispatch-interrupted');}
 return {ok:true,json:async()=>({data:String(url).includes('/generation')?meta:{limit:20,limit_reset:'monthly',limit_remaining:20}})};
 };
 const options={store:f.store,apiKey:'fixture-private-key',checkpointKey:'x'.repeat(32),paidAuthorization:{evidenceRef:'oct',month:'2026-10',maxMonthlyMicrousd:20000000,expiresAt:'2026-11-01T00:00:00Z',crownRoutes:['openrouter:anthropic/claude-opus-5.5']},replacementAuthorization:auth};
 try{await Promise.all([runCrownAutoFinish(options),runCrownAutoFinish(options)]);assert.equal(paid,1);assert.equal(f.get()[REPLACEMENT_KEY].status,'FAILED_NO_AUTOMATIC_RETRY');
 await runCrownAutoFinish(options);assert.equal(paid,1);}finally{globalThis.fetch=original;}
});
