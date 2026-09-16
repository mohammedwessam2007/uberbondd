import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOwnedTarget } from '../src/owned-target-security-verifier.mjs';
import { searchPublicAdapter, searchPublicMesh } from '../src/public-research-adapter-mesh.mjs';

function response({status=200,json={},headers={}}={}){return {ok:status>=200&&status<300,status,headers:new Headers(headers),json:async()=>json,body:{cancel:async()=>{}}};}

test('owned security verifier is read-only and bounded to owned nonproduction targets',async()=>{
  const methods=[];
  const fetchImpl=async(url,options)=>{methods.push(options.method);return response({headers:{'content-security-policy':"default-src 'self'",'x-content-type-options':'nosniff','referrer-policy':'same-origin','strict-transport-security':'max-age=31536000'}});};
  const r=await verifyOwnedTarget({url:'http://127.0.0.1:3000/',targetClass:'OWNED_LOCAL',fetchImpl});
  assert.equal(r.ok,true);
  assert.deepEqual(methods,['HEAD','OPTIONS','GET']);
  assert.equal(r.receipt.exploitPayloads,false);
  assert.equal(r.receipt.credentialAccess,false);
  assert.equal(r.externalEffectAuthority,'SECURITY_TEST_ONLY');
  for(const [url,targetClass] of [['https://example.com','THIRD_PARTY'],['https://example.com','OWNED_PRODUCTION'],['https://example.com','OWNED_LOCAL'],['http://example.com','OWNED_TEST']]){
    const denied=await verifyOwnedTarget({url,targetClass,fetchImpl});
    assert.equal(denied.ok,false,`${targetClass}:${url}`);
  }
});

test('public adapter normalizes provenance',async()=>{
  const fetchImpl=async()=>response({json:{objects:[{package:{name:'alpha',description:'A',version:'1.0.0',date:'2026-09-13',links:{npm:'https://www.npmjs.com/package/alpha'}},score:{final:0.9}}]}});
  const r=await searchPublicAdapter({adapter:'npm',query:'agent',limit:3,fetchImpl});
  assert.equal(r.ok,true);
  assert.equal(r.results[0].adapter,'npm');
  assert.match(r.results[0].evidenceDigest,/^[a-f0-9]{64}$/);
  assert.equal(r.externalEffectAuthority,'READ_ONLY_NETWORK');
});

test('public mesh tolerates one failed adapter but requires two successes',async()=>{
  const fetchImpl=async(url)=>{
    if(url.includes('api.github.com'))return response({json:{items:[{id:1,full_name:'o/r',html_url:'https://github.com/o/r',description:'repo',stargazers_count:1,updated_at:'2026-09-13',language:'JS'}]}});
    if(url.includes('hn.algolia.com'))return response({status:503});
    if(url.includes('registry.npmjs.org'))return response({json:{objects:[{package:{name:'pkg',description:'pkg',version:'1',date:'2026',links:{npm:'https://www.npmjs.com/package/pkg'}},score:{final:0.8}}]}});
    throw new Error('unexpected');
  };
  const r=await searchPublicMesh({query:'agent',fetchImpl});
  assert.equal(r.ok,true);
  assert.equal(r.status,'PUBLIC_RESEARCH_MESH_PARTIAL');
  assert.deepEqual(r.state.successfulAdapters,['github','npm']);
  assert.deepEqual(r.state.failedAdapters,['hackernews']);
  const denied=await searchPublicMesh({query:'agent',adapters:['github'],fetchImpl});
  assert.equal(denied.ok,false);
});
