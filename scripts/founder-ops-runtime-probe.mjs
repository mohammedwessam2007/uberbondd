#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compileFounderOpsRuntimeProbeReceipt } from '../src/founder-ops-runtime-probe.mjs';

const endpoint=String(process.env.UBERBOND_FOUNDER_OPS_URL||'').trim();
const token=String(process.env.ADMIN_TOKEN||'').trim();
const verifierRef=String(process.env.UBERBOND_PROBE_VERIFIER_REF||'').trim();
const evidenceRef=String(process.env.UBERBOND_PROBE_EVIDENCE_REF||'').trim();
let sourceCommit=String(process.env.UBERBOND_SOURCE_COMMIT||'').trim();
if(!sourceCommit){try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{/* handled below */}}
if(!endpoint||!token||!verifierRef||!evidenceRef){
 console.error(JSON.stringify({ok:false,status:'FOUNDER_OPS_RUNTIME_PROBE_NOT_RUN',reasonCodes:[!endpoint?'UBERBOND_FOUNDER_OPS_URL_REQUIRED':null,!token?'ADMIN_TOKEN_REQUIRED':null,!verifierRef?'UBERBOND_PROBE_VERIFIER_REF_REQUIRED':null,!evidenceRef?'UBERBOND_PROBE_EVIDENCE_REF_REQUIRED':null].filter(Boolean),businessEffectAuthority:'NONE'}));
 process.exit(2);
}
let httpStatus=0;let view=null;let providerCallObserved=false;
const observedAt=new Date();
try{
 providerCallObserved=true;
 const response=await fetch(endpoint,{method:'GET',headers:{authorization:`Bearer ${token}`,accept:'application/json'},redirect:'error'});
 httpStatus=response.status;
 try{view=await response.json();}catch{view=null;}
}catch{view=null;}
const receipt=compileFounderOpsRuntimeProbeReceipt({expectedSourceCommit:sourceCommit,targetUrl:endpoint,httpStatus,view,verifierRef,evidenceRef,providerCallObserved,observedAt,now:new Date()});
const output=process.env.UBERBOND_CONTROL_PLANE_RECEIPT_PATH||path.join('artifacts','runtime','founder-ops-runtime-latest.json');
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,`${JSON.stringify(receipt,null,2)}\n`,'utf8');
console.log(JSON.stringify({ok:receipt.ok,status:receipt.status,sourceCommit:receipt.sourceCommit||sourceCommit,targetIdentity:receipt.targetIdentity||null,runtimeIdentity:receipt.runtimeIdentity||null,receiptDigest:receipt.receiptDigest||null,providerCalls:receipt.externalEffectLedger?.providerCalls??null,output,businessEffectAuthority:'NONE'}));
process.exit(receipt.ok?0:1);
