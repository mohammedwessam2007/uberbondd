import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGoalAdjointSlice, verifyGoalAdjointSlice } from '../src/omega-goal-adjoint.mjs';

const zero = receipt => {
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectLedger.productionMutations, 0);
  assert.equal(receipt.externalEffectLedger.spendCents, 0);
};

const graph = [
  { id: 'observe', requires: [], cost: 4 },
  { id: 'infer', requires: ['observe'], cost: 8 },
  { id: 'verify', requires: ['infer'], cost: 5 },
  { id: 'terminal', requires: ['verify'], cost: 1 },
  { id: 'decorative-research', requires: [], cost: 20 },
  { id: 'decorative-summary', requires: ['decorative-research'], cost: 10 }
];

test('goal adjoint deletes work outside the exact backward causal light cone', () => {
  const out = compileGoalAdjointSlice({ nodes: graph, terminalIds: ['terminal'], terminalContract: 'verified terminal answer' });
  assert.equal(out.ok, true);
  assert.deepEqual(out.slice.retainedIds, ['infer', 'observe', 'terminal', 'verify']);
  assert.deepEqual(out.slice.prunedIds, ['decorative-research', 'decorative-summary']);
  assert.equal(out.slice.deletedCost, 30);
  assert.ok(out.slice.deletedFraction > 0.6);
  assert.equal(out.slice.proofClass, 'EXACT_BACKWARD_REACHABILITY_ON_DECLARED_DEPENDENCY_GRAPH');
  assert.match(out.truthBoundary, /missing causal edges/i);
  zero(out);
});

test('one real dependency edge pulls an apparently irrelevant branch back into the light cone', () => {
  const coupled = graph.map(row => row.id === 'verify' ? { ...row, requires: ['infer', 'decorative-summary'] } : row);
  const out = compileGoalAdjointSlice({ nodes: coupled, terminalIds: ['terminal'], terminalContract: 'verified terminal answer' });
  assert.equal(out.ok, true);
  assert.deepEqual(out.slice.prunedIds, []);
  assert.equal(out.slice.deletedCost, 0);
});

test('slice verification detects terminal-contract mutation', () => {
  const out = compileGoalAdjointSlice({ nodes: graph, terminalIds: ['terminal'], terminalContract: 'verified terminal answer' });
  const same = verifyGoalAdjointSlice({ nodes: graph, terminalIds: ['terminal'], terminalContract: 'verified terminal answer', slice: out.slice });
  assert.equal(same.valid, true);
  const changed = verifyGoalAdjointSlice({ nodes: graph, terminalIds: ['terminal'], terminalContract: 'different easier answer', slice: out.slice });
  assert.equal(changed.valid, false);
});

test('unknown dependencies and cycles fail closed', () => {
  const unknown = compileGoalAdjointSlice({ nodes: [{ id: 'a', requires: ['missing'] }], terminalIds: ['a'] });
  assert.equal(unknown.ok, false);
  const cycle = compileGoalAdjointSlice({ nodes: [{ id: 'a', requires: ['b'] }, { id: 'b', requires: ['a'] }], terminalIds: ['a'] });
  assert.equal(cycle.ok, false);
  zero(cycle);
});
