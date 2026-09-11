import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileBrainstateCapsule, compileContextCognitiveEvent } from '../src/sovereign-context-fabric.mjs';
import { appendCognitiveJournalEvent } from '../src/cognitive-event-journal.mjs';
import { exportCognitiveJournalSegments } from '../scripts/sovereign-context-segment-journal.mjs';
import { exportContextReplicationDirectory } from '../scripts/sovereign-context-replication-bundle.mjs';
import { runLocalContextRecoveryDrill } from '../scripts/sovereign-context-local-recovery-drill.mjs';

const sha='a'.repeat(40), h=c=>c.repeat(64);
function brain(){const packet={project:'UberBond',sourceCommit:sha,contextDigest:h('b'),memoryDigest:h('c'),memoryReconciliationDigest:h('d'),externalCapabilityDigest:h('e'),capabilityGenome:{capabilityGraphDigest:h('f')},objective:'Preserve one sovereign brain.',economicNorthStar:'risk-adjusted cleared contribution profit / founder minute',endState:'Recoverable verified context.',namedInitiatives:[{id:'context-spine',name:'Context Spine',status:'CURRENT_PROGRAM'}],unresolvedNames:[],externalProofGates:['off-host survival remains external'],startupProtocol:['verify recovery'],truthLaw:'Internal prose cannot manufacture external truth.',memoryLaw:'History stays evidence-bound.',currentHandoff:{handoffBasisSha:sha,activeBranch:null,activePullRequest:null,activeMission:'Recover exact context.',completed:[],blockers:[],nextActions:['drill restore'],freshAgainstSourceCommit:true}};const out=compileBrainstateCapsule({packet,generatedAt:'2026-09-11T21:00:00Z'});assert.equal(out.ok,true);return out.capsule;}
function evt(i){const out=compileContextCognitiveEvent({kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'RECOVERY_TEST',subjectId:`recovery-${i}`,summary:`Recovery row ${i}`,evidenceRefs:[`test://recovery-${i}`],truthClass:'VERIFIED_CURRENT',observedAt:`2026-09-11T21:0${i}:00Z`});assert.equal(out.ok,true);return out;}
function bundle(tmp){const journal=path.join(tmp,'events.jsonl');for(let i=0;i<4;i++)appendCognitiveJournalEvent({journalPath:journal,compiledEvent:evt(i)});const snapshot=exportCognitiveJournalSegments({journalPath:journal,outputRoot:path.join(tmp,'segments'),segmentSize:2});assert.equal(snapshot.ok,true);const brainPath=path.join(tmp,'brainstate.json');fs.writeFileSync(brainPath,JSON.stringify(brain()));const out=exportContextReplicationDirectory({brainstatePath:brainPath,journalSnapshotPath:snapshot.snapshotPath,outputRoot:path.join(tmp,'bundles')});assert.equal(out.ok,true);return out;}

test('local recovery reconstructs exact Brainstate and journal identities into an empty directory',()=>{const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ub-recovery-'));try{const b=bundle(tmp);const out=runLocalContextRecoveryDrill({bundlePath:b.bundlePath,recoveryRoot:path.join(tmp,'restore')});assert.equal(out.ok,true);assert.equal(out.bundleId,b.bundleId);assert.equal(out.sourceCommit,sha);assert.equal(out.totalJournalEntries,4);assert.equal(out.recoveredPath,null);}finally{fs.rmSync(tmp,{recursive:true,force:true});}});

test('recovery refuses a bundle that no longer verifies',()=>{const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ub-recovery-bad-'));try{const b=bundle(tmp);const brainPath=path.join(b.bundlePath,'brainstate.json');const poisoned=JSON.parse(fs.readFileSync(brainPath,'utf8'));poisoned.objective='poisoned';fs.writeFileSync(brainPath,JSON.stringify(poisoned));const out=runLocalContextRecoveryDrill({bundlePath:b.bundlePath});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('verified-replication-directory-required'));}finally{fs.rmSync(tmp,{recursive:true,force:true});}});
