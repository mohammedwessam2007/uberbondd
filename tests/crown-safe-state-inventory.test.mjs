import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
// Original bounded operation was replaced by the next one-time recovery step.
// Preserve its exact source guard; do not reinstate a retired production hook.
// Source: server.mjs at 698b3442c2cec913b48e41852e438b696cdb2c0a.
const source=fs.readFileSync(new URL('./fixtures/retired-startup-guards/crown-safe-state-inventory.txt',import.meta.url),'utf8');
const currentSource=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'47394de288d45124c846eef6a63b0758922cb736b688797125ab7001019d6f53');
assert.equal(currentSource.includes('UBERMIND_CROWN_SAFE_STATE_INVENTORY'),false, 'retired operation must not restart on deployment');
test('retired safe Crown inventory cannot call providers or expose sealed payloads',()=>{
  const i=source.indexOf('UBERMIND_CROWN_SAFE_STATE_INVENTORY');
  assert.ok(i>0);
  const w=source.slice(Math.max(0,i-6000),i+2400);
  assert.match(w,/startsWith\('infinite_opus_crown_'\)/);
  assert.match(w,/sealedEvidencePresent:Boolean/);
  assert.match(w,/providerInferenceCalls:0/);
  assert.match(w,/providerMetadataCalls:0/);
  assert.doesNotMatch(w,/openCrownCheckpoint/);
  assert.doesNotMatch(w,/api\/v1\/chat\/completions/);
  assert.doesNotMatch(w,/api\/v1\/generation\?id=/);
  assert.doesNotMatch(w,/answers:/);
  assert.doesNotMatch(w,/rubric:/);
});
