import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createUberMailRuntime, defaultUberMailStatePath } from '../src/ubermail-runtime.mjs';

test('runtime chooses explicit UberLit-aware durable paths',()=>{
  assert.equal(defaultUberMailStatePath({env:{UBERMAIL_STATE_PATH:'/tmp/custom.json'},cwd:'/work'}),'/tmp/custom.json');
  assert.equal(defaultUberMailStatePath({env:{UBERLIT_RUNTIME_ROOT:'/var/lib/uberlit/uberbond'},cwd:'/work'}),'/var/lib/uberlit/uberbond/state/ubermail-agent-api.json');
  assert.equal(defaultUberMailStatePath({env:{},cwd:'/work'}),'/work/.data/ubermail-agent-api.json');
});

test('runtime persists API state and remains fail-closed without governed dispatch',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ubermail-runtime-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const statePath=path.join(dir,'state.json');
  const runtime=createUberMailRuntime({statePath,webhookMasterSecret:'test-master',domainVerifier:async()=>({verified:true,records:[]}),now:()=>new Date('2026-09-19T00:00:00Z')});
  const root=await runtime.bootstrapRootKey();const auth={apiKey:root.api_key};
  const domain=await runtime.api.createDomain({auth,domain:'runtime.example',idempotencyKey:'d'});await runtime.api.verifyDomain({auth,domainId:domain.domain_id,idempotencyKey:'v'});
  const inbox=await runtime.api.createInbox({auth,username:'mohamed',domain:'runtime.example',idempotencyKey:'i'});
  await assert.rejects(()=>runtime.api.sendMessage({auth,inboxId:inbox.inbox_id,to:['buyer@example.com'],subject:'Hi',text:'Body',relationship:'USER_INITIATED',approval:{granted:true,grantedBy:'owner:test',scope:['ubermail:send'],expiresAt:'2035-01-01T00:00:00Z'},idempotencyKey:'s'}),error=>error.code==='send-rejected'&&String(error.detail||'').includes('governed-uberdoso-dispatch-not-configured'));
  const restarted=createUberMailRuntime({statePath,webhookMasterSecret:'test-master'});
  const listed=await restarted.api.listInboxes({auth});assert.equal(listed.count,1);
  const status=await restarted.status();assert.equal(status.ok,true);assert.equal(status.externalEffectAuthority,'NONE');
});

test('governed dispatch can be injected without weakening receipt binding',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ubermail-runtime-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  let call;
  const runtime=createUberMailRuntime({statePath:path.join(dir,'state.json'),domainVerifier:async()=>({verified:true,records:[]}),governedDispatch:async request=>{call=request;return{authorized:true,executed:true,accepted:true,providerReferenceId:'postal-1',payloadDigest:request.payloadDigest,authorizationDigest:'a'.repeat(64),policyDigest:'b'.repeat(64)};}});
  const root=await runtime.bootstrapRootKey();const auth={apiKey:root.api_key};const domain=await runtime.api.createDomain({auth,domain:'governed.example'});await runtime.api.verifyDomain({auth,domainId:domain.domain_id});const inbox=await runtime.api.createInbox({auth,username:'mohamed',domain:'governed.example'});
  const sent=await runtime.api.sendMessage({auth,inboxId:inbox.inbox_id,to:['buyer@example.com'],subject:'Hi',text:'Body',relationship:'USER_INITIATED',approval:{granted:true,grantedBy:'owner:test',scope:['ubermail:send'],expiresAt:'2035-01-01T00:00:00Z'},idempotencyKey:'send'});
  assert.equal(sent.provider_reference_id,'postal-1');assert.equal(call.consequenceClass,'COMMUNICATE_EXTERNAL');
});
