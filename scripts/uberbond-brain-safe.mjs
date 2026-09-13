#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUberBondBrainFromRepository, formatUberBondBrainPacket } from './uberbond-brain-bootstrap.mjs';
import { resolveExactSourceIdentity } from '../src/source-root-identity.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const identity=resolveExactSourceIdentity({rootDir:root,explicitCommit:process.env.UBERBOND_SOURCE_SHA||null});
if(!identity.ok){
  process.stderr.write(`${JSON.stringify({ok:false,status:'UBERBOND_BRAIN_BOOTSTRAP_FAILED',reason:'source-root-identity-refused',reasonCodes:identity.reasonCodes||[],expectedSourceRoot:identity.expectedSourceRoot||root,observedGitTopLevel:identity.observedGitTopLevel||null,businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}},null,2)}\n`);
  process.exitCode=1;
}else{
  try{
    const packet=loadUberBondBrainFromRepository({rootDir:root,sourceCommit:identity.sourceCommit});
    packet.sourceIdentity={status:identity.status,method:identity.identityMethod,sourceRoot:identity.sourceRoot};
    if(process.argv.includes('--json'))process.stdout.write(`${JSON.stringify(packet,null,2)}\n`);
    else process.stdout.write(`${formatUberBondBrainPacket(packet)}\n`);
  }catch(error){
    process.stderr.write(`${JSON.stringify({ok:false,status:'UBERBOND_BRAIN_BOOTSTRAP_FAILED',reason:error?.message||'unknown-error',reasonCodes:error?.reasonCodes||[],missingPaths:error?.missingPaths||[],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}},null,2)}\n`);
    process.exitCode=1;
  }
}
