import test from 'node:test';
import assert from 'node:assert/strict';
import { parameterizedMultiplicityProgramsV10, runParameterizedMultiplicityDepthV10 } from '../src/parameterized-multiplicity-depth-v10.mjs';

test('v10 exposes a generic threshold family rather than target names',()=>{
  const programs=parameterizedMultiplicityProgramsV10();
  assert.ok(programs.length>1000);
  assert.ok(programs.every(p=>!/squarefree|cubefree|fourth|mobius|oeis/i.test(p.id)));
  assert.ok(programs.some(p=>p.spec.threshold===4&&p.spec.outputMode==='DEPTH_LT'));
});
test('v10 requires exact semantics on every deterministic public target',()=>{
  const r=runParameterizedMultiplicityDepthV10();
  assert.equal(r.ok,true);
  if(!r.falsifierTriggered) assert.ok(r.results.every(x=>x.heldOut.accuracy===1));
});
test('v10 never self-promotes beyond evidence',()=>{
  const r=runParameterizedMultiplicityDepthV10();
  if(!r.falsifierTriggered) assert.equal(r.promotionCandidate.authority,'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  assert.match(r.claimBoundary,/FRESH_UNSEEN_K_ORDER/);
  assert.equal(r.externalEffectAuthority,'NONE');
});
