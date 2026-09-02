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

const routeBase = {
  taskClass: 'lead-analysis',
  configured: true,
  revoked: false,
  available: true,
  securityPassed: true,
  providerIdentityObservable: true,
  modelId: 'm',
  providerId: 'p',
  taskSuccess: 0.8,
  reliability: 0.9,
  quality: 0.9,
  latencyMs: 10,
  costCents: 1
};

test('model routing cannot escape the capability bundle selected by admission/retrieval', () => {
  const common = { ...routeBase, taskSuccess: 1, reliability: 1, quality: 1, latencyMs: 1, costCents: 0 };
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

test('negative monetary cost cannot manufacture an artificially dominant route', () => {
  const result = routeCapabilityModel({
    taskClass: 'lead-analysis',
    candidates: [
      { ...routeBase, capabilityId: 'invalid-negative-cost', costCents: -1000 },
      { ...routeBase, capabilityId: 'valid' }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.capabilityId, 'valid');
  assert.equal(result.alternatives.some(x => x.capabilityId === 'invalid-negative-cost'), false);
});

test('negative latency cannot manufacture an artificially dominant route', () => {
  const result = routeCapabilityModel({
    taskClass: 'lead-analysis',
    candidates: [
      { ...routeBase, capabilityId: 'invalid-negative-latency', latencyMs: -5000 },
      { ...routeBase, capabilityId: 'valid' }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.capabilityId, 'valid');
  assert.equal(result.alternatives.some(x => x.capabilityId === 'invalid-negative-latency'), false);
});

test('out-of-range success, reliability, and quality metrics are not route-eligible', () => {
  const result = routeCapabilityModel({
    taskClass: 'lead-analysis',
    candidates: [
      { ...routeBase, capabilityId: 'success-over-one', taskSuccess: 10 },
      { ...routeBase, capabilityId: 'negative-reliability', reliability: -1 },
      { ...routeBase, capabilityId: 'quality-over-one', quality: 2 },
      { ...routeBase, capabilityId: 'valid' }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.selected.capabilityId, 'valid');
  assert.deepEqual(result.alternatives.map(x => x.capabilityId), []);
});
