#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { mountSovereignContext } from './sovereign-context-mount.mjs';
import { compileContextProjection } from '../src/context-projection.mjs';

export const SOVEREIGN_CONTEXT_QUERY_VERSION='sovereign-context-query-1.0.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_QUERY_REFUSED',extra={}){return{ok:false,queryVersion:SOVEREIGN_CONTEXT_QUERY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function boundedMission(value){const text=String(value??'').trim();return text&&text.length<=16000?text:null;}
function sourceRoot(candidate){const fallback=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const supplied=String(candidate||'').trim();if(!supplied)return fallback;const resolved=path.resolve(supplied);return resolved;}

export function querySovereignContext({mission,controlDir='/var/lib/uberbond-control',rootDir=null,maxHistory=8,audience='research-worker',generatedAt=new Date()}={}){
  const query=boundedMission(mission);if(!query)return fail(['bounded-context-query-required']);
  if(audience!=='research-worker')return fail(['context-query-audience-must-be-research-worker']);
  const root=sourceRoot(rootDir);const control=path.resolve(controlDir);
  const mounted=mountSovereignContext({rootDir:root,journalPath:path.join(control,'context','events.jsonl'),capsuleCachePath:path.join(control,'context','brainstate.json'),mountCachePath:null,mission:query,maxHistoricalEvents:maxHistory,generatedAt});
  if(!mounted.ok)return fail(['verified-context-mount-required',...(mounted.reasonCodes||[])],'CONTEXT_QUERY_MOUNT_REFUSED',{contextMountStatus:mounted.status});
  const projected=compileContextProjection({mountResult:mounted,audience:'research-worker',maxHistory});
  if(!projected.ok)return fail(['research-context-projection-required',...(projected.reasonCodes||[])]);
  return{ok:true,queryVersion:SOVEREIGN_CONTEXT_QUERY_VERSION,status:'CONTEXT_QUERY_READY',projection:projected.projection,sourceCommit:projected.projection.sourceCommit,brainstateId:projected.projection.brainstateId,contextMountId:projected.projection.contextMountId,projectionId:projected.projection.projectionId,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'The query text is a transient retrieval mission. This helper does not persist a mission-specific mount or turn the query into cognitive evidence.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const mission=process.argv.slice(2).join(' ').trim();const result=querySovereignContext({mission,controlDir:process.env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control',rootDir:process.env.UBERBOND_SOURCE_ROOT||null,maxHistory:Number(process.env.UBERBOND_CONTEXT_QUERY_MAX_HISTORY||8)});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
