import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectNativeCliAuth } from '../src/phoenix-native-cli-health.mjs';
import { runPhoenixCosCommand } from '../scripts/phoenix-cos-operator.mjs';

const instant='2026-10-19T00:00:00Z';
const cases=(claude,codex)=>binary=>binary==='claude'?claude:codex;

test('positive fixture is sanitized, source-classified, and never exposes secrets',()=>{
  const r=inspectNativeCliAuth({now:instant,run:cases(
    {status:0,stdout:JSON.stringify({loggedIn:true,apiKey:'SECRET_NEVER_LOG',email:'PII@example.com'})},
    {status:0,stdout:'Logged in using ChatGPT\nRefresh: SECRET_NEVER_LOG'}
  )});
  assert.equal(r.ok,true);
  assert.deepEqual(r.clients.map(x=>x.status),['AUTHENTICATED_CLI_REPORTED','AUTHENTICATED_CLI_REPORTED']);
  assert.match(r.receiptDigest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(r).includes('SECRET_NEVER_LOG'),false);
  assert.equal(JSON.stringify(r).includes('PII@example.com'),false);
  assert.equal(r.signatureStatus,'UNSIGNED_SHA256_RECEIPT_NOT_TRUSTED_PROVIDER_ATTESTATION');
  assert.ok(r.clients.every(c=>c.actualModelTurnObserved===false));
});

test('negative, missing CLI, and unknown results never claim authenticated identity',()=>{
  const result=inspectNativeCliAuth({now:instant,run:cases(
    {status:1,stdout:'{"loggedIn":false}'},
    {status:1,stderr:'Not logged in'}
  )});
  assert.deepEqual(result.clients.map(x=>x.status),['NOT_AUTHENTICATED_CLI_REPORTED','NOT_AUTHENTICATED_CLI_REPORTED']);
  const missing=inspectNativeCliAuth({now:instant,run:()=>({error:{code:'ENOENT'}})});
  assert.ok(missing.clients.every(x=>x.status==='CLI_NOT_FOUND'));
  const timeout=inspectNativeCliAuth({now:instant,run:()=>({error:{code:'ETIMEDOUT'}})});
  assert.ok(timeout.clients.every(x=>x.status==='STATUS_TIMED_OUT'));
  const ambiguous=inspectNativeCliAuth({now:instant,run:()=>({status:0,stdout:'not a known format'})});
  assert.ok(ambiguous.clients.every(x=>x.status==='UNKNOWN_FROM_LOCAL_STATUS'));
});

test('exact command allowlist denies shell interpretation and network/purchase methods',()=>{
  const seen=[];
  const r=inspectNativeCliAuth({now:instant,run:(bin,args,options)=>{
    seen.push({bin,args,options});
    return {status:1,stdout:'Not logged in'};
  }});
  assert.equal(r.ok,true);
  assert.deepEqual(seen.map(v=>[v.bin,...v.args]),[
    ['claude','auth','status','--json'],
    ['codex','login','status']
  ]);
  assert.ok(seen.every(x=>x.options.shell===false && x.options.timeout<=7000 && x.options.maxBuffer<=8192));
});

test('receipt is deterministic under fixed evidence and fails without valid clock',()=>{
  const run=cases({status:1,stdout:'{"loggedIn":false}'},{status:1,stdout:'Not logged in'});
  assert.deepEqual(inspectNativeCliAuth({now:instant,run}),inspectNativeCliAuth({now:instant,run}));
  assert.equal(inspectNativeCliAuth({now:'invalid',run}).ok,false);
});

test('CoS command exposes only safe local auth summary, without opening login',()=>{
  const r=runPhoenixCosCommand(['cli-auth']);
  assert.equal(r.ok,true);
  assert.equal(r.clients.length,2);
  assert.ok(r.clients.every(x=>[
    'CLI_NOT_FOUND','STATUS_TIMED_OUT','UNKNOWN_FROM_LOCAL_STATUS',
    'AUTHENTICATED_CLI_REPORTED','NOT_AUTHENTICATED_CLI_REPORTED'
  ].includes(x.status)));
  assert.equal(r.externalEffectAuthority,'NONE');
  assert.equal(r.businessEffectAuthority,'NONE');
});
