import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchReservedPostalCanary } from '../src/omnia-v9/integrations/external-effect-dispatcher.mjs';
import { postalProviderEffectIdentity } from '../src/omnia-v9/integrations/providers/postal-effect-adapter.mjs';
function fixture(){
 const cfg={outbound:{messageIdDomain:'fixture.test'},providers:{postal:{baseUrl:'https://postal.example.test',apiKey:'fixture-only'}}};
 const account={email:'sender@fixture.test'},reservation={id:'fixture',idempotencyKey:'fixture-business'};
 const effectPayload={to:'recipient@fixture.test',from:account.email,subject:'Fixture',body:'Fixture',listUnsubscribe:'https://fixture.test/unsubscribe'};
 const effectIntent={executionId:'outbound:fixture',businessKey:reservation.idempotencyKey,provider:'postal',providerEffectIdentity:postalProviderEffectIdentity('outbound:fixture','fixture.test'),effectPayload,actionIntentDigest:'fixture-action',authorizationDigest:'fixture-authorization',approvalId:'fixture-approval',policyDigest:'fixture-policy',constitutionDigest:'fixture-constitution'};
 let row=null,calls=0;
 const store={async prepare(intent){row??={...intent,status:'PREPARED'};return {...row};},async transition({expectedFromStatus,toStatus,providerReferenceId}){const applied=row.status===expectedFromStatus;if(applied)row={...row,status:toStatus,providerReferenceId};return {applied,execution:{...row}};},async getById(){return {...row};}};
 const finalAdmissionCheck=async ({preparedEffect})=>({...effectIntent,argumentsDigest:preparedEffect.argumentsDigest,decision:'ALLOW',authoritative:true,enforced:true});
 const fetchImpl=async()=>{calls++;return {status:200,json:async()=>({status:'success',data:{message_id:'fixture-message',messages:{'recipient@fixture.test':{id:77}}}})};};
 return {args:{cfg,account,reservation,effectPayload,effectIntent,store,evidenceStore:{append:async()=>{}},finalAdmissionCheck,fetchImpl},calls:()=>calls,row:()=>row};
}
test('canonical Postal dispatch persists acceptance and duplicate execution never repeats submission',async()=>{
 const f=fixture();const first=await dispatchReservedPostalCanary(f.args);assert.equal(first.classification,'ACCEPTED');assert.equal(first.providerReferenceId,'77');assert.equal(f.calls(),1);
 await dispatchReservedPostalCanary(f.args);assert.equal(f.calls(),1);
});
test('canonical Postal refuses forged final authority and changed current payload before provider call',async()=>{
 const f=fixture();const result=await dispatchReservedPostalCanary({...f.args,finalAdmissionCheck:async()=>({decision:'ALLOW',authoritative:false,enforced:true})});assert.equal(result.classification,'REJECTED');assert.equal(f.calls(),0);assert.equal(f.row().status,'ABORTED_BEFORE_DISPATCH');
 const g=fixture();const changed=await dispatchReservedPostalCanary({...g.args,effectPayload:{...g.args.effectPayload,body:'Changed'}});assert.equal(changed.classification,'REJECTED');assert.equal(g.calls(),0);
});
test('canonical Postal uncertain outcome preserves durable hold and never retries the provider',async()=>{
 const f=fixture();let calls=0;const args={...f.args,fetchImpl:async()=>{calls++;throw new Error('network-uncertain');}};
 const first=await dispatchReservedPostalCanary(args);assert.equal(first.classification,'UNCERTAIN');assert.equal(f.row().status,'RESULT_UNCERTAIN');await dispatchReservedPostalCanary(args);assert.equal(calls,1);
});
