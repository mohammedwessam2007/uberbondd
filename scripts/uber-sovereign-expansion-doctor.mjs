#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileUberGenesisMission, UBER_GENESIS_ORCHESTRATOR_VERSION } from '../src/uber-genesis-orchestrator.mjs';
import { compileKilimanjaroEvidence, KILIMANJARO_EVIDENCE_VERSION } from '../src/kilimanjaro-evidence.mjs';

export const UBER_SOVEREIGN_EXPANSION_DOCTOR_VERSION='uberbond.uber-sovereign-expansion-doctor.v1.1';

export function runUberSovereignExpansionDoctor(){
  const genesis=compileUberGenesisMission({});
  const kilimanjaro=compileKilimanjaroEvidence({tests:1,pass:1,fail:0,skipped:0,sourceRef:'doctor:synthetic-suite'});
  return {
    ok:kilimanjaro.ok===true&&genesis?.businessEffectAuthority==='NONE',
    status:'UBER_SOVEREIGN_EXPANSION_SOURCE_DOCTOR',
    versions:{genesis:UBER_GENESIS_ORCHESTRATOR_VERSION,kilimanjaro:KILIMANJARO_EVIDENCE_VERSION},
    genesisMechanisms:Object.keys(genesis).filter(key=>!['businessEffectAuthority','externalEffectAuthority'].includes(key)).length,
    kilimanjaroStatus:kilimanjaro.status,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'SOURCE_DOCTOR_PROVES OPERATOR-REACHABLE SOURCE COMPOSITION ONLY; THIS DOES NOT PROVE LIVE RUNTIME OR EXTERNAL OUTCOMES'
  };
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){const result=runUberSovereignExpansionDoctor();process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;}
