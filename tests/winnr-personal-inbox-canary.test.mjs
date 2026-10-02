import test from 'node:test';
import assert from 'node:assert/strict';
import { runWinnrPersonalInboxCanary } from '../src/winnr-placement-phenotype-canary.mjs';

function fixture(){
  const settings={},sent=[],logs=[];
  const accounts=[1,2,3].map(n=>({id:`smtp-${n}`,slot:`winnr:${n}`,provider:'smtp-relay',connected:true}));
  let queue=Promise.resolve();
  const store={init:async()=>{},list:async()=>accounts,getSettings:async()=>settings,
    setSetting:async(k,v)=>{settings[k]=structuredClone(v);},log:async(k,v)=>logs.push(v),close:async()=>{},
    transaction(fn){const next=queue.then(()=>fn(store));queue=next.catch(()=>{});return next;}};
  const options={config:{encryptionKey:'test-key'},storeFactory:()=>store,delayFn:async()=>{},
    dispatchFn:async args=>{sent.push(args);return {classification:'ACCEPTED',messageId:`<probe-${sent.length}>`};}};
  return {settings,sent,logs,accounts,options};
}

test('fixed personal seed sends once per sender and never changes fleet quarantine',async()=>{
  const f=fixture();
  const result=await runWinnrPersonalInboxCanary(f.options);
  assert.equal(result.status,'WINNR_PERSONAL_CANARY_SENT');
  assert.equal(f.sent.length,3);
  assert.ok(f.sent.every(x=>x.message.to==='mohammedwessam306@gmail.com'));
  assert.equal((await runWinnrPersonalInboxCanary(f.options)).status,'WINNR_PERSONAL_CANARY_ALREADY_COMPLETED');
  assert.equal(f.sent.length,3);
  assert.equal(JSON.stringify(result).includes('test-key'),false);
  assert.ok(f.logs.every(x=>x.prospectSendAuthorityGranted===false));
});
test('rejects alternate recipients, missing encryption and malformed inventory before effects',async()=>{
  for(const alteration of [{target:'prospect@example.test'},{config:{}},{target:'mohammedwessam306@gmail.com\r\nBcc: prospect@example.test'}]){
    const f=fixture();assert.equal((await runWinnrPersonalInboxCanary({...f.options,...alteration})).ok,false);assert.equal(f.sent.length,0);
  }
  const f=fixture();f.accounts.pop();assert.equal((await runWinnrPersonalInboxCanary(f.options)).ok,false);assert.equal(f.sent.length,0);
});
test('uncertain send or throw is never automatically retried or logged verbatim',async()=>{
  for(const throws of [false,true]){
    const f=fixture();f.options.dispatchFn=async args=>{f.sent.push(args);if(throws)throw Error('secret-password');return {classification:'UNCERTAIN',dispatchError:'secret-password'};};
    const result=await runWinnrPersonalInboxCanary(f.options);
    assert.equal(result.status,'WINNR_PERSONAL_CANARY_RECONCILE_REQUIRED');
    await runWinnrPersonalInboxCanary(f.options);
    assert.equal(f.sent.length,1);
    assert.equal(JSON.stringify([result,f.logs,f.settings]).includes('secret-password'),false);
  }
});
test('overlapping boots acquire only one permanent effect reservation',async()=>{
  const f=fixture();await Promise.all([runWinnrPersonalInboxCanary(f.options),runWinnrPersonalInboxCanary(f.options)]);assert.equal(f.sent.length,3);
});
test('PostgreSQL reservation locks before reading effect ledger',async()=>{
  const f=fixture(),order=[];
  const store=f.options.storeFactory();store.pool={query:async()=>order.push('lock')};
  store.getSettings=async()=>{order.push('read');return f.settings;};
  await runWinnrPersonalInboxCanary(f.options);assert.deepEqual(order.slice(0,2),['lock','read']);
});
