import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runUniversalWealthJob } from './universal-wealth-job-handler.mjs';
import { compileEightHourOverdetermination, EIGHT_HOUR_OVERDETERMINATION_VERSION } from './eight-hour-overdetermination-engine.mjs';

export const UNIVERSAL_WEALTH_OVERDETERMINATION_JOB_VERSION='uberbond.universal-wealth-overdetermination-job.v1';
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashId=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex').slice(0,16);

async function readJson(file){
  try{return JSON.parse(await fs.readFile(file,'utf8'));}
  catch(error){if(error?.code==='ENOENT') return null; throw error;}
}

export async function runUniversalWealthOverdeterminationJob({
  root=process.cwd(),
  inputPath='private/universal-wealth-input.json',
  outputPath='artifacts/universal-wealth-latest.json',
  enqueueJob=null,
  maximumRepairTasks=8,
  ...baseOptions
}={}){
  const resolvedRoot=path.resolve(root);
  const inputFile=path.resolve(resolvedRoot,inputPath);
  if(!inputFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('wealth-input-path-must-stay-under-root');
  const outputFile=path.resolve(resolvedRoot,outputPath);
  if(!outputFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('wealth-output-path-must-stay-under-root');

  const input=await readJson(inputFile)||{};
  const base=await runUniversalWealthJob({root,inputPath,outputPath,...baseOptions});
  const sleepHours=Number.isFinite(Number(input.sleepHours))?Number(input.sleepHours):Number(baseOptions.sleepHours||8);
  const maxCapitalAtRisk=Number.isFinite(Number(baseOptions.maxCapitalAtRisk))?Number(baseOptions.maxCapitalAtRisk):0;
  const maxParallelCanaries=Number.isFinite(Number(input.maxParallelCanaries))
    ?Math.max(1,Math.floor(Number(input.maxParallelCanaries)))
    :Math.min(32,Math.max(1,Math.floor(Number(baseOptions.maxConcurrentMechanisms)||32)));
  const overdetermination=compileEightHourOverdetermination({
    attempts:Array.isArray(input.executionPaths)?input.executionPaths:[],
    horizonHours:sleepHours,
    maxParallelCanaries,
    minimumOperationallyIndependentAttempts:Number.isFinite(Number(input.minimumOperationallyIndependentAttempts))
      ?Math.max(1,Math.floor(Number(input.minimumOperationallyIndependentAttempts))):8,
    targetBoundedClearanceModel:Number.isFinite(Number(input.targetBoundedClearanceModel))
      ?Number(input.targetBoundedClearanceModel):0.99,
    maxCapitalAtRisk,
    externalAddressableCombinationCount:base.openWorldAddressableCombinationCount
  });

  const repairTasks=overdetermination.repairQueue.slice(0,Math.max(1,Math.floor(Number(maximumRepairTasks)||8)));
  let repairDispatch={requested:false,taskCount:0,jobId:null,batchDigest:null};
  if(repairTasks.length&&typeof enqueueJob==='function'){
    const batchDigest=digest({inputDigest:base.inputDigest,tasks:repairTasks}).slice(0,24);
    const queued=await enqueueJob('economic.repair.process',{tasks:repairTasks,maxRepairs:repairTasks.length},{idempotencyKey:`economic-repair-batch:${batchDigest}`});
    repairDispatch={requested:true,taskCount:repairTasks.length,jobId:queued?.id||queued?.jobId||null,batchDigest};
  }

  const extended={
    ...base,
    schema:UNIVERSAL_WEALTH_OVERDETERMINATION_JOB_VERSION,
    baseWealthJobSchema:base.schema,
    eightHourOverdeterminationVersion:EIGHT_HOUR_OVERDETERMINATION_VERSION,
    eightHourOverdetermination:{
      status:overdetermination.status,
      addressableRouteCount:overdetermination.addressableRouteCount,
      internalRouteArchetypeCount:overdetermination.internalRouteArchetypeCount,
      materializedAttemptCount:overdetermination.materializedAttemptCount,
      eligibleAttemptCount:overdetermination.eligibleAttemptCount,
      selectedAttemptCount:overdetermination.selectedAttemptCount,
      realizedSelectedAttemptCount:overdetermination.realizedSelectedAttemptCount,
      operationallyIndependentSelectedCount:overdetermination.operationallyIndependentSelectedCount,
      dimensions:overdetermination.dimensions,
      singlePointFailures:overdetermination.singlePointFailures,
      boundedNightClearanceModel:overdetermination.boundedNightClearanceModel,
      targetBoundedClearanceModel:overdetermination.targetBoundedClearanceModel,
      saturationDeficit:overdetermination.saturationDeficit,
      replacementCapacityRemaining:overdetermination.replacementCapacityRemaining,
      repairTaskCount:overdetermination.repairQueue.length,
      ownerOnlyBlockerCount:overdetermination.ownerOnlyBlockers.length,
      killedAttemptCount:overdetermination.killedAttemptCount,
      selectedAttemptDigests:overdetermination.selectedAttemptIds.map(hashId),
      repairDispatch,
      moneyClaimAuthority:'NONE',
      inevitabilityClaimAuthority:'NONE',
      externalEffectAuthority:'NONE',
      capitalDeploymentAuthority:'NONE'
    },
    truthBoundary:`${base.truthBoundary}; OVERDETERMINATION_TARGET_REQUIRES_DIVERSIFIED_OPERATIONAL_FAILURE_DOMAINS_AND_A_BOUNDED_CLEARANCE_MODEL_BUT_IS_NOT_A_GUARANTEE; RAW_ROUTE_IDENTITIES_REMAIN_RUNTIME_LOCAL; AUTHORITY_AND_PROHIBITED_BLOCKERS_ARE_NEVER_AUTO_DISPATCHED; REAL_MONEY_REQUIRES_OBSERVED_CLEARED_PAYMENT_PLUS_ACCEPTED_DELIVERY`
  };
  await fs.mkdir(path.dirname(outputFile),{recursive:true});
  await fs.writeFile(outputFile,`${JSON.stringify(extended,null,2)}\n`,'utf8');
  return extended;
}
