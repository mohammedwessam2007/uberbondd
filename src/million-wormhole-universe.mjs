import crypto from 'node:crypto';

export const MILLION_WORMHOLE_UNIVERSE_VERSION = 'uberbond.million-wormhole-universe.v1';
export const MILLION_WORMHOLE_CANDIDATE_COUNT = 1_048_576;
export const MILLION_WORMHOLE_SHARD_COUNT = 4096;
export const MILLION_WORMHOLE_SHARD_SIZE = 256;

const ORGAN_FAMILIES = Object.freeze(['Sovereign Reality Compiler','World Brain','Reality Graph','Truth Engine','Context Spine','Gamechanger','GENESIS','Business Genome','Opportunity Factory','Capability Genome','Open Model Universe','Avengers Arsenal','MAX Council','Temporal Foundry','Timeline Topology Wormhole','Sandwich Governor','Connectome Autopoiesis','Self-Maintainer','Economic Metabolism','UberGraph','UberMind','UberDNA','Sovereign Compute Cell Fabric','UberCloud Ubercel','Agent Mesh','Memory Fabric','Capability Lab','Security Immune System','Distribution Revenue OS','Payment Reconciliation','Personal Civilization Engine','Forge Physical Reality Bridge']);
const ORGAN_FUNCTIONS = Object.freeze(['observe','represent','retrieve','reason','route','compress','verify','self_improve']);
const OPERATORS = Object.freeze(Array.from({length:64},(_,index)=>`operator-${String(index+1).padStart(2,'0')}`));
const SUBSTRATES = Object.freeze(['LOCAL_CPU','LOCAL_GPU_NPU','EDGE_PEER_MESH','BURST_RENTED_ACCELERATOR','FRONTIER_MODEL_API','OPEN_MODEL_MESH','SYMBOLIC_FORMAL_STACK','WORLD_TOOL_MEMORY_FABRIC']);
const VERIFIERS = Object.freeze(['DETERMINISTIC_TEST','HOSTILE_ADVERSARIAL','HELDOUT_BENCHMARK','FORMAL_PROPERTY','COUNTERFACTUAL_ABLATION','ECONOMIC_REAL_WORLD','LONGITUDINAL_OUTCOME','INDEPENDENT_PANEL']);

export function decodeMillionWormholeIndex(index){
  if(!Number.isSafeInteger(index)||index<0||index>=MILLION_WORMHOLE_CANDIDATE_COUNT) throw new Error('candidate-index-out-of-range');
  const verifierId=index%8; let q=Math.floor(index/8); const substrateId=q%8; q=Math.floor(q/8); const operatorId=q%64; q=Math.floor(q/64); const organFunctionId=q%8; const organFamilyId=Math.floor(q/8);
  return {organFamilyId,organFunctionId,operatorId,substrateId,verifierId};
}

export function encodeMillionWormholeIndex(a){
  const xs=[[a.organFamilyId,32],[a.organFunctionId,8],[a.operatorId,64],[a.substrateId,8],[a.verifierId,8]];
  if(xs.some(([n,m])=>!Number.isSafeInteger(n)||n<0||n>=m)) throw new Error('candidate-axis-out-of-range');
  return ((((a.organFamilyId*8+a.organFunctionId)*64+a.operatorId)*8+a.substrateId)*8+a.verifierId);
}

export function renderMillionWormholeCandidate(index){
  const a=decodeMillionWormholeIndex(index);
  const organ=`${ORGAN_FAMILIES[a.organFamilyId]}::${ORGAN_FUNCTIONS[a.organFunctionId]}`;
  const id=crypto.createHash('sha256').update(`UBMW1|${index}|${a.organFamilyId}|${a.organFunctionId}|${a.operatorId}|${a.substrateId}|${a.verifierId}`).digest('hex').slice(0,20);
  return {index,id:`mw-${id}`,organ,operator:OPERATORS[a.operatorId],substrate:SUBSTRATES[a.substrateId],verification:VERIFIERS[a.verifierId],status:'HYPOTHESIS',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
}
