import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { createInfiniteOpusRuntime } from '../src/infinite-opus-native-runtime.mjs';
import { createOpenRouterGovernedAdapter } from '../src/openrouter-governed-adapter.mjs';
import { COGNITION_PERIMETER_ADMISSION } from '../src/cognition-transport-guard.mjs';

const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const fail=message=>{console.error(JSON.stringify({ok:false,status:'CANARY_REFUSED',reason:String(message)}));process.exit(2);};
const authPath=arg('--authorization'),outputPath=arg('--output');
if(!process.argv.includes('--execute'))fail('--execute-required');
if(!authPath)fail('--authorization-file-required');
const key=String(process.env.OPENROUTER_API_KEY||'');
if(!key)fail('OPENROUTER_API_KEY-runtime-secret-required');
let authorization;
try{authorization=JSON.parse(fs.readFileSync(path.resolve(authPath),'utf8'));}catch(e){fail(`authorization-read-failed:${e.message}`);}
const now=Date.now(),month=new Date(now).toISOString().slice(0,7);
if(authorization?.schemaVersion!=='uberbond.infinite-opus.canary-authorization.v1'||authorization.ownerApproved!==true)fail('explicit-owner-canary-approval-required');
if(!authorization.authorizationId||!Number.isFinite(Date.parse(authorization.expiresAt))||Date.parse(authorization.expiresAt)<=now)fail('unexpired-owner-authorization-required');
if(Number(authorization.maximumSpendUsd)>0.05||Number(authorization.maximumSpendUsd)<=0)fail('canary-max-spend-must-be-0-to-0.05-usd');
if(authorization.model!=='xiaomi/mimo-v2.6-flash'||authorization.task!=='credential-model-billing-tool-smoke-only'||!Array.isArray(authorization.externalEffects)||authorization.externalEffects.length)fail('fixed-no-effect-canary-contract-required');
const route={model:authorization.model,provider:'openrouter',sourceRef:'https://openrouter.ai/xiaomi/mimo-v2.6-flash',verifiedAt:'2026-09-30T00:00:00Z',expiresAt:'2026-10-01T00:00:00Z',contextTokens:1048576,maxOutputTokens:131072,inputUsdPerMillion:0.14,outputUsdPerMillion:0.28,cacheWriteUsdPerMillion:0.14,cacheReadUsdPerMillion:0.0028};
const adapter=createOpenRouterGovernedAdapter({apiKeyProvider:async()=>key,expectedKeyLimitUsd:20,cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION});
const paidExecutor=async payload=>{
 const result=await adapter.execute({model:payload.model,messages:[{role:'system',content:'Return exactly the word OK. Do not use tools, browse, send messages, mutate external state, or claim any effect.'},{role:'user',content:'Credential, model identity, usage and billing smoke test. Reply OK.'}],maxTokens:payload.maxTokens,providerPolicy:{data_collection:'deny'}});
 return {...result,provider:'openrouter',result:result.ok?{message:result.result,upstreamProvider:result.provider,generationReceipt:result.generationReceipt}:null};
};
const store=createStore(config);
try{
 await store.init();
 const runtime=createInfiniteOpusRuntime({store,paidExecutor,paidAuthorization:{evidenceRef:authorization.authorizationId,month,maxMonthlyMicrousd:30000000,expiresAt:authorization.expiresAt,crownRoutes:[]},routePrices:[route],platformFeeRate:0.055});
 const taskId=`canary-${crypto.randomUUID()}`,callId=`or-canary-${crypto.randomUUID()}`,ceilingMicrousd=Math.floor(Number(authorization.maximumSpendUsd)*1e6);
 const prepared=await runtime.preparePaidCall({callId,taskId,model:authorization.model,provider:'openrouter',qualityClass:'CANARY_TRANSPORT_ONLY',role:'WORKER',cacheState:'MISS',ceilingMicrousd});
 if(!prepared.ok){console.log(JSON.stringify({ok:false,status:prepared.status,providerCallsPerformed:0},null,2));process.exitCode=2;}
 else {
  const result=await runtime.dispatchPaidCall(callId,{model:authorization.model,task:{taskId,objective:authorization.task,consequenceClass:'LOCAL_PREPARATION'},maxTokens:8,costCeilingCents:Math.max(1,Math.floor(Number(authorization.maximumSpendUsd)*100))});
  const receipt={...result,authorizationId:authorization.authorizationId,observedAt:new Date().toISOString(),externalEffects:[],secretReturned:false,semanticPromotion:false};
  if(outputPath)fs.writeFileSync(path.resolve(outputPath),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(receipt,null,2)); if(!result.ok)process.exitCode=2;
 }
} finally {await store.close().catch(()=>{});}
