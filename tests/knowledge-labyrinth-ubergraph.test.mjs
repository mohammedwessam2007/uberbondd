import test from 'node:test';
import assert from 'node:assert/strict';
import { compileKnowledgeLabyrinth } from '../src/knowledge-labyrinth-ubergraph.mjs';

test('Knowledge Labyrinth refuses semantic matches without provenance',()=>{
  const r=compileKnowledgeLabyrinth({nodes:[{id:'a',domain:'REALITY'}],semanticMatches:[{nodeId:'a',score:.9}],startNodes:['a']});
  assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('provenance-bearing-semantic-matches-required'));
});

test('Knowledge Labyrinth never turns a weak anecdotal edge into a strict traversal',()=>{
  const r=compileKnowledgeLabyrinth({
    nodes:[{id:'a',domain:'SELF'},{id:'b',domain:'CAPABILITY'}],
    edges:[{from:'a',to:'b',kind:'ENABLES',basis:'SINGLE_ANECDOTE'}],startNodes:['a'],strictOnly:true
  });
  assert.equal(r.ok,true);assert.equal(r.packet.traversals[0].reached.length,0);assert.equal(r.packet.traversals[0].edgesSkipped,1);
});

test('Knowledge Labyrinth keeps contradictory causal claims open instead of deleting one',()=>{
  const r=compileKnowledgeLabyrinth({
    nodes:[{id:'a',domain:'REALITY'},{id:'b',domain:'COMPANY'}],
    edges:[{from:'a',to:'b',kind:'CAUSES',basis:'LONGITUDINAL'},{from:'a',to:'b',kind:'PREVENTS',basis:'DIRECTLY_MEASURED'}],startNodes:['a'],
    claims:[{claim:'observed claim',origin:'PRIMARY_OBSERVATION'}],transactionRefs:['postgres://event/1'],semanticMatches:[{nodeId:'b',sourceRef:'vector://match/1',score:.8}]
  });
  assert.equal(r.ok,true);assert.equal(r.packet.contradictions.conflicts.length,1);assert.equal(r.businessEffectAuthority,'NONE');
});
