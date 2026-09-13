import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCapabilityTotalState } from '../src/capability-total-state.mjs';

test('total capability state keeps native and external reality classes separate',()=>{
  const r=inspectCapabilityTotalState({sourceRevision:'TEST',observedAt:'2026-09-13T11:20:00Z'});
  assert.equal(r.ok,true);
  assert.equal(r.status,'CAPABILITY_TOTAL_INTERNAL_SURFACE_READY');
  assert.equal(r.state.nativeFirstParty.total,15);
  assert.equal(r.state.nativeFirstParty.active,15);
  assert.equal(r.state.optionalRuntimeSubstitutes.total,4);
  assert.equal(r.state.optionalRuntimeSubstitutes.ready,4);
  assert.equal(r.state.boundedResearchSecurity.total,2);
  assert.equal(r.state.boundedResearchSecurity.ready,2);
  assert.equal(r.state.internalCapabilityGapCount,0);
  assert.equal(r.state.externalRealityGapCount,7);
  assert.ok(r.state.externalOnly.some(x=>x.id==='autonomous-exploit-verification-runtime'));
  assert.ok(r.state.externalOnly.some(x=>x.id==='live-cross-platform-public-research-adapters'));
  assert.match(r.truthBoundary,/separate classes/i);
});
