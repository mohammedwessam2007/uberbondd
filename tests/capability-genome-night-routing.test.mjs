import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCapabilityModel, selectMinimumCapabilityBundle } from '../src/capability-genome-runtime.mjs';

const cap = (id, atom, dependencies = []) => ({
  id,
  capabilityAtoms: [{ id: atom }],
  dependencies,
  knownConflicts: [],
  compatibilityEdges: [],
  contextCost: { tokens: 0 },
  monetaryCost: { cents: 0 }
});

test('model routing cannot escape the capability bundle selected by admission/retrieval', () => {
  const common = { taskClass: 'lead-analysis', configured: true, revoked: false, available: true, securityPassed: true, providerIdentityObservable: true, modelId: 'm', providerId: 'p', taskSuccess: 1, reliability: 1, quality: 1, latencyMs: 1, costCents: 0 };
  const result = routeCapabilityModel({
    taskClass: 'lead-analysis',
    allowedCapabilityIds: ['approved-selected'],
    candidates: [
      { ...common, capabilityId: 'unselected-cheap' },
      { ...common, capabilityId: 'approved-selected', taskSuccess: 0.8 }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.capabilityId, 'approved-selected');
  assert.equal(result.alternatives.some(x => x.capabilityId === 'unselected-cheap'), false);
});

test('a dependency selected later in the same bundle is not reported as unresolved', () => {
  const result = selectMinimumCapabilityBundle({
    requiredAtomIds: ['atom-a', 'atom-b'],
    retrievalResults: [
      { capability: cap('a', 'atom-a', ['b']), score: 1 },
      { capability: cap('b', 'atom-b'), score: 0.9 }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'MINIMUM_SUFFICIENT_BUNDLE_SELECTED');
  assert.deepEqual(result.reasons.filter(x => x.status === 'DEPENDENCY_REQUIRED'), []);
});

test('a dependency absent from the selected bundle remains a hard execution gap', () => {
  const result = selectMinimumCapabilityBundle({
    requiredAtomIds: ['atom-a'],
    retrievalResults: [{ capability: cap('a', 'atom-a', ['missing']), score: 1 }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPABILITY_DEPENDENCY_GAP');
  assert.deepEqual(result.reasons.filter(x => x.status === 'DEPENDENCY_REQUIRED'), [{ id: 'a', dependency: 'missing', status: 'DEPENDENCY_REQUIRED' }]);
});
