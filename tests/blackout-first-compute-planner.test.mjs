import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { recomputeExecutionLeafGraphDigest } from '../src/execution-leaf-graph-receipt-digest.mjs';
import {
  compileBlackoutFirstComputePlan,
  applyBlackoutFirstEvent,
  evaluateBlackoutRecoveryReplay
} from '../src/blackout-first-compute-planner.mjs';

const HEAD='a'.repeat(40),R1='b'.repeat(64),R2='c'.repeat(64);
const AUTH='d'.repeat(64),STRAT='e'.repeat(64),BLOCK='f'.repeat(64);
const NOW=Date.parse('2026-09-22T20:00:00Z');
const EXP='2026-09-22T21:00:00.000Z';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const PUB=publicKey.export({type:'spki',format:'pem'});
const FINGERPRINT=crypto.createHash('sha256').update(JSON.stringify(publicKey.export({type:'spki',format:'der'}))).digest('hex');
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function graph(){
 const requirements=[{id:'r1'}],leaves=[{leafId:'a',predecessors:[]},{leafId:'b',predecessors:['a']}],topologicalWaves=[['a'],['b']],criticalPath=['a','b'];
 const g={ok:true,status:'ZERO_ORPHAN_EXECUTION_LEAF_GRAPH_COMPILED',sourceCommit:HEAD,requirements,leaves,topologicalWaves,criticalPath};
 g.graphDigest=recomputeExecutionLeafGraphDigest(g);
 return g;
}
function signedEvent(g,leafId,status,receiptDigest,{evidenceRefs=['evidence:test'],authorityEpoch=AUTH,expiresAt=EXP,strategyFingerprint=STRAT,blockerFingerprint=BLOCK}={}){
 const sorted=[...new Set(evidenceRefs)].sort();
 const envelope={
  version:'uberbond.execution-leaf-result-attestation.v1',
  sourceCommit:g.sourceCommit,
  graphDigest:g.graphDigest,
  leafId,status,receiptDigest,
  evidenceRefs:sorted,
  authorityEpoch,expiresAt,strategyFingerprint,blockerFingerprint
 };
 return {
  type:'RESULT',leafId,status,receiptDigest,evidenceRefs:sorted,authorityEpoch,expiresAt,strategyFingerprint,blockerFingerprint,
  attestation:{
    version:'uberbond.execution-leaf-result-attestation.v1',
    publicKeyFingerprint:FINGERPRINT,
    signatureBase64:crypto.sign(null,Buffer.from(JSON.stringify(envelope)),privateKey).toString('base64')
  }
 };
}

test('plan requires an independently configured trusted verifier',()=>{
 const blocked=compileBlackoutFirstComputePlan({graph:graph()});
 assert.equal(blocked.ok,false);
 assert.ok(blocked.reasonCodes.includes('trusted-verifier-required-for-recoverable-results'));
 const r=compileBlackoutFirstComputePlan({graph:graph(),maxAttempts:3,trustedVerifierPublicKeyPem:PUB});
 assert.equal(r.ok,true);
 assert.equal(r.recoveryPolicy.proofCarryingResultsRequired,true);
 assert.equal(r.verifier.publicKeyFingerprint,FINGERPRINT);
 assert.equal(r.verifier.privateKeyStored,false);
 assert.equal(r.externalEffectAuthority,'NONE');
});

test('blackout before any result resumes exact initial proof-bound checkpoint',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g,trustedVerifierPublicKeyPem:PUB});
 const r=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 assert.equal(r.ok,true); assert.equal(r.status,'BLACKOUT_FIRST_RESUMED'); assert.equal(r.state.stateDigest,p.state.stateDigest);
});

test('signed completed work survives blackout and dependent frontier stays unlocked',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g,trustedVerifierPublicKeyPem:PUB});
 const a=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:signedEvent(g,'a','COMPLETED',R1),currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 assert.equal(a.ok,true);
 const b=applyBlackoutFirstEvent({graph:g,state:a.state,checkpoint:a.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 assert.deepEqual(b.state.completedLeafIds,['a']); assert.deepEqual(b.state.runnableLeafIds,['b']);
});

test('same signed terminal receipt replay after blackout is idempotent and creates no duplicate terminal effect',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g,trustedVerifierPublicKeyPem:PUB});
 const event=signedEvent(g,'a','COMPLETED',R1);
 const a=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event,currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 const b=applyBlackoutFirstEvent({graph:g,state:a.state,checkpoint:a.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 const c=applyBlackoutFirstEvent({graph:g,state:b.state,checkpoint:b.checkpoint,event,currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 assert.equal(c.status,'BLACKOUT_FIRST_RESULT_IDEMPOTENT'); assert.equal(c.duplicateTerminalEffect,false);
});

test('conflicting signed terminal replay after blackout is refused',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g,trustedVerifierPublicKeyPem:PUB});
 const a=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:signedEvent(g,'a','COMPLETED',R1),currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 const b=applyBlackoutFirstEvent({graph:g,state:a.state,checkpoint:a.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 const c=applyBlackoutFirstEvent({graph:g,state:b.state,checkpoint:b.checkpoint,event:signedEvent(g,'a','COMPLETED',R2),currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 assert.equal(c.ok,false); assert.ok(c.reasonCodes.includes('conflicting-terminal-replay'));
});

test('forged result attestation is rejected before checkpoint promotion',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g,trustedVerifierPublicKeyPem:PUB});
 const bad=signedEvent(g,'a','COMPLETED',R1);
 bad.attestation.signatureBase64=Buffer.from('forged').toString('base64');
 const r=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:bad,currentSourceCommit:HEAD,verifierPublicKeyPem:PUB,now:NOW});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('independent-result-attestation-invalid'));
});

test('source revision change refuses resume instead of guessing',()=>{
 const g=graph(),p=compileBlackoutFirstComputePlan({graph:g,trustedVerifierPublicKeyPem:PUB});
 const r=applyBlackoutFirstEvent({graph:g,state:p.state,checkpoint:p.checkpoint,event:{type:'BLACKOUT'},currentSourceCommit:'1'.repeat(40),verifierPublicKeyPem:PUB,now:NOW});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('source-revision-changed-reconciliation-required'));
});

test('signed fault injection replay matches no-blackout control state',()=>{
 const g=graph();
 const a=signedEvent(g,'a','COMPLETED',R1);
 const b=signedEvent(g,'b','COMPLETED',R2,{strategyFingerprint:digest('strategy-b'),blockerFingerprint:digest('blocker-b')});
 const r=evaluateBlackoutRecoveryReplay({
  graph:g,currentSourceCommit:HEAD,trustedVerifierPublicKeyPem:PUB,now:NOW,
  events:[
    {type:'BLACKOUT'},
    a,
    {type:'BLACKOUT'},
    a,
    b,
    {type:'BLACKOUT'}
  ]
 });
 assert.equal(r.ok,true); assert.equal(r.status,'BLACKOUT_RECOVERY_EQUIVALENT');
 assert.equal(r.faultRecoveryEquivalent,true); assert.equal(r.noLostCompletedWork,true);
 assert.equal(r.duplicateTerminalEffectsObserved,false); assert.equal(r.proofCarryingResultsRequired,true);
 assert.equal(r.hypothesisSupported,true);
});
