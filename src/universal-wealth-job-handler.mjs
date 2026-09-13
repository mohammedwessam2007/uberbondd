import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileSleepWealthCycle, UNIVERSAL_WEALTH_ENGINE_VERSION } from './universal-wealth-engine.mjs';
import { compileOpenWorldMoneyUniverse, simulateEightHourWealthUniverse, EIGHT_HOUR_WEALTH_SIM_VERSION } from './eight-hour-wealth-universe-simulator.mjs';
import { simulateSyntheticEightHourUniverse, SYNTHETIC_WEALTH_PRIOR_VERSION } from './synthetic-eight-hour-wealth-priors.mjs';
import { compileEconomicInevitabilityPlan, ECONOMIC_INEVITABILITY_VERSION } from './economic-inevitability-engine.mjs';
import { compileTotalCommercialGenomeOfferUniverseWealth, TOTAL_COMMERCIAL_GENOME_OFFER_UNIVERSE_WEALTH_VERSION } from './uberbond-total-commercial-genome-offer-universe-and-wealth-engine.mjs';

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
  maxConcurrentMechanisms=64,
  syntheticSamples=512,
  syntheticIterations=1200
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
  const commercialAggregate=compileTotalCommercialGenomeOfferUniverseWealth({
    candidate:input.commercialCandidate&&typeof input.commercialCandidate==='object'?input.commercialCandidate:null,
    evidenceRefs:Array.isArray(input.commercialEvidenceRefs)?input.commercialEvidenceRefs:[],
    buyer:input.commercialBuyer||'',
    objective:input.commercialObjective||'discover and validate economically useful offers',
    signals:Array.isArray(input.signals)?input.signals:[],
    wealthCandidates:Array.isArray(input.candidates)?input.candidates:[],
    constraints:input.constraints&&typeof input.constraints==='object'?input.constraints:{},
    maxOfferHypotheses:Number.isFinite(Number(input.maxOfferHypotheses))?Math.max(0,Math.min(25,Math.floor(Number(input.maxOfferHypotheses)))):25,
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
  const syntheticScenarios={};
  for(const scenario of ['CONSERVATIVE','BASE','AGGRESSIVE']){
    const thought=simulateSyntheticEightHourUniverse({
      domains,
      materializedSamples:Number.isFinite(Number(input.syntheticSamples))?Number(input.syntheticSamples):syntheticSamples,
      scenario,
      sleepHours:Number.isFinite(Number(input.sleepHours))?Number(input.sleepHours):sleepHours,
      iterations:Number.isFinite(Number(input.syntheticIterations))?Number(input.syntheticIterations):syntheticIterations,
      seed:`resident-synthetic:${inputDigest.slice(0,24)}:${scenario}`,
      maxConcurrentMechanisms:Number.isFinite(Number(input.maxConcurrentMechanisms))?Number(input.maxConcurrentMechanisms):maxConcurrentMechanisms,
      maxCapitalAtRisk,
      assumeRegulatoryClearance:false
    });
    syntheticScenarios[scenario]={
      status:thought.status,
      scenario,
      materializedSampleCount:thought.universe.materializedSampleCount,
      selectedMechanismCount:thought.simulation.selectedMechanismCount,
      fantasyGrossCeiling:thought.simulation.fantasyGrossCeiling,
      executableGrossCeiling:thought.simulation.executableGrossCeiling,
      expectedClearedGross:thought.simulation.expectedClearedGross,
      analyticExpectedNetContribution:thought.simulation.analyticExpectedNetContribution,
      evidenceWeightedExpectedNetContribution:thought.simulation.evidenceWeightedExpectedNetContribution,
      p10:thought.simulation.simulation.p10,
      p50:thought.simulation.simulation.p50,
      p90:thought.simulation.simulation.p90,
      p99:thought.simulation.simulation.p99,
      probabilityPositive:thought.simulation.simulation.probabilityPositive,
      synthetic:true,
      forecastAuthority:'NONE'
    };
  }
  const inevitability=compileEconomicInevitabilityPlan({
    paths:Array.isArray(input.executionPaths)?input.executionPaths:[],
    policyClearedDonorDigests:Array.isArray(input.policyClearedDonorDigests)?input.policyClearedDonorDigests:[],
    minimumIndependentPaths:Number.isFinite(Number(input.minimumIndependentPaths))?Math.max(1,Math.floor(Number(input.minimumIndependentPaths))):3
  });
  const receipt={
    schema:UNIVERSAL_WEALTH_JOB_VERSION,
    engineVersion:UNIVERSAL_WEALTH_ENGINE_VERSION,
    totalCommercialGenomeOfferUniverseWealthVersion:TOTAL_COMMERCIAL_GENOME_OFFER_UNIVERSE_WEALTH_VERSION,
    sleepSimulationVersion:EIGHT_HOUR_WEALTH_SIM_VERSION,
    syntheticPriorVersion:SYNTHETIC_WEALTH_PRIOR_VERSION,
    economicInevitabilityVersion:ECONOMIC_INEVITABILITY_VERSION,
    generatedAt:new Date().toISOString(),
    inputDigest,
    totalCommercialGenomeOfferUniverseWealth:{
      status:commercialAggregate.status,
      commercialGenomeCompleteness:commercialAggregate.commercialGenome?.completeness??null,
      offerAtomCount:commercialAggregate.offerUniverse?.atomCount??0,
      offerHypothesisCount:commercialAggregate.offerUniverse?.candidateCount??0,
      wealthSearchCellCount:commercialAggregate.wealth?.searchLattice?.cellCount??0,
      wealthCanaryCount:commercialAggregate.wealth?.portfolio?.canaries?.length??0,
      moneyClaimAuthority:'NONE',
      externalEffectAuthority:'NONE'
    },
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
    economicInevitability:{
      status:inevitability.status,
      inevitabilityIndex:inevitability.inevitabilityIndex,
      pathCount:inevitability.pathCount,
      executablePathCount:inevitability.executablePathCount,
      realizedPathCount:inevitability.realizedPathCount,
      recurringPathCount:inevitability.recurringPathCount,
      independentExecutionClassCount:inevitability.independentExecutionClassCount,
      executableMechanismFamilyCount:inevitability.executableMechanismFamilyCount,
      blockerCounts:inevitability.blockerCounts,
      stageBlockerCounts:inevitability.stageBlockerCounts,
      singlePointFailures:inevitability.singlePointFailures,
      autonomousResolutionTaskCount:inevitability.autonomousResolutionTasks.length,
      ownerOnlyBlockerCount:inevitability.ownerOnlyBlockers.length,
      killedPathCount:inevitability.killedPathIds.length,
      donorAtomIds:inevitability.donorAtomIds,
      policyClearedDonorCount:inevitability.policyClearedDonorDigests.length,
      boundedNightClearanceModel:inevitability.boundedNightClearanceModel,
      selectedExecutablePathDigests:inevitability.selectedExecutablePathIds.map(hashId),
      moneyClaimAuthority:'NONE',
      inevitabilityClaimAuthority:'NONE',
      externalEffectAuthority:'NONE'
    },
    syntheticEightHourThoughtExperiments:syntheticScenarios,
    externalEffectAuthority:'NONE',
    capitalDeploymentAuthority:'NONE',
    tradingAuthority:'NONE',
    status:cycle.status,
    truthBoundary:'PRIVATE_WEALTH_INPUT_STAYS_RUNTIME_LOCAL; COMMERCIAL GENOME AND OFFER-UNIVERSE OUTPUTS REMAIN ZERO-AUTHORITY INTERNAL HYPOTHESES; OPEN_WORLD_AND_EIGHT_HOUR_OUTPUTS_ARE COUNTERFACTUAL_AGGREGATES_ONLY; SYNTHETIC_SCENARIOS_ARE_THOUGHT_EXPERIMENTS_NOT_FORECASTS; INEVITABILITY_IS_A_RESILIENCE_AND_EVIDENCE_SCORE_NOT_A_GUARANTEE; OWNER_AUTHORITY_BLOCKS_MUST_NOT_BE_BYPASSED; NO SIMULATED_DOLLAR_IS_REVENUE; NO SIMULATED_DOLLAR_OR_READINESS_INDEX_IS_REVENUE_OR_PAYMENT_EVIDENCE'
  };
  await fs.mkdir(path.dirname(outputFile),{recursive:true});
  await fs.writeFile(outputFile,`${JSON.stringify(receipt,null,2)}\n`,'utf8');
  return receipt;
}
