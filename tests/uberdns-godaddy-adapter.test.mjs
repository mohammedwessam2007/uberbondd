import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoDaddyDnsAdapter} from '../src/uberdns-godaddy-adapter.mjs';

test('requires PAT and preserves unrelated DNS while creating missing records',async()=>{
  assert.throws(()=>createGoDaddyDnsAdapter({pat:''}),/godaddy-pat/);
  const calls=[];
  const fetchFn=async(url,opts={})=>{
    calls.push({url,opts});
    if((opts.method||'GET')==='GET') return {ok:true,status:200,json:async()=>({items:[{recordId:'1',name:'www',type:'A',data:'1.2.3.4',ttl:600}]})};
    return {ok:true,status:200,json:async()=>({})};
  };
  const adapter=createGoDaddyDnsAdapter({pat:'pat-test',fetchFn,idempotencyKey:()=> 'idem-1'});
  const result=await adapter.applyChanges({provider:'GODADDY',ownerAuthorized:true,roots:['uberbond.cloud'],changes:[{name:'uberbond.cloud',type:'MX',priority:10,value:'mta.uberbond.cloud',ttl:600}]});
  assert.equal(result.ok,true);
  assert.equal(result.externalEffects,1);
  assert.equal(calls.filter(c=>(c.opts.method||'GET')==='POST').length,1);
  assert.match(calls.find(c=>(c.opts.method||'GET')==='POST').url,/\/v3\/domains\/zones\/uberbond.cloud\/dns-records$/);
  assert.equal(calls.find(c=>(c.opts.method||'GET')==='POST').opts.headers['Idempotency-Key'],'idem-1');
});

test('refuses a plan not bound to GoDaddy or owner authorization',async()=>{
  const adapter=createGoDaddyDnsAdapter({pat:'pat-test',fetchFn:async()=>{throw new Error('must-not-call');}});
  assert.equal((await adapter.applyChanges({provider:'OTHER',ownerAuthorized:true})).ok,false);
  assert.equal((await adapter.applyChanges({provider:'GODADDY',ownerAuthorized:false})).ok,false);
});
