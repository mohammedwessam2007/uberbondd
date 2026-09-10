import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSandwichAutocatalyticDirective, compileSandwichAutocatalyticTask } from '../src/sandwich-autocatalytic-governor.mjs';

const HEAD='a'.repeat(40);
const closed={ok:true,status:'FINITE_ENGINEERING_ALREADY_CLOSED',baseRevision:HEAD,taskRequired:false};

test('resident sovereign worker computes fresh connectome evidence from exact source for descendant genesis',()=>{
  const source=readFileSync(new URL('../scripts/sovereign-native-local-model-worker.mjs',import.meta.url),'utf8');
  assert.match(source,/compileUberBondCognitiveGraph/);
  assert.match(source,/compileConnectomeAutopoiesis/);
  assert.match(source,/context:connectome-autopoiesis/);
  assert.match(source,/main:\$\{taskBase\(task\)\}/);
  assert.doesNotMatch(source,/https:\/\/(api\.|openai|anthropic).*connectome/i);
});

test('post-finite governor explicitly prioritizes real connectome debt but refuses graph busywork',()=>{
  const directive=compileSandwichAutocatalyticDirective({baseRevision:HEAD,finiteDirective:closed});
  assert.equal(directive.ok,true);
  assert.match(directive.nextTransition,/AUDIT_CONNECTOME/);
  assert.match(directive.connectomeLaw,/ISOLATED_CAPABILITY_IS_INCOMPLETE_CAPABILITY/);
  assert.match(directive.connectomeLaw,/HEALTHY_CONNECTOME_MUST_NOT_MANUFACTURE_BRIDGE_WORK/);
  const task=compileSandwichAutocatalyticTask({directive,date:new Date('2026-09-11T00:00:00Z')});
  assert.ok(task.constraints.includes('connectome-autopoiesis-audit-required-before-descendant-selection'));
  assert.ok(task.constraints.includes('healthy-connectome-must-not-manufacture-bridge-work'));
  assert.ok(task.constraints.includes('connectome-feature-still-requires-temporal-and-topology-binding'));
  assert.ok(task.forbiddenActions.includes('manufacture-connectome-debt-when-audit-is-healthy'));
  assert.ok(task.forbiddenActions.includes('treat-cognitive-edge-as-execution-authority'));
});

test('connectome candidate remains inside the same trusted Future Raid, Wormhole and Sandwich authority funnel',()=>{
  const directive=compileSandwichAutocatalyticDirective({baseRevision:HEAD,finiteDirective:closed});
  const task=compileSandwichAutocatalyticTask({directive,date:new Date('2026-09-11T00:00:00Z')});
  for(const ref of ['source:connectome-autopoiesis','source:uberbond-cognitive-graph','context:connectome-autopoiesis','doc:TEMPORAL_FOUNDRY_CANON','doc:TIMELINE_TOPOLOGY_ENGINE_CANON']) assert.ok(task.contextRefs.includes(ref),ref);
  for(const output of ['connectomeAudit','connectomeFeatureCandidate','futureCapabilityDecomposition','timelineTopologyAnalysis']) assert.ok(task.requiredOutputs.includes(output),output);
  assert.equal(task.consequenceClass,'LOCAL_PREPARATION');
  assert.equal(task.objective.length<=1200,true,`objective was ${task.objective.length}`);
}
