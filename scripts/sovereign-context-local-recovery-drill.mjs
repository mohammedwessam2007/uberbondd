#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { verifyBrainstateIntegrity } from '../src/sovereign-context-fabric.mjs';
import { readCognitiveJournal } from '../src/cognitive-event-journal.mjs';
import { verifyContextReplicationDirectory } from './sovereign-context-replication-bundle.mjs';
import { verifyCognitiveJournalSegmentSnapshot } from './sovereign-context-segment-journal.mjs';

export const SOVEREIGN_CONTEXT_LOCAL_RECOVERY_VERSION='sovereign-context-local-recovery-1.0.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_LOCAL_RECOVERY_REFUSED',extra={}){return{ok:false,recoveryVersion:SOVEREIGN_CONTEXT_LOCAL_RECOVERY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function readJson(file){try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>128*1024*1024)return null;return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}}
function atomic(file,content){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,content,{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}

export function runLocalContextRecoveryDrill({bundlePath,recoveryRoot=null,keepRecovered=false}={}){
  const verifiedBundle=verifyContextReplicationDirectory(bundlePath);if(!verifiedBundle.ok)return fail(['verified-replication-directory-required',...(verifiedBundle.reasonCodes||[])]);
  const source=path.resolve(bundlePath);const bundle=readJson(path.join(source,'bundle.json'));const brainstate=readJson(path.join(source,'brainstate.json'));
  if(!bundle||!brainstate)return fail(['bundle-and-brainstate-required']);
  const brain=verifyBrainstateIntegrity(brainstate);if(!brain.ok)return fail(['recovered-brainstate-invalid',...(brain.reasonCodes||[])]);
  const journalPath=path.join(source,'journal',bundle.journalManifestId);const journal=verifyCognitiveJournalSegmentSnapshot(journalPath);if(!journal.ok)return fail(['recovery-journal-snapshot-invalid',...(journal.reasonCodes||[])]);
  const parent=recoveryRoot?path.resolve(recoveryRoot):fs.mkdtempSync(path.join(os.tmpdir(),'uberbond-context-recovery-root-'));
  if(recoveryRoot)fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const target=fs.mkdtempSync(path.join(parent,'recovered-'));
  try{
    atomic(path.join(target,'brainstate.json'),`${JSON.stringify(brainstate,null,2)}\n`);
    atomic(path.join(target,'events.jsonl'),journal.entries.map(entry=>JSON.stringify(entry)).join('\n')+(journal.entries.length?'\n':''));
    const recoveredBrain=readJson(path.join(target,'brainstate.json'));const recoveredJournal=readCognitiveJournal(path.join(target,'events.jsonl'));
    const recoveredBrainCheck=verifyBrainstateIntegrity(recoveredBrain);
    if(!recoveredBrainCheck.ok||!recoveredJournal.ok)return fail(['reconstructed-context-failed-verification'],'CONTEXT_LOCAL_RECOVERY_FAILED');
    if(recoveredBrain.brainstateId!==bundle.brainstateId||recoveredBrain.sourceCommit!==bundle.sourceCommit||recoveredJournal.tipDigest!==bundle.journalTipDigest||recoveredJournal.entryCount!==bundle.totalJournalEntries)return fail(['reconstructed-context-identity-mismatch'],'CONTEXT_LOCAL_RECOVERY_FAILED');
    return{ok:true,recoveryVersion:SOVEREIGN_CONTEXT_LOCAL_RECOVERY_VERSION,status:'CONTEXT_LOCAL_RECOVERY_VERIFIED',bundleId:bundle.bundleId,sourceCommit:bundle.sourceCommit,brainstateId:bundle.brainstateId,journalTipDigest:bundle.journalTipDigest,totalJournalEntries:bundle.totalJournalEntries,recoveredPath:keepRecovered?target:null,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'This proves local reconstruction from one verified portable bundle into an empty directory. It does not prove off-host availability, transport authenticity, disaster survival, or second-host failover.'};
  }finally{if(!keepRecovered)fs.rmSync(target,{recursive:true,force:true});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=runLocalContextRecoveryDrill({bundlePath:process.argv[2],recoveryRoot:process.env.UBERBOND_CONTEXT_RECOVERY_ROOT||null,keepRecovered:false});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
