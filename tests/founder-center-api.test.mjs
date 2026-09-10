import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, FREE_MODEL } from '../api/founder-center.mjs';

function invoke(handler,{method='GET',body=null,headers={}}={}){
  return new Promise((resolve,reject)=>{
    const req={method,body,headers};
    const res={statusCode:200,status(n){this.statusCode=n;return this},json(payload){resolve({status:this.statusCode,payload});}};
    Promise.resolve(handler(req,res)).catch(reject);
  });
}

test('status reports server-backed free-only model and relay readiness without secrets',async()=>{
  const h=createHandler({env:{VERCEL_OIDC_TOKEN:'secret-oidc',GITHUB_TOKEN:'secret-gh',GITHUB_REPOSITORY:'o/r',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),VERCEL_ENV:'preview'}});
  const r=await invoke(h);
  assert.equal(r.status,200); assert.equal(r.payload.model,FREE_MODEL); assert.equal(r.payload.modelPricing,'FREE_ONLY_NO_PAID_FALLBACK'); assert.equal(r.payload.modelReady,true); assert.equal(r.payload.relayReady,true); assert.doesNotMatch(JSON.stringify(r.payload),/secret-oidc|secret-gh/);
});

test('chat uses Vercel OIDC against the fixed free model',async()=>{
  let seen;
  const h=createHandler({env:{VERCEL_OIDC_TOKEN:'oidc-token',VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)},root:'/definitely/missing',fetch:async(url,init)=>{seen={url,init,body:JSON.parse(init.body)};return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'server answer'}}],usage:{total_tokens:12}})};}});
  const r=await invoke(h,{method:'POST',headers:{host:'center.test',origin:'https://center.test'},body:{action:'chat',message:'hello',history:[{role:'user',content:'prior'}]}});
  assert.equal(r.status,200); assert.equal(r.payload.answer,'server answer'); assert.equal(seen.url,'https://ai-gateway.vercel.sh/v1/chat/completions'); assert.equal(seen.init.headers.authorization,'Bearer oidc-token'); assert.equal(seen.body.model,FREE_MODEL); assert.equal(seen.body.stream,false);
});

test('chat fails closed when no Gateway credential exists',async()=>{
  const h=createHandler({env:{},root:'/missing',fetch:async()=>{throw new Error('must not call')}});
  const r=await invoke(h,{method:'POST',headers:{host:'c.test',origin:'https://c.test'},body:{action:'chat',message:'hello'}});
  assert.equal(r.status,503); assert.equal(r.payload.status,'MODEL_AUTH_UNAVAILABLE');
});

test('keep-working refuses honestly when GitHub runtime credential is absent',async()=>{
  const h=createHandler({env:{VERCEL_GIT_REPO_OWNER:'o',VERCEL_GIT_REPO_SLUG:'r'}});
  const r=await invoke(h,{method:'POST',headers:{host:'c.test',origin:'https://c.test'},body:{action:'keep-working'}});
  assert.equal(r.status,409); assert.equal(r.payload.status,'RELAY_NOT_CONFIGURED');
});

test('keep-working compiles a generic privacy-preserving relay task',async()=>{
  let call;
  const h=createHandler({env:{GITHUB_TOKEN:'gh',GITHUB_REPOSITORY:'o/r',VERCEL_GIT_COMMIT_SHA:'c'.repeat(40)},fetch:async()=>{throw new Error('client should not execute in injected relay')},createRelayTask:async args=>{call=args;return {ok:true,status:'QUEUED',taskId:args.input.taskId,issueNumber:7,issueUrl:'https://github.test/7'}}});
  const r=await invoke(h,{method:'POST',headers:{host:'c.test',origin:'https://c.test'},body:{action:'keep-working',message:'PRIVATE FOUNDER SECRET'}});
  assert.equal(r.status,200); assert.equal(r.payload.status,'QUEUED');
  const serialized=JSON.stringify(call.input);
  assert.doesNotMatch(serialized,/PRIVATE FOUNDER SECRET/);
  assert.match(call.input.objective,/exact-current self-completion/);
  assert.equal(call.input.targetAgent,'claude-code');
  assert.equal(call.input.consequenceClass,'LOCAL_PREPARATION');
  assert.equal(call.input.budget.maxCostCents,0);
});

test('cross-origin POST is refused before model or relay work',async()=>{
  const h=createHandler({env:{VERCEL_OIDC_TOKEN:'oidc'},fetch:async()=>{throw new Error('must not call')}});
  const r=await invoke(h,{method:'POST',headers:{host:'good.test',origin:'https://evil.test'},body:{action:'chat',message:'x'}});
  assert.equal(r.status,403); assert.equal(r.payload.status,'CROSS_ORIGIN_REFUSED');
});
