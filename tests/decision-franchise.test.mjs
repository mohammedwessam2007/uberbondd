import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createSemanticClosureChecker, semanticProgramHash,
  mintDecisionFranchiseFromClosure
} from '../src/semantic-closure-kernel.mjs';
import {
  executeDecisionFranchise, verifyDistinctFranchiseFanout,
  modelDecisionFranchiseCompression
} from '../src/decision-franchise.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');

function fixture(){
  const quality=h('q');
  const policy={
    domain:[{risk:'LOW'},{risk:'HIGH'}],
    rows:[
      {input:{risk:'LOW'},output:{route:'AUTO'}},
      {input:{risk:'HIGH'},output:{route:'CROWN'}}
    ]
  };
  const spec={
    schemaVersion:'uberbond.decision-franchise.spec.v1',
    taskClass:'ROUTE_DECISION',qualityContractHash:quality,
    sideEffectClass:'NONE',relevantKeys:['risk'],policy
  };
  const authority={
    id:'franchise-spec',kind:'REALITY',status:'ACTIVE',scope:'DF',qualityContractHash:quality,
    crownRevision:'opus-5.5-r1',verifiedAt:'2026-09-30T19:00:00Z',expiresAt:'2026-10-01T00:00:00Z',
    sourceHashes:{policy:h('policy-source')},invalidators:['policy-drift'],evidenceRef:'proof://franchise',value:spec
  };
  const artifact={
    scope:'DF',qualityContractHash:quality,
    nodes:[
      {id:'spec-leaf',kind:'REALITY',authorityId:authority.id,dependencies:[],value:spec},
      {id:'spec-id',kind:'DERIVATION',opcode:'IDENTITY',dependencies:['spec-leaf'],params:{},value:spec}
    ],
    claims:[{id:'franchise',nodeId:'spec-id',value:spec}]
  };
  const context={
    scope:'DF',crownRevision:'opus-5.5-r1',qualityContractHash:quality,
    sourceHashes:{policy:h('policy-source')},invalidators:{'policy-drift':false},
    requiredClaimIds:['franchise'],authorizedProgramHash:semanticProgramHash(artifact)
  };
  const checker=createSemanticClosureChecker({authorityRecords:[authority]});
  const closure=checker({artifact,context,now});
  const minted=mintDecisionFranchiseFromClosure({
    artifact,closure,context,franchiseClaimId:'franchise',
    evidenceRef:'proof://franchise-mint',expiresAt:'2026-10-01T00:00:00Z',now
  });
  return {quality,context,minted};
}

const task=(quality,i,risk=i%2?'HIGH':'LOW')=>({
  taskId:'consumer-'+i,taskClass:'ROUTE_DECISION',qualityContractHash:quality,sideEffectClass:'NONE',
  payload:{risk,requestId:'unique-'+i,irrelevantNarrative:'different surrounding task '+i}
});

test('E1 closure mints franchise and exact projection ignores only certified-irrelevant fields',()=>{
  const f=fixture();assert.equal(f.minted.ok,true);
  const out=executeDecisionFranchise({
    record:f.minted.record,trustPin:f.minted.trustPin,
    task:task(f.quality,1,'HIGH'),currentContext:f.context,now
  });
  assert.equal(out.ok,true);assert.deepEqual(out.decision,{route:'CROWN'});
  assert.equal(out.providerCallsPerformed,0);
});

test('10000 distinct full tasks share two proven semantic states with zero provider calls',()=>{
  const f=fixture();
  const tasks=Array.from({length:10000},(_,i)=>task(f.quality,i));
  const proof=verifyDistinctFranchiseFanout({
    record:f.minted.record,trustPin:f.minted.trustPin,tasks,currentContext:f.context,now
  });
  assert.equal(proof.ok,true);
  assert.equal(proof.consumerCount,10000);
  assert.equal(proof.uniqueFullTaskCount,10000);
  assert.equal(proof.uniqueProjectedStateCount,2);
  assert.equal(proof.providerCallsPerformed,0);
});

test('irrelevant-field differences do not permit relevant-state omission or drift',()=>{
  const f=fixture();
  const missing=task(f.quality,3);delete missing.payload.risk;
  assert.equal(executeDecisionFranchise({record:f.minted.record,trustPin:f.minted.trustPin,task:missing,currentContext:f.context,now}).ok,false);
  const drift={...f.context,sourceHashes:{policy:h('changed')}};
  assert.equal(executeDecisionFranchise({record:f.minted.record,trustPin:f.minted.trustPin,task:task(f.quality,4),currentContext:drift,now}).ok,false);
});

test('33,333x capacity threshold is crossed at 1,176,471 distinct $0.85-reference consumers under $30 all-in',()=>{
  const modeled=modelDecisionFranchiseCompression({
    distinctConsumerCount:1176471,
    directOpusUnitMicrousd:850000,
    actualAllInMicrousd:30000000
  });
  assert.equal(modeled.targetMet,true);
  assert.equal(modeled.millionDollarReferenceThresholdMet,true);
  assert.equal(modeled.consumersForTarget,1176471);
  assert.ok(modeled.multiplier>33333.333333333336);
});
