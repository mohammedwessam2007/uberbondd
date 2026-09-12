export const SOURCE_GENESIS_VERSION='uberbond.source-genesis.v1';
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
