import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { verifyOwnedTarget } from '../src/owned-target-security-verifier.mjs';

test('owned-local verifier performs only read-only methods against a loopback fixture',async(t)=>{
  const methods=[];
  const server=http.createServer((req,res)=>{
    methods.push(req.method);
    res.setHeader('content-security-policy',"default-src 'self'");
    res.setHeader('x-content-type-options','nosniff');
    res.setHeader('referrer-policy','same-origin');
    res.setHeader('strict-transport-security','max-age=31536000');
    res.statusCode=200;
    if(req.method==='HEAD'){res.end();return;}
    res.end('ok');
  });
  await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',err=>err?reject(err):resolve()));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const address=server.address();
  const result=await verifyOwnedTarget({url:`http://127.0.0.1:${address.port}/`,targetClass:'OWNED_LOCAL'});
  assert.equal(result.ok,true);
  assert.equal(result.status,'OWNED_SECURITY_VERIFICATION_COMPLETE');
  assert.deepEqual(methods,['HEAD','OPTIONS','GET']);
  assert.deepEqual(result.receipt.methods,['HEAD','OPTIONS','GET']);
  assert.equal(result.receipt.readOnly,true);
  assert.equal(result.receipt.exploitPayloads,false);
  assert.equal(result.receipt.credentialAccess,false);
  assert.equal(result.receipt.persistence,false);
  assert.equal(result.externalEffectAuthority,'SECURITY_TEST_ONLY');
  assert.match(result.receiptDigest,/^[a-f0-9]{64}$/);
});
