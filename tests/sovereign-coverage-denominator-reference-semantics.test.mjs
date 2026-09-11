import test from 'node:test';
import assert from 'node:assert/strict';
import { extractConcepts } from '../scripts/sovereign-coverage-matrix.mjs';

const bySourceList = (concepts, source, sourceList) => concepts.filter(row => row.source === source && row.sourceList === sourceList);

test('capability domain lists remain complete ontology without becoming individual module obligations', () => {
  const { concepts, missingSources } = extractConcepts();
  assert.deepEqual(missingSources, []);
  const totalBrain = bySourceList(concepts, 'total-brain', 'capabilityDomains');
  const memoryIndex = bySourceList(concepts, 'memory-index', 'sharedOperatingSystemDomains');
  assert.ok(totalBrain.length > 0);
  assert.ok(memoryIndex.length > 0);
  assert.ok([...totalBrain, ...memoryIndex].every(row => row.class === 'ONTOLOGY'));
});

test('named open model runtimes are preserved as reference surfaces, not internal clone obligations', () => {
  const { concepts } = extractConcepts();
  const runtimes = bySourceList(concepts, 'total-brain', 'openModelRuntimes');
  assert.ok(runtimes.length > 0);
  assert.ok(runtimes.every(row => row.class === 'REFERENCE_SURFACE'));
});

test('external skill and plugin supplier identities are catalogue ontology, not missing UberBond products', () => {
  const { concepts } = extractConcepts();
  const suppliers = bySourceList(concepts, 'suppliers', 'entries');
  assert.ok(suppliers.length > 0);
  assert.ok(suppliers.every(row => row.class === 'ONTOLOGY'));
  for (const expected of ['Find Skills', 'Task Observer', 'Strix', 'Agent Reach']) {
    assert.ok(suppliers.some(row => row.name === expected), `${expected} missing from no-drop supplier catalogue`);
  }
});

test('all founder freedom dimensions remain external reality gates even when similarly named software exists', () => {
  const { concepts } = extractConcepts();
  const dimensions = bySourceList(concepts, 'genesis', 'founderFreedomDimensions');
  assert.equal(dimensions.length, 8);
  assert.ok(dimensions.every(row => row.class === 'EXTERNAL_GATE'));
  assert.ok(dimensions.some(row => String(row.name).toLowerCase() === 'health and safety'));
});
