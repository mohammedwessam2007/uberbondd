import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTimelineTopology,
  buildTimelineCannibalismPacket,
  evaluateWormholeCandidate
} from '../src/timeline-topology-engine.mjs';

const baselineGraph = {
  objective: 'Produce the same verified physical prototype',
  terminalIds: ['verify'],
  nodes: [
    { id:'plan', label:'Manual coordination plan', durationMs:240, requires:[], boundaryClass:'COORDINATION_OVERHEAD', necessity:'ASSUMPTION_ONLY', evidenceRefs:[] },
    { id:'analysis', label:'Compute design', durationMs:360, requires:['plan'], boundaryClass:'COMPUTE', necessity:'REQUIRED_BUT_COMPRESSIBLE', evidenceRefs:[] },
    { id:'fabricate', label:'Fabricate physical part', durationMs:1440, requires:['analysis'], boundaryClass:'MATTER_TRANSFORMATION', necessity:'EVIDENCE_BOUND_CAUSAL_FLOOR', evidenceRefs:['measurement:current-fabrication-process'] },
    { id:'verify', label:'Verify same terminal contract', durationMs:60, requires:['fabricate'], boundaryClass:'ELAPSED_EVIDENCE', necessity:'REQUIRED_BUT_COMPRESSIBLE', evidenceRefs:[] }
  ]
};

test('finds the actual critical path and separates current evidence-bound floor from attackable time',()=>{
  const result=analyzeTimelineTopology(baselineGraph);
  assert.equal(result.ok,true);
  assert.deepEqual(result.criticalPathNodeIds,['plan','analysis','fabricate','verify']);
  assert.equal(result.criticalPathDurationMs,2100);
  assert.equal(result.declaredEvidenceBoundFloorMs,1440);
  assert.equal(result.attackableCriticalPathMs,660);
  assert.equal(result.attackTargets[0].id,'analysis');
  assert.match(result.floorBoundary,/NOT_UNIVERSAL_PROOF/);
});

test('cycle and missing dependency graphs fail closed',()=>{
  const cycle=structuredClone(baselineGraph);cycle.nodes[0].requires=['verify'];
  assert.ok(analyzeTimelineTopology(cycle).reasonCodes.includes('dependency-cycle-refused'));
  const missing=structuredClone(baselineGraph);missing.nodes[1].requires=['ghost'];
  assert.ok(analyzeTimelineTopology(missing).reasonCodes.includes('dependency-reference-missing'));
});

test('evidence-bound causal floor cannot be declared without evidence',()=>{
  const bad=structuredClone(baselineGraph);bad.nodes[2].evidenceRefs=[];
  const result=analyzeTimelineTopology(bad);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('valid-timeline-nodes-required'));
});

test('timeline cannibalism prioritizes deletion and topology change rather than faster execution only',()=>{
  const analysis=analyzeTimelineTopology(baselineGraph);
  const packet=buildTimelineCannibalismPacket({analysis,maxTargets:3});
  assert.equal(packet.ok,true);
  assert.equal(packet.selectedTargets.length,3);
  assert.ok(packet.searchOrders.includes('DELETE_THE_STEP_BEFORE_OPTIMIZING_THE_STEP'));
  assert.match(packet.handoff,/SANDWICH/);
});

test('a genuine projected shortcut may remove conventional coordination while preserving the terminal contract',()=>{
  const analysis=analyzeTimelineTopology(baselineGraph);
  const projected=structuredClone(baselineGraph);
  projected.nodes=projected.nodes.filter(n=>n.id!=='plan');
  projected.nodes.find(n=>n.id==='analysis').requires=[];
  const result=evaluateWormholeCandidate({baseline:analysis,candidate:{
    name:'Compile coordination into the design pipeline',
    mechanismClass:'DELETE_REQUIREMENT',
    evidenceClass:'SIMULATION',
    evidenceRefs:['simulation:dependency-replay'],
    independentlyVerified:false,
    baseGraphDigest:analysis.graphDigest,
    baselineGraph,
    projectedGraph:projected,
    transformations:[
      {targetId:'plan',kind:'DELETE_REQUIREMENT',evidenceRefs:['trace:coordination-is-nonterminal'],causalBoundaryRebuttalRefs:[]},
      {targetId:'analysis',kind:'PARALLELIZE_DEPENDENCIES',evidenceRefs:['trace:analysis-can-start-without-plan'],causalBoundaryRebuttalRefs:[]}
    ]
  }});
  assert.equal(result.ok,true);
  assert.equal(result.status,'WORMHOLE_HYPOTHESIS_ONLY');
  assert.equal(result.criticalPathSavingsMs,240);
  assert.equal(result.criticalPathAfterMs,1860);
});

test('mutating a declared causal floor requires explicit rebuttal evidence',()=>{
  const analysis=analyzeTimelineTopology(baselineGraph);
  const projected=structuredClone(baselineGraph);
  projected.nodes.find(n=>n.id==='fabricate').durationMs=10;
  const result=evaluateWormholeCandidate({baseline:analysis,candidate:{
    name:'Magic fabrication', mechanismClass:'SUBSTITUTE_TRANSFORMATION', evidenceClass:'HYPOTHESIS', evidenceRefs:['idea:x'],
    baseGraphDigest:analysis.graphDigest,baselineGraph,projectedGraph:projected,
    transformations:[{targetId:'fabricate',kind:'SUBSTITUTE_TRANSFORMATION',evidenceRefs:['idea:x'],causalBoundaryRebuttalRefs:[]}]
  }});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.some(x=>x.includes('evidence-bound-causal-floor-mutation-without-rebuttal:fabricate')));
});

test('changing the objective is not timeline compression',()=>{
  const analysis=analyzeTimelineTopology(baselineGraph);
  const projected=structuredClone(baselineGraph);projected.objective='Produce any unverified object';projected.nodes[0].durationMs=0;
  const result=evaluateWormholeCandidate({baseline:analysis,candidate:{
    name:'Move the goalposts',mechanismClass:'DELETE_REQUIREMENT',evidenceClass:'HYPOTHESIS',evidenceRefs:['idea:cheat'],baseGraphDigest:analysis.graphDigest,
    baselineGraph,projectedGraph:projected,transformations:[{targetId:'plan',kind:'DELETE_REQUIREMENT',evidenceRefs:['idea:cheat'],causalBoundaryRebuttalRefs:[]}]
  }});
  assert.equal(result.ok,false);assert.ok(result.reasonCodes.includes('terminal-objective-mutation-refused'));
});

test('executed compression cannot count as evidence without independent verification',()=>{
  const analysis=analyzeTimelineTopology(baselineGraph);
  const projected=structuredClone(baselineGraph);projected.nodes.find(n=>n.id==='analysis').durationMs=100;
  const result=evaluateWormholeCandidate({baseline:analysis,candidate:{
    name:'Faster internal representation',mechanismClass:'REPRESENTATION_ESCAPE',evidenceClass:'EXECUTED_INTERNAL',evidenceRefs:['run:1'],independentlyVerified:false,
    baseGraphDigest:analysis.graphDigest,baselineGraph,projectedGraph:projected,
    transformations:[{targetId:'analysis',kind:'REPRESENTATION_ESCAPE',evidenceRefs:['run:1'],causalBoundaryRebuttalRefs:[]}]
  }});
  assert.equal(result.ok,false);assert.ok(result.reasonCodes.includes('executed-or-observed-compression-requires-independent-evidence'));
});
