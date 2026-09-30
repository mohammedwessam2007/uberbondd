import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const full=JSON.parse(fs.readFileSync(new URL('../config/openrouter-frontier-vm-full-stack-v4.json',import.meta.url),'utf8'));
const cockpit=JSON.parse(fs.readFileSync(new URL('../config/typingmind-opus-quality-mincost-v3.json',import.meta.url),'utf8'));

test('TypingMind is cockpit only and cannot redefine UberMind',()=>{
  assert.equal(cockpit.scope,'TYPINGMIND_COCKPIT_PROFILE_ONLY');
  assert.match(cockpit.supersessionLaw,/DOES_NOT_SUPERSEDE_OPEN_ROUTER/);
  assert.equal(full.typingMind.role,'COCKPIT_ONLY');
  assert.equal(full.typingMind.nativeProfile,'config/typingmind-opus-quality-mincost-v3.json');
});

test('JEV remains a first-class semantic control plane below exact substrate and above cheap swarm',()=>{
  assert.equal(full.layers[0].name,'EXACT_SUBSTRATE');
  assert.equal(full.layers[1].name,'JEV_HYPERREFLEX');
  assert.equal(full.layers[2].name,'CHEAP_HETEROGENEOUS_EXPLORATION');
  assert.equal(full.jev.role,'SEMANTIC_CONTROL_PLANE_NOT_SOVEREIGN_REASONER');
  assert.equal(full.jev.maySuppressRequiredCrown,false);
  assert.deepEqual(full.jev.regressionAction,['FREEZE','DECOMPILE','CROWN','REVALIDATE']);
});

test('full stack preserves Frontier VM, synthesis, Crown/Pantheon, Reality Court and crystallization',()=>{
  assert.deepEqual(full.layers.map(x=>x.name),[
    'EXACT_SUBSTRATE','JEV_HYPERREFLEX','CHEAP_HETEROGENEOUS_EXPLORATION',
    'ADVERSARIAL_SYNTHESIS_COURT','CROWN_PANTHEON','REALITY_COURT','CRYSTALLIZATION'
  ]);
  assert.equal(full.crown.taskClassPantheon,true);
  assert.equal(full.crown.permanent,false);
});

test('Cognitive Supercompiler runs before model-chain fallback',()=>{
  for(const pass of [
    'EXACT_PRECHECK','COMMON_SEMANTIC_SUBEXPRESSION_ELIMINATION','DEAD_BRANCH_ELIMINATION',
    'PARTIAL_EVALUATION','EVIDENCE_MULTICAST','FRONTIER_RESIDUALIZATION'
  ]) assert.ok(full.compilerPasses.includes(pass),pass);
  assert.match(cockpit.cognitiveCompilerBoundary,/BEFORE_ANY_MODEL_CHAIN/);
});

test('intelligence-capital organs cannot be amputated by cost workflow simplification',()=>{
  for(const organ of [
    'FRONTIER_THOUGHT_BONDS','DECISION_FRANCHISES','LIVING_EVIDENCE_GRAPH',
    'SEMANTIC_DEMAND_EXCHANGE','COGNITIVE_CAPSULES_SEMANTIC_ABI',
    'SELF_EVOLVING_TASK_CLASS_COMPILERS','FRONTIER_PATCH_PROTOCOL',
    'REFLEX_MICROSTUDENTS','SEMANTIC_E_GRAPH','GHOST_AGENTS','CROWN_BOUNDARY_QUERYING'
  ]) assert.ok(full.cognitionCapital.mechanisms.includes(organ),organ);
  assert.ok(full.antiAmputation.includes('NO_NEW_MODEL_OR_WORKFLOW_REDEFINES_UBERMIND_WHOLE'));
});

test('final invariant stays new->frontier, bounded->JEV, exact->code, drift->frontier',()=>{
  assert.deepEqual(full.finalInvariant,{
    newOrUncertain:'FRONTIER',
    boundedCertified:'JEV',
    exactStable:'CODE',
    drift:'FRONTIER'
  });
});
