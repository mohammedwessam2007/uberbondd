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

function recordingFetch(zones){
  const calls=[];
  const fetchFn=async(url,opts={})=>{
    const method=opts.method||'GET';
    calls.push({url,method,body:opts.body?JSON.parse(opts.body):null});
    if(method==='GET'){
      const zone=decodeURIComponent(url.match(/zones\/([^/]+)\/dns-records$/)[1]);
      return {ok:true,status:200,json:async()=>({items:zones[zone]||[]})};
    }
    return {ok:true,status:200,json:async()=>({})};
  };
  return {calls,fetchFn,writes:()=>calls.filter(c=>c.method!=='GET')};
}
const plan=(roots,changes,extra={})=>({provider:'GODADDY',ownerAuthorized:true,roots,changes,...extra});
const spf={name:'uberbondhq.site',type:'TXT',value:'v=spf1 mx -all',ttl:600,purpose:'SPF'};

test('publishing SPF never overwrites an unrelated root TXT such as a site-verification token',async()=>{
  const f=recordingFetch({'uberbondhq.site':[{recordId:'v1',name:'@',type:'TXT',data:'google-site-verification=abc',ttl:3600}]});
  const result=await createGoDaddyDnsAdapter({pat:'p',fetchFn:f.fetchFn,idempotencyKey:()=> 'k'}).applyChanges(plan(['uberbondhq.site'],[spf]));
  assert.equal(result.ok,true);
  assert.deepEqual(f.writes().map(w=>w.method),['POST']);
  assert.equal(f.writes()[0].body.data,'v=spf1 mx -all');
  assert.equal(result.receipts[0].state,'CREATED');
});

test('an existing SPF is replaced in place and the verification token beside it survives',async()=>{
  const f=recordingFetch({'uberbondhq.site':[
    {recordId:'v1',name:'@',type:'TXT',data:'google-site-verification=abc',ttl:3600},
    {recordId:'s1',name:'@',type:'TXT',data:'v=spf1 include:old.example ~all',ttl:3600}
  ]});
  const result=await createGoDaddyDnsAdapter({pat:'p',fetchFn:f.fetchFn,idempotencyKey:()=> 'k'}).applyChanges(plan(['uberbondhq.site'],[spf]));
  assert.equal(result.ok,true);
  assert.deepEqual(f.writes().map(w=>[w.method,w.url.split('/').pop()]),[['PUT','s1']]);
});

test('the GoDaddy default DMARC is replaced, never duplicated',async()=>{
  const f=recordingFetch({'uberbondhq.site':[{recordId:'d1',name:'_dmarc',type:'TXT',data:'v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;',ttl:3600}]});
  const result=await createGoDaddyDnsAdapter({pat:'p',fetchFn:f.fetchFn,idempotencyKey:()=> 'k'}).applyChanges(plan(['uberbondhq.site'],[{name:'_dmarc.uberbondhq.site',type:'TXT',value:'v=DMARC1; p=quarantine; adkim=r; aspf=r',ttl:600}]));
  assert.equal(result.ok,true);
  assert.deepEqual(f.writes().map(w=>[w.method,w.url.split('/').pop()]),[['PUT','d1']]);
});

test('ambiguous live DNS refuses the whole plan before any zone is written',async()=>{
  const f=recordingFetch({
    'uberbondhq.site':[],
    'uberbondlabs.site':[
      {recordId:'a',name:'@',type:'TXT',data:'v=spf1 a -all',ttl:600},
      {recordId:'b',name:'@',type:'TXT',data:'v=spf1 mx -all',ttl:600}
    ]
  });
  const result=await createGoDaddyDnsAdapter({pat:'p',fetchFn:f.fetchFn,idempotencyKey:()=> 'k'}).applyChanges(plan(['uberbondhq.site','uberbondlabs.site'],[spf,{...spf,name:'uberbondlabs.site'}]));
  assert.equal(result.ok,false);
  assert.equal(result.externalEffects,0);
  assert.deepEqual(result.reasonCodes,['multiple-existing-spf-records:uberbondlabs.site:@']);
  assert.equal(f.writes().length,0);
});

test('existing mail routing is not changed without an explicit MX replacement flag',async()=>{
  const zones={'uberbondhq.site':[{recordId:'m1',name:'@',type:'MX',data:'mx.other.example',priority:10,ttl:3600}]};
  const mx={name:'uberbondhq.site',type:'MX',priority:10,value:'mta.uberbond.cloud',ttl:600};
  const refused=recordingFetch(zones);
  const r1=await createGoDaddyDnsAdapter({pat:'p',fetchFn:refused.fetchFn}).applyChanges(plan(['uberbondhq.site'],[mx]));
  assert.equal(r1.ok,false);
  assert.match(r1.reasonCodes[0],/^existing-mx-would-change-mail-routing/);
  assert.equal(refused.writes().length,0);
  const allowed=recordingFetch(zones);
  const r2=await createGoDaddyDnsAdapter({pat:'p',fetchFn:allowed.fetchFn,idempotencyKey:()=> 'k'}).applyChanges(plan(['uberbondhq.site'],[mx],{allowMxReplacement:true}));
  assert.equal(r2.ok,true);
  assert.deepEqual(allowed.writes().map(w=>[w.method,w.url.split('/').pop()]),[['PUT','m1']]);
  const same=recordingFetch({'uberbondhq.site':[{recordId:'m1',name:'@',type:'MX',data:'mta.uberbond.cloud',priority:10,ttl:600}]});
  const r3=await createGoDaddyDnsAdapter({pat:'p',fetchFn:same.fetchFn}).applyChanges(plan(['uberbondhq.site'],[mx]));
  assert.equal(r3.ok,true);
  assert.equal(r3.externalEffects,0);
  assert.equal(r3.receipts[0].state,'ALREADY_PRESENT');
});
