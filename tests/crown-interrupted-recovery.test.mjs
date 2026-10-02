import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileInterruptedCrownGeneration} from '../scripts/infinite-opus-crown-interrupted-recovery.mjs';
import {RESUME_KEY} from '../src/crown-resume-checkpoint.mjs';
const id='gen-1790900587-TKEqsFrik1iupnf4Ljrd';
const fixture=()=>{const settings={[RESUME_KEY]:{status:'FAILED_NO_AUTOMATIC_RETRY',reason:'generation-reconciliation-required:'+id,newSpendUsd:.11058375,sealedEvidence:{ciphertext:'PRIVATE_UNCHANGED'},generationJournal:[{id,model:'openai/gpt-6.1-sol-pro',status:'DISPATCHED_UNRECONCILED',reservedWorstCaseUsd:.04}]}};return {settings,store:{transaction:async fn=>fn({getSettings:async()=>structuredClone(settings),setSetting:async(k,v)=>{settings[k]=structuredClone(v);}})}};};
const bill={id,model:'openai/gpt-6.1-sol-pro-20260929',provider_name:'Azure',total_cost:.01};
test('metadata-only recovery settles once and preserves failed state and private custody',async()=>{
 const f=fixture();let reads=0;const options={apiKey:'SYNTHETIC_SECRET',fetchImpl:async(url,o)=>{reads++;assert.equal(o.method,'GET');assert.equal(new URL(url).searchParams.get('id'),id);return {ok:true,json:async()=>({data:bill})};}};
 const r=await reconcileInterruptedCrownGeneration(f.store,options);assert.equal(r.status,'RECONCILED_BILL_ONLY_NO_RETAINED_ANSWER');assert.equal(r.providerCallsPerformed,0);
 assert.equal(f.settings[RESUME_KEY].status,'FAILED_NO_AUTOMATIC_RETRY');assert.equal(f.settings[RESUME_KEY].sealedEvidence.ciphertext,'PRIVATE_UNCHANGED');assert(Math.abs(f.settings[RESUME_KEY].newSpendUsd-.12058375)<1e-12);
 await reconcileInterruptedCrownGeneration(f.store,options);assert.equal(reads,1);assert(!JSON.stringify(r).includes('SYNTHETIC_SECRET'));
});
for(const [label,data] of [['wrong id',{...bill,id:'other'}],['provider drift',{...bill,provider_name:'Other'}],['model drift',{...bill,model:bill.model+'new'}],['missing cost',{...bill,total_cost:undefined}],['negative cost',{...bill,total_cost:-1}],['over reservation',{...bill,total_cost:.05}]])test(label+' remains uncertain with no mutation',async()=>{
 const f=fixture(),before=JSON.stringify(f.settings);const r=await reconcileInterruptedCrownGeneration(f.store,{apiKey:'SYNTHETIC',fetchImpl:async()=>({ok:true,json:async()=>({data})})});assert.equal(r.status,'DISPATCHED_UNRECONCILED');assert.equal(JSON.stringify(f.settings),before);
});
test('provider 404 does not mean free, absent or safe to retry',async()=>{const f=fixture(),before=JSON.stringify(f.settings);const r=await reconcileInterruptedCrownGeneration(f.store,{apiKey:'SYNTHETIC',fetchImpl:async()=>({ok:false,status:404})});assert.equal(r.status,'DISPATCHED_UNRECONCILED');assert.equal(r.metadataHttpStatus,404);assert.equal(r.costUsd,undefined);assert.equal(JSON.stringify(f.settings),before);});
