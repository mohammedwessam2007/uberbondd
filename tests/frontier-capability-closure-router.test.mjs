import test from 'node:test';
import assert from 'node:assert/strict';
import {routeFrontierCapabilityClosures} from '../src/frontier-capability-closure-router.mjs';

const entry=(id,name,overrides={})=>({id,name,maturity:'PARTIAL_PRIMITIVE',status:'SOURCE_AND_TEST_PRESENT',sources:[`src/${id}.mjs`],tests:[`tests/${id}.test.mjs`],runtimeReceipts:[],note:'bounded source/test primitive',...overrides});

test('source-only primitive is routed to runtime evidence before any later maturity claim',()=>{
  const out=routeFrontierCapabilityClosures({entries:[entry('final','Final',{note:'Source/test presence is not proof of correctness, runtime success, market truth, or authority.'})]});
  assert.equal(out.ok,true);
  assert.equal(out.routed[0].closureClass,'INTERNAL_RUNTIME_EVIDENCE');
  assert.equal(out.routed[0].ultimateBoundary,'EXTERNAL_OR_OWNER_ONLY');
});

test('after runtime proof, an external-validation primitive moves to external reality rather than more code',()=>{
  const out=routeFrontierCapabilityClosures({entries:[entry('world','World',{status:'OBSERVED_INTERNAL_RUNTIME_RECEIPT',runtimeReceipts:['artifact:runtime'],note:'Zero-effect simulation primitive; synthetic state never becomes external evidence or market truth.'})]});
  assert.equal(out.routed[0].closureClass,'EXTERNAL_OR_OWNER_ONLY');
});

test('explicit capability depth gaps remain internal deepening work',()=>{
  const out=routeFrontierCapabilityClosures({entries:[entry('rival','Future Rival',{status:'OBSERVED_INTERNAL_RUNTIME_RECEIPT',runtimeReceipts:['artifact:rival'],note:'Autonomous rival implementation is not yet present.'})]});
  assert.equal(out.routed[0].closureClass,'INTERNAL_DEEPENING');
  assert.equal(out.routed[0].ultimateBoundary,'INTERNAL_DEEPENING');
});

test('intentional safety gates cannot be reclassified as unfinished engineering',()=>{
  const out=routeFrontierCapabilityClosures({entries:[entry('ontology','Ontology',{note:'Autonomous canonical rewrite remains intentionally disabled.'})]});
  assert.equal(out.routed[0].closureClass,'INTENTIONALLY_GATED');
});

test('implemented capabilities are not reopened',()=>{
  const out=routeFrontierCapabilityClosures({entries:[entry('done','Done',{maturity:'IMPLEMENTED_PRIMITIVE',status:'SOURCE_AND_TEST_PRESENT'})]});
  assert.equal(out.routed[0].closureClass,'ALREADY_IMPLEMENTED');
  assert.equal(out.counts.ALREADY_IMPLEMENTED,1);
});

test('routing never promotes maturity or grants effects',()=>{
  const input=entry('x','X');
  const out=routeFrontierCapabilityClosures({entries:[input]});
  assert.equal(input.maturity,'PARTIAL_PRIMITIVE');
  assert.equal(out.externalEffectAuthority,'NONE');
  assert.equal(out.businessEffectAuthority,'NONE');
  assert.match(out.truthBoundary,/DOES_NOT_PROMOTE_MATURITY/);
});
