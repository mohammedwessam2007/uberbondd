import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {buildSourceGroundedObligations,resolveJsonPointer} from './achieved-opus-equivalence-island.mjs';

export const UBERMIND_SOURCE_WORK_SCHEMA='uberbond.ubermind-source-work.v1';
export const UBERMIND_SOURCE_WORK_PATHS=Object.freeze([
  'config/absolute-frontier-quality-lock.json',
  'config/infinite-opus-first-real-workload.json',
  'config/opus-equivalence-reference-2026-10-07.json',
  'open router/79_CURRENT_RUNTIME_FRONTIER_2026-10-07.json',
  'open router/OPEN_ROUTER_UBERMIND_CANON.json',
  'open router/MANIFEST.json',
  'artifacts/research/founder-moonshot-literal-corpus/manifest.json'
]);
const sha=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):
  v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>sha(JSON.stringify(canonical(v)));
const hold=(reason)=>({ok:false,status:'SOURCE_BOUND_WORK_HELD',reason,
  materializedOutputCount:0,verifiedSourceCount:0,receiptBatchDigest:null,
  independentFrontierQualitySamplesAdded:0,empiricalMultiplier:null,
  global33333xConfirmed:false,providerCallsPerformed:0,externalEffectAuthority:'NONE'});

/**
 * Materialize and independently re-hash exact JSON-pointer answers from a
 * bounded, *currently read* source collection. This is actual deterministic
 * source verification, never independent novel frontier reasoning or client
 * demand. No content or per-field values are written into public logs.
 */
export function executeBoundedSourceWork({
  sourceDocuments={},resolve=resolveJsonPointer,maximumObligations=8192
}={}){
  try{
    if(!sourceDocuments||typeof sourceDocuments!=='object'||
       Array.isArray(sourceDocuments)||typeof resolve!=='function'||
       !Number.isSafeInteger(maximumObligations)||maximumObligations<1||
       maximumObligations>8192)return hold('typed-bounded-source-work-required');
    const names=Object.keys(sourceDocuments).sort();
    if(!names.length||names.length>16||names.some(n=>
      !UBERMIND_SOURCE_WORK_PATHS.includes(n)||
      typeof sourceDocuments[n]!=='object'||sourceDocuments[n]===null||
      Array.isArray(sourceDocuments[n])))return hold('allowlisted-public-json-sources-only');
    const materializedBytes=Buffer.byteLength(JSON.stringify(sourceDocuments));
    if(materializedBytes>2_000_000)return hold('source-material-exceeds-memory-cap');
    const proof=buildSourceGroundedObligations(sourceDocuments);
    if(!proof.obligations.length||proof.obligations.length>maximumObligations)
      return hold('source-obligation-cap-refused');
    const seen=new Set(),completed=[];
    for(const o of proof.obligations){
      const key=o.sourcePath+'\n'+o.pointer;
      if(seen.has(key)||!o.id||!o.sourceDigest||
        o.sourceDigest!==proof.sourceDigests[o.sourcePath])
        return hold('duplicate-or-unbound-source-obligation');
      seen.add(key);
      // Resolve from original source again, not from the expected value.
      const observed=resolve(sourceDocuments[o.sourcePath],o.pointer);
      const answerDigest=digest(observed);
      if(answerDigest!==o.expectedValueDigest)return hold('actual-source-answer-mismatch');
      completed.push({obligationId:o.id,sourcePath:o.sourcePath,
        pointer:o.pointer,sourceDigest:o.sourceDigest,answerDigest});
    }
    const receiptBatchDigest=sha(JSON.stringify(completed));
    const sourceBatchDigest=sha(JSON.stringify(proof.sourceDigests));
    return {ok:true,schemaVersion:UBERMIND_SOURCE_WORK_SCHEMA,
      status:'SOURCE_BOUND_EXACT_WORK_EXECUTED_VERIFIED',
      materializedOutputCount:completed.length,verifiedSourceCount:names.length,
      sourceDigests:proof.sourceDigests,sourceBatchDigest,
      receiptBatchDigest,
      completedObligationIds:completed.map(x=>x.obligationId),
      proofClass:'E1_SOURCE_GROUNDED_EXACT_JSON_POINTER',
      independentFrontierQualitySamplesAdded:0,
      independentlyAuthenticatedCustomerDemandCount:0,
      distinctNovelReasoningProblemsProven:0,
      externalModelReferenceBillObserved:false,
      independentlyAuditedEconomicMultiplier:null,
      empiricalMultiplier:null,global33333xConfirmed:false,
      providerCallsPerformed:0,actualModelSpendUsd:0,
      externalEffectAuthority:'NONE',
      truthBoundary:'These are completed deterministic pointer-resolution work checks on committed public JSON sources. Re-running identical source snapshots is idempotent and cannot be counted as additional novel jobs, third-party demand, new independent frontier holdouts, or dollar compression.'
    };
  }catch{return hold('source-read-or-evidence-evaluation-failed');}
}

/** Fixed allowlisted repository files, no network and no private data. */
export function runUberMindLiveSourceWork({root=process.cwd()}={}){
  try{
    const docs={};
    for(const name of UBERMIND_SOURCE_WORK_PATHS){
      const full=path.join(root,name);
      const st=fs.statSync(full);
      if(!st.isFile()||st.size>400_000)return hold('source-size-or-type-refused');
      docs[name]=JSON.parse(fs.readFileSync(full,'utf8'));
    }
    return executeBoundedSourceWork({sourceDocuments:docs});
  }catch{return hold('allowlisted-current-repo-source-unavailable');}
}

/**
 * Compact, append-only version lineage for protected existing settings.
 * Never lets duplicate runs inflate cumulative useful work, and never
 * replaces the E3 native task ledger or any economic admission gate.
 */
export function compileSourceWorkCheckpoint({prior=null,work,observedAt}={}){
  if(!work?.ok||work.schemaVersion!==UBERMIND_SOURCE_WORK_SCHEMA||
     !Array.isArray(work.completedObligationIds)||
     work.completedObligationIds.length!==work.materializedOutputCount||
     !/^sha256:[a-f0-9]{64}$/.test(work.receiptBatchDigest??'')||
     !/^sha256:[a-f0-9]{64}$/.test(work.sourceBatchDigest??'')||
     typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt)))
    return hold('verified-current-source-work-required');
  if(prior!==null&&(
     prior.schemaVersion!==UBERMIND_SOURCE_WORK_SCHEMA||
     !Array.isArray(prior.versions)||prior.versions.length<1||
     prior.versions.length>32||
     prior.versions.some(v=>!/^sha256:[a-f0-9]{64}$/.test(v.receiptBatchDigest??'')||
       !/^sha256:[a-f0-9]{64}$/.test(v.sourceBatchDigest??'')||
       !Number.isSafeInteger(v.materializedOutputCount)||v.materializedOutputCount<1)))
    return hold('existing-protected-work-ledger-invalid');
  const existing=prior?.versions??[];
  if(existing.some(v=>v.sourceBatchDigest===work.sourceBatchDigest)){
    const row=existing.find(v=>v.sourceBatchDigest===work.sourceBatchDigest);
    if(row.receiptBatchDigest!==work.receiptBatchDigest||
       row.materializedOutputCount!==work.materializedOutputCount)
      return hold('source-identity-replayed-with-contradictory-work');
    return {ok:true,status:'EXISTING_SOURCE_VERSION_ALREADY_VERIFIED',
      changed:false,ledger:prior,novelSourceVersionsAdded:0,
      newVerifiedObligationsThisVersion:0};
  }
  if(existing.length>=32)return hold('source-version-archive-checkpoint-required');
  const receipt={sourceBatchDigest:work.sourceBatchDigest,
    receiptBatchDigest:work.receiptBatchDigest,
    materializedOutputCount:work.materializedOutputCount,
    verifiedSourceCount:work.verifiedSourceCount,observedAt};
  return {ok:true,status:'NEW_VERIFIED_SOURCE_VERSION',
    changed:true,novelSourceVersionsAdded:1,
    // This is source-audit work, NOT newly independent reasoning demand.
    newVerifiedObligationsThisVersion:work.materializedOutputCount,
    ledger:{schemaVersion:UBERMIND_SOURCE_WORK_SCHEMA,
      versions:[...existing,receipt],latestSourceBatchDigest:work.sourceBatchDigest,
      counterMeaning:'SOURCE_AUDIT_OPERATIONS_NOT_MATCHED_FRONTIER_QUALITY'}}
}
