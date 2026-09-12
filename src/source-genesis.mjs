export const SOURCE_GENESIS_VERSION='uberbond.source-genesis.v2';
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const id=v=>String(v??'').trim().toLowerCase();

export function scoreSource(input={}){
 const useful=Math.max(0,num(input.uniqueUsefulDiscoveries));
 const gain=Math.max(0.0001,num(input.northStarGain));
 const fresh=Math.max(0.0001,num(input.freshnessValue));
 const burden=1+Math.max(0,num(input.apiCostUsd))+Math.max(0,num(input.computeCostUsd))+Math.max(0,num(input.storageCostUsd))+Math.max(0,num(input.founderMinutes));
 return useful*gain*fresh/burden;
}

export function proposeSource(input={}){
 if(!id(input.sourceId)) throw new Error('sourceId required');
 return {version:SOURCE_GENESIS_VERSION,sourceId:id(input.sourceId),score:scoreSource(input),state:'DISCOVERED',requiredChecks:['access','rights','quota','provenance','trust']};
}

export function rankSources(inputs=[]){
 return inputs.map(proposeSource).sort((a,b)=>b.score-a.score);
}

export function discoverSourceCandidatesFromLinks(links=[]){
 const hosts=new Map();
 for(const raw of links){
  try{
   const url=new URL(String(raw));
   if(!['http:','https:'].includes(url.protocol)) continue;
   const host=url.hostname.toLowerCase().replace(/^www\./,'');
   if(!host) continue;
   hosts.set(host,(hosts.get(host)||0)+1);
  }catch{}
 }
 return [...hosts.entries()].map(([sourceId,observations])=>proposeSource({sourceId,uniqueUsefulDiscoveries:observations,northStarGain:1,freshnessValue:1})).sort((a,b)=>b.score-a.score||a.sourceId.localeCompare(b.sourceId));
}
