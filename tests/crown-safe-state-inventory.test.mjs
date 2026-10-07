import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
test('safe Crown inventory cannot call providers or expose sealed payloads',()=>{
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
