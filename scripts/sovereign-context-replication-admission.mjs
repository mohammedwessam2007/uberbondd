#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { verifyContextReplicationDirectory } from './sovereign-context-replication-bundle.mjs';
import { probeContextSourceAncestry } from './sovereign-context-source-ancestry.mjs';
import { verifyContextSourceAncestryReceipt } from '../src/context-source-ancestry.mjs';

export const SOVEREIGN_CONTEXT_REPLICATION_ADMISSION_VERSION='sovereign-context-replication-admission-1.0.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_REPLICATION_ADMISSION_REFUSED',extra={}){return{ok:false,admissionVersion:SOVEREIGN_CONTEXT_REPLICATION_ADMISSION_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function readBundle(root){try{const file=path.join(path.resolve(root),'bundle.json');const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>2_000_000)return null;const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}

export function admitContextReplicationDirectory({candidateBundlePath,currentBundlePath=null,trustedRepoRoot=null}={}){
  const current=currentBundlePath?verifyContextReplicationDirectory(currentBundlePath):null;
  if(currentBundlePath&&!current?.ok)return fail(['verified-current-context-bundle-required',...(current?.reasonCodes||[])]);
  const currentBundle=currentBundlePath?readBundle(currentBundlePath):null;
  if(currentBundlePath&&!currentBundle)return fail(['current-bundle-document-required']);
  const candidate=verifyContextReplicationDirectory(candidateBundlePath,{currentBundle});
  if(!candidate.ok)return fail(['candidate-context-bundle-invalid',...(candidate.reasonCodes||[])],candidate.status||'CONTEXT_REPLICATION_ADMISSION_REFUSED');
  let ancestry=null;
  if(currentBundle&&currentBundle.sourceCommit!==candidate.sourceCommit){
    if(!trustedRepoRoot)return fail(['trusted-local-repository-required-for-cross-source-admission'],'CONTEXT_REPLICATION_SOURCE_PROOF_REQUIRED');
    const probed=probeContextSourceAncestry({repoRoot:trustedRepoRoot,currentSourceCommit:currentBundle.sourceCommit,candidateSourceCommit:candidate.sourceCommit});
    if(!probed.ok)return fail(['source-ancestry-probe-failed',...(probed.reasonCodes||[])],'CONTEXT_REPLICATION_SOURCE_PROOF_REFUSED');
    const checked=verifyContextSourceAncestryReceipt(probed.receipt,{currentSourceCommit:currentBundle.sourceCommit,candidateSourceCommit:candidate.sourceCommit,allowSame:false,allowFastForward:true});
    if(!checked.ok)return fail(['safe-source-ancestry-required',...(checked.reasonCodes||[])],checked.status||'CONTEXT_REPLICATION_SOURCE_PROOF_REFUSED');
    ancestry={receiptId:checked.receiptId,relation:checked.relation,mergeBase:checked.mergeBase};
  }
  return{ok:true,admissionVersion:SOVEREIGN_CONTEXT_REPLICATION_ADMISSION_VERSION,status:'CONTEXT_REPLICATION_ADMITTED',bundleId:candidate.bundleId,sourceCommit:candidate.sourceCommit,brainstateId:candidate.brainstateId,journalTipDigest:candidate.journalTipDigest,totalJournalEntries:candidate.totalJournalEntries,sourceAncestry:ancestry,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'Admission proves local bundle integrity and, for a changed source SHA, fast-forward ancestry in the trusted local Git object graph. It does not prove transport authenticity, remote-host identity, or off-host availability.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=admitContextReplicationDirectory({candidateBundlePath:process.argv[2],currentBundlePath:process.argv[3]||null,trustedRepoRoot:process.env.UBERBOND_SOURCE_ROOT||null});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
