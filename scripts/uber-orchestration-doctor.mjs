#!/usr/bin/env node
import { UBER_SOVEREIGN_LAYERS } from '../src/uber-sovereign-stack.mjs';
import { compileUberOrchestrationPlan, inspectUberOrchestrationIntegrity, UBER_ORCHESTRATION_SINGULARITY_VERSION } from '../src/uber-orchestration-singularity.mjs';
const evidence=Object.fromEntries(UBER_SOVEREIGN_LAYERS.map(layer=>[layer.id,{sourceVerified:true,testsPassed:true,evidenceRefs:[`doctor:${layer.id}`]}]));
const integrity=inspectUberOrchestrationIntegrity();
const plan=compileUberOrchestrationPlan({target:'SOURCE',layerEvidence:evidence,mission:{missionId:'doctor',maxParallel:8}});
const output={ok:integrity.ok===true&&plan.ok===true&&plan.counts?.layers===UBER_SOVEREIGN_LAYERS.length,status:'UBER_ORCHESTRATION_SOURCE_DOCTOR',version:UBER_ORCHESTRATION_SINGULARITY_VERSION,layerCount:UBER_SOVEREIGN_LAYERS.length,ready:plan.counts?.ready||0,authority:'NONE'};
console.log(JSON.stringify(output,null,2));
if(!output.ok)process.exitCode=2;
