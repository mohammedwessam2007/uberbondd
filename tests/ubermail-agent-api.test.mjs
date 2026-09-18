import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUberMailAgentApi,
  createMemoryUberMailRepository,
  UberMailError
} from '../src/ubermail-agent-api.mjs';

function approval(scope='ubermail:send') {
  return { granted:true, grantedBy:'owner:test', scope:[scope], expiresAt:'2035-01-01T00:00:00.000Z' };
}

async function fixture(options={}) {
  const transportCalls=[];
  const webhookCalls=[];
  const repository=options.repository || createMemoryUberMailRepository();
  const api=createUberMailAgentApi({
    repository,
    now: options.now || (()=>new Date('2026-09-19T00:00:00.000Z')),
    sendTransport: options.sendTransport === undefined ? async payload=>{transportCalls.push(payload);return{ok:true,providerReferenceId:'postal_'+transportCalls.length};} : options.sendTransport,
    domainVerifier: options.domainVerifier || (async ({domain})=>({verified:true,records:[{type:'TXT',name:'_verify.'+domain,value:'owned'}]})),
    webhookDispatcher: options.webhookDispatcher || (async call=>{webhookCalls.push(call);}),
    webhookMasterSecret:'test-webhook-master-secret',
    enforceSendAllowList:Boolean(options.enforceSendAllowList)
  });
  const root=await api.bootstrapRootKey();
  const auth={apiKey:root.api_key};
  return {api,auth,root,repository,transportCalls,webhookCalls};
}

async function provision(api,auth) {
  const pod=await api.createPod({auth,name:'Primary',idempotencyKey:'pod:1'});
  const domain=await api.createDomain({auth,domain:'uberbond.agency',podId:pod.pod_id,idempotencyKey:'domain:1'});
  const verified=await api.verifyDomain({auth,domainId:domain.domain_id,idempotencyKey:'domain:verify:1'});
  const inbox=await api.createInbox({auth,username:'mohamed',domain:'uberbond.agency',displayName:'Mohamed',podId:pod.pod_id,idempotencyKey:'inbox:1'});
  return {pod,domain:verified,inbox};
}

test('bootstrap and scoped API keys never persist or replay raw secrets', async()=>{
  const {api,auth,root}=await fixture();
  assert.match(root.api_key,/^ubm_/);
  const created=await api.createApiKey({auth,name:'reader',permissions:{message_read:true},idempotencyKey:'key:create:1'});
  assert.match(created.api_key,/^ubm_/);
  const replay=await api.createApiKey({auth,name:'ignored',permissions:{message_read:true},idempotencyKey:'key:create:1'});
  assert.equal(replay.api_key,null);
  assert.equal(replay.secret_replay_unavailable,true);
  assert.equal(replay.api_key_id,created.api_key_id);
  const snap=await api.snapshot({auth});
  assert.equal(JSON.stringify(snap).includes(root.api_key),false);
  assert.equal(JSON.stringify(snap).includes(created.api_key),false);
  assert.equal(JSON.stringify(snap).includes('secretHash'),false);
  await assert.rejects(()=>api.createPod({auth:{apiKey:created.api_key},name:'nope'}),e=>e instanceof UberMailError && e.code==='permission-denied:pod_create');
});

test('pod domain verification inbox CRUD/search are idempotent and scoped', async()=>{
  const {api,auth}=await fixture();
  const {pod,domain,inbox}=await provision(api,auth);
  assert.equal(domain.status,'verified');
  assert.equal(inbox.email,'mohamed@uberbond.agency');
  const replay=await api.createInbox({auth,username:'mohamed',domain:'uberbond.agency',podId:pod.pod_id,idempotencyKey:'inbox:1'});
  assert.equal(replay.inbox_id,inbox.inbox_id);
  const found=await api.searchInboxes({auth,q:'moh'});
  assert.equal(found.count,1);
  const updated=await api.updateInbox({auth,inboxId:inbox.inbox_id,displayName:'Mohamed Wessam',metadata:{role:'founder'}});
  assert.equal(updated.display_name,'Mohamed Wessam');
  await assert.rejects(()=>api.deleteDomain({auth,domainId:domain.domain_id}),e=>e.code==='domain-in-use');
});

test('sends fail closed without approval or transport', async()=>{
  const f=await fixture({sendTransport:null});
  const {inbox}=await provision(f.api,f.auth);
  await assert.rejects(()=>f.api.sendMessage({auth:f.auth,inboxId:inbox.inbox_id,to:'a@example.com',subject:'x',text:'x'}),e=>e.code==='effect-approval-required');
  await assert.rejects(()=>f.api.sendMessage({auth:f.auth,inboxId:inbox.inbox_id,to:'a@example.com',subject:'x',text:'x',approval:approval()}),e=>e.code==='send-transport-not-configured');
});

test('send reply forward threads attachments and idempotency work end-to-end', async()=>{
  const {api,auth,transportCalls}=await fixture();
  const {inbox}=await provision(api,auth);
  const sent=await api.sendMessage({auth,inboxId:inbox.inbox_id,to:'alice@example.com',subject:'Hello',text:'Body',attachments:[{filename:'a.txt',contentBase64:Buffer.from('hello').toString('base64')}],approval:approval(),idempotencyKey:'send:1'});
  const replay=await api.sendMessage({auth,inboxId:inbox.inbox_id,to:'alice@example.com',subject:'ignored',text:'ignored',approval:approval(),idempotencyKey:'send:1'});
  assert.equal(replay.message_id,sent.message_id);
  assert.equal(transportCalls.length,1);
  const msg=await api.getMessage({auth,inboxId:inbox.inbox_id,messageId:sent.message_id});
  assert.equal(msg.attachments.length,1);
  assert.equal('content_base64' in msg.attachments[0],false);
  const raw=await api.getMessageAttachment({auth,inboxId:inbox.inbox_id,messageId:sent.message_id,attachmentId:msg.attachments[0].attachment_id});
  assert.equal(Buffer.from(raw.content_base64,'base64').toString(),'hello');
  const reply=await api.replyToMessage({auth,inboxId:inbox.inbox_id,messageId:sent.message_id,to:'alice@example.com',text:'Reply',approval:approval(),idempotencyKey:'reply:1'});
  assert.equal(reply.thread_id,sent.thread_id);
  const fwd=await api.forwardMessage({auth,inboxId:inbox.inbox_id,messageId:sent.message_id,to:'bob@example.com',approval:approval(),idempotencyKey:'fwd:1'});
  const fwdRaw=await api.getMessageAttachment({auth,inboxId:inbox.inbox_id,messageId:fwd.message_id,attachmentId:(await api.getMessage({auth,inboxId:inbox.inbox_id,messageId:fwd.message_id})).attachments[0].attachment_id});
  assert.equal(Buffer.from(fwdRaw.content_base64,'base64').toString(),'hello');
  const thread=await api.getThread({auth,inboxId:inbox.inbox_id,threadId:sent.thread_id});
  assert.equal(thread.message_count,2);
  const search=await api.searchThreads({auth,q:'hello'});
  assert.ok(search.count>=1);
});

test('message labels and deletes mutate local state without external effects', async()=>{
  const {api,auth}=await fixture(); const {inbox}=await provision(api,auth);
  const sent=await api.sendMessage({auth,inboxId:inbox.inbox_id,to:'a@example.com',subject:'Label',text:'Body',approval:approval(),idempotencyKey:'label:send'});
  const updated=await api.updateMessage({auth,inboxId:inbox.inbox_id,messageId:sent.message_id,addLabels:['important','seen'],removeLabels:['seen']});
  assert.deepEqual(updated.labels,['important']);
  const deleted=await api.deleteMessage({auth,inboxId:inbox.inbox_id,messageId:sent.message_id});
  assert.equal(deleted.deleted,true);
  await assert.rejects(()=>api.getMessage({auth,inboxId:inbox.inbox_id,messageId:sent.message_id}),e=>e.code==='message-not-found');
});

test('draft lifecycle supports attachments, scheduling, update, send and delete', async()=>{
  const {api,auth,transportCalls}=await fixture(); const {inbox}=await provision(api,auth);
  const draft=await api.createDraft({auth,inboxId:inbox.inbox_id,to:'alice@example.com',subject:'Draft',text:'Body',attachments:[{filename:'d.txt',contentBase64:Buffer.from('draft').toString('base64')}],sendAt:'2026-09-18T23:00:00.000Z',idempotencyKey:'draft:1'});
  const raw=await api.getDraftAttachment({auth,inboxId:inbox.inbox_id,draftId:draft.draft_id,attachmentId:draft.attachments[0].attachment_id});
  assert.equal(Buffer.from(raw.content_base64,'base64').toString(),'draft');
  await api.updateDraft({auth,inboxId:inbox.inbox_id,draftId:draft.draft_id,addLabels:['scheduled']});
  const run=await api.runScheduledDrafts({auth,approval:approval()});
  assert.equal(run.count,1);
  assert.equal(run.results[0].ok,true);
  assert.equal(transportCalls.length,1);
  const second=await api.createDraft({auth,inboxId:inbox.inbox_id,to:'b@example.com',subject:'Delete',text:'x'});
  assert.equal((await api.deleteDraft({auth,inboxId:inbox.inbox_id,draftId:second.draft_id})).deleted,true);
});

test('webhook lifecycle signs dispatches and never replays signing secret', async()=>{
  const {api,auth,webhookCalls}=await fixture(); const {inbox}=await provision(api,auth);
  const hook=await api.createWebhook({auth,url:'https://example.test/hook',eventTypes:['message.sent'],inboxIds:[inbox.inbox_id],idempotencyKey:'hook:1'});
  assert.ok(hook.secret);
  const replay=await api.createWebhook({auth,url:'https://example.test/ignored',eventTypes:['message.sent'],inboxIds:[inbox.inbox_id],idempotencyKey:'hook:1'});
  assert.equal(replay.secret,null);
  assert.equal(replay.secret_replay_unavailable,true);
  await api.sendMessage({auth,inboxId:inbox.inbox_id,to:'alice@example.com',subject:'Webhook',text:'x',approval:approval(),idempotencyKey:'hook:send'});
  assert.equal(webhookCalls.length,1);
  assert.match(webhookCalls[0].signature,/^[a-f0-9]{64}$/);
  assert.equal((await api.updateWebhook({auth,webhookId:hook.webhook_id,enabled:false})).enabled,false);
  assert.equal((await api.deleteWebhook({auth,webhookId:hook.webhook_id})).deleted,true);
});

test('allow/block lists protect outbound and inbound paths', async()=>{
  const {api,auth}=await fixture({enforceSendAllowList:true}); const {inbox}=await provision(api,auth);
  await api.createListEntry({auth,direction:'send',type:'allow',entry:'example.com',inboxId:inbox.inbox_id,idempotencyKey:'allow:1'});
  await assert.rejects(()=>api.sendMessage({auth,inboxId:inbox.inbox_id,to:'a@other.com',subject:'x',text:'x',approval:approval(),idempotencyKey:'send:no'}),e=>e.code==='recipient-not-allowlisted');
  await api.createListEntry({auth,direction:'send',type:'block',entry:'blocked@example.com',inboxId:inbox.inbox_id,idempotencyKey:'block:send'});
  await assert.rejects(()=>api.sendMessage({auth,inboxId:inbox.inbox_id,to:'blocked@example.com',subject:'x',text:'x',approval:approval(),idempotencyKey:'send:block'}),e=>e.code==='recipient-blocked');
  await api.createListEntry({auth,direction:'receive',type:'block',entry:'evil.example',inboxId:inbox.inbox_id,idempotencyKey:'block:recv'});
  await assert.rejects(()=>api.ingestReceivedMessage({auth:{system:true},inboxId:inbox.inbox_id,from:'x@evil.example',subject:'bad',text:'bad'}),e=>e.code==='sender-blocked');
  const received=await api.ingestReceivedMessage({auth:{system:true},inboxId:inbox.inbox_id,from:'friend@example.com',subject:'hi',text:'hello'});
  assert.equal(received.direction,'received');
});

test('event stream and metrics account for mailbox activity without exposing blobs', async()=>{
  const {api,auth}=await fixture(); const {inbox}=await provision(api,auth);
  await api.ingestReceivedMessage({auth:{system:true},inboxId:inbox.inbox_id,from:'friend@example.com',subject:'hello',text:'world',attachments:[{filename:'x',contentBase64:Buffer.from('secretblob').toString('base64')}]});
  await api.sendMessage({auth,inboxId:inbox.inbox_id,to:'friend@example.com',subject:'re',text:'yo',approval:approval(),idempotencyKey:'metrics:send'});
  const metrics=await api.metrics({auth});
  assert.equal(metrics.received,1); assert.equal(metrics.sent,1); assert.equal(metrics.inboxes,1);
  const events=await api.pollEvents({auth,cursor:0,limit:100});
  assert.ok(events.events.some(e=>e.type==='message.received'));
  assert.ok(events.events.some(e=>e.type==='message.sent'));
  const snap=await api.snapshot({auth});
  assert.equal(JSON.stringify(snap).includes('secretblob'),false);
  assert.equal(JSON.stringify(snap).includes('content_base64'),false);
});

test('relationship policy refuses unsanctioned classes', async()=>{
  const {api,auth}=await fixture(); const {inbox}=await provision(api,auth);
  await assert.rejects(()=>api.sendMessage({auth,inboxId:inbox.inbox_id,to:'a@example.com',subject:'x',text:'x',relationship:'COLD_BLAST',approval:approval(),idempotencyKey:'cold'}),e=>e.code==='relationship-not-permitted');
});
