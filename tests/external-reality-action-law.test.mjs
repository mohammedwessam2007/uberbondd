import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExternalRealityActionBoundary } from '../src/external-reality-action-law.mjs';

const valid=()=>({actionClass:'MESSAGE',lawful:true,consentSatisfied:true,rightsRespected:true,permissionsSatisfied:true,platformBoundariesSatisfied:true,physicallyFeasible:true,evidenceRefs:['evidence:law','evidence:consent']});

test('external action planning remains constrained by law consent rights permissions platform boundaries and physics',()=>{
  const out=evaluateExternalRealityActionBoundary(valid());
  assert.equal(out.ok,true);assert.equal(out.status,'EXTERNAL_REALITY_BOUNDARY_SATISFIED_FOR_PLANNING_ONLY');assert.equal(out.businessEffectAuthority,'NONE');assert.equal(out.externalEffectAuthority,'NONE');
});

test('missing consent or permission evidence blocks external action instead of inventing authority',()=>{
  const out=evaluateExternalRealityActionBoundary({...valid(),consentSatisfied:false,permissionsSatisfied:false});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('external-reality-consentSatisfied-not-established'));assert.ok(out.reasonCodes.includes('external-reality-permissionsSatisfied-not-established'));assert.equal(out.externalEffectAuthority,'NONE');
});
