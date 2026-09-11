import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCognitionTopology, compileUberMindExchange } from '../src/ubermind-cognitive-exchange.mjs';

test('UberMind refuses unbounded cognition stakes',()=>{
  const r=chooseCognitionTopology({consequence:2,uncertainty:.5,reversibility:.5,founderImportance:.5});
  assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('bounded-cognition-stakes-required'));
});

test('UberMind does not maximize agent count for a cheap reversible decision',()=>{
  const r=chooseCognitionTopology({consequence:.05,uncertainty:.05,reversibility:1,founderImportance:.05});
  assert.equal(r.ok,true);assert.equal(r.reasoningTier,'FAST');assert.deepEqual(r.roles,['planner']);
});

test('UberMind escalates a consequential uncertain irreversible founder decision to council cognition',()=>{
  const r=chooseCognitionTopology({consequence:1,uncertainty:1,reversibility:0,founderImportance:1});
  assert.equal(r.ok,true);assert.equal(r.reasoningTier,'COUNCIL_MAX');assert.ok(r.roles.includes('falsifier'));assert.ok(r.roles.includes('judge'));
});

test('UberMind never invents a callable model when runtime evidence is missing',()=>{
  const r=compileUberMindExchange({mission:{missionId:'m1',taskId:'t1',objective:'analyze a bounded choice'},stakes:{consequence:.4,uncertainty:.4,reversibility:.8,founderImportance:.5}});
  assert.equal(r.ok,true);assert.equal(r.status,'UBERMIND_TOPOLOGY_READY_RUNTIME_EVIDENCE_REQUIRED');assert.equal(r.runtimePlan,null);assert.equal(r.businessEffectAuthority,'NONE');
});
