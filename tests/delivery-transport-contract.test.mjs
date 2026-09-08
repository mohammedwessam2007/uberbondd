import test from 'node:test';
import assert from 'node:assert/strict';
import { attemptDelivery, compileFulfillmentDeliveryEvent, evaluateAcceptanceWindow, compileLateCustomerEvent } from '../src/delivery-transport-contract.mjs';

const base = { tenantRef:'tenant-1', orderRef:'order-1', fulfillmentId:'fulfill-1', artifactRefs:['report-1'], attemptId:'attempt-1', idempotencyKey:'deliver:order-1:v1' };

test('provider-confirmed delivery compiles DELIVERY_RECORDED but never acceptance', async()=>{
 let calls=0;
 const providerAdapter={name:'fake', async send(){ calls++; return {confirmed:true,providerReceiptId:'r1'}; }};
 const out=await attemptDelivery({...base,providerAdapter});
 assert.equal(out.status,'PROVIDER_CONFIRMED_DELIVERY'); assert.equal(calls,1); assert.equal(out.receipt.acceptanceTruth,'NOT_INFERRED');
 const ev=compileFulfillmentDeliveryEvent(out.receipt,{eventId:'e1'});
 assert.equal(ev.event.type,'DELIVERY_RECORDED'); assert.equal(ev.acceptanceTruth,'NOT_INFERRED');
});

test('uncertain provider timeout enters reconciliation and duplicate attempt does not resend', async()=>{
 let calls=0;
 const providerAdapter={name:'fake', async send(){ calls++; const e=new Error('timeout'); e.code='TIMEOUT'; throw e; }};
 const first=await attemptDelivery({...base,providerAdapter});
 assert.equal(first.status,'RECONCILIATION_REQUIRED'); assert.equal(calls,1);
 const second=await attemptDelivery({...base,providerAdapter,priorReceipts:[first.receipt]});
 assert.equal(second.result,'DUPLICATE_ATTEMPT_SUPPRESSED'); assert.equal(calls,1);
});

test('definitely-pre-effect failure is retryable only with same identity', async()=>{
 const providerAdapter={name:'fake', async send(){ const e=new Error('validation'); e.definitelyNoEffect=true; throw e; }};
 const first=await attemptDelivery({...base,providerAdapter});
 assert.equal(first.status,'FAILED_PRE_EFFECT');
 const collision=await attemptDelivery({...base,orderRef:'other',providerAdapter,priorReceipts:[first.receipt]});
 assert.equal(collision.ok,false); assert.ok(collision.reasonCodes.includes('delivery-attempt-identity-collision'));
});

test('window expiry and customer silence never imply acceptance',()=>{
 const out=evaluateAcceptanceWindow({deliveredAt:'2026-01-01T00:00:00.000Z',now:new Date('2026-01-10T00:00:00.000Z'),acceptanceWindowMs:86400000,followupCount:2,maxFollowups:2});
 assert.equal(out.status,'WINDOW_ELAPSED_WITHOUT_ACCEPTANCE'); assert.equal(out.accepted,false); assert.equal(out.acceptanceTruth,'NOT_INFERRED_FROM_SILENCE_OR_TIME');
});

test('suppression forbids followup and bounded counts cannot overflow',()=>{
 const out=evaluateAcceptanceWindow({deliveredAt:'2026-01-01T00:00:00.000Z',now:new Date('2026-01-01T01:00:00.000Z'),suppressed:true,followupCount:0,maxFollowups:2});
 assert.equal(out.status,'FOLLOWUP_SUPPRESSED'); assert.equal(out.followupAllowed,false);
 const bad=evaluateAcceptanceWindow({deliveredAt:'2026-01-01T00:00:00.000Z',now:new Date('2026-01-01T01:00:00.000Z'),followupCount:0,maxFollowups:999}); assert.equal(bad.ok,false);
});

test('late customer event requires authentic customer evidence',()=>{
 const bad=compileLateCustomerEvent({evidenceClass:'INTERNAL_MODEL',evidenceRef:'x',decision:'ACCEPTED'}); assert.equal(bad.ok,false);
 const good=compileLateCustomerEvent({evidenceClass:'EXTERNAL_CUSTOMER',evidenceRef:'customer:msg-1',decision:'ACCEPTED',eventId:'cust-1',at:'2026-01-03T00:00:00.000Z'});
 assert.equal(good.ok,true); assert.equal(good.event.type,'CUSTOMER_ACCEPTED');
});

test('provider receipt without confirmed provider identity cannot become delivery event', async()=>{
 const providerAdapter={name:'fake', async send(){ return {confirmed:true}; }};
 const out=await attemptDelivery({...base,providerAdapter}); assert.equal(out.status,'RECONCILIATION_REQUIRED');
 const ev=compileFulfillmentDeliveryEvent(out.receipt); assert.equal(ev.ok,false);
});
