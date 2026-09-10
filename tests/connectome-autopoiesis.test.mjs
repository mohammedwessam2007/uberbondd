import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberBondCognitiveGraph, cognitiveGraphIntegrity, reachableNodes } from '../src/uberbond-cognitive-graph.mjs';
import { auditUberBondConnectome, compileConnectomeAutopoiesis, CONNECTOME_SYNERGY_CONTRACTS } from '../src/connectome-autopoiesis.mjs';
import { compileCognitiveEvent, routeCognitiveEvent, compileClosedLoopActivation } from '../src/uberbond-cognitive-bus.mjs';

const REQUIRED=['temporal-foundry','timeline-topology','sandwich','connectome-autopoiesis','avengers','max-council','self-maintainer'];

test('canonical UberBond connectome contains timeline, frontier and self-completion organs in one integral learning graph',()=>{
  const graph=compileUberBondCognitiveGraph();
  assert.equal(graph.ok,true);
  const ids=new Set(graph.nodes.map(n=>n.id));
  for(const id of REQUIRED) assert.equal(ids.has(id),true,`missing ${id}`);
  const integrity=cognitiveGraphIntegrity(graph);
  assert.equal(integrity.ok,true,JSON.stringify(integrity));
  assert.deepEqual(integrity.orphanNodes,[]);
  assert.deepEqual(integrity.unreachableFromWorld,[]);
  assert.deepEqual(integrity.cannotReturnToLearning,[]);
});

test('Avengers MAX Temporal Foundry Wormhole and Sandwich satisfy direct synergy contracts',()=>{
  const graph=compileUberBondCognitiveGraph();
  const audit=auditUberBondConnectome({graph});
  assert.equal(audit.ok,true);
  assert.equal(audit.status,'CONNECTOME_SYNERGY_CONTRACTS_SATISFIED',JSON.stringify(audit));
  assert.equal(audit.synergyGapCount,0);
  for(const c of CONNECTOME_SYNERGY_CONTRACTS) assert.ok(graph.edges.some(e=>e.from===c.from&&e.to===c.to),`${c.from}->${c.to}`);
});

test('frontier intelligence circulates through future raid, topology, Sandwich, engineering and learning',()=>{
  const graph=compileUberBondCognitiveGraph();
  const fromAvengers=new Set(reachableNodes({graph,startNodeId:'avengers'}));
  for(const id of ['temporal-foundry','timeline-topology','sandwich','self-maintainer','economic-memory','connectome-autopoiesis']) assert.ok(fromAvengers.has(id),id);
  const fromTemporal=new Set(reachableNodes({graph,startNodeId:'temporal-foundry'}));
  for(const id of ['avengers','max-council','timeline-topology','sandwich','economic-memory']) assert.ok(fromTemporal.has(id),id);
});

test('healthy connectome does not manufacture another feature merely to stay busy',()=>{
  const out=compileConnectomeAutopoiesis({graph:compileUberBondCognitiveGraph()});
  assert.equal(out.ok,true);
  assert.equal(out.status,'CONNECTOME_NO_FEATURE_REQUIRED');
  assert.equal(out.featureCandidate,null);
  assert.equal(out.eventInput,null);
});

test('a newly introduced isolated organ becomes one bounded integration feature hypothesis only',()=>{
  const graph=compileUberBondCognitiveGraph({extraNodes:[{id:'future-organ',kind:'RESEARCH',label:'Future Organ',truthClass:'DRAFT_BRANCH'}]});
  const out=compileConnectomeAutopoiesis({graph,evidenceRefs:['source:new-future-organ']});
  assert.equal(out.ok,true);
  assert.equal(out.status,'CONNECTOME_FEATURE_HYPOTHESIS_READY');
  assert.ok(out.audit.structural.some(g=>g.nodeId==='future-organ'));
  assert.equal(out.featureCandidate.foldClass,'INTERNAL_SOURCE');
  assert.equal(out.businessEffectAuthority,'NONE');
  assert.equal(out.externalEffectAuthority,'NONE');
  assert.match(out.admissionBoundary,/CANNOT_EDIT_SOURCE/i);
});

test('future and topology events wake Avengers MAX and the self-completion nervous system',()=>{
  const graph=compileUberBondCognitiveGraph();
  const future=compileCognitiveEvent({kind:'FUTURE_FUNCTION_CANDIDATE',sourceNodeId:'temporal-foundry',subjectType:'FUTURE_FUNCTION',subjectId:'f1',summary:'Pull a future function forward.',evidenceRefs:['evidence:f1']});
  const targets=new Set(routeCognitiveEvent({graph,compiledEvent:future}).activations.map(a=>a.targetNodeId));
  for(const id of ['avengers','max-council','timeline-topology','sandwich','connectome-autopoiesis']) assert.ok(targets.has(id),id);
  const topology=compileCognitiveEvent({kind:'TIMELINE_TOPOLOGY_RESULT',sourceNodeId:'timeline-topology',subjectType:'WORMHOLE_RESULT',subjectId:'w1',summary:'A route was compressed.',evidenceRefs:['evidence:w1']});
  const topologyTargets=new Set(routeCognitiveEvent({graph,compiledEvent:topology}).activations.map(a=>a.targetNodeId));
  for(const id of ['avengers','max-council','wallbreaker','sandwich','connectome-autopoiesis']) assert.ok(topologyTargets.has(id),id);
});

test('closed-loop activation preserves zero authority and carries connectome audit status',()=>{
  const graph=compileUberBondCognitiveGraph();
  const event=compileCognitiveEvent({kind:'DESCENDANT_GAP',sourceNodeId:'sandwich',subjectType:'FINITE_REQUIREMENT',subjectId:'d1',summary:'One bounded descendant gap.',evidenceRefs:['evidence:d1']});
  const cycle=compileClosedLoopActivation({graph,events:[event]});
  assert.equal(cycle.ok,true);
  assert.equal(cycle.connectomeAutopoiesis.status,'CONNECTOME_NO_FEATURE_REQUIRED');
  assert.equal(cycle.generatedConnectomeEventCount,0);
  assert.equal(cycle.businessEffectAuthority,'NONE');
  assert.equal(cycle.externalEffectLedger.deployments,0);
});
