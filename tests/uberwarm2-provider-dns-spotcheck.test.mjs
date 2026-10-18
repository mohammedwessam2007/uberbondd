import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeUberWarm2ProviderDnsSpotcheck as spotcheck} from '../src/uberwarm2-provider-dns-spotcheck.mjs';
import {compileOperationalSnapshot} from '../src/uberwarm2-operational-journal.mjs';
const items = [{name:'one.example',id:'one'}, {name:'two.example',id:'two'}];
const response = domain => ({ok:true,receipt:{responseDigest:'sha256:'+'a'.repeat(64)},data:{
  domain,ns_status:true,all_verified:true,
  records:{mx:{verified:true},spf:{verified:true},dkim:{verified:true},dmarc:{verified:true}}
}});
const at = '2026-10-19T00:00:00.000Z';

test('one and only one authenticated DNS GET, no sending or billing',async()=>{
  let count=0, selected;
  const r=await spotcheck({domains:items,now:at,getDnsStatus:async({domainId})=>{
    count++;selected=domainId;return response(items.find(x=>x.id===domainId).name);
  }});
  assert.equal(count,1); assert.ok(['one','two'].includes(selected));
  assert.equal(r.status,'UBERWARM2_PROVIDER_DNS_SPOTCHECK_REPORTED_READY');
  assert.equal(r.reportedRecordTypesVerified,4);
  assert.equal(r.authenticatedProviderReceiptObserved,true);
  assert.equal(r.independentlyVerifiedMessageAuthentication,false);
  assert.equal(r.sendAuthority,'NONE'); assert.equal(r.sends,0); assert.equal(r.spendCents,0);
  assert.equal(JSON.stringify(r).includes(selected),false);
});
test('rotating selected domain is deterministic across provider reorder',async()=>{
  const get = ({domainId})=>response(items.find(x=>x.id===domainId).name);
  const a=await spotcheck({domains:items,now:at,getDnsStatus:get});
  const b=await spotcheck({domains:[...items].reverse(),now:at,getDnsStatus:get});
  assert.deepEqual(a,b);
  let selected=[];
  const spy=({domainId})=>{selected.push(domainId); return get({domainId});};
  await spotcheck({domains:items,now:at,getDnsStatus:spy});
  await spotcheck({domains:items,now:new Date(Date.parse(at)+300000),getDnsStatus:spy});
  assert.equal(new Set(selected).size,2);
});
test('no valid inventory or reader triggers zero provider calls',async()=>{
  for (const domains of [[],null,[items[0],items[0]],
    [{name:'evil.invalid',id:'one'},{name:'other.invalid',id:'one'}],
    [{name:'invalid',id:'one'}], [{name:'one.example',id:'\nwrite'}]]) {
    let calls=0;
    const r=await spotcheck({domains,now:at,getDnsStatus:async()=>{calls++;return response('one.example');}});
    assert.equal(r.status,'UBERWARM2_PROVIDER_DNS_SPOTCHECK_HELD');
    assert.equal(r.checked,false); assert.equal(calls,0); assert.equal(r.sends,0);
  }
});
test('provider receipt, exact domain and all DNS records required; no false-positive',async()=>{
  const cases=[
    ()=>({ok:false}),
    ()=>({...response('one.example'),receipt:null}),
    ()=>response('other.example'),
    ()=>({...response('one.example'),data:{...response('one.example').data,all_verified:false}}),
    ()=>({...response('one.example'),data:{...response('one.example').data,ns_status:false}}),
    ()=>({...response('one.example'),data:{...response('one.example').data,records:{...response('one.example').data.records,dkim:{verified:false}}}}),
  ];
  for (const factory of cases) {
    const r=await spotcheck({domains:[items[0]],now:at,getDnsStatus:factory});
    assert.equal(r.providerReportedReady,false);
    assert.equal(r.status,'UBERWARM2_PROVIDER_DNS_SPOTCHECK_HELD');
    assert.equal(r.sendAuthority,'NONE');
  }
});
test('provider failure and invalid time fail closed',async()=>{
  const throwing=await spotcheck({domains:[items[0]],now:at,getDnsStatus:()=>{throw Error('private endpoint secret');}});
  assert.equal(throwing.checked,true);assert.equal(throwing.providerReportedReady,false);
  assert.equal(JSON.stringify(throwing).includes('secret'),false);
  const invalid=await spotcheck({domains:[items[0]],now:'invalid',getDnsStatus:()=>{throw Error('should not call');}});
  assert.equal(invalid.checked,false);
});
test('operational database snapshot records only redacted aggregate spotcheck evidence',()=>{
  const proof={checked:true,providerReportedReady:true,reportedRecordTypesVerified:4,
    authenticatedProviderReceiptObserved:true,selectedDomain:'private.example',token:'private'};
  const actual=compileOperationalSnapshot({source:'a'.repeat(40),observedAt:at,
    sends:0,runtimeReady:false,sendAuthority:'NONE',status:'BLOCKED_FOR_SENDING',
    provider:{providerDnsSpotcheck:proof}});
  assert.equal(actual.providerDnsSpotcheck.checked,true);
  assert.equal(actual.providerDnsSpotcheck.reportedRecordTypesVerified,4);
  assert.equal(actual.providerDnsSpotcheck.independentMessageAuthenticationClaimed,false);
  assert.equal(actual.providerDnsSpotcheck.sendingAuthority,'NONE');
  assert.equal(JSON.stringify(actual).includes('private'),false);
});
test('production Docker includes new spotcheck module and the doctor imports it',()=>{
  const docker=readFileSync(new URL('../Dockerfile.uberwarm-read-monitor',import.meta.url),'utf8');
  const doctor=readFileSync(new URL('../scripts/uberwarm2-live-read-doctor.mjs',import.meta.url),'utf8');
  assert.match(docker,/COPY src\/uberwarm2-provider-dns-spotcheck\.mjs/);
  assert.match(doctor,/from '\.\.\/src\/uberwarm2-provider-dns-spotcheck\.mjs'/);
});
