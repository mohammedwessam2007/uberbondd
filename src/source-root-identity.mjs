import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOURCE_ROOT_IDENTITY_VERSION='uberbond.source-root-identity.v1';
const SHA40=/^[a-f0-9]{40}$/;
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

export function resolveExactSourceIdentity({rootDir,explicitCommit=null,exec=execFileSync}={}){
  const root=path.resolve(String(rootDir||''));
  const supplied=String(explicitCommit||'').trim().toLowerCase();
  if(supplied){
    if(!SHA40.test(supplied))return envelope({ok:false,status:'SOURCE_IDENTITY_REFUSED',reasonCodes:['explicit-source-commit-must-be-sha40']});
    return envelope({ok:true,status:'SOURCE_IDENTITY_EXPLICIT',sourceCommit:supplied,sourceRoot:root,identityMethod:'EXPLICIT_SHA40'});
  }
  try{
    const top=path.resolve(String(exec('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000})).trim());
    if(top!==root)return envelope({ok:false,status:'SOURCE_IDENTITY_REFUSED',reasonCodes:['git-top-level-must-equal-source-root'],observedGitTopLevel:top,expectedSourceRoot:root});
    const head=String(exec('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000})).trim().toLowerCase();
    if(!SHA40.test(head))return envelope({ok:false,status:'SOURCE_IDENTITY_REFUSED',reasonCodes:['git-head-must-be-sha40']});
    return envelope({ok:true,status:'SOURCE_IDENTITY_GIT_ROOT_VERIFIED',sourceCommit:head,sourceRoot:root,identityMethod:'EXACT_GIT_TOPLEVEL'});
  }catch(error){
    return envelope({ok:false,status:'SOURCE_IDENTITY_REFUSED',reasonCodes:['exact-source-identity-unavailable'],errorClass:String(error?.code||error?.name||'ERROR')});
  }
}
