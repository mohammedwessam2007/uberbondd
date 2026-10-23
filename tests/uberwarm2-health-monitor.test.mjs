import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHealthMetrics, compileMailboxHealth, mailboxDigest } from '../src/uberwarm2-health-metrics.mjs';
import { observeAlienmail, compileAlienmailObservation } from '../src/uberwarm2-alienmail-observer.mjs';
const emails=Array.from({length:32},(_,i)=>`team${i}@uberbond.site`);
function fixture({badIdentity=false,toolError=false,sse=false}={}) {
  const calls=[];
  return {calls,fetchImpl:async(url,options)=>{
    calls.push({url,options});const msg=JSON.parse(options.body);
    if(!msg.id)return new Response(null,{status:202});
    const result=msg.method==='initialize'?{protocolVersion:'2024-11-05'}:msg.method==='tools/list'?{tools:[{name:'list_smtp_accounts'}]}:
      {isError:toolError,structuredContent:{accounts:emails.map((email,i)=>({email:badIdentity?'outsider@example.com':email,health_score:i,stats:{sent:5},password:'SECRET'}))}};
    const data=JSON.stringify({jsonrpc:'2.0',id:msg.id,result});
    return new Response(sse?'data: '+data+'\n\n':data,{headers:{'content-type':sse?'text/event-stream':'application/json','mcp-session-id':'test-session'}});
  }};
}
test('metrics retain provider paths, reject secrets, numeric strings, negative and invalid values',()=>{
  const m=extractHealthMetrics({health_score:42,stats:{sent:0,replies:'3',password:'SECRET'},spam_rate:NaN,errors:-1});
  assert.deepEqual(m,{health_score:42,'stats.sent':0});
  const row={mailboxDigest:mailboxDigest(emails[0]),metrics:{...m,'password.sent':99,token:99}};
  assert.deepEqual(compileMailboxHealth([row,row])[0].metrics,m);
  assert.equal(compileMailboxHealth([row,row]).length,1);
});
test('unconfigured and unbound AlienMail do not call network',async()=>{
  const f=fixture();assert.equal((await observeAlienmail(f)).status,'NOT_CONFIGURED');
  assert.equal((await observeAlienmail({...f,apiKey:'SECRET'})).status,'IDENTITY_HOLD');assert.equal(f.calls.length,0);
});
test('MCP JSON and SSE only initialize, discover and call read inventory; redact identities',async()=>{
  for(const sse of [false,true]){
    const f=fixture({sse});const r=await observeAlienmail({...f,apiKey:'SECRET',expectedMailboxDigests:emails.map(mailboxDigest)});
    assert.equal(r.status,'INVENTORY_OBSERVED');assert.equal(r.enrolled,32);assert.equal(r.mailboxHealth.length,32);
    assert.equal(r.mailboxHealth[0].metrics.health_score,0);
    assert.ok(!/SECRET|team0@|test-session/.test(JSON.stringify(r)));
    assert.deepEqual(f.calls.map(c=>JSON.parse(c.options.body).method),['initialize','notifications/initialized','tools/list','tools/call']);
    for(const c of f.calls){assert.equal(c.url,'https://app.alienmail.io/api/mcp');assert.equal(c.options.redirect,'error');}
    assert.equal(JSON.parse(f.calls[3].options.body).params.name,'list_smtp_accounts');
  }
});
test('foreign identities, tool errors, malformed payloads and oversize responses fail closed',async()=>{
  for(const [options,status] of [[{badIdentity:true},'IDENTITY_HOLD'],[{toolError:true},'READ_FAILED']]){
    assert.equal((await observeAlienmail({...fixture(options),apiKey:'SECRET',expectedMailboxDigests:emails.map(mailboxDigest)})).status,status);
  }
  for(const fetchImpl of [async()=>new Response('SECRET',{status:429}),async()=>new Response('x'.repeat(262145)),async()=>{throw Error('SECRET');}]){
    const r=await observeAlienmail({apiKey:'SECRET',expectedMailboxDigests:emails.map(mailboxDigest),fetchImpl});assert.notEqual(r.status,'INVENTORY_OBSERVED');assert.ok(!JSON.stringify(r).includes('SECRET'));
  }
  const r=compileAlienmailObservation({status:'HEALTHY',sendAuthority:'SEND',independentPlacementVerified:true});
  assert.equal(r.status,'SCHEMA_UNVERIFIED');assert.equal(r.sendAuthority,'NONE');assert.equal(r.independentPlacementVerified,false);
});

test('trend preserves real zero and compares only matching provider fields',async()=>{
  const {compareMailboxHealth}=await import('../src/uberwarm2-health-metrics.mjs');
  const id=mailboxDigest(emails[0]);
  const current=[{mailboxDigest:id,metrics:{health_score:45,'stats.sent':0}}];
  assert.deepEqual(compareMailboxHealth(current,[{mailboxDigest:id,metrics:{health_score:40,'stats.sent':5}}])[0].changes,{health_score:5,'stats.sent':-5});
  assert.equal(compareMailboxHealth(current,[])[0].baselineAvailable,false);
});
