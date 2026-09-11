import { MILLION_WORMHOLE_CANDIDATE_COUNT, MILLION_WORMHOLE_SHARD_COUNT, MILLION_WORMHOLE_SHARD_SIZE, renderMillionWormholeCandidate } from './million-wormhole-universe.mjs';

export const MILLION_WORMHOLE_TOURNAMENT_VERSION='uberbond.million-wormhole-tournament.v1';
const HIGH=new Set(['DELETE_REQUIREMENT','TOPOLOGY_DELETE','THOUGHT_COMPILATION','DYNAMIC_MODEL_ROUTING','DYNAMIC_EXPERT_ROUTING','COMPILE_TO_CODE','SYMBOLIC_SOLVE','FORMALIZE','COUNTERFACTUAL_SEARCH','EXTERNALIZE_MEMORY','EXTERNALIZE_TOOL','META_LEARN','PROGRAM_SYNTHESIS']);
const LOW_COST=new Set(['LOCAL_CPU','OPEN_MODEL_MESH','SYMBOLIC_FORMAL_STACK','WORLD_TOOL_MEMORY_FABRIC']);
const STRONG_VERIFY=new Set(['HOSTILE_ADVERSARIAL','HELDOUT_BENCHMARK','FORMAL_PROPERTY','COUNTERFACTUAL_ABLATION','INDEPENDENT_PANEL']);
const zero=()=>({providerCalls:0,messages:0,spendCents:0,deployments:0,payments:0});

function staticPrior(candidate){
  let score=.5;
  if(HIGH.has(candidate.operator)) score+=.18;
  if(LOW_COST.has(candidate.substrate)) score+=.13;
  if(STRONG_VERIFY.has(candidate.verification)) score+=.11;
  if(/Wormhole|Reality Compiler|UberMind|Capability Lab|UberDNA/.test(candidate.organ)) score+=.06;
  return Number(Math.min(1,score).toFixed(6));
}

export function compileMillionWormholeShard({shardIndex=0,topK=32,target='SEARCH_POLICY'}={}){
  if(!Number.isSafeInteger(shardIndex)||shardIndex<0||shardIndex>=MILLION_WORMHOLE_SHARD_COUNT) return {ok:false,status:'MILLION_WORMHOLE_SHARD_REFUSED',reasonCodes:['valid-shard-index-required'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  if(!Number.isSafeInteger(topK)||topK<1||topK>MILLION_WORMHOLE_SHARD_SIZE) return {ok:false,status:'MILLION_WORMHOLE_SHARD_REFUSED',reasonCodes:['bounded-top-k-required'],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
  const start=shardIndex*MILLION_WORMHOLE_SHARD_SIZE,rows=[];
  for(let offset=0;offset<MILLION_WORMHOLE_SHARD_SIZE;offset++){
    const candidate=renderMillionWormholeCandidate(start+offset);
    rows.push({...candidate,staticPrior:staticPrior(candidate)});
  }
  rows.sort((a,b)=>b.staticPrior-a.staticPrior||a.index-b.index);
  return {ok:true,status:'MILLION_WORMHOLE_SHARD_READY',version:MILLION_WORMHOLE_TOURNAMENT_VERSION,target,coverage:{shardIndex,shardCount:MILLION_WORMHOLE_SHARD_COUNT,evaluatedNow:MILLION_WORMHOLE_SHARD_SIZE,virtualTotal:MILLION_WORMHOLE_CANDIDATE_COUNT,nextShardIndex:(shardIndex+1)%MILLION_WORMHOLE_SHARD_COUNT,exhaustiveAfterShards:MILLION_WORMHOLE_SHARD_COUNT},selected:rows.slice(0,topK),truthBoundary:'STATIC_PRIOR_ONLY__NOT_BENCHMARKED__UNVISITED_SHARDS_NOT_EVALUATED',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}

export function intelligenceDensity({capabilityGain,computeUnits=0,dollars=0,seconds=0,founderMinutes=0,riskBurden=0}={}){
  const values=[capabilityGain,computeUnits,dollars,seconds,founderMinutes,riskBurden].map(Number);
  if(values.some((value,index)=>!Number.isFinite(value)||(index>0&&value<0))) throw new Error('valid-intelligence-density-input-required');
  return capabilityGain/((1+computeUnits)*(1+dollars)*(1+seconds/60)*(1+founderMinutes)*(1+riskBurden));
}

export function compileRecursiveWormholeRound({shardIndex=0,topK=32,round=0,target='SEARCH_POLICY'}={}){
  const shard=compileMillionWormholeShard({shardIndex,topK,target});
  if(!shard.ok) return shard;
  return {...shard,status:'RECURSIVE_WORMHOLE_ROUND_READY',round,recursiveTarget:target,selfImprovementLaw:'SEARCH_POLICY_MAY_PROPOSE_IMPROVEMENTS_TO_SEARCH_POLICY_BUT_CANNOT_SCORE_OR_PROMOTE_ITS_OWN_CHANGE',nextRound:{round:round+1,shardIndex:shard.coverage.nextShardIndex,target},promotionAuthority:'NONE'};
}
