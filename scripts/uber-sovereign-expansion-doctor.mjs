#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileUberGenesisMission, UBER_GENESIS_ORCHESTRATOR_VERSION } from '../src/uber-genesis-orchestrator.mjs';
import { compileUberDistributionCycle, UBER_DISTRIBUTION_ORCHESTRATOR_VERSION } from '../src/uber-distribution-orchestrator.mjs';
import { compileKilimanjaroEvidence, KILIMANJARO_EVIDENCE_VERSION } from '../src/kilimanjaro-evidence.mjs';

export const UBER_SOVEREIGN_EXPANSION_DOCTOR_VERSION='uberbond.uber-sovereign-expansion-doctor.v1';

export function runUberSovereignExpansionDoctor(){
  const genesis=compileUberGenesisMission({});
  const distribution=compileUberDistributionCycle({motions:[{id:'doctor-owned-content',type:'OWNED_CONTENT',capabilityRef:'doctor:content',configured:true,blocked:false,evidence:{verifiedOutcomeCount:0,clearedPaymentCount:0,quality:'NO_VERIFIED_OUTCOMES'},safety:{suppressionClear:true,complaintClear:true,senderHealthClear:true}}],now:'2026-09-11T12:00:00Z',explorationSlots:1});
  const kilimanjaro=compileKilimanjaroEvidence({tests:1,pass:1,fail:0,skipped:0,sourceRef:'doctor:synthetic-suite'});
  return {
    ok:distribution.ok===true&&kilimanjaro.ok===true&&genesis?.businessEffectAuthority==='NONE',
    status:'UBER_SOVEREIGN_EXPANSION_SOURCE_DOCTOR',
    versions:{genesis:UBER_GENESIS_ORCHESTRATOR_VERSION,distribution:UBER_DISTRIBUTION_ORCHESTRATOR_VERSION,kilimanjaro:KILIMANJARO_EVIDENCE_VERSION},
    genesisMechanisms:Object.keys(genesis).filter(key=>!['businessEffectAuthority','externalEffectAuthority'].includes(key)).length,
    distributionStatus:distribution.status,
    kilimanjaroStatus:kilimanjaro.status,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'SOURCE_DOCTOR_PROVES_OPERATOR_REACHABILITY_AND_FAIL_CLOSED_COMPOSITION_ONLY; IT_DOES_NOT_PROVE_LIVE_RUNTIME_OR_EXTERNAL_OUTCOMES'
  };
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){const result=runUberSovereignExpansionDoctor();process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;}
