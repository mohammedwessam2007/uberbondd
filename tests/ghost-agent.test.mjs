import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';
import { compileGhostAgentFromFranchise, executeGhostAgent, verifyGhostAgentBatch } from '../src/ghost-agent.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');
function fixture(){
 const quality=h('quality');
 const spec={
  schemaVersion:'uberbond.decision-franchise.spec.v1',taskClass:'ROUTE_DECISION',
  qualityContractHash:quality,sideEffectClass:'NONE',relevantKeys:['risk'],
  policy:{
   domain:[{risk:'LOW'},{risk:'HIGH'}],
   rows:[{input:{risk:'LOW'},output:{route:'AUTO'}},{input:{risk:'HIGH'},output:{route:'CROWN'}}]
  }
 };
 const record={
  kind:'DECISION_FRANCHISE',status:'ACTIVE',id:'df:'+semanticHash(spec),spec,
  crownRevision:'opus-5.5-r1',sourceDependencies:{policy:h('policy-source')},invalidators:{drift:false},
  proofClass:'E3',evidenceRef:'proof://df',expiresAt:'2026-10-01T00:00:00Z',mintedAt:'2026-09-30T19:00:00Z'
 };
 const trustPin=semanticHash(record);
 const ghost=compileGhostAgentFromFranchise({record,trustPin,eventType:'LEAD_RISK_CHANGED',compiledAt:'2026-09-30T19:30:00Z'});
 const currentContext={crownRevision:'opus-5.5-r1',sourceHashes:{policy:h('policy-source')},invalidators:{drift:false}};
 return {record,trustPin,ghost,currentContext};
}

test('unrelated events sleep with zero inference',()=>{
 const f=fixture();
 const out=executeGhostAgent({ghost:f.ghost,event:{eventId:'e1',type:'OTHER',payload:{risk:'HIGH'}},currentContext:f.currentContext,now});
 assert.equal(out.ok,true);assert.equal(out.status,'GHOST_AGENT_SLEEP');assert.equal(out.providerCallsPerformed,0);assert.equal(out.inferenceUsd,0);
});

test('matching event executes certified franchise with zero JEV/model calls',()=>{
 const f=fixture();
 const out=executeGhostAgent({ghost:f.ghost,event:{eventId:'e2',type:'LEAD_RISK_CHANGED',payload:{risk:'HIGH',irrelevant:'x'}},currentContext:f.currentContext,now});
 assert.equal(out.ok,true);assert.equal(out.status,'GHOST_AGENT_EXECUTED');assert.deepEqual(out.decision,{route:'CROWN'});
 assert.equal(out.providerCallsPerformed,0);assert.equal(out.inferenceUsd,0);assert.equal(out.semanticAuthority,'CERTIFIED_BOUNDED_POLICY');
});

test('dependency drift decompiles instead of serving stale cognition',()=>{
 const f=fixture();
 const drift={...f.currentContext,sourceHashes:{policy:h('changed')}};
 const out=executeGhostAgent({ghost:f.ghost,event:{eventId:'e3',type:'LEAD_RISK_CHANGED',payload:{risk:'LOW'}},currentContext:drift,now});
 assert.equal(out.ok,false);assert.equal(out.status,'GHOST_AGENT_DECOMPILE_TO_FRONTIER');assert.equal(out.decompileRequired,true);assert.equal(out.providerCallsPerformed,0);
});

test('expired franchise decompiles',()=>{
 const f=fixture();
 const out=executeGhostAgent({ghost:f.ghost,event:{eventId:'e4',type:'LEAD_RISK_CHANGED',payload:{risk:'LOW'}},currentContext:f.currentContext,now:Date.parse('2026-10-02T00:00:00Z')});
 assert.equal(out.ok,false);assert.equal(out.status,'GHOST_AGENT_DECOMPILE_TO_FRONTIER');
});

test('10000 idle events and 10000 valid events require zero inference',()=>{
 const f=fixture();
 const events=[];
 for(let i=0;i<10000;i++)events.push({eventId:'idle-'+i,type:'OTHER',payload:{risk:'LOW'}});
 for(let i=0;i<10000;i++)events.push({eventId:'hit-'+i,type:'LEAD_RISK_CHANGED',payload:{risk:i%2?'HIGH':'LOW',nonce:i}});
 const out=verifyGhostAgentBatch({ghost:f.ghost,events,currentContext:f.currentContext,now});
 assert.equal(out.ok,true);assert.equal(out.slept,10000);assert.equal(out.executed,10000);
 assert.equal(out.providerCallsPerformed,0);assert.equal(out.idleInferenceUsd,0);
});
