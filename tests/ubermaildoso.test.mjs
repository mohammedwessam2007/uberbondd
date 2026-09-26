import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberMaildosoAdapter } from '../src/ubermaildoso.mjs';

function fakeFetch(handler){
  return async(url,options)=>{
    const out=await handler(String(url),options);
    return {
      ok:out.status>=200&&out.status<300,
      status:out.status,
      headers:{get:name=>name==='x-request-id'?'req-1':null},
      text:async()=>JSON.stringify(out.body??{})
    };
  };
}
const approval={authorized:true,receiptId:'owner-1',authorizedBy:'founder',scopes:['createAccounts'],expiresAt:'2099-01-01T00:00:00.000Z'};

test('read routes use PAT without exposing it in receipts',async()=>{
  let auth='';
  const a=createUberMaildosoAdapter({token:'super-secret',fetchImpl:fakeFetch(async(_u,o)=>{auth=o.headers.authorization;return{status:200,body:{ok:true}};})});
  const r=await a.read('stats');
  assert.equal(r.ok,true);
  assert.equal(auth,'Bearer super-secret');
  assert.equal(JSON.stringify(r).includes('super-secret'),false);
});

test('mutations fail closed without exact owner scope',async()=>{
  const a=createUberMaildosoAdapter({token:'x',fetchImpl:fakeFetch(async()=>({status:200,body:{}}))});
  const r=await a.mutate('createAccounts',{body:{count:10},approval:{...approval,scopes:['createDomains']}});
  assert.equal(r.ok,false);
  assert.equal(r.providerCalls,0);
  assert.ok(r.reasonCodes.includes('authorization-scope-required'));
});

test('confirmed mutation returns a redacted provider receipt',async()=>{
  const a=createUberMaildosoAdapter({token:'x',fetchImpl:fakeFetch(async(url,o)=>{
    assert.match(url,/\/v1\/user\/accounts$/);
    assert.equal(o.method,'POST');
    return{status:201,body:{created:3}};
  })});
  const r=await a.mutate('createAccounts',{body:{accounts:[1,2,3]},approval});
  assert.equal(r.ok,true);
  assert.equal(r.status,'UBERMAILDOSO_MUTATION_CONFIRMED');
  assert.equal(r.receipt.status,201);
  assert.equal(r.externalEffects,1);
});

test('thrown mutation is uncertain and never blindly retryable',async()=>{
  const a=createUberMaildosoAdapter({token:'x',fetchImpl:async()=>{throw new Error('socket reset');}});
  const r=await a.mutate('createAccounts',{body:{},approval});
  assert.equal(r.ok,false);
  assert.equal(r.status,'UBERMAILDOSO_MUTATION_OUTCOME_UNCERTAIN');
  assert.equal(r.automaticRetryAuthorized,false);
});

test('provider-returned mailbox secrets are redacted',async()=>{
  const a=createUberMaildosoAdapter({token:'x',fetchImpl:fakeFetch(async()=>({status:200,body:{email:'a@example.com',password:'mailbox-pass',nested:{totp:'123456'}}}))});
  const r=await a.read('accountsLookup');
  assert.equal(r.data.password,'[REDACTED]');
  assert.equal(r.data.nested.totp,'[REDACTED]');
  assert.equal(JSON.stringify(r).includes('mailbox-pass'),false);
});
