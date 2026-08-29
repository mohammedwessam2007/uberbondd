import test from 'node:test';
import assert from 'node:assert/strict';
import { applyUberBondMemoryReconciliation } from '../src/uberbond-memory-reconciliation.mjs';

function base() {
  return {
    generatedAt: '2026-08-28T00:00:00Z',
    namedInitiatives: [
      { id:'everest', name:'Everest', status:'OWNER_RECALLED_UNRESOLVED', role:'old', currentReconciliation:'old' }
    ],
    unresolvedNames: [{ name:'Everest', status:'OWNER_RECALLED_UNRESOLVED', requiredAction:'search' }],
    sourceBasis: [{ id:'repo', title:'Repo', evidenceClass:'CANON' }],
    antiForgettingRules: ['keep history']
  };
}
function correction() {
  return {
    schemaVersion:'uberbond-memory-reconciliation-1.0.0',
    project:'UberBond',
    generatedAt:'2026-08-29T05:05:00Z',
    lineage:['Everest','SUMMIT 100','BLACK SKY','Reality Activation'],
    replaceInitiatives:[
      { id:'everest', name:'Everest', status:'CANONICAL_LINEAGE', role:'receipt-backed', currentReconciliation:'EVEREST_PARTIALLY_CLOSED' }
    ],
    appendInitiatives:[
      { id:'summit-100', name:'SUMMIT 100', status:'CANONICAL_LINEAGE', role:'closure', currentReconciliation:'reality pending' },
      { id:'black-sky', name:'BLACK SKY', status:'CANONICAL_LINEAGE', role:'red-team', currentReconciliation:'reality next' },
      { id:'unreconstructed-owner-programs', name:'Unreconstructed Owner-Recalled UberBond Programs', status:'OWNER_RECALLED_UNRESOLVED', role:'bucket', currentReconciliation:'search first' }
    ],
    unresolvedNames:[{ name:'Unreconstructed Owner-Recalled UberBond Programs', status:'OWNER_RECALLED_UNRESOLVED', requiredAction:'search first' }],
    appendSourceBasis:[{ id:'everest-receipt', title:'Everest receipt', evidenceClass:'HISTORICAL_REPOSITORY_RECEIPT' }],
    appendAntiForgettingRules:['Everest is source-backed.']
  };
}

test('source-backed reconciliation upgrades Everest and preserves lineage', () => {
  const result = applyUberBondMemoryReconciliation({ memoryIndex: base(), reconciliation: correction() });
  assert.equal(result.ok, true);
  assert.equal(result.memoryIndex.namedInitiatives.length, 4);
  assert.equal(result.memoryIndex.namedInitiatives.find(item => item.id === 'everest').status, 'CANONICAL_LINEAGE');
  assert.equal(result.memoryIndex.unresolvedNames[0].name, 'Unreconstructed Owner-Recalled UberBond Programs');
  assert.deepEqual(result.lineage, ['Everest','SUMMIT 100','BLACK SKY','Reality Activation']);
});

test('replacement must target an existing initiative', () => {
  const c = correction();
  c.replaceInitiatives[0].id = 'missing';
  const result = applyUberBondMemoryReconciliation({ memoryIndex: base(), reconciliation: c });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('replacement-initiative-target-missing'));
});

test('appended initiatives cannot collide by id or name', () => {
  const c = correction();
  c.appendInitiatives[0].id = 'everest';
  const result = applyUberBondMemoryReconciliation({ memoryIndex: base(), reconciliation: c });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('append-initiative-conflict'));
});

test('reconciliation is deterministic and does not mutate the source memory', () => {
  const source = base();
  const before = structuredClone(source);
  const a = applyUberBondMemoryReconciliation({ memoryIndex: source, reconciliation: correction() });
  const b = applyUberBondMemoryReconciliation({ memoryIndex: source, reconciliation: correction() });
  assert.equal(a.reconciledMemoryDigest, b.reconciledMemoryDigest);
  assert.deepEqual(source, before);
});

test('unsupported reconciliation schema fails closed', () => {
  const c = correction();
  c.schemaVersion = 'future';
  const result = applyUberBondMemoryReconciliation({ memoryIndex: base(), reconciliation: c });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('unsupported-memory-reconciliation-schema'));
});
