import { MILLION_WORMHOLE_OPERATORS } from './million-wormhole-operators.mjs';
import { encodeMillionWormholeIndex, renderMillionWormholeCandidate } from './million-wormhole-universe.mjs';
import { COMPILED_MAX_EXACT_TOP_K } from './million-wormhole-compiled-prior.mjs';

export const MILLION_WORMHOLE_EARLY_EXIT_PRIOR_VERSION='uberbond.million-wormhole-early-exit-prior.v1';
const HIGH=new Set(['DELETE_REQUIREMENT','TOPOLOGY_DELETE','THOUGHT_COMPILATION','DYNAMIC_MODEL_ROUTING','DYNAMIC_EXPERT_ROUTING','COMPILE_TO_CODE','SYMBOLIC_SOLVE','FORMALIZE','COUNTERFACTUAL_SEARCH','EXTERNALIZE_MEMORY','EXTERNALIZE_TOOL','META_LEARN','PROGRAM_SYNTHESIS']);
const OPERATOR_IDS=Object.freeze(MILLION_WORMHOLE_OPERATORS.map((name,index)=>HIGH.has(name)?index:null).filter(Number.isInteger));
const ORGAN_FAMILY_IDS=Object.freeze([0,14,20,21,26]);
const SUBSTRATE_IDS=Object.freeze([0,5,6,7]);
const VERIFIER_IDS=Object.freeze([1,2,3,4,7]);
const zero=()=>({providerCalls:0,messages:0,spendCents:0,deployments:0,payments:0});

export function compileEarlyExitMillionWormholePriors({topK=100}={}){
  if(!Number.isSafeInteger(topK)||topK<1||topK>COMPILED_MAX_EXACT_TOP_K) return {ok:false,status:'EARLY_EXIT_PRIOR_REFUSED',reasonCodes:['top-k-outside-exact-envelope'],exactTopKLimit:COMPILED_MAX_EXACT_TOP_K,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const selected=[];
  outer: for(const organFamilyId of ORGAN_FAMILY_IDS) for(let organFunctionId=0;organFunctionId<8;organFunctionId++) for(const operatorId of OPERATOR_IDS) for(const substrateId of SUBSTRATE_IDS) for(const verifierId of VERIFIER_IDS){
    const index=encodeMillionWormholeIndex({organFamilyId,organFunctionId,operatorId,substrateId,verifierId});
    selected.push({...renderMillionWormholeCandidate(index),staticPrior:.98});
    if(selected.length===topK) break outer;
  }
  return {ok:true,status:'EARLY_EXIT_PRIOR_EXACT_TOP_K_READY',version:MILLION_WORMHOLE_EARLY_EXIT_PRIOR_VERSION,selected,addressEvaluations:selected.length,exactTopKLimit:COMPILED_MAX_EXACT_TOP_K,semanticContract:'EXACTLY_MATCH_COMPILED_V1_AND_EXHAUSTIVE_STATIC_PRIOR_ORDER_WITHIN_DECLARED_ENVELOPE',truthBoundary:'EARLY_EXIT_STATIC_PRIOR_ONLY__NOT_GENERAL_INTELLIGENCE_EVIDENCE__NO_EXTERNAL_EFFECT',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}
