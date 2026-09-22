import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  compileBlackoutFirstComputePlan,
  applyBlackoutFirstEvent,
  evaluateBlackoutRecoveryReplay
} from '../src/blackout-first-compute-planner.mjs';

const d=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const HEAD='a'.repeat(40),R1='b'.repeat(64),R2='c'.repeat(64);
function graph(){
 const requirements=[{id:'r1'}],leaves=[{leafId:'a',predecessors:[]},{leafId:'b',predecessors:['a']}],topologicalWaves=[['a'],['b']],criticalPath=['a','b'];
 const g={ok:true,status:'ZERO_ORPHAN_EXECUTION_LEAF_GRAPH_COMPILED',sourceCommit:HEAD,requirements,leaves,topologicalWaves,criticalPath};
 g.graphDigest=d({sourceCommit:g.sourceCommit,requirements,leaves,topologicalWaves,criticalPath});
 return g;
}

test('plan inherits exact checkpoint and replay laws from canonical continuation',()=>{
 const r=compileBlackoutFirstComputePlan({graph:graph(),maxAttempts:3});
 assert.equal(r.ok,true);
 assert.equal(r.recoveryPolicy.checkpointAfterEveryAcceptedResult,true);
 assert.equal(r.recoveryPolicy.resumeRequiresExactSourceRevision,true);
 assert.equal(r.recoveryPolicy.dependencySkippingAllowed,false);
 assert.equal(r.externalEffectAuthority,'NONE');
});

test('blackout before any result resumes exact initial checkpoint',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g});
 const r=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:HEAD});
 assert.equal(r.ok,true); assert.equal(r.status,'BLACKOUT_FIRST_RESUMED'); assert.equal(r.state.stateDigest,p.state.stateDigest);
});

test('completed work survives blackout and dependent frontier stays unlocked',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g});
 const a=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:{type:'RESULT',leafId:'a',status:'COMPLETED',receiptDigest:R1},currentSourceCommit:HEAD});
 const b=applyBlackoutFirstEvent({graph:g,state:a.state,checkpoint:a.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:HEAD});
 assert.deepEqual(b.state.completedLeafIds,['a']); assert.deepEqual(b.state.runnableLeafIds,['b']);
});

test('same terminal receipt replay after blackout is idempotent and creates no duplicate terminal effect',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g});
 const a=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:{type:'RESULT',leafId:'a',status:'COMPLETED',receiptDigest:R1},currentSourceCommit:HEAD});
 const b=applyBlackoutFirstEvent({graph:g,state:a.state,checkpoint:a.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:HEAD});
 const c=applyBlackoutFirstEvent({graph:g,state:b.state,checkpoint:b.checkpoint,event:{type:'RESULT',leafId:'a',status:'COMPLETED',receiptDigest:R1},currentSourceCommit:HEAD});
 assert.equal(c.status,'BLACKOUT_FIRST_RESULT_IDEMPOTENT'); assert.equal(c.duplicateTerminalEffect,false);
});

test('conflicting terminal replay after blackout is refused',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g});
 const a=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:{type:'RESULT',leafId:'a',status:'COMPLETED',receiptDigest:R1},currentSourceCommit:HEAD});
 const b=applyBlackoutFirstEvent({graph:g,state:a.state,checkpoint:a.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:HEAD});
 const c=applyBlackoutFirstEvent({graph:g,state:b.state,checkpoint:b.checkpoint,event:{type:'RESULT',leafId:'a',status:'COMPLETED',receiptDigest:R2},currentSourceCommit:HEAD});
 assert.equal(c.ok,false); assert.ok(c.reasonCodes.includes('conflicting-terminal-replay'));
});

test('source revision change refuses resume instead of guessing',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g});
 const r=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:'d'.repeat(40)});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('source-revision-changed-reconciliation-required'));
});

test('fault injection replay matches no-blackout control state',()=>{
 const r=evaluateBlackoutRecoveryReplay({
  graph:graph(),currentSourceCommit:HEAD,
  events:[
    {type:'BLACKOUT'},
    {type:'RESULT',leafId:'a',status:'COMPLETED',receiptDigest:R1},
    {type:'BLACKOUT'},
    {type:'RESULT',leafId:'a',status:'COMPLETED',receiptDigest:R1},
    {type:'RESULT',leafId:'b',status:'COMPLETED',receiptDigest:R2},
    {type:'BLACKOUT'}
  ]
 });
 assert.equal(r.ok,true); assert.equal(r.status,'BLACKOUT_RECOVERY_EQUIVALENT');
 assert.equal(r.faultRecoveryEquivalent,true); assert.equal(r.noLostCompletedWork,true);
 assert.equal(r.duplicateTerminalEffectsObserved,false); assert.equal(r.hypothesisSupported,true);
});
