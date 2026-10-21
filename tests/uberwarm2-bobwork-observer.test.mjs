import test from 'node:test';
import assert from 'node:assert/strict';
import {observeBobwork, compileBobworkObservation} from '../src/uberwarm2-bobwork-observer.mjs';
import {compileOperationalSnapshot} from '../src/uberwarm2-operational-journal.mjs';
const domains=['uberbond.site','uberbondai.shop','uberbondapp.site','uberbondcloud.shop','uberbondconnect.online','uberbondcore.space','uberbondengine.website','uberbondflow.space','uberbondforge.space','uberbondglobal.website'];
const boxes=domains.flatMap(d=>['hello@'+d,'growth@'+d]).map(email=>({email,password:'private'}));
function fixture(overrides={}) {
  const calls=[];
  return {calls, fetchImpl:async(url, options)=>{
    calls.push({url, options});
    const path=new URL(url).pathname.split('/').at(-1);
    const body=Object.hasOwn(overrides,path) ? overrides[path] : ({me:{email:'uberbond.co@gmail.com'},mailboxes:boxes,usage:{unknown:'private'},stats:{token:'private'}})[path];
    return new Response(JSON.stringify(body));
  }};
}
test('unconfigured observer makes no network calls',async()=>{
  const f=fixture(); assert.equal((await observeBobwork(f)).status,'NOT_CONFIGURED'); assert.equal(f.calls.length,0);
});
test('four fixed GET calls cannot send, follow redirects, or persist raw payloads',async()=>{
  const f=fixture(); const r=await observeBobwork({...f,apiKey:'test-key'});
  assert.equal(r.status,'INVENTORY_OBSERVED'); assert.equal(r.enrolled,20); assert.equal(r.authenticated,true);
  assert.equal(r.independentPlacementVerified,false); assert.equal(r.sendAuthority,'NONE');
  assert.equal(f.calls.length,4); assert.equal(Object.keys(r.endpointDigests).length,4);
  assert.ok(!/private|test-key|hello@|growth@/.test(JSON.stringify(r)));
  for(const c of f.calls){ assert.equal(new URL(c.url).origin,'https://app-emailwarmup.bobwork.ai'); assert.equal(c.options.method,'GET'); assert.equal(c.options.redirect,'error'); }
});
test('wrong account, duplicate, excluded paid sender and unknown schema fail closed',async()=>{
  for(const [changes,status] of [[{me:{email:'other@example.com'}},'ACCOUNT_IDENTITY_HOLD'],[{mailboxes:[boxes[0],boxes[0]]},'MAILBOX_IDENTITY_HOLD'],[{mailboxes:[{email:'connect@uberbond.site'}]},'MAILBOX_IDENTITY_HOLD'],[{mailboxes:{unrecognized:boxes}},'SCHEMA_UNVERIFIED']]) {
    assert.equal((await observeBobwork({...fixture(changes),apiKey:'test'})).status,status);
  }
  assert.equal((await observeBobwork({...fixture({mailboxes:boxes.slice(1)}),apiKey:'test'})).status,'ENROLLMENT_GAP');
});
test('provider errors, invalid JSON, excessive response and thrown errors do not leak exceptions',async()=>{
  for(const fetchImpl of [async()=>new Response('secret',{status:429}),async()=>new Response('bad-json'),async()=>new Response('x'.repeat(262145)),async()=>{throw Error('private-token');}]){
    const r=await observeBobwork({apiKey:'private-key',fetchImpl});
    assert.ok(['READ_FAILED','RATE_LIMITED','RESPONSE_TOO_LARGE'].includes(r.status)); assert.ok(!JSON.stringify(r).includes('private'));
  }
});
test('journal allowlists observer output and preserves independent sending gates',()=>{
  const input={status:'INVENTORY_OBSERVED',authenticated:true,enrolled:20,token:'private',body:'private',independentPlacementVerified:true,sendAuthority:'YES',endpointDigests:{stats:'sha256:'+'a'.repeat(64),evil:'private'}};
  const output=compileBobworkObservation(input); assert.equal(output.sendAuthority,'NONE'); assert.equal(output.independentPlacementVerified,false); assert.ok(!JSON.stringify(output).includes('private'));
  const journal=compileOperationalSnapshot({source:'a'.repeat(40),observedAt:new Date().toISOString(),sends:0,runtimeReady:false,sendAuthority:'NONE',bobwork:input});
  assert.deepEqual(journal.bobwork,output); assert.equal(journal.activation,'INDEPENDENT_SENDER_CONSENT_AND_PLACEMENT_GATES_REQUIRED');
});
