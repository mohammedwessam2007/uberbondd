#!/usr/bin/env node
import { compileKnowledgeLabyrinth } from '../src/knowledge-labyrinth-ubergraph.mjs';
import { compileUberMindExchange } from '../src/ubermind-cognitive-exchange.mjs';
import { compileUberDnaSoftwareGenome } from '../src/uberdna-software-genome.mjs';
import { allocateSovereignCells } from '../src/sovereign-compute-cell-fabric.mjs';
import { allocateEconomicMetabolism } from '../src/economic-metabolism.mjs';
import { compileUberCloudPlan } from '../src/ubercloud-sovereign-fabric.mjs';
import { compileUbercelDeployment } from '../src/ubercel-deployment-control-plane.mjs';
import { UBER_SOVEREIGN_LAYERS } from '../src/uber-sovereign-stack.mjs';
import { canonicalMechanismIdentity } from '../src/capability-mechanism-identity.mjs';
import { proposeSource } from '../src/source-genesis.mjs';
import { buildEliteReserve } from '../src/elite-capability-reserve.mjs';
import { compileMissionBrain } from '../src/mission-brain-compiler.mjs';
import { scoreResourceEfficiency } from '../src/resource-efficiency.mjs';
import { runRevenueDecisionDesk } from '../src/revenue-decision-desk.mjs';
import { buildCreatorRevenueCell } from '../src/ai-creator-revenue-cell.mjs';

const now='2026-09-11T10:00:00Z';
const sha='a'.repeat(40),d='sha256:'+'b'.repeat(64);
const doctorCell=(id,provider)=>({cellId:id,resourceType:'EXECUTION',provider,failureDomain:`doctor-fd-${provider}`,failureDomainEvidenceRef:`receipt:doctor:failure-domain:${provider}`,sourceRef:`receipt:doctor:${id}`,verifiedAt:now,capabilityTags:['node20'],allowedDataClasses:['SOURCE_CODE'],availableUnits:1,costCents:0,reliability:provider==='owned-a'?1:.95,latencyScore:1,privacyScore:1,trustScore:1,reversibilityScore:1,ownershipClass:provider==='owned-a'?'OWNER_OWNED':'OPEN_SELF_HOSTED',networkMode:'UBERMESH',credentialCustody:'OWNER'});
const requiredUber=['UBERMESH','UBERCLOUD','UBERCEL','UBERGRAPH','UBERMIND','UBERDNA','UBERMEMORY','UBERVAULT','UBERRUNTIME','UBERCONTROL','UBERAGENTS','UBERMODELS','UBERRESEARCH','UBERECONOMY','UBERPAY','UBERMAIL','UBERDELIVERY'];
const uberIds=UBER_SOVEREIGN_LAYERS.map(layer=>layer.id);
const stackRegistry={ok:new Set(uberIds).size===uberIds.length&&requiredUber.every(id=>uberIds.includes(id)),status:'UBER_SOVEREIGN_STACK_REGISTRY_INTACT',layerCount:uberIds.length,missing:requiredUber.filter(id=>!uberIds.includes(id)),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
const cells=[doctorCell('doctor-owned','owned-a'),doctorCell('doctor-open','open-b')];
const meshReceipt={providerIndependent:true,transport:'WIREGUARD',evidenceRef:'receipt:doctor:synthetic-ubermesh'};
const requirement={requirementId:'runtime',resourceType:'EXECUTION',dataClass:'SOURCE_CODE',requiredTags:['node20'],units:1};
const probe=(status,fn)=>{try{return{ok:true,status,data:fn()};}catch(error){return{ok:false,status:`${status}_BLOCKED`,reasonCodes:[String(error?.message||error)]};}};
const eliteCandidate={mechanismId:'mechanism:doctor',provenanceDigest:'sha256:doctor',rightsState:'ALLOWED',securityState:'PASSED',benchmarkReceipt:'receipt:doctor:benchmark',incrementalUtility:1,inputContract:['mission'],outputContract:['result'],runtimeCostUsd:0,missionFit:1};
const probes={
  uberGraph:compileKnowledgeLabyrinth({nodes:[{id:'truth',domain:'EVIDENCE'}],startNodes:['truth'],transactionRefs:['receipt:doctor:truth']}),
  uberMind:compileUberMindExchange({mission:{missionId:'doctor',taskId:'cognition',objective:'select the minimum useful cognition topology'},stakes:{consequence:.2,uncertainty:.2,reversibility:1,founderImportance:.2}}),
  uberDna:compileUberDnaSoftwareGenome({root:process.cwd(),sourceRevision:process.env.GITHUB_SHA||'DOCTOR_HEAD'}),
  computeCells:allocateSovereignCells({requirements:[requirement],cells:[doctorCell('doctor-local','owned-a')],maxTotalCostCents:0}),
  uberCloud:compileUberCloudPlan({serviceId:'doctor-continuum',requirements:[requirement],cells,meshReceipt,maxTotalCostCents:0}),
  ubercel:compileUbercelDeployment({serviceId:'doctor-continuum',target:'SOVEREIGN',release:{sourceCommit:sha,imageDigest:d,configDigest:d,artifactDigest:d,signatureRef:'receipt:doctor:synthetic-signature',signerIdentity:'doctor-offline-signer',signedAt:now,signatureVerified:true},adapters:[{adapterId:'owned',adapterType:'OWNED_LINUX',provider:'owned-a',sourceRef:'receipt:adapter:owned',verifiedAt:now,capabilityTags:['deploy']},{adapterId:'open',adapterType:'GENERIC_DOCKER',provider:'open-b',sourceRef:'receipt:adapter:open',verifiedAt:now,capabilityTags:['deploy']}],cloudRequirements:[requirement],resourceCells:cells,meshReceipt,maxTotalCostCents:0,healthContract:{authenticatedHealthRef:'probe:doctor:health',expectedStatus:200},rollbackContract:{rollbackProcedureRef:'receipt:doctor:rollback-procedure',independentRollbackEvidenceRequired:true}}),
  mechanismIdentity:probe('MECHANISM_IDENTITY_READY',()=>canonicalMechanismIdentity({intent:'select useful capability',inputContract:['mission'],outputContract:['result'],mechanism:['evidence-ranked-selection']})),
  sourceGenesis:probe('SOURCE_GENESIS_READY',()=>proposeSource({sourceId:'doctor-source',uniqueUsefulDiscoveries:1,northStarGain:1,freshnessValue:1})),
  eliteReserve:probe('ELITE_RESERVE_READY',()=>buildEliteReserve([eliteCandidate])),
  missionBrain:probe('MISSION_BRAIN_READY',()=>compileMissionBrain({mission:'doctor',candidates:[eliteCandidate],maxCapabilities:1,maxRuntimeCostUsd:0})),
  resourceEfficiency:probe('RESOURCE_EFFICIENCY_READY',()=>scoreResourceEfficiency({measuredGain:1,joules:1,bytes:1,costUsd:0,seconds:1,founderMinutes:0})),
  revenueDecision:probe('REVENUE_DECISION_DESK_READY',()=>runRevenueDecisionDesk([{id:'doctor-opportunity',fingerprint:'doctor',evidenceRefs:['receipt:doctor:opportunity'],authority:true,stopConditions:['stop-on-negative-evidence'],expectedClearedContribution:1,founderMinutes:1,probability:.5,downside:0,reversibility:1,evidenceQuality:1}],{maxActions:1})),
  creatorRevenue:buildCreatorRevenueCell({creator:{identity:'doctor-synthetic-creator',syntheticDisclosure:true,monetizationRoutes:['service-lead']},experiments:[{id:'doctor-creator-probe',hookStrength:.5,retentionPotential:.5,repeatability:.5,monetizationFit:.5,differentiation:.5,founderMinutes:1,cashCost:0}],maxLive:1}),
  metabolism:allocateEconomicMetabolism({candidates:[{id:'doctor-cognition',kind:'COGNITION',objective:'verify supporting-organ composition',expectedValue:.7,founderImpact:.7,evidenceConfidence:.9,reversibility:1,costCents:0,founderMinutes:1,resourceUnits:1}],budget:{maxCostCents:0,maxFounderMinutes:5,maxResourceUnits:5,minimumEvidenceConfidence:.5,explorationSlots:0}}),
  stackRegistry
};
const failed=Object.entries(probes).filter(([,v])=>v?.ok!==true).map(([k,v])=>({organ:k,status:v?.status||'UNKNOWN',reasonCodes:v?.reasonCodes||[]}));
const output={ok:failed.length===0,status:failed.length?'SUPPORTING_CIVILIZATION_ORGANS_BLOCKED':'SUPPORTING_CIVILIZATION_ORGANS_READY',simulationOnly:true,organs:Object.fromEntries(Object.entries(probes).map(([k,v])=>[k,{ok:v?.ok===true,status:v?.status||'UNKNOWN'}])),failed,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'DOCTOR PROVES ONLY ZERO-EFFECT SOURCE COMPOSITION AND SYNTHETIC POLICY PATHS ON THIS CHECKOUT. SYNTHETIC UBERCLOUD/UBERCEL CELLS, SIGNATURES, FAILURE-DOMAIN ATTESTATIONS, MESH RECEIPTS, CAPABILITY CANDIDATES AND REVENUE/CREATOR CANDIDATES ARE NOT PHYSICAL RUNTIME, CUSTOMER, PROVIDER OR PAYMENT EVIDENCE. THIS DOES NOT PROVE EXTERNAL OUTCOMES OR ASI.'};
console.log(JSON.stringify(output,null,2));
if(!output.ok)process.exitCode=2;
