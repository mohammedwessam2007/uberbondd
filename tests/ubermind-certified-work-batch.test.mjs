import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticHash} from '../src/semantic-closure-kernel.mjs';
import {executeCertifiedFranchiseWorkBatch} from '../src/decision-franchise.mjs';

const now=Date.parse('2026-10-08T17:00:00Z');
const quality=semanticHash('w12-quality-contract');
function setup(){
  const sourceHashes={policy:semanticHash('w12-policy-source')};
  const invalidators={'policy-drift':false};
  const context={crownRevision:'w12-fixture-revision',
    qualityContractHash:quality,sourceHashes,invalidators};
  const record={
    id:'w12-certified-fixture',kind:'DECISION_FRANCHISE',status:'ACTIVE',
    mintedAt:'2026-10-08T16:00:00Z',expiresAt:'2026-10-09T16:00:00Z',
    crownRevision:context.crownRevision,sourceDependencies:sourceHashes,invalidators,
    proofClass:'E3',
    spec:{schemaVersion:'uberbond.decision-franchise.spec.v1',
      taskClass:'W12_FINITE_ROUTE',qualityContractHash:quality,sideEffectClass:'NONE',
      relevantKeys:['risk'],
      policy:{domain:[{risk:'LOW'},{risk:'HIGH'}],rows:[
        {input:{risk:'LOW'},output:{route:'AUTOMATED_EXACT'}},
        {input:{risk:'HIGH'},output:{route:'HUMAN_REVIEW_REQUIRED'}}
      ]}
    }
  };
  return {context,record,trustPin:semanticHash(record)};
}
const task=(i,risk=i%2?'HIGH':'LOW')=>({
  taskId:'w12-task-'+i,taskClass:'W12_FINITE_ROUTE',
  qualityContractHash:quality,sideEffectClass:'NONE',
  payload:{risk,uniqueSubject:'subject-'+i,irrelevantAuditTrail:i}
});
const run=(items,overrides={})=>executeCertifiedFranchiseWorkBatch({
  ...setup(),tasks:items,now,...overrides
});

test('materializes 1024 bounded distinct responses with just two independently cross-checked states',()=>{
  const out=run(Array.from({length:1024},(_,i)=>task(i)));
  console.log('W12_DIAG_FIRST:'+String(out.reasons?.join('|')??out.reason??out.status).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,100)+':'+out.completedOutputs.length+':'+String(out.distinctCertifiedSemanticStateCount??0));
  assert.equal(out.ok,true);
  assert.equal(out.status,'CERTIFIED_WORK_BATCH_MATERIALIZED');
  assert.equal(out.completedOutputs.length,1024);
  assert.equal(out.distinctFullTaskHashCount,1024);
  assert.equal(out.distinctCertifiedSemanticStateCount,2);
  assert.equal(out.independentlyCrossCheckedStateCount,2);
  assert.deepEqual(out.completedOutputs[0].decision,{route:'AUTOMATED_EXACT'});
  assert.deepEqual(out.completedOutputs[1].decision,{route:'HUMAN_REVIEW_REQUIRED'});
  assert.ok(out.completedOutputs.every(row=>typeof row.taskHash==='string'&&
    typeof row.decisionHash==='string'&&typeof row.projectedStateHash==='string'));
  assert.equal(out.providerCallsPerformed,0);
  assert.equal(out.independentlyVerifiedRealDemandCount,0);
  assert.equal(out.independentPairedQualitySamplesAdded,0);
  assert.equal(out.economicMultiplier,null);
  assert.equal(out.global33333xConfirmed,false);
});

test('a single out-of-domain task invalidates the entire batch, with no partial outputs',()=>{
  const out=run([task(1),task(2,'UNSUPPORTED'),task(3)]);
  assert.equal(out.ok,false);
  assert.equal(out.completedOutputs.length,0);
  assert.equal(out.status,'CERTIFIED_WORK_BATCH_ATOMIC_HOLD');
  assert.equal(out.providerCallsPerformed,0);
});

test('duplicate task identity and payload replay fail closed without output leakage',()=>{
  const repeated=task(1);
  const out=run([task(0),repeated,structuredClone(repeated)]);
  console.log('W12_DIAG_DUPLICATE:'+String(out.reasons?.join('|')??out.reason??out.status).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,100));
  assert.equal(out.ok,false);
  assert.equal(out.reason,'duplicate-task-or-identity-replay');
  assert.deepEqual(out.completedOutputs,[]);
});

test('expired, source-drifted, or task-supplied effects never produce certificates',()=>{
  const base=setup();
  const cases=[
    {...base,now:Date.parse('2026-10-10T17:00:00Z')},
    {...base,currentContext:{...base.context,sourceHashes:{policy:semanticHash('drift')}}},
  ];
  for(const input of cases){
    const out=run([task(0)],input);
    assert.equal(out.ok,false);
    assert.deepEqual(out.completedOutputs,[]);
  }
  const unsafe=task(0);unsafe.sideEffectClass='SEND_EMAIL';
  assert.equal(run([unsafe]).ok,false);
});

test('nondeterministic canonicalizers are detected by compiled-vs-interpreter shadow check',()=>{
  let reads=0;
  const out=run([task(0)],{semanticCanonicalizers:{
    risk:{canonicalize(){return {ok:true,value:(reads++%2?'HIGH':'LOW'),transformed:true};}}
  }});
  console.log('W12_DIAG_CANONICALIZER:'+String(out.reasons?.join('|')??out.reason??out.status).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,100));
  assert.equal(out.ok,false);
  assert.equal(out.reason,'compiled-interpreter-non-equivalence');
  assert.deepEqual(out.completedOutputs,[]);
});

test('bounded batch requires at least one and at most 4096 requests',()=>{
  assert.equal(run([]).ok,false);
  assert.equal(run(Array.from({length:4097},(_,i)=>task(i))).ok,false);
});
