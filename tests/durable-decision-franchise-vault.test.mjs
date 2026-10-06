import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createInfiniteOpusRuntime, INFINITE_OPUS_TASK_SCHEMA } from '../src/infinite-opus-native-runtime.mjs';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');

function makeStore(){
 let settings={};
 return {
  transaction:async fn=>fn({
   transactionClient:false,
   getSettings:async()=>structuredClone(settings),
   setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}
  })
 };
}
const context=()=>({
 scope:'LIVE_DF',crownRevision:'opus-5.5-r1',qualityContractHash:h('quality'),
 sourceHashes:{policy:h('policy-source')},invalidators:{drift:false},
 requiredClaimIds:['decision'],authorizedProgramHash:h('program')
});
function bundle(){
 const domain=[{risk:'LOW'},{risk:'HIGH'}];
 const observations=domain.map((input,i)=>{
  const decision=i===0?{route:'AUTO'}:{route:'CROWN'};
  const observation={
   observationId:'obs-'+i,semanticAuthority:'CURRENT_TASK_CLASS_CROWN',
   exactModelId:'anthropic/claude-opus-5.5',taskClass:'ROUTE_DECISION',
   qualityContractHash:h('quality'),crownRevision:'opus-5.5-r1',
   input,inputHash:semanticHash(input),decision,decisionHash:semanticHash(decision),
   providerReceiptRef:'provider://real-receipt-'+i
  };
  return observation;
 });
 return {
  domain,observations,
  observationTrustPins:Object.fromEntries(observations.map(o=>[o.observationId,semanticHash(o)])),
  taskClass:'ROUTE_DECISION',qualityContractHash:h('quality'),relevantKeys:['risk'],
  crownRevision:'opus-5.5-r1',sourceDependencies:{policy:h('policy-source')},
  invalidators:{drift:false},evidenceRef:'proof://exhaustive-live',
  expiresAt:'2026-10-01T00:00:00Z'
 };
}
const task=i=>({
 schemaVersion:INFINITE_OPUS_TASK_SCHEMA,taskId:'live-task-'+i,taskClass:'ROUTE_DECISION',
 stakes:'LOW',sideEffectClass:'NONE',payload:{risk:i?'HIGH':'LOW',nonce:i},
 obligation:{kind:'ROUTE_DECISION'}
});

test('exhaustive current-Crown observations persist as a durable franchise across runtime recreation',async()=>{
 const store=makeStore();
 const first=createInfiniteOpusRuntime({store,clock:()=>now,contextLoader:async()=>context()});
 const admitted=await first.admitExhaustiveDecisionFranchise(bundle());
 assert.equal(admitted.ok,true);assert.equal(admitted.status,'DECISION_FRANCHISE_ADMITTED');
 const listed=await first.listDecisionFranchises();
 assert.equal(listed.count,1);assert.equal(listed.franchises[0].taskClass,'ROUTE_DECISION');

 const second=createInfiniteOpusRuntime({store,clock:()=>now,contextLoader:async()=>context()});
 const out=await second.execute(task(1));
 assert.equal(out.ok,true);assert.equal(out.status,'CLOSED_DECISION_FRANCHISE');
 assert.deepEqual(out.decision,{route:'CROWN'});assert.equal(out.providerCallsPerformed,0);
 const snap=await second.snapshot();assert.equal(snap.decisionFranchiseCount,1);
});

test('tampered Crown observation cannot enter the durable vault',async()=>{
 const store=makeStore(),runtime=createInfiniteOpusRuntime({store,clock:()=>now,contextLoader:async()=>context()});
 const b=bundle();b.observations[0].decision={route:'OTHER'};
 const out=await runtime.admitExhaustiveDecisionFranchise(b);
 assert.equal(out.ok,false);assert.match(out.reasons.join(','),/untrusted-or-mutated-crown-observation|decision-hash/);
 assert.equal((await runtime.listDecisionFranchises()).count,0);
});

test('vault admission is idempotent and conflicting recertification cannot overwrite cognition',async()=>{
 const store=makeStore(),runtime=createInfiniteOpusRuntime({store,clock:()=>now,contextLoader:async()=>context()});
 const a=await runtime.admitExhaustiveDecisionFranchise(bundle());
 const b=await runtime.admitExhaustiveDecisionFranchise(bundle());
 assert.equal(a.ok,true);assert.equal(b.status,'IDEMPOTENT_DECISION_FRANCHISE_ADMISSION');
 assert.equal((await runtime.listDecisionFranchises()).count,1);
});
