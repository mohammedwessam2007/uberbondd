import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 calculateEventGatedUberMind55 as calculate,
 DEFAULT_CONDITIONAL_AGENTS as defaults
} from '../src/ubermind-conditional-agent-optimizer.mjs';

export const UBERMIND_OMEGA16_DOCTOR='uberbond.ubermind.event-gated-quality-cost-doctor.v1';
export function uberMindOmega16ConditionalDoctor(){
 const oldFixed=.2512;
 const reference=8;
 const baseModel=3.66;
 const cases=[0,.4,.6,.8].map(reuse=>{
  const newRoute=calculate({certifiedReuseShare:reuse});
  return {certifiedReuseShareAssumed:reuse,
   previousFixedAgentsUsd:Number((baseModel*(1-reuse)+oldFixed).toFixed(9)),
   optimizedExpectedUsd:newRoute.expectedAllInApiEquivalentUsd,
   optimizedWorstCaseUsd:newRoute.worstCaseAllInApiEquivalentUsd,
   expectedPriceCutPercent:newRoute.expectedApiEquivalentReductionPercent,
   independentQualityCertified:false,realProFiveHourUsage:null};
 });
 const upgradedMix=calculate({opusShare:.1,sonnetShare:.5,haikuShare:.4});
 return {
  status:'MODELED_AGENT_PROBABILITIES_NOT_MEASURED_QUALITY_OR_PRO_USAGE',
  schema:UBERMIND_OMEGA16_DOCTOR,
  baselineAllOpusApiEquivalentUsd:reference,
  defaultPrimaryModelFractions:'opus_20_sonnet_50_haiku_30',
  defaultOptionalAgentAssumptions:defaults,
  scenarios:cases,
  speculative10_50_40With60PercentReuse:{
   costUsd:upgradedMix.expectedAllInApiEquivalentUsd,
   savingsPercent:upgradedMix.expectedApiEquivalentReductionPercent,
   qualityEquivalenceVerified:false},
  minReuseFor90pctTariffCut:calculate().minimumCertifiedReuseFor90pctApiProxyCut,
  observedFiveHourUsage:null,proCashPriceUsdMonthly:20,
  additionalPaidCalls:0,
  warning:'Probabilities are illustrative. Mandatory Opus review must always run when quality requires it; keep full review if evidence is insufficient. These are uncached API prices, not Pro quota values or verified Opus-quality results.'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.write(JSON.stringify(uberMindOmega16ConditionalDoctor(),null,2)+'\n');
}
