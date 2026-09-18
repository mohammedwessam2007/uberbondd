import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberMailUberDosoTransport } from '../src/ubermail-uberdoso-bridge.mjs';
const payload={idempotencyKey:'send:1',inboxId:'i',from:'mohamed@uberbond.agency',to:['a@example.com'],subject:'Hi',text:'Body'};

test('UberDoso bridge refuses missing or non-authoritative dispatch',async()=>{
  assert.equal((await createUberMailUberDosoTransport()(payload)).ok,false);
  const denied=await createUberMailUberDosoTransport({governedDispatch:async()=>({authorized:false,executed:false,accepted:false,reason:'v9-deny'})})(payload);
  assert.equal(denied.ok,false);assert.equal(denied.reason,'v9-deny');
});

test('UberDoso bridge preserves payload binding and authoritative receipt',async()=>{
  let seen;
  const transport=createUberMailUberDosoTransport({governedDispatch:async request=>{seen=request;return{authorized:true,executed:true,accepted:true,providerReferenceId:'postal-42',messageId:'<m42@uberbond.cloud>',payloadDigest:request.payloadDigest,authorizationDigest:'a'.repeat(64),policyDigest:'b'.repeat(64)};}});
  const result=await transport({...payload,cc:['cc@example.com'],attachments:[{filename:'x.txt',size:1}]});
  assert.equal(result.ok,true);assert.equal(result.providerReferenceId,'postal-42');assert.equal(seen.operation,'OUTBOUND_EMAIL_SEND');assert.equal(seen.consequenceClass,'COMMUNICATE_EXTERNAL');assert.equal(seen.cc[0],'cc@example.com');assert.match(seen.payloadDigest,/^[a-f0-9]{64}$/);
});

test('UberDoso bridge treats transport ambiguity or digest mismatch as uncertain',async()=>{
  const uncertain=await createUberMailUberDosoTransport({governedDispatch:async()=>({uncertain:true})})(payload);
  assert.equal(uncertain.uncertain,true);
  const mismatch=await createUberMailUberDosoTransport({governedDispatch:async()=>({authorized:true,executed:true,accepted:true,providerReferenceId:'x',payloadDigest:'bad'})})(payload);
  assert.equal(mismatch.uncertain,true);assert.equal(mismatch.reason,'provider-receipt-payload-digest-mismatch');
});
