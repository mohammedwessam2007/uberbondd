import crypto from 'node:crypto';
import { compileOpenWorldMoneyUniverse, simulateEightHourWealthUniverse, EIGHT_HOUR_WEALTH_SIM_VERSION } from './eight-hour-wealth-universe-simulator.mjs';

export const SYNTHETIC_WEALTH_PRIOR_VERSION='uberbond.synthetic-eight-hour-wealth-priors.v1';

export const SYNTHETIC_EIGHT_HOUR_SCENARIOS=Object.freeze({
  CONSERVATIVE:Object.freeze({grossMin:5,grossMax:250,successMin:0.001,successMax:0.03,attemptsMin:0.1,attemptsMax:5,settlementMin:0.15,settlementMax:0.65,marginMin:0.25,marginMax:0.80,setupMax:4,fixedCostMax:2}),
  BASE:Object.freeze({grossMin:10,grossMax:1000,successMin:0.003,successMax:0.07,attemptsMin:0.2,attemptsMax:12,settlementMin:0.20,settlementMax:0.80,marginMin:0.35,marginMax:0.90,setupMax:3,fixedCostMax:4}),
  AGGRESSIVE:Object.freeze({grossMin:20,grossMax:5000,successMin:0.005,successMax:0.12,attemptsMin:0.3,attemptsMax:25,settlementMin:0.25,settlementMax:0.92,marginMin:0.45,marginMax:0.96,setupMax:2,fixedCostMax:8})
});

const HORIZON_SETTLEMENT_SCALE=Object.freeze({MINUTES:1,HOURS:0.85,DAYS:0.25,WEEKS:0.06,MONTHS:0.015,YEARS:0.002,DECADES:0.0005});
const CAPITAL_INTENSIVE_ASSETS=new Set(['CAPITAL','FINANCIAL_CLAIM','REAL_ASSET','REAL_ESTATE','PHYSICAL_GOOD','INVENTORY','ENERGY']);
const REGULATED_CAPTURE_MODELS=new Set(['EQUITY','DIVIDEND','INTEREST','CAPITAL_GAIN','YIELD','INSURANCE_PAYOUT']);
const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const c=v=>Math.max(0,Math.min(1,n(v)));
const round=(v,d=2)=>Number(n(v).toFixed(d));
const hash=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');
const unit=seed=>Number.parseInt(hash(seed).slice(0,13),16)/0x1fffffffffffff;
const between=(min,max,u)=>min+(max-min)*u;
const logBetween=(min,max,u)=>Math.exp(Math.log(min)+(Math.log(max)-Math.log(min))*u);

export function compileSyntheticUniverseMechanisms({universe,scenario='BASE',maxMechanisms=512,seed='uberbond-synthetic-priors',assumeRegulatoryClearance=false}={}){
  const key=String(scenario||'BASE').toUpperCase();
  const prior=SYNTHETIC_EIGHT_HOUR_SCENARIOS[key];
  if(!prior) throw new Error('unknown-synthetic-wealth-scenario');
  const cells=(Array.isArray(universe?.samples)?universe.samples:[]).slice(0,Math.max(0,Math.min(100000,Math.floor(n(maxMechanisms,512)))));
  const mechanisms=cells.map(cell=>{
    const local=`${seed}:${key}:${cell.id}`;
    const u=label=>unit(`${local}:${label}`);
    const horizonScale=HORIZON_SETTLEMENT_SCALE[String(cell.horizons||'HOURS').toUpperCase()]??0.1;
    const asset=String(cell.assetForms||'').toUpperCase();
    const capture=String(cell.captureModels||'').toUpperCase();
    const capitalIntensive=CAPITAL_INTENSIVE_ASSETS.has(asset);
    const regulated=capitalIntensive||REGULATED_CAPTURE_MODELS.has(capture);
    const cashAtRisk=capitalIntensive?logBetween(25,key==='AGGRESSIVE'?10000:2500,u('cash-risk')):0;
    return {
      id:`synthetic:${key.toLowerCase()}:${cell.id}`,
      policyCleared:!regulated||assumeRegulatoryClearance===true,
      authorityAvailable:true,
      grossIfSuccess:round(logBetween(prior.grossMin,prior.grossMax,u('gross')),2),
      successProbabilityPerAttempt:round(between(prior.successMin,prior.successMax,u('success')),9),
      attemptsPerHour:round(logBetween(prior.attemptsMin,prior.attemptsMax,u('attempts')),6),
      settlementProbabilityWithinWindow:round(c(between(prior.settlementMin,prior.settlementMax,u('settlement'))*horizonScale),9),
      deliveryAcceptanceProbability:round(between(0.70,0.99,u('acceptance')),9),
      netMargin:round(between(prior.marginMin,prior.marginMax,u('margin')),9),
      setupHours:round(between(0,prior.setupMax,u('setup')),6),
      fixedCost:round(capitalIntensive?between(5,100,u('fixed-cost')):between(0,prior.fixedCostMax,u('fixed-cost')),2),
      cashAtRisk:round(cashAtRisk,2),
      capitalLossProbability:round(capitalIntensive?between(0.01,key==='AGGRESSIVE'?0.18:0.10,u('loss-probability')):0,9),
      evidenceQuality:0,
      syntheticPrior:true,
      syntheticScenario:key,
      syntheticAuthorityAssumed:true,
      sourceCellId:cell.id
    };
  });
  return {
    version:SYNTHETIC_WEALTH_PRIOR_VERSION,
    engineVersion:EIGHT_HOUR_WEALTH_SIM_VERSION,
    status:'SYNTHETIC_EIGHT_HOUR_PRIORS_COMPILED',
    scenario:key,
    mechanismCount:mechanisms.length,
    mechanisms,
    synthetic:true,
    forecastAuthority:'NONE',
    truthBoundary:'SYNTHETIC_PRIORS_ARE_THOUGHT_EXPERIMENT_INPUTS_ONLY; THEY_ARE_NOT_MARKET_EVIDENCE, FORECASTS, OR REVENUE CLAIMS'
  };
}

export function simulateSyntheticEightHourUniverse({domains=['general'],materializedSamples=512,scenario='BASE',sleepHours=8,iterations=2000,seed='uberbond-synthetic-night',maxConcurrentMechanisms=64,maxCapitalAtRisk=0,assumeRegulatoryClearance=false}={}){
  const universe=compileOpenWorldMoneyUniverse({domains,materializedSamples,seed:`${seed}:universe`});
  const priors=compileSyntheticUniverseMechanisms({universe,scenario,maxMechanisms:materializedSamples,seed:`${seed}:priors`,assumeRegulatoryClearance});
  const simulation=simulateEightHourWealthUniverse({mechanisms:priors.mechanisms,sleepHours,iterations,seed:`${seed}:simulation`,maxConcurrentMechanisms,maxCapitalAtRisk});
  return {
    version:SYNTHETIC_WEALTH_PRIOR_VERSION,
    status:'SYNTHETIC_EIGHT_HOUR_UNIVERSE_SIMULATED',
    scenario:priors.scenario,
    universe:{addressableCombinationCount:universe.addressableCombinationCount,materializedSampleCount:universe.materializedSampleCount,unknownMechanismFrontier:universe.unknownMechanismFrontier},
    simulation,
    synthetic:true,
    forecastAuthority:'NONE',
    truthBoundary:'ALL_DOLLAR_OUTPUTS_HERE_ARE_SYNTHETIC_COUNTERFACTUALS_FROM_DECLARED_PRIORS; THEY_ARE_NOT_EXPECTED_REVENUE, FINANCIAL_ADVICE, OR EVIDENCE_OF_PAYMENT'
  };
}
