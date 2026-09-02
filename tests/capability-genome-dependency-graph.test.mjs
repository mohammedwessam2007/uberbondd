import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMinimumCapabilityBundle } from '../src/capability-genome-runtime.mjs';

const cap = (id, atom, dependencies = []) => ({
  id,
  capabilityAtoms: [{ id: atom }],
  dependencies,
  knownConflicts: [],
  compatibilityEdges: [],
  contextCost: { tokens: 0 },
  monetaryCost: { cents: 0 }
});

test('self cycle is rejected', () => {
  const a = cap('supplier.alpha', 'code.search', ['supplier.alpha']);
  const result = selectMinimumCapabilityBundle({
    requiredAtomIds: ['code.search'],
    retrievalResults: [{ capability: a, score: 1 }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPABILITY_DEPENDENCY_CYCLE');
  assert.deepEqual(result.reasons.find(x => x.status === 'DEPENDENCY_CYCLE').members, ['supplier.alpha']);
});

test('two-node cycle is rejected when both members are selected', () => {
  const a = cap('supplier.alpha', 'code.search', ['supplier.beta']);
  const b = cap('supplier.beta', 'web.crawl', ['supplier.alpha']);
  const result = selectMinimumCapabilityBundle({
    requiredAtomIds: ['code.search', 'web.crawl'],
    retrievalResults: [
      { capability: a, score: 1 },
      { capability: b, score: 0.9 }
    ]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPABILITY_DEPENDENCY_CYCLE');
  assert.deepEqual(result.reasons.find(x => x.status === 'DEPENDENCY_CYCLE').members, ['supplier.alpha', 'supplier.beta']);
  assert.equal(result.reasons.some(x => x.status === 'DEPENDENCY_REQUIRED'), false);
});

test('acyclic complete dependency graph is accepted', () => {
  const a = cap('supplier.alpha', 'code.search', ['supplier.beta']);
  const b = cap('supplier.beta', 'web.crawl');
  const result = selectMinimumCapabilityBundle({
    requiredAtomIds: ['code.search', 'web.crawl'],
    retrievalResults: [
      { capability: a, score: 1 },
      { capability: b, score: 0.9 }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'MINIMUM_SUFFICIENT_BUNDLE_SELECTED');
});
