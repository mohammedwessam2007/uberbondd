import test from 'node:test';
import assert from 'node:assert/strict';
import {runPhoenixRuntimeDoctor} from '../src/phoenix-runtime-doctor.mjs';

test('native cryptography and read-only schema contract are validated',async()=>{
 let called=false;
 const r=await runPhoenixRuntimeDoctor({async list(name,options){
  called=true;assert.equal(name,'phoenixCapsules');assert.equal(options.limit,0);return [];
 }});
 assert.equal(called,true);assert.equal(r.ok,true);
 assert.equal(r.status,'PHOENIX_NATIVE_CRYPTO_AND_DB_SCHEMA_READY');
 assert.equal(r.cryptoVerified,true);assert.equal(r.forgeryRejected,true);
 assert.equal(r.rowsWritten,0);assert.equal(r.ownerSessionRoundtripObserved,false);
});
test('database missing remains honestly incomplete',async()=>{
 const r=await runPhoenixRuntimeDoctor({async list(){throw Error('missing table')}});
 assert.equal(r.ok,false);assert.equal(r.tableQueryOk,false);
 assert.equal(r.status,'PHOENIX_RUNTIME_PROOF_INCOMPLETE');
});
test('unexpected records from limit-zero is not accepted as schema evidence',async()=>{
 const r=await runPhoenixRuntimeDoctor({async list(){return [{ownerSecret:'should-not-read'}]}});
 assert.equal(r.ok,false);assert.equal(r.tableQueryOk,false);
});
