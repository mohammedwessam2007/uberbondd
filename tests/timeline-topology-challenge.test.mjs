import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTimelineTopologyChallenge } from '../src/timeline-topology-challenge.mjs';

const graph={objective:'Same terminal result',terminalIds:['z'],nodes:[
  {id:'a',label:'manual prep',durationMs:100,requires:[],boundaryClass:'COORDINATION_OVERHEAD',necessity:'ASSUMPTION_ONLY',evidenceRefs:[]},
  {id:'z',label:'terminal',durationMs:10,requires:['a'],boundaryClass:'COMPUTE',necessity:'REQUIRED_BUT_COMPRESSIBLE',evidenceRefs:[]}
]};

test('trusted challenge validates a topology-changing hypothesis',()=>{
  const projected=structuredClone(graph);projected.nodes=projected.nodes.filter(n=>n.id!=='a');projected.nodes[0].requires=[];
  const out=compileTimelineTopologyChallenge({baselineGraph:graph,decision:'WORMHOLE',name:'delete manual prep',mechanismClass:'DELETE_REQUIREMENT',projectedGraph:projected,evidenceRefs:['context:trace'],transformations:[{targetId:'a',kind:'DELETE_REQUIREMENT',evidenceRefs:['context:trace'],causalBoundaryRebuttalRefs:[]},{targetId:'z',kind:'PARALLELIZE_DEPENDENCIES',evidenceRefs:['context:trace'],causalBoundaryRebuttalRefs:[]}]});
  assert.equal(out.ok,true);assert.equal(out.trustedEvidence.criticalPathSavingsMs,100);assert.equal(out.trustedEvidence.terminalContractPreserved,true);
});

test('no-shortcut decision requires a real mechanism search rather than assertion',()=>{
  const bad=compileTimelineTopologyChallenge({baselineGraph:graph,decision:'NO_VALID_SHORTCUT',attemptedMechanismClasses:['DELETE_REQUIREMENT'],reason:'nothing worked'});assert.equal(bad.ok,false);
  const good=compileTimelineTopologyChallenge({baselineGraph:graph,decision:'NO_VALID_SHORTCUT',attemptedMechanismClasses:['DELETE_REQUIREMENT','REPRESENTATION_ESCAPE','PRECOMPUTE','REUSE_EXISTING_CAPABILITY'],reason:'Each route preserves the same dependency in current evidence.'});
  assert.equal(good.ok,true);assert.equal(good.trustedEvidence.decision,'NO_VALID_SHORTCUT');
});

test('goalpost-moving shortcut is refused by trusted challenge',()=>{
  const projected=structuredClone(graph);projected.objective='Different easier result';projected.nodes[0].durationMs=0;
  const out=compileTimelineTopologyChallenge({baselineGraph:graph,decision:'WORMHOLE',name:'cheat',mechanismClass:'DELETE_REQUIREMENT',projectedGraph:projected,evidenceRefs:['idea:x'],transformations:[{targetId:'a',kind:'DELETE_REQUIREMENT',evidenceRefs:['idea:x'],causalBoundaryRebuttalRefs:[]}]});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('terminal-objective-mutation-refused'));
});
