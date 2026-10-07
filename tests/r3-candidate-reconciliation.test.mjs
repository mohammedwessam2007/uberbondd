import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('R3 reconciliation is metadata-only and cannot retry candidate inference',()=>{
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
