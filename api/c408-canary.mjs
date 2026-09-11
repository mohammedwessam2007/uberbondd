import crypto from 'node:crypto';
import { runSovereignContextDoctor } from '../scripts/sovereign-context-doctor.mjs';
import { compileContextMount } from '../src/context-history-retrieval.mjs';
import { compileContextProjection } from '../src/context-projection.mjs';
import { createVercelAIGatewayExecutor } from '../src/vercel-ai-gateway-executor.mjs';

const REV='c40843d55cca9110ab9661524f5cd662d00dec6d';
const MODEL='inclusionai/ling-3.0-flash-sante-free';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const digest=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
function send(res,status,payload){if(typeof res.status==='function'&&typeof res.json==='function')return res.status(status).json(payload);res.writeHead(status,headers);res.end(JSON.stringify(payload));}
export default async function handler(req,res){
 if(String(req?.method||'').toUpperCase()!=='GET')return send(res,405,{ok:false,status:'REFUSED'});
 const key=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||'';
 if(!key)return send(res,503,{ok:false,status:'PROVIDER_UNAVAILABLE'});
 const doctor=runSovereignContextDoctor({rootDir:process.cwd(),sourceCommit:REV,mission:'frozen verification canary'});
 if(!doctor.ok)return send(res,500,{ok:false,status:'CONTEXT_REFUSED',reasonCodes:doctor.reasonCodes||[]});
 const mount=compileContextMount({doctorResult:doctor,journalEntries:[],mission:'frozen verification canary',maxHistoricalEvents:0,recompiledFromStale:false});
 if(!mount.ok)return send(res,500,{ok:false,status:'MOUNT_REFUSED',reasonCodes:mount.reasonCodes||[]});
 const projected=compileContextProjection({mountResult:mount,audience:'founder-dialogue',maxHistory:0});
 if(!projected.ok)return send(res,500,{ok:false,status:'PROJECTION_REFUSED',reasonCodes:projected.reasonCodes||[]});
 const executor=createVercelAIGatewayExecutor({apiKey:key,enabled:true,defaultModel:MODEL,pricing:{inputUsdPerMillion:0,outputUsdPerMillion:0,sourceRef:'free-model-verification',verifiedAt:new Date().toISOString()}});
 const objective=`Return only structured JSON with answer equal to 42. Verified UberBond context projection: ${JSON.stringify(projected.projection).slice(0,40000)}`;
 const result=await executor({task:{taskId:'c408_canary',objective,originAgent:'verification',targetAgent:'ai-gateway',contextRefs:[`candidate:${REV}`],evidenceRefs:[`candidate:${REV}`],constraints:['local-only'],forbiddenActions:['send','spend','deploy'],requiredOutputs:['answer'],acceptanceTests:[],economicObjective:'correct answer',consequenceClass:'LOCAL_PREPARATION'},model:MODEL,maxTokens:80,costCeilingCents:0});
 const answer=String(result?.result?.answer??'').trim();
 return send(res,result?.ok?200:502,{ok:result?.ok===true,status:result?.ok?'C408_CANARY_OBSERVED':'C408_CANARY_FAILED',candidateRevision:REV,sourceCommit:doctor.sourceCommit,model:MODEL,correct:answer==='42',answerDigest:answer?digest(answer):null,usage:result?.usage||null,reasonCodes:result?.reasonCodes||[],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'ONE PRIVATE FROZEN-CONTEXT CANARY ONLY; NOT ASI EVIDENCE.'});
}
