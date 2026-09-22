#!/usr/bin/env node
import crypto from 'node:crypto';
import { recomputeExecutionLeafGraphDigest } from '../src/execution-leaf-graph-receipt-digest.mjs';
import { evaluateBlackoutRecoveryReplay } from '../src/blackout-first-compute-planner.mjs';

const HEAD='a'.repeat(40),AUTH='b'.repeat(64),STRAT='c'.repeat(64),BLOCK='d'.repeat(64),R1='e'.repeat(64),R2='f'.repeat(64);
const NOW=Date.parse('2026-09-22T20:00:00Z'),EXP='2026-09-22T21:00:00.000Z';
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'});
const fingerprint=crypto.createHash('sha256').update(JSON.stringify(publicKey.export({type:'spki',format:'der'}))).digest('hex');
const g={ok:true,status:'ZERO_ORPHAN_EXECUTION_LEAF_GRAPH_COMPILED',sourceCommit:HEAD,requirements:[{id:'r1'}],leaves:[{leafId:'a',predecessors:[]},{leafId:'b',predecessors:['a']}],topologicalWaves:[['a'],['b']],criticalPath:['a','b']};
g.graphDigest=recomputeExecutionLeafGraphDigest(g);
function event(leafId,receiptDigest,strategyFingerprint=STRAT,blockerFingerprint=BLOCK){
  const evidenceRefs=['doctor:evidence'];
  const env={version:'uberbond.execution-leaf-result-attestation.v1',sourceCommit:g.sourceCommit,graphDigest:g.graphDigest,leafId,status:'COMPLETED',receiptDigest,evidenceRefs,authorityEpoch:AUTH,expiresAt:EXP,strategyFingerprint,blockerFingerprint};
  return {type:'RESULT',leafId,status:'COMPLETED',receiptDigest,evidenceRefs,authorityEpoch:AUTH,expiresAt:EXP,strategyFingerprint,blockerFingerprint,attestation:{version:'uberbond.execution-leaf-result-attestation.v1',publicKeyFingerprint:fingerprint,signatureBase64:crypto.sign(null,Buffer.from(JSON.stringify(env)),privateKey).toString('base64')}};
}
const out=evaluateBlackoutRecoveryReplay({
  graph:g,currentSourceCommit:HEAD,trustedVerifierPublicKeyPem:publicPem,now:NOW,
  events:[{type:'BLACKOUT'},event('a',R1),{type:'BLACKOUT'},event('a',R1),event('b',R2,'1'.repeat(64),'2'.repeat(64)),{type:'BLACKOUT'}]
});
const ok=out.ok&&out.status==='BLACKOUT_RECOVERY_EQUIVALENT'&&out.noLostCompletedWork&&out.duplicateTerminalEffectsObserved===false&&out.proofCarryingResultsRequired===true;
console.log(JSON.stringify({ok,status:out.status,blackoutCount:out.blackoutCount,idempotentReplayCount:out.idempotentReplayCount,proofCarryingResultsRequired:out.proofCarryingResultsRequired,truthBoundary:out.truthBoundary},null,2));
if(!ok) process.exitCode=1;
