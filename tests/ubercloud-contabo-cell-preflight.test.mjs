import test from 'node:test';
import assert from 'node:assert/strict';
import { selectContaboMailCellInputs, discoverContaboMailCellInputs, createContaboPreflightClient } from '../src/ubercloud-contabo-cell-preflight.mjs';

test('deterministically prefers standard Ubuntu 24.04 and an UberBond-named SSH key',()=>{
  const result=selectContaboMailCellInputs({images:[
    {imageId:'u22',name:'Ubuntu',version:'22.04',osType:'Linux',standardImage:true},
    {imageId:'u24',name:'Ubuntu',version:'24.04',osType:'Linux',standardImage:true},
    {imageId:'win',name:'Windows 2025',version:'2025',osType:'Windows',standardImage:true}
  ],secrets:[
    {secretId:7,name:'default-key',type:'ssh'},
    {secretId:9,name:'uberbond-mail-cell',type:'ssh'},
    {secretId:11,name:'password',type:'password'}
  ]});
  assert.equal(result.ok,true);assert.equal(result.status,'CONTABO_MAIL_CELL_PREFLIGHT_READY');
  assert.equal(result.selection.imageId,'u24');assert.equal(result.selection.sshKeySecretId,9);assert.equal(result.selection.regionId,'EU');assert.equal(result.selection.productId,'V153');
  assert.equal(result.externalEffectLedger.providerCalls,0);assert.equal(result.externalEffectLedger.spendCents,0);
});

test('preflight refuses to invent an SSH credential when none exists',()=>{
  const result=selectContaboMailCellInputs({images:[{imageId:'u24',name:'Ubuntu 24.04',version:'24.04',osType:'Linux',standardImage:true}],secrets:[]});
  assert.equal(result.ok,false);assert.ok(result.reasonCodes.includes('existing-ssh-key-secret-required'));
  assert.equal(result.externalEffectLedger.credentialChanges,0);
});

test('read-only discovery performs exactly two provider reads and no mutations',async()=>{
  const calls=[];
  const result=await discoverContaboMailCellInputs({client:{async listImages(){calls.push('images');return[{imageId:'u24',name:'Ubuntu 24.04',version:'24.04',osType:'Linux',standardImage:true}];},async listSecrets(input){calls.push(['secrets',input]);return[{secretId:42,name:'uberbond',type:'ssh'}];}}});
  assert.equal(result.ok,true);assert.equal(result.selection.sshKeySecretId,42);assert.equal(calls.length,2);
  assert.equal(result.externalEffectLedger.providerCalls,2);assert.equal(result.externalEffectLedger.purchases,0);assert.equal(result.externalEffectLedger.credentialChanges,0);
});

test('HTTP preflight client sends credentials only to auth body and caches token',async()=>{
  const calls=[];
  const fetchFn=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/protocol/openid-connect/token'))return{ok:true,status:200,json:async()=>({access_token:'token-abc'})};
    if(String(url).includes('/v1/compute/images'))return{ok:true,status:200,json:async()=>({data:[{imageId:'u24',name:'Ubuntu 24.04',version:'24.04',osType:'Linux',standardImage:true}]})};
    if(String(url).includes('/v1/secrets'))return{ok:true,status:200,json:async()=>({data:[{secretId:42,name:'uberbond',type:'ssh'}]})};
    throw new Error('unexpected-url');
  };
  const client=createContaboPreflightClient({clientId:'cid',clientSecret:'secret-value',apiUser:'owner@example.com',apiPassword:'password-value',fetchFn,requestId:()=> '00000000-0000-4000-8000-000000000001'});
  const images=await client.listImages();const secrets=await client.listSecrets({type:'ssh'});
  assert.equal(images.length,1);assert.equal(secrets.length,1);assert.equal(calls.length,3);
  assert.ok(calls.every(row=>!row.url.includes('secret-value')&&!row.url.includes('password-value')));
  assert.equal(calls[1].options.headers.authorization,'Bearer token-abc');assert.equal(calls[2].options.headers.authorization,'Bearer token-abc');
});
