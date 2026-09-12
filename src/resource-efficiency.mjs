export const RESOURCE_EFFICIENCY_VERSION='uberbond.resource-efficiency.v1';
const n=v=>Number.isFinite(Number(v))?Number(v):0;
export function scoreResourceEfficiency({measuredGain=0,joules=0,bytes=0,costUsd=0,seconds=0,founderMinutes=0}={}){
 const gain=Math.max(0,n(measuredGain));
 const burden=1+Math.max(0,n(joules))/1e6+Math.max(0,n(bytes))/1e9+Math.max(0,n(costUsd))+Math.max(0,n(seconds))/3600+Math.max(0,n(founderMinutes));
 return {version:RESOURCE_EFFICIENCY_VERSION,gain,burden,fitness:gain/burden};
}
