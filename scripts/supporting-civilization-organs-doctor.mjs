#!/usr/bin/env node
import { compileKnowledgeLabyrinth } from '../src/knowledge-labyrinth-ubergraph.mjs';
import { compileUberMindExchange } from '../src/ubermind-cognitive-exchange.mjs';
import { compileUberDnaSoftwareGenome } from '../src/uberdna-software-genome.mjs';
import { allocateSovereignCells } from '../src/sovereign-compute-cell-fabric.mjs';
import { allocateEconomicMetabolism } from '../src/economic-metabolism.mjs';

const now='2026-09-11T10:00:00Z';
const probes={
  uberGraph:compileKnowledgeLabyrinth({nodes:[{id:'truth',domain:'EVIDENCE'}],startNodes:['truth'],transactionRefs:['receipt:doctor:truth']}),
  uberMind:compileUberMindExchange({mission:{missionId:'doctor',taskId:'cognition',objective:'select the minimum useful cognition topology'},stakes:{consequence:.2,uncertainty:.2,reversibility:1,founderImportance:.2}}),
  uberDna:compileUberDnaSoftwareGenome({root:process.cwd(),sourceRevision:process.env.GITHUB_SHA||'DOCTOR_HEAD'}),
  computeCells:allocateSovereignCells({requirements:[{resourceType:'EXECUTION',dataClass:'SOURCE_CODE',requiredTags:['node20'],units:1}],cells:[{cellId:'doctor-local',resourceType:'EXECUTION',provider:'local',sourceRef:'receipt:doctor:local',verifiedAt:now,capabilityTags:['node20'],allowedDataClasses:['SOURCE_CODE'],availableUnits:1,costCents:0,reliability:1,latencyScore:1,privacyScore:1,trustScore:1,reversibilityScore:1}],maxTotalCostCents:0}),
  metabolism:allocateEconomicMetabolism({candidates:[{id:'doctor-cognition',kind:'COGNITION',objective:'verify supporting-organ composition',expectedValue:.7,founderImpact:.7,evidenceConfidence:.9,reversibility:1,costCents:0,founderMinutes:1,resourceUnits:1}],budget:{maxCostCents:0,maxFounderMinutes:5,maxResourceUnits:5,minimumEvidenceConfidence:.5,explorationSlots:0}})
};
const failed=Object.entries(probes).filter(([,v])=>v?.ok!==true).map(([k,v])=>({organ:k,status:v?.status||'UNKNOWN',reasonCodes:v?.reasonCodes||[]}));
const output={ok:failed.length===0,status:failed.length?'SUPPORTING_CIVILIZATION_ORGANS_BLOCKED':'SUPPORTING_CIVILIZATION_ORGANS_READY',organs:Object.fromEntries(Object.entries(probes).map(([k,v])=>[k,{ok:v?.ok===true,status:v?.status||'UNKNOWN'}])),failed,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'DOCTOR_PROVES_ONLY ZERO-EFFECT SOURCE COMPOSITION ON THIS CHECKOUT. IT DOES NOT PROVE PROVIDER CALLABILITY, PHYSICAL RUNTIME, CUSTOMER VALUE, LIFE OUTCOMES OR ASI.'};
console.log(JSON.stringify(output,null,2));
if(!output.ok)process.exitCode=2;
