import test from 'node:test';
import assert from 'node:assert/strict';
import { UBER_SOVEREIGN_LAYERS } from '../src/uber-sovereign-stack.mjs';
import { compileUberOrchestrationPlan, inspectUberOrchestrationIntegrity } from '../src/uber-orchestration-control-plane.mjs';

const sourceEvidence=layer=>({sourceVerified:true,testsPassed:true,controlOwned:false,providerReplaceable:false,stateExportable:false,authorityRoot:'',runtimeObserved:false,evidenceRefs:[`test:source:${layer.id}`]});
const runtimeEvidence=layer=>({sourceVerified:true,testsPassed:true,controlOwned:true,providerReplaceable:true,stateExportable:layer.stateful?true:false,authorityRoot:'UBERBOND',runtimeObserved:layer.runtimeProof?true:false,evidenceRefs:[`test:runtime:${layer.id}`]});
const evidenceMap=builder=>Object.fromEntries(UBER_SOVEREIGN_LAYERS.map(layer=>[layer.id,builder(layer)]));

// Asserted against the registry's own length rather than a literal.
//
// This said 28 and UBEROCEAN was added to UBER_SOVEREIGN_LAYERS without being
// added to the dependency graph or the phases. The registry went to 29, the
// graph stayed at 28, the topology could not resolve at all, and six tests went
// red on main. A literal turns that into "someone must remember to bump a
// number"; comparing the three to each other makes the drift itself the failure.
test('Uber orchestration accounts for every canonical sovereign layer exactly once with an acyclic dependency graph',()=>{
  const expected=UBER_SOVEREIGN_LAYERS.length;
  const integrity=inspectUberOrchestrationIntegrity();
  assert.equal(integrity.ok,true);
  assert.equal(integrity.integrity.registryIds.length,expected);
  assert.equal(new Set(integrity.integrity.registryIds).size,expected,'a duplicate layer id would pass a length check');
  assert.equal(integrity.topology.order.length,expected,'every layer must be reachable in the dependency topology');
  assert.equal(new Set(integrity.integrity.phaseIds).size,expected);
  assert.deepEqual(integrity.integrity.missingFromGraph,[]);
  assert.deepEqual(integrity.integrity.missingFromPhases,[]);
});
test('source-ready orchestration never impersonates sovereign independence or live runtime',()=>{const plan=compileUberOrchestrationPlan({target:'SOURCE',layerEvidence:evidenceMap(sourceEvidence)});assert.equal(plan.ok,true);assert.equal(plan.status,'UBER_ORCHESTRATION_SOURCE_READY');assert.equal(plan.counts.ready,UBER_SOVEREIGN_LAYERS.length);assert.notEqual(plan.stackStatus,'UBER_SOVEREIGN_STACK_INDEPENDENCE_READY');assert.equal(plan.executionAuthority,'NONE');assert.equal(plan.businessEffectAuthority,'NONE');});
test('runtime orchestration blocks downstream organs when a dependency lacks observed runtime evidence',()=>{const evidence=evidenceMap(runtimeEvidence);evidence.UBERIDENTITY.runtimeObserved=false;const plan=compileUberOrchestrationPlan({target:'RUNTIME',layerEvidence:evidence});assert.equal(plan.ok,true);assert.notEqual(plan.status,'UBER_ORCHESTRATION_RUNTIME_READY');assert.equal(plan.layerStates.UBERIDENTITY.ready,false);assert.ok(plan.layerStates.UBERMESH.dependencyBlockers.includes('UBERIDENTITY'));assert.ok(plan.layerStates.UBERCONTROL.dependencyBlockers.includes('UBERIDENTITY'));});
test('provider authority cannot be laundered into independence through orchestration',()=>{const evidence=evidenceMap(runtimeEvidence);evidence.UBERSOURCE.authorityRoot='GITHUB';const plan=compileUberOrchestrationPlan({target:'INDEPENDENCE',layerEvidence:evidence});assert.equal(plan.ok,true);assert.equal(plan.layerStates.UBERSOURCE.ready,false);assert.ok(plan.layerStates.UBERSOURCE.reasonCodes.includes('uberbond-authority-root-required'));assert.ok(plan.layerStates.UBERFORGE.dependencyBlockers.includes('UBERSOURCE'));assert.equal(plan.providerAuthority,'NONE');});
test('complete evidence makes every layer runtime-ready but orchestration still grants no execution authority',()=>{const plan=compileUberOrchestrationPlan({target:'RUNTIME',layerEvidence:evidenceMap(runtimeEvidence),mission:{missionId:'runtime-proof',maxParallel:8}});assert.equal(plan.ok,true);assert.equal(plan.status,'UBER_ORCHESTRATION_RUNTIME_READY');assert.equal(plan.counts.ready,UBER_SOVEREIGN_LAYERS.length);assert.equal(plan.blockers.length,0);assert.equal(plan.nextActions.length,0);assert.equal(plan.executionAuthority,'NONE');assert.equal(plan.promotionAuthority,'NONE');assert.equal(plan.externalEffectAuthority,'NONE');});
test('invalid orchestration target fails closed',()=>{const plan=compileUberOrchestrationPlan({target:'MAGIC',layerEvidence:{}});assert.equal(plan.ok,false);assert.ok(plan.reasonCodes.includes('recognized-orchestration-target-required'));assert.equal(plan.executionAuthority,'NONE');});
