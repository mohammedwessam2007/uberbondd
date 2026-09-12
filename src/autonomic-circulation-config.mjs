export const AUTONOMIC_CIRCULATION_CONFIG_VERSION='uberbond.autonomic-circulation-config.v1';
const bool=(value,fallback=false)=>value==null?fallback:String(value).trim().toLowerCase()==='true';
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
export function autonomicCirculationConfigFromEnv(env=process.env){
  return {
    version:AUTONOMIC_CIRCULATION_CONFIG_VERSION,
    enabled:bool(env.AUTONOMIC_CIRCULATION_ENABLED,false),
    intervalMs:Math.max(15_000,Math.min(15*60_000,number(env.AUTONOMIC_CIRCULATION_INTERVAL_MS,60_000))),
    authority:'LOCAL_PREPARATION_ONLY'
  };
}
