import test from 'node:test';
import assert from 'node:assert/strict';
import { compileKilimanjaroEvidence } from '../src/kilimanjaro-evidence.mjs';

test('Kilimanjaro compiles exact suite counts into bounded evidence without inventing runtime proof',()=>{
  const out=compileKilimanjaroEvidence({tests:100,pass:98,fail:0,skipped:2,sourceRef:'tap:exact-head'});
  assert.equal(out.ok,true);assert.equal(out.status,'KILIMANJARO_SUITE_EVIDENCE_PASS');assert.equal(out.runtimeClaim,'NONE');assert.equal(out.externalOutcomeClaim,'NONE');
});

test('Kilimanjaro refuses inconsistent suite counts instead of calling them completion evidence',()=>{
  const out=compileKilimanjaroEvidence({tests:100,pass:99,fail:0,skipped:0,sourceRef:'tap:bad'});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('consistent-bounded-suite-counts-and-source-ref-required'));
});
