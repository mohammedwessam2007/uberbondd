import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileSleepWealthCycle, UNIVERSAL_WEALTH_ENGINE_VERSION } from './universal-wealth-engine.mjs';
import { compileOpenWorldMoneyUniverse, simulateEightHourWealthUniverse, EIGHT_HOUR_WEALTH_SIM_VERSION } from './eight-hour-wealth-universe-simulator.mjs';

export const UNIVERSAL_WEALTH_JOB_VERSION='uberbond.universal-wealth-job.v1';
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashId=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex').slice(0,16);

async function readJson(file){
  try{return JSON.parse(await fs.readFile(file,'utf8'));}
  catch(error){if(error?.code==='ENOENT') return null; throw error;}
}

export async function runUniversalWealthJob({
  root=process.cwd(),
  inputPath='private/universal-wealth-input.json',
  outputPath='artifacts/universal-wealth-latest.json',
  maxSearchCells=256,
  maxCanaries=5,
  maxCapitalAtRisk=0,
  sleepHours=8,
  simulationIterations=5000,
  maxConcurrentMechanisms=64
}={}){
  const resolvedRoot=path.resolve(root);
  const inputFile=path.resolve(resolvedRoot,inputPath);
  if(!inputFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('wealth-input-path-must-stay-under-root');
  const outputFile=path.resolve(resolvedRoot,outputPath);
  if(!outputFile.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error('wealth-output-path-must-stay-under-root');
  const input=await readJson(inputFile)||{};
  const cycle=compileSleepWealthCycle({
    signals:Array.isArray(input.signals)?input.signals:[],
    candidates:Array.isArray(input.candidates)?input.candidates:[],
    constraints:input.constraints&&typeof input.constraints==='object'?input.constraints:{},
    maxSearchCells,
    maxCanaries,
    maxCapitalAtRisk
  });
  const inputDigest=digest(input);
  const domains=Array.isArray(input.domains)&&input.domains.length?input.domains:['general'];
  const universe=compileOpenWorldMoneyUniverse({
    domains,
    materializedSamples:Math.max(64,Math.min(4096,Number(maxSearchCells||256)*4)),
    seed:`resident:${inputDigest.slice(0,24)}`
  });
  const mechanisms=Array.isArray(input.sleepMechanisms)
    ? input.sleepMechanisms
    : (Array.isArray(input.candidates)?input.candidates:[]);
  const sim=simulateEightHourWealthUniverse({
    mechanisms,
    sleepHours:Number.isFinite(Number(input.sleepHours))?Number(input.sleepHours):sleepHours,
    iterations:Number.isFinite(Number(input.simulationIterations))?Number(input.simulationIterations):simulationIterations,
    seed:`resident-night:${inputDigest.slice(0,24)}`,
    maxConcurrentMechanisms:Number.isFinite(Number(input.maxConcurrentMechanisms))?Number(input.maxConcurrentMechanisms):maxConcurrentMechanisms,
    maxCapitalAtRisk
  });
  const receipt={
    schema:UNIVERSAL_WEALTH_JOB_VERSION,
    engineVersion:UNIVERSAL_WEALTH_ENGINE_VERSION,
    sleepSimulationVersion:EIGHT_HOUR_WEALTH_SIM_VERSION,
    generatedAt:new Date().toISOString(),
    inputDigest,
    searchCellCount:cycle.searchLattice.cellCount,
    candidateCount:Array.isArray(input.candidates)?input.candidates.length:0,
    canaryCount:cycle.portfolio.canaries.length,
    canaryDigests:cycle.portfolio.canaries.map(hashId),
    openWorldAddressableCombinationCount:universe.addressableCombinationCount,
    openWorldMaterializedSampleCount:universe.materializedSampleCount,
    unknownMechanismFrontier:universe.unknownMechanismFrontier,
    eightHourSimulation:{
      status:sim.status,
      sleepHours:sim.sleepHours,
      mechanismCount:sim.mechanismCount,
      eligibleMechanismCount:sim.eligibleMechanismCount,
      selectedMechanismCount:sim.selectedMechanismCount,
      selectedMechanismDigests:sim.selectedMechanismIds.map(hashId),
      fantasyGrossCeiling:sim.fantasyGrossCeiling,
      executableGrossCeiling:sim.executableGrossCeiling,
      expectedClearedGross:sim.expectedClearedGross,
      analyticExpectedNetContribution:sim.analyticExpectedNetContribution,
      evidenceWeightedExpectedNetContribution:sim.evidenceWeightedExpectedNetContribution,
      p10:sim.simulation.p10,
      p50:sim.simulation.p50,
      p90:sim.simulation.p90,
      p99:sim.simulation.p99,
      probabilityPositive:sim.simulation.probabilityPositive,
      assumptionsAreHypotheses:true,
      moneyClaimAuthority:'NONE'
    },
    externalEffectAuthority:'NONE',
    capitalDeploymentAuthority:'NONE',
    tradingAuthority:'NONE',
    status:cycle.status,
    truthBoundary:'PRIVATE_WEALTH_INPUT_STAYS_RUNTIME_LOCAL; OPEN_WORLD_AND_EIGHT_HOUR_OUTPUTS_ARE_COUNTERFACTUAL_AGGREGATES_ONLY; NO SIMULATED_DOLLAR_IS_REVENUE_OR_PAYMENT_EVIDENCE'
  };
  await fs.mkdir(path.dirname(outputFile),{recursive:true});
  await fs.writeFile(outputFile,`${JSON.stringify(receipt,null,2)}\n`,'utf8');
  return receipt;
}
