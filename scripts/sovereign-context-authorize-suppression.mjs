#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { compileFounderContextAuthorization } from '../src/context-privacy.mjs';

export const SOVEREIGN_CONTEXT_AUTH_VERSION='sovereign-context-authorize-suppression-1.0.0';
const CONFIRMATION='I_CONFIRM_RETRIEVAL_SUPPRESSION';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_SUPPRESSION_AUTHORIZATION_REFUSED'){return{ok:false,authorizationVersion:SOVEREIGN_CONTEXT_AUTH_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};}
function atomicJson(file,value){const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});const handle=fs.openSync(tmp,'r');try{fs.fsyncSync(handle);}finally{fs.closeSync(handle);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}

export function authorizeContextSuppression({authorizationRoot,targetEventId,confirmation,issuedAt=new Date()}={}){
  if(String(confirmation||'')!==CONFIRMATION)return fail(['exact-founder-suppression-confirmation-required']);
  if(!authorizationRoot)return fail(['founder-authorization-root-required']);
  const compiled=compileFounderContextAuthorization({targetEventId,founderConfirmed:true,issuedAt});if(!compiled.ok)return fail(compiled.reasonCodes||['founder-authorization-compilation-failed']);
  const root=path.resolve(authorizationRoot);const output=path.join(root,`${compiled.receipt.authorizationId}.json`);atomicJson(output,compiled.receipt);
  return{ok:true,authorizationVersion:SOVEREIGN_CONTEXT_AUTH_VERSION,status:'CONTEXT_SUPPRESSION_AUTHORIZED',authorizationId:compiled.receipt.authorizationId,targetEventId:compiled.receipt.targetEventId,authorizationPath:output,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'This records one explicit founder confirmation for retrieval suppression. It does not itself suppress, delete, rewrite, or create external effects.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=authorizeContextSuppression({authorizationRoot:process.env.UBERBOND_FOUNDER_AUTHORIZATION_ROOT||null,targetEventId:process.argv[2],confirmation:process.argv[3]});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
