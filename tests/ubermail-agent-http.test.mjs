import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createUberMailAgentApi } from '../src/ubermail-agent-api.mjs';
import { createUberMailAgentHttp } from '../src/ubermail-agent-http.mjs';
import { createFileUberMailRepository } from '../src/ubermail-file-repository.mjs';

function approval(){return{granted:true,grantedBy:'owner:test',scope:['ubermail:send'],expiresAt:'2035-01-01T00:00:00.000Z'};}
async function setup(){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ubermail-test-'));
  const repo=createFileUberMailRepository({filePath:path.join(dir,'state.json')});
  const sends=[];
  const api=createUberMailAgentApi({repository:repo,now:()=>new Date('2026-09-19T00:00:00Z'),webhookMasterSecret:'master',domainVerifier:async()=>({verified:true,records:[]}),sendTransport:async p=>{sends.push(p);return{ok:true,providerReferenceId:'postal-http-'+sends.length};}});
  const root=await api.bootstrapRootKey();
  const http=createUberMailAgentHttp({api});
  const headers={authorization:'Bearer '+root.api_key};
  return{dir,repo,api,http,headers,sends};
}

test('HTTP facade exposes AgentMail-shaped /v0 lifecycle over durable state',async t=>{
  const f=await setup();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));
  let r=await f.http({method:'POST',path:'/v0/pods',headers:{...f.headers,'idempotency-key':'pod'},body:{name:'Primary'}});assert.equal(r.status,201);const pod=r.body;
  r=await f.http({method:'POST',path:'/v0/domains',headers:{...f.headers,'idempotency-key':'domain'},body:{domain:'uberbond.agency',pod_id:pod.pod_id}});const domain=r.body;
  r=await f.http({method:'POST',path:`/v0/domains/${domain.domain_id}/verify`,headers:{...f.headers,'idempotency-key':'verify'}});assert.equal(r.body.status,'verified');
  r=await f.http({method:'POST',path:'/v0/inboxes',headers:{...f.headers,'idempotency-key':'inbox'},body:{username:'mohamed',domain:'uberbond.agency',pod_id:pod.pod_id,display_name:'Mohamed'}});const inbox=r.body;assert.equal(inbox.email,'mohamed@uberbond.agency');
  r=await f.http({method:'GET',path:'/v0/inboxes/search?q=moh',headers:f.headers});assert.equal(r.body.count,1);
  r=await f.http({method:'POST',path:`/v0/inboxes/${inbox.inbox_id}/messages/send`,headers:{...f.headers,'idempotency-key':'send-1'},effectApproval:approval(),body:{to:'a@example.com',subject:'Hi',text:'Body'}});assert.equal(r.status,201);const msg=r.body;
  r=await f.http({method:'POST',path:`/v0/inboxes/${inbox.inbox_id}/messages/${msg.message_id}/reply`,headers:{...f.headers,'idempotency-key':'reply-1'},effectApproval:approval(),body:{to:'a@example.com',text:'Reply'}});assert.equal(r.body.thread_id,msg.thread_id);
  r=await f.http({method:'GET',path:'/v0/threads/search?q=hi',headers:f.headers});assert.ok(r.body.count>=1);
  r=await f.http({method:'GET',path:'/v0/metrics',headers:f.headers});assert.equal(r.body.sent,2);
  const onDisk=JSON.parse(await fs.readFile(f.repo.filePath,'utf8'));assert.equal(Object.keys(onDisk.inboxes).length,1);assert.equal(Object.keys(onDisk.messages).length,2);
  const mode=(await fs.stat(f.repo.filePath)).mode & 0o777;assert.equal(mode,0o600);
});

test('HTTP facade does not accept self-asserted approval headers',async t=>{
  const f=await setup();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));
  const pod=(await f.http({method:'POST',path:'/v0/pods',headers:{...f.headers,'idempotency-key':'p'},body:{}})).body;
  const d=(await f.http({method:'POST',path:'/v0/domains',headers:{...f.headers,'idempotency-key':'d'},body:{domain:'uberbond.agency',pod_id:pod.pod_id}})).body;
  await f.http({method:'POST',path:`/v0/domains/${d.domain_id}/verify`,headers:{...f.headers,'idempotency-key':'v'}});
  const inbox=(await f.http({method:'POST',path:'/v0/inboxes',headers:{...f.headers,'idempotency-key':'i'},body:{username:'mohamed',domain:'uberbond.agency'}})).body;
  const denied=await f.http({method:'POST',path:`/v0/inboxes/${inbox.inbox_id}/messages/send`,headers:{...f.headers,'idempotency-key':'s','x-owner-approved':'true'},body:{to:'a@example.com',subject:'No',text:'No'}});
  assert.equal(denied.status,403);assert.equal(denied.body.error,'effect-approval-required');assert.equal(f.sends.length,0);
});

test('durable repository survives API recreation and raw secrets remain absent',async t=>{
  const f=await setup();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));
  const pod=await f.api.createPod({auth:{system:true},name:'Persistent'});
  const api2=createUberMailAgentApi({repository:createFileUberMailRepository({filePath:f.repo.filePath}),requireEffectApproval:true});
  const snap=await api2.snapshot({auth:{system:true}});
  assert.equal(snap.pods[pod.pod_id].name,'Persistent');
  const disk=await fs.readFile(f.repo.filePath,'utf8');
  const rawToken=f.headers.authorization.slice('Bearer '.length);assert.equal(disk.includes(rawToken),false);assert.equal(disk.includes('secretHash'),true);
});

test('HTTP scoped resource routes and reply-draft routes stay inside pod/inbox boundaries',async t=>{
  const f=await setup();t.after(()=>fs.rm(f.dir,{recursive:true,force:true}));
  const p1=await f.api.createPod({auth:{apiKey:f.headers.authorization.slice(7)},name:'One',idempotencyKey:'nested:p1'});
  const p2=await f.api.createPod({auth:{apiKey:f.headers.authorization.slice(7)},name:'Two',idempotencyKey:'nested:p2'});
  const d1=await f.api.createDomain({auth:{apiKey:f.headers.authorization.slice(7)},domain:'nested.example',podId:p1.pod_id,subdomainsEnabled:true,idempotencyKey:'nested:d1'});
  await f.api.verifyDomain({auth:{apiKey:f.headers.authorization.slice(7)},domainId:d1.domain_id,idempotencyKey:'nested:v1'});
  const i1=await f.api.createInbox({auth:{apiKey:f.headers.authorization.slice(7)},username:'mohamed',domain:'sub.nested.example',podId:p1.pod_id,idempotencyKey:'nested:i1'});
  const d2=await f.api.createDomain({auth:{apiKey:f.headers.authorization.slice(7)},domain:'other.example',podId:p2.pod_id,idempotencyKey:'nested:d2'});
  await f.api.verifyDomain({auth:{apiKey:f.headers.authorization.slice(7)},domainId:d2.domain_id,idempotencyKey:'nested:v2'});
  await f.api.createInbox({auth:{apiKey:f.headers.authorization.slice(7)},username:'other',domain:'other.example',podId:p2.pod_id,idempotencyKey:'nested:i2'});
  let r=await f.http({method:'GET',path:`/v0/pods/${p1.pod_id}/inboxes`,headers:f.headers});
  assert.equal(r.body.count,1);assert.equal(r.body.inboxes[0].inbox_id,i1.inbox_id);
  r=await f.http({method:'POST',path:`/v0/pods/${p1.pod_id}/webhooks`,headers:{...f.headers,'idempotency-key':'nested:hook'},body:{url:'https://hooks.example.test/nested',event_types:['message.received'],headers:{Authorization:'secret'}}});
  assert.equal(r.status,201);assert.equal('headers' in r.body,false);
  r=await f.http({method:'POST',path:`/v0/inboxes/${i1.inbox_id}/api-keys`,headers:{...f.headers,'idempotency-key':'nested:key'},body:{name:'Inbox scoped'}});
  assert.equal(r.status,201);assert.equal(r.body.inbox_id,i1.inbox_id);
  const incoming=await f.api.ingestReceivedMessage({auth:{system:true},inboxId:i1.inbox_id,from:'buyer@example.com',subject:'Question',text:'Hello'});
  r=await f.http({method:'POST',path:`/v0/inboxes/${i1.inbox_id}/messages/${incoming.message_id}/reply-draft`,headers:{...f.headers,'idempotency-key':'nested:reply-draft'},body:{text:'Draft'}});
  assert.equal(r.status,201);assert.equal(r.body.in_reply_to,incoming.message_id);
});
