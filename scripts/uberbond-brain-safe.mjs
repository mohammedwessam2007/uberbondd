#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUberBondBrainFromRepository, formatUberBondBrainPacket } from './uberbond-brain-bootstrap.mjs';
import { resolveExactSourceIdentity } from '../src/source-root-identity.mjs';
import { inspectCapabilityTotalState } from '../src/capability-total-state.mjs';
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
    const capabilityTotal=inspectCapabilityTotalState({sourceRevision:identity.sourceCommit});
    if(!capabilityTotal.ok)throw Object.assign(new Error('capability-total-state-degraded'),{reasonCodes:['native-capability-surface-must-be-ready']});
    packet.capabilityTotal={status:capabilityTotal.status,...capabilityTotal.state,stateDigest:capabilityTotal.stateDigest,truthBoundary:capabilityTotal.truthBoundary};
    if(process.argv.includes('--json'))process.stdout.write(`${JSON.stringify(packet,null,2)}\n`);
    else process.stdout.write(`${formatUberBondBrainPacket(packet)}\nnative capabilities: ${packet.capabilityTotal.nativeFirstParty.active}/${packet.capabilityTotal.nativeFirstParty.total} active; optional substitutes=${packet.capabilityTotal.optionalRuntimeSubstitutes.ready}/${packet.capabilityTotal.optionalRuntimeSubstitutes.total}; research/security=${packet.capabilityTotal.boundedResearchSecurity.ready}/${packet.capabilityTotal.boundedResearchSecurity.total}\ninternal capability gaps: ${packet.capabilityTotal.internalCapabilityGapCount}; external reality/runtime gaps: ${packet.capabilityTotal.externalRealityGapCount}\n`);
  }catch(error){
    process.stderr.write(`${JSON.stringify({ok:false,status:'UBERBOND_BRAIN_BOOTSTRAP_FAILED',reason:error?.message||'unknown-error',reasonCodes:error?.reasonCodes||[],missingPaths:error?.missingPaths||[],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS}},null,2)}\n`);
    process.exitCode=1;
  }
}
