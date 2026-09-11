#!/usr/bin/env node
import crypto from 'node:crypto';

const endpoint='https://ai-gateway.vercel.sh/v1/chat/completions';
const model='inclusionai/ling-3.0-flash-sante-free';
const credential=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||'';
const zero={customerMessages:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0};
const fail=(status,reasonCodes,extra={})=>{console.error(JSON.stringify({ok:false,status,reasonCodes,model,credentialPresent:Boolean(credential),credentialSource:process.env.AI_GATEWAY_API_KEY?'AI_GATEWAY_API_KEY':(process.env.VERCEL_OIDC_TOKEN?'VERCEL_OIDC_TOKEN':'NONE'),businessEffectAuthority:'NONE',externalEffectLedger:{...zero,providerCalls:0},...extra}));process.exit(2);};
if(!credential) fail('PROVIDER_CANARY_AUTH_UNAVAILABLE',['ai-gateway-key-or-vercel-oidc-required']);
const challenge=`UBERBOND_PROVIDER_CANARY_${crypto.createHash('sha256').update(String(process.env.VERCEL_GIT_COMMIT_SHA||'unknown')).digest('hex').slice(0,16)}`;
let response;
try{
  response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${credential}`,'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'Return only the exact user token. No explanation.'},{role:'user',content:challenge}],max_tokens:40,temperature:0,stream:false})});
}catch(error){fail('PROVIDER_CANARY_NETWORK_FAILED',['gateway-network-call-failed'],{errorClass:error?.name||'Error'});}
const text=await response.text();let body=null;try{body=JSON.parse(text)}catch{}
if(!response.ok) fail('PROVIDER_CANARY_HTTP_FAILED',['gateway-returned-non-success'],{httpStatus:response.status});
const answer=String(body?.choices?.[0]?.message?.content||'').trim();
if(answer!==challenge) fail('PROVIDER_CANARY_SEMANTIC_FAILED',['exact-canary-echo-mismatch'],{httpStatus:response.status,responsePresent:Boolean(answer)});
console.log(JSON.stringify({ok:true,status:'PROVIDER_CALLABILITY_OBSERVED',model,providerEndpoint:'VERCEL_AI_GATEWAY',credentialSource:process.env.AI_GATEWAY_API_KEY?'AI_GATEWAY_API_KEY':'VERCEL_OIDC_TOKEN',sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||null,sourceBranch:process.env.VERCEL_GIT_COMMIT_REF||null,responseDigest:crypto.createHash('sha256').update(answer).digest('hex'),usage:body?.usage||null,businessEffectAuthority:'NONE',externalEffectLedger:{...zero,providerCalls:1},truthBoundary:'ONE_OBSERVED_FREE_MODEL_PROVIDER_CALL_ONLY__NOT_GENERAL_INTELLIGENCE_OR_ASI_EVIDENCE'}));
