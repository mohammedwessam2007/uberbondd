import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Original bounded operation was replaced by the next one-time recovery step.
// Preserve its exact source guard; do not reinstate a retired production hook.
// Source: server.mjs at 1221e146ac37f0e0101fa6e9efe74b88888a4ec8.
const source=fs.readFileSync(new URL('./fixtures/retired-startup-guards/r3-candidate-reconciliation.txt',import.meta.url),'utf8');
const currentSource=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'34fa8505e15a4f0cb30c642405f2546c542a9bf67be3c8a4c5c31cd666d3410b');
assert.equal(currentSource.includes('UBERMIND_R3_CANDIDATE_RECONCILIATION'),false, 'retired operation must not restart on deployment');

test('retired R3 reconciliation is metadata-only and cannot retry candidate inference',()=>{
  const start=source.indexOf("UBERMIND_R3_CANDIDATE_RECONCILIATION");
  assert.ok(start>0);
  const window=source.slice(Math.max(0,start-5000),start+5000);
  assert.match(window,/infinite_opus_crown_resume_20261002_r3/);
  assert.match(window,/DISPATCHED_UNRECONCILED/);
  assert.match(window,/api\/v1\/generation\?id=/);
  assert.match(window,/PROVIDER_RECONCILED_PENDING_EVIDENCE/);
  assert.match(window,/verifyCrownProviderModel/);
  assert.match(window,/providerInferenceCalls:0/);
  assert.doesNotMatch(window,/api\/v1\/chat\/completions/);
});
