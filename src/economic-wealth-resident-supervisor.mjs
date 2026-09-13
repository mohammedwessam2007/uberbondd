import fs from 'node:fs/promises';
import path from 'node:path';
import { runUniversalWealthJob } from './universal-wealth-job-handler.mjs';
import { compileEconomicInevitabilityPlan } from './economic-inevitability-engine.mjs';
import { compileEconomicSaturationPlan, compileEconomicRepairQueuePlan, ECONOMIC_SATURATION_SELF_REPAIR_VERSION } from './economic-saturation-self-repair.mjs';

export const ECONOMIC_WEALTH_RESIDENT_SUPERVISOR_VERSION='uberbond.economic-wealth-resident-supervisor.v1';

async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error?.code==='ENOENT')return{};throw error;}}

export async function runEconomicWealthResidentSupervisor({
  root=process.cwd(),
  inputPath='private/universal-wealth-input.json',
  outputPath='artifacts/universal-wealth-latest.json',
  enqueueJob=null,
  maxQueuedRepairs=8,
  ...wealthOptions
}={}){
  const resolvedRoot=path.resolve(root);
  const inputFile=path.resolve(resolvedRoot,inputPath);
  const outputFile=path.resolve(resolvedRoot,outputPath);
  if(!inputFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('wealth-input-path-must-stay-under-root');
  if(!outputFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('wealth-output-path-must-stay-under-root');

  const receipt=await runUniversalWealthJob({root:resolvedRoot,inputPath,outputPath,...wealthOptions});
  const input=await readJson(inputFile);
  const inevitability=compileEconomicInevitabilityPlan({
    paths:Array.isArray(input.executionPaths)?input.executionPaths:[],
    policyClearedDonorDigests:Array.isArray(input.policyClearedDonorDigests)?input.policyClearedDonorDigests:[],
    minimumIndependentPaths:Number.isFinite(Number(input.minimumIndependentPaths))?Math.max(1,Math.floor(Number(input.minimumIndependentPaths))):3
  });
  const saturation=compileEconomicSaturationPlan({
    inevitability,
    executionPaths:Array.isArray(input.executionPaths)?input.executionPaths:[],
    targetNightClearanceProbability:Number.isFinite(Number(input.targetNightClearanceProbability))?Number(input.targetNightClearanceProbability):0.995,
    minimumIndependentPaths:Number.isFinite(Number(input.saturationMinimumIndependentPaths))?Number(input.saturationMinimumIndependentPaths):8,
    minimumMechanismFamilies:Number.isFinite(Number(input.minimumMechanismFamilies))?Number(input.minimumMechanismFamilies):6,
    maxRepairMissions:Number.isFinite(Number(input.maxRepairMissions))?Number(input.maxRepairMissions):12,
    maxReplacementRequests:Number.isFinite(Number(input.maxReplacementRequests))?Number(input.maxReplacementRequests):24
  });
  const queuePlan=compileEconomicRepairQueuePlan({saturationPlan:saturation,maxJobs:maxQueuedRepairs});
  const queued=[];const queueFailures=[];
  if(typeof enqueueJob==='function'){
    for(const job of queuePlan.jobs){
      try{
        const result=await enqueueJob(job.type,job.payload||{},{maxAttempts:job.maxAttempts,priority:job.priority,dedupeKey:job.dedupeKey});
        queued.push({type:job.type,jobId:result?.id||null});
      }catch(error){queueFailures.push({type:job.type,reason:String(error?.message||'enqueue-failed').slice(0,240)});}
    }
  }

  const enriched={
    ...receipt,
    economicSaturationVersion:ECONOMIC_SATURATION_SELF_REPAIR_VERSION,
    economicSaturation:{
      status:saturation.status,
      targetNightClearanceProbability:saturation.targetNightClearanceProbability,
      modeledNightClearanceProbability:saturation.modeledNightClearanceProbability,
      modeledAllPathsFailProbability:saturation.modeledAllPathsFailProbability,
      minimumIndependentPaths:saturation.minimumIndependentPaths,
      minimumMechanismFamilies:saturation.minimumMechanismFamilies,
      executablePathCount:saturation.executablePathCount,
      observedIndependentClassCount:saturation.observedIndependentClassCount,
      observedMechanismFamilyCount:saturation.observedMechanismFamilyCount,
      uniqueCorrelationFingerprintCount:saturation.uniqueCorrelationFingerprintCount,
      structuralSaturation:saturation.structuralSaturation,
      probabilisticSaturation:saturation.probabilisticSaturation,
      deficitTypes:saturation.deficits.map(x=>x.type),
      deficitCount:saturation.deficits.length,
      repairMissionCount:saturation.repairMissions.length,
      replacementRequestCount:saturation.replacementRequests.length,
      hardStopCount:saturation.hardStopCount,
      ownerOnlyBlockerCount:saturation.ownerOnlyBlockerCount,
      plannedQueueCount:queuePlan.jobs.length,
      queuedJobCount:queued.length,
      queuedJobTypes:queued.map(x=>x.type),
      queueFailureCount:queueFailures.length,
      externalEffectAuthority:'NONE',
      capitalDeploymentAuthority:'NONE'
    },
    residentSupervisorVersion:ECONOMIC_WEALTH_RESIDENT_SUPERVISOR_VERSION,
    truthBoundary:`${receipt.truthBoundary}; SATURATION_AND_REPAIR_QUEUEING_ONLY_COORDINATE_BOUNDED_PREPARATION_AND_RESEARCH; OVERDETERMINATION_IS_A_RESILIENCE_TARGET_NOT_A_PROFIT_GUARANTEE`
  };
  await fs.mkdir(path.dirname(outputFile),{recursive:true});
  await fs.writeFile(outputFile,`${JSON.stringify(enriched,null,2)}\n`,'utf8');
  return enriched;
}
