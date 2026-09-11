#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileUberGenesisMission, UBER_GENESIS_ORCHESTRATOR_VERSION } from '../src/uber-genesis-orchestrator.mjs';
import { compileKilimanjaroEvidence, KILIMANJARO_EVIDENCE_VERSION } from '../src/kilimanjaro-evidence.mjs';
import { evaluateExternalRealityActionBoundary, EXTERNAL_REALITY_ACTION_LAW_VERSION } from '../src/external-reality-action-law.mjs';
import { compileHealthRecommendationBoundary, HEALTH_RECOMMENDATION_BOUNDARY_VERSION } from '../src/health-recommendation-boundary.mjs';
import { compileRepositoryMemoryIngestion, REPOSITORY_MEMORY_INGESTION_LAW_VERSION } from '../src/repository-memory-ingestion-law.mjs';

export const UBER_SOVEREIGN_EXPANSION_DOCTOR_VERSION='uberbond.uber-sovereign-expansion-doctor.v1.2';

export function runUberSovereignExpansionDoctor(){
  const genesis=compileUberGenesisMission({});
  const kilimanjaro=compileKilimanjaroEvidence({tests:1,pass:1,fail:0,skipped:0,sourceRef:'doctor:synthetic-suite'});
  const reality=evaluateExternalRealityActionBoundary({actionClass:'LOCAL_PLAN',lawful:true,consentSatisfied:true,rightsRespected:true,permissionsSatisfied:true,platformBoundariesSatisfied:true,physicallyFeasible:true,evidenceRefs:['doctor:synthetic-boundary']});
  const health=compileHealthRecommendationBoundary({recommendationClass:'GENERAL_INFORMATION',evidenceRefs:['doctor:synthetic-evidence'],uncertaintyStated:true,cautionStated:true});
  const memory=compileRepositoryMemoryIngestion({observedAt:'2026-09-11T00:00:00Z',provenanceRefs:['doctor:synthetic-provenance'],authorityClass:'CHAT_SPEC_GOAL',contentDigest:'sha256:'+'a'.repeat(64),bodyRef:'doctor:synthetic-body',decisions:[],contradictions:[],supersessionLinks:[]});
  const boundaries=[reality,health,memory];
  return {
    ok:kilimanjaro.ok===true&&genesis?.businessEffectAuthority==='NONE'&&boundaries.every(item=>item.ok===true&&item.businessEffectAuthority==='NONE'),
    status:'UBER_SOVEREIGN_EXPANSION_SOURCE_DOCTOR',
    versions:{genesis:UBER_GENESIS_ORCHESTRATOR_VERSION,kilimanjaro:KILIMANJARO_EVIDENCE_VERSION,reality:EXTERNAL_REALITY_ACTION_LAW_VERSION,health:HEALTH_RECOMMENDATION_BOUNDARY_VERSION,memory:REPOSITORY_MEMORY_INGESTION_LAW_VERSION},
    genesisMechanisms:Object.keys(genesis).filter(key=>!['businessEffectAuthority','externalEffectAuthority'].includes(key)).length,
    kilimanjaroStatus:kilimanjaro.status,
    constitutionalBoundaryStatuses:boundaries.map(item=>item.status),
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'SOURCE_DOCTOR PROVES OPERATOR-REACHABLE ZERO-EFFECT SOURCE COMPOSITION AND FAIL-CLOSED CONSTITUTIONAL BOUNDARIES ONLY; IT DOES NOT PROVE LIVE RUNTIME OR EXTERNAL OUTCOMES'
  };
}

const direct=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){const result=runUberSovereignExpansionDoctor();process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;}
