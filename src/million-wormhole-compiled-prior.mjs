import { MILLION_WORMHOLE_OPERATORS } from './million-wormhole-operators.mjs';
import { encodeMillionWormholeIndex, renderMillionWormholeCandidate } from './million-wormhole-universe.mjs';

export const MILLION_WORMHOLE_COMPILED_PRIOR_VERSION='uberbond.million-wormhole-compiled-prior.v1';
export const MILLION_WORMHOLE_EARLY_EXIT_PRIOR_VERSION='uberbond.million-wormhole-compiled-prior.v2';
const HIGH_OPERATOR_NAMES=new Set(['DELETE_REQUIREMENT','TOPOLOGY_DELETE','THOUGHT_COMPILATION','DYNAMIC_MODEL_ROUTING','DYNAMIC_EXPERT_ROUTING','COMPILE_TO_CODE','SYMBOLIC_SOLVE','FORMALIZE','COUNTERFACTUAL_SEARCH','EXTERNALIZE_MEMORY','EXTERNALIZE_TOOL','META_LEARN','PROGRAM_SYNTHESIS']);
const HIGH_OPERATOR_IDS=Object.freeze(MILLION_WORMHOLE_OPERATORS.map((name,index)=>HIGH_OPERATOR_NAMES.has(name)?index:null).filter(index=>index!==null));
const SPECIAL_ORGAN_FAMILY_IDS=Object.freeze([0,14,20,21,26]);
const LOW_COST_SUBSTRATE_IDS=Object.freeze([0,5,6,7]);
const STRONG_VERIFIER_IDS=Object.freeze([1,2,3,4,7]);
export const COMPILED_MAX_EXACT_TOP_K=SPECIAL_ORGAN_FAMILY_IDS.length*8*HIGH_OPERATOR_IDS.length*LOW_COST_SUBSTRATE_IDS.length*STRONG_VERIFIER_IDS.length;

const zero=()=>({providerCalls:0,messages:0,spendCents:0,deployments:0,payments:0});
const refused=()=>({ok:false,status:'COMPILED_PRIOR_SEARCH_REFUSED',reasonCodes:['top-k-outside-exact-compiled-envelope'],exactTopKLimit:COMPILED_MAX_EXACT_TOP_K,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()});
const validTopK=topK=>Number.isSafeInteger(topK)&&topK>=1&&topK<=COMPILED_MAX_EXACT_TOP_K;
const rowFor=(organFamilyId,organFunctionId,operatorId,substrateId,verifierId)=>{const index=encodeMillionWormholeIndex({organFamilyId,organFunctionId,operatorId,substrateId,verifierId});return {...renderMillionWormholeCandidate(index),staticPrior:.98};};

export function compileTopMillionWormholePriors({topK=100}={}){
  if(!validTopK(topK)) return refused();
  const rows=[];
  for(const organFamilyId of SPECIAL_ORGAN_FAMILY_IDS){
    for(let organFunctionId=0;organFunctionId<8;organFunctionId++){
      for(const operatorId of HIGH_OPERATOR_IDS){
        for(const substrateId of LOW_COST_SUBSTRATE_IDS){
          for(const verifierId of STRONG_VERIFIER_IDS) rows.push(rowFor(organFamilyId,organFunctionId,operatorId,substrateId,verifierId));
        }
      }
    }
  }
  rows.sort((a,b)=>a.index-b.index);
  return {ok:true,status:'COMPILED_PRIOR_EXACT_TOP_K_READY',version:MILLION_WORMHOLE_COMPILED_PRIOR_VERSION,selected:rows.slice(0,topK),addressEvaluations:rows.length,exactTopKLimit:COMPILED_MAX_EXACT_TOP_K,semanticContract:'EXACTLY_MATCH_EXHAUSTIVE_STATIC_PRIOR_ORDER_WITHIN_DECLARED_ENVELOPE',truthBoundary:'COMPILED_STATIC_PRIOR_ONLY__NOT_BENCHMARKED_CAPABILITY_GAIN__NO_EXTERNAL_EFFECT',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export function compileTopMillionWormholePriorsEarlyExit({topK=100}={}){
  if(!validTopK(topK)) return refused();
  const selected=[];
  for(const organFamilyId of SPECIAL_ORGAN_FAMILY_IDS){
    for(let organFunctionId=0;organFunctionId<8;organFunctionId++){
      for(const operatorId of HIGH_OPERATOR_IDS){
        for(const substrateId of LOW_COST_SUBSTRATE_IDS){
          for(const verifierId of STRONG_VERIFIER_IDS){
            selected.push(rowFor(organFamilyId,organFunctionId,operatorId,substrateId,verifierId));
            if(selected.length===topK){
              return {ok:true,status:'EARLY_EXIT_COMPILED_PRIOR_EXACT_TOP_K_READY',version:MILLION_WORMHOLE_EARLY_EXIT_PRIOR_VERSION,selected,addressEvaluations:topK,exactTopKLimit:COMPILED_MAX_EXACT_TOP_K,semanticContract:'EXACTLY_MATCH_COMPILED_V1_AND_EXHAUSTIVE_STATIC_PRIOR_ORDER_WITHIN_DECLARED_ENVELOPE',truthBoundary:'EARLY_EXIT_COMPILED_STATIC_PRIOR_ONLY__NOT_GENERAL_INTELLIGENCE_OR_ASI_PROOF__NO_EXTERNAL_EFFECT',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
            }
          }
        }
      }
    }
  }
  throw new Error('early-exit-compiled-prior-internal-cardinality-violation');
}
