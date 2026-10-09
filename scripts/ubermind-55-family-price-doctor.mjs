import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {calculateUberMind55PriceProxy as calculate,
 model55PriceFloorWithOpusRequired as floor} from '../src/ubermind-55-family-subscription-price-proxy.mjs';

/** Standalone, zero-call tariff doctor, NEVER a Claude Pro allowance meter. */
export const UBERMIND_55_DOCTOR_SCHEMA='uberbond.ubermind-55-tariff-doctor.v1';
export function inspectUberMind55TariffScenarios(){
 const reference=calculate({opusShare:1,sonnetShare:0,haikuShare:0});
 const defensive=calculate({opusShare:.4,sonnetShare:.4,haikuShare:.2});
 const balanced=calculate();
 const aggressive=calculate({opusShare:.1,sonnetShare:.3,haikuShare:.6});
 const theoreticalMinimum=floor({essentialOpusShare:0});
 const floorWith20Opus=floor({essentialOpusShare:.2});
 return {
  schema:UBERMIND_55_DOCTOR_SCHEMA,
  result:'OFFICIAL_API_TARIFF_ILLUSTRATIONS_NOT_PRO_QUOTA',
  exampleTokens:{input:1000000,output:200000},
  haikuTierPerIndividualPrompt:'AT_MOST_100K_TOKENS',
  examples:[
   {name:'all_opus',...pick(reference)},
   {name:'quality_defensive_40_40_20',...pick(defensive)},
   {name:'balanced_20_50_30',...pick(balanced)},
   {name:'aggressive_10_30_60',...pick(aggressive)},
   {name:'all_haiku_THEORETICAL_price_floor',...pick(theoreticalMinimum)},
   {name:'at_least_20pct_opus_conditional_floor',...pick(floorWith20Opus)}
  ],
  proMonthlyBillUsd:20,
  actualFiveHourUsageReductionPercent:null,
  actualWeeklyUsageReductionPercent:null,
  maxQualityConfirmed:false,
  tariffEquivalentNotSubscriptionMeter:true,
  providerCalls:0,paidApiSpendUsd:0,
  note:'A 97.5% per-token tariff cut for all Haiku short prompts is NOT a 97.5% Pro quota gain and does NOT prove Opus-level results. Only use mixed routes when source-bound accepted-quality evidence covers those units. The full workflow, retries, and verification must be counted.'
 };
}
function pick(s){
 return {apiEquivalentUsd:s.candidateApiEquivalentUsd,
  hypotheticalCutPercent:s.hypotheticalApiEquivalentPriceCutPercent,
  qualityEquivalenceProven:s.qualityEquivalenceProven};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.write(JSON.stringify(inspectUberMind55TariffScenarios(),null,2)+'\n');
}