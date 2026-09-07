import test from 'node:test';
import assert from 'node:assert/strict';
import {
  traceOntologicalCrisis,
  compileOntologyRebuild
} from '../src/ontological-crisis-protocol.mjs';

const graph = [
  { id: 'a1', type: 'ASSUMPTION', dependsOn: [] },
  { id: 'b1', type: 'BELIEF', dependsOn: ['a1'] },
  { id: 'm1', type: 'MODEL', dependsOn: ['b1'] },
  { id: 'p1', type: 'PREDICTION', dependsOn: ['m1'] },
  { id: 'v1', type: 'VALUE', dependsOn: ['p1'] },
  { id: 'r1', type: 'RECOMMENDATION', dependsOn: ['p1', 'v1'] },
  { id: 'c1', type: 'CHOICE', dependsOn: ['r1'] },
  { id: 'x1', type: 'ACTION', dependsOn: ['c1'] },
  { id: 'o1', type: 'OUTCOME', dependsOn: ['x1'] },
  { id: 'independent', type: 'OBSERVATION', dependsOn: [] }
];

test('failed assumption contaminates downstream system claims but not independent evidence', () => {
  const crisis = traceOntologicalCrisis({ nodes: graph, failedIds: ['a1'], crisisRef: 'reality:contradiction' });
  assert.equal(crisis.ok, true, JSON.stringify(crisis.reasonCodes));
  for (const id of ['a1', 'b1', 'm1', 'p1', 'r1']) assert.ok(crisis.invalidated.includes(id), id);
  assert.ok(crisis.unaffected.includes('independent'));
});

test('human values and choices are review-required rather than auto-invalidated', () => {
  const crisis = traceOntologicalCrisis({ nodes: graph, failedIds: ['a1'] });
  assert.ok(crisis.reviewRequired.includes('v1'));
  assert.ok(crisis.reviewRequired.includes('c1'));
  assert.equal(crisis.invalidated.includes('v1'), false);
  assert.equal(crisis.invalidated.includes('c1'), false);
  assert.match(crisis.truthBoundary, /DOES_NOT_INVALIDATE_HUMAN_VALUES/);
});

test('past actions and outcomes are preserved as history even when their rationale collapses', () => {
  const crisis = traceOntologicalCrisis({ nodes: graph, failedIds: ['a1'] });
  const action = crisis.dispositions.find(row => row.id === 'x1');
  const outcome = crisis.dispositions.find(row => row.id === 'o1');
  assert.match(action.disposition, /^HISTORICAL_FACT_PRESERVED/);
  assert.match(outcome.disposition, /^HISTORICAL_FACT_PRESERVED/);
});

test('system cannot declare a human value itself to be a failed ontology root', () => {
  const crisis = traceOntologicalCrisis({ nodes: graph, failedIds: ['v1'] });
  assert.equal(crisis.ok, false);
  assert.ok(crisis.reasonCodes.includes('failed-root-type-not-system-invalidatable:VALUE'));
});

test('dangling dependencies and cycles fail closed before contamination is computed', () => {
  const dangling = traceOntologicalCrisis({
    nodes: [{ id: 'a', type: 'BELIEF', dependsOn: ['missing'] }],
    failedIds: ['a']
  });
  assert.equal(dangling.ok, false);
  assert.ok(dangling.reasonCodes.some(code => code.startsWith('dangling-dependency:')));

  const cyclic = traceOntologicalCrisis({
    nodes: [
      { id: 'a', type: 'BELIEF', dependsOn: ['b'] },
      { id: 'b', type: 'MODEL', dependsOn: ['a'] }
    ],
    failedIds: ['a']
  });
  assert.equal(cyclic.ok, false);
  assert.ok(cyclic.reasonCodes.some(code => code.startsWith('dependency-cycle:')));
});

test('rebuild plan respects dependencies and never auto-rebuilds human or historical nodes', () => {
  const crisis = traceOntologicalCrisis({ nodes: graph, failedIds: ['a1'] });
  const plan = compileOntologyRebuild({ nodes: graph, crisis });
  assert.equal(plan.ok, true, JSON.stringify(plan.reasonCodes));
  assert.deepEqual(plan.steps.map(step => step.id), ['a1', 'b1', 'm1', 'p1', 'r1']);
  assert.equal(plan.steps.some(step => ['v1', 'c1', 'x1', 'o1'].includes(step.id)), false);
  assert.equal(plan.founderReviewRequired, true);
  assert.equal(plan.businessEffectAuthority, 'NONE');
});
