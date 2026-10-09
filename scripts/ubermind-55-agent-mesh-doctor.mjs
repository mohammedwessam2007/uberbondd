import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {calculateUberMind55AllInMesh as calculate,
 requiredReuseForMeshCut as required} from '../src/ubermind-55-agent-mesh-total-cost.mjs';
export const W37_MESH_DOCTOR_SCHEMA='uberbond.ubermind-w37-mesh-doctor.v1';
export const W37_EXAMPLE_AUX_CALLS=Object.freeze([
 Object.freeze({role:'haiku-source-scout',model:'haiku',calls:4,inputTokensPerCall:18000,outputTokensPerCall:2000}),
 Object.freeze({role:'sonnet-independent-verifier',model:'sonnet',calls:1,inputTokensPerCall:30000,outputTokensPerCall:4000}),
 Object.freeze({role:'opus-final-crown',model:'opus',calls:1,inputTokensPerCall:20000,outputTokensPerCall:3000})
]);
export function getW37AllInMeshIllustrations(){
 const kinds=[0,.4,.6,.8,.9].map(reuse=>{
   const r=calculate({certifiedReuseShare:reuse,auxiliaryCalls:W37_EXAMPLE_AUX_CALLS});
   return {certifiedReuseShareAssumed:reuse,
     combinedApiEquivalentUsd:r.combinedApiEquivalentUsd,
     combinedPriceCutPercent:r.combinedApiEquivalentPriceCutPercent,
     auxiliaryCostUsd:r.auxiliaryAgentAndExtraVerificationApiEquivalentUsd};
 });
 const goals=[90,95,99].map(cut=>{
   const r=required({desiredApiEquivalentCutPercent:cut,auxiliaryCalls:W37_EXAMPLE_AUX_CALLS});
   return {desiredPriceCutPercent:cut,requiredSourceCertifiedReuseShare:r.requiredCertifiedReuseShare,
    possibleUnderFixedAuxiliaryWork:r.targetReachableWithDeclaredFixedAgentOverhead};
 });
 return {schema:W37_MESH_DOCTOR_SCHEMA,
  baseline:'ONE_MILLION_INPUT_AND_TWO_HUNDRED_THOUSAND_OUTPUT_TOKENS_ON_OPUS_55',
  status:'HYPOTHETICAL_API_EQUIVALENT_NOT_OBSERVED_PRO_ALLOWANCE_OR_QUALITY',
  agentCallGeometry:W37_EXAMPLE_AUX_CALLS,
  assumptions:'No cache or batch, same main input and output token proportions, all Haiku prompts short tier. Six additional calls include a Sonnet validator and Opus reviewer. Change based on actual task traces.',
  examples:kinds,desiredSavingsBreakEven:goals,
  actualProFiveHourUsagePercent:null,actualProWeeklyUsagePercent:null,
  sameTaskOpusQualityIndependentlyVerified:false,
  monthlyProSubscriptionCostUsd:20,newApiChargesUsd:0,providerCalls:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 process.stdout.write(JSON.stringify(getW37AllInMeshIllustrations(),null,2)+'\n');
