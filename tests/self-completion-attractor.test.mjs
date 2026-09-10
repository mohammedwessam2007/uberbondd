import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSelfCompletionStates, compileSelfCompletionAttractor } from '../src/self-completion-attractor.mjs';

const baseNodes = [
  { id: 'source', label: 'source brainstem', state: 'VERIFIED_CURRENT', closureClass: 'INTERNAL_SOURCE', requires: [], unlockWeight: 10, evidenceStrength: 1, effortUnits: 1 },
  { id: 'sensorium', label: 'life sensorium', state: 'MISSING', closureClass: 'INTERNAL_SOURCE', requires: ['source'], unlockWeight: 8, evidenceStrength: 0.8, effortUnits: 2 },
  { id: 'ambient', label: 'ambient founder interface', state: 'MISSING', closureClass: 'OWNED_PHYSICAL_HOST', requires: ['sensorium'], unlockWeight: 15, evidenceStrength: 0.5, effortUnits: 8 },
  { id: 'commercial', label: 'real customer proof', state: 'MISSING', closureClass: 'EXTERNAL_COMMERCIAL', requires: ['source'], unlockWeight: 12, evidenceStrength: 1, effortUnits: 5 },
  { id: 'longitudinal', label: 'longitudinal life outcome evidence', state: 'MISSING', closureClass: 'ELAPSED_REALITY', requires: ['sensorium'], unlockWeight: 20, evidenceStrength: 0, effortUnits: 365 }
];

test('self-completion attractor selects a dependency-satisfied internal gap first', () => {
  const out = compileSelfCompletionAttractor({ nodes: baseNodes });
  assert.equal(out.ok, true);
  assert.equal(out.gapNodes, 4);
  assert.equal(out.nextInternalGap.id, 'sensorium');
  assert.deepEqual(out.unresolvedDependencies.find(row => row.id === 'ambient').waitingOn, ['sensorium']);
  assert.match(out.foldingRule, /RECOMPUTE_THE_NEGATIVE_IMAGE/);
});

test('external and elapsed gaps remain visible but cannot masquerade as internally closable', () => {
  const out = compileSelfCompletionAttractor({ nodes: baseNodes });
  const external = new Set(out.externalEvidenceFrontier.map(row => row.id));
  assert.ok(external.has('commercial'));
  assert.ok(!out.rankedFrontier.find(row => row.id === 'ambient'), 'ambient waits on sensorium');
  assert.match(out.blockerRule, /MAY_NOT_BE_MINTED_CLOSED_BY_SOURCE_CODE/);
  assert.equal(out.externalEffectAuthority, 'NONE');
});

test('dependency cycles fail closed', () => {
  const out = compileSelfCompletionAttractor({ nodes: [
    { id: 'a', label: 'a', state: 'MISSING', closureClass: 'INTERNAL_SOURCE', requires: ['b'] },
    { id: 'b', label: 'b', state: 'MISSING', closureClass: 'INTERNAL_SOURCE', requires: ['a'] }
  ] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('dependency-cycle-refused'));
});

test('unknown dependency references fail closed', () => {
  const out = compileSelfCompletionAttractor({ nodes: [
    { id: 'a', label: 'a', state: 'MISSING', closureClass: 'INTERNAL_SOURCE', requires: ['ghost'] }
  ] });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('dependency-reference-missing'));
});

test('comparison recognizes closed gaps', () => {
  const before = compileSelfCompletionAttractor({ nodes: baseNodes });
  const afterNodes = baseNodes.map(node => node.id === 'sensorium' ? { ...node, state: 'VERIFIED_CURRENT', evidenceStrength: 1 } : node);
  const after = compileSelfCompletionAttractor({ nodes: afterNodes });
  const comparison = compareSelfCompletionStates({ before, after });
  assert.equal(comparison.ok, true);
  assert.ok(comparison.closedGapIds.includes('sensorium'));
  assert.equal(comparison.interpretation, 'NEGATIVE_IMAGE_SHRANK');
});

test('revealing more missing structure is not falsely labeled regression', () => {
  const before = compileSelfCompletionAttractor({ nodes: baseNodes });
  const after = compileSelfCompletionAttractor({ nodes: [...baseNodes, { id: 'new-dimension', label: 'newly discovered missing dimension', state: 'UNKNOWN', closureClass: 'UNKNOWN', requires: ['source'], unlockWeight: 1, evidenceStrength: 0, effortUnits: 1 }] });
  const comparison = compareSelfCompletionStates({ before, after });
  assert.equal(comparison.interpretation, 'STRONGER_MODEL_REVEALED_MORE_MISSING_STRUCTURE');
  assert.ok(comparison.newlyVisibleGapIds.includes('new-dimension'));
  assert.match(comparison.law, /CAN_BE_PROGRESS/);
});
