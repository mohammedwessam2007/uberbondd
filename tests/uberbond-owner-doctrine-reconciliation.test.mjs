import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyUberBondMemoryReconciliation } from '../src/uberbond-memory-reconciliation.mjs';
import { validateUberBondMemoryIndex } from '../src/uberbond-brain-context.mjs';

const memory = JSON.parse(fs.readFileSync(new URL('../artifacts/uberbond-memory-index.json', import.meta.url), 'utf8'));
const reconciliation = JSON.parse(fs.readFileSync(new URL('../artifacts/uberbond-memory-reconciliation.json', import.meta.url), 'utf8'));

test('real owner-goals reconciliation survives the mature memory validator without widening its taxonomy', () => {
  const reconciled = applyUberBondMemoryReconciliation({ memoryIndex: memory, reconciliation });
  assert.equal(reconciled.ok, true);

  const ownerDoctrine = reconciled.memoryIndex.namedInitiatives.find(item => item.id === 'owner-goals-2026-09-02');
  assert.ok(ownerDoctrine);
  assert.equal(ownerDoctrine.status, 'CURRENT_PROGRAM');
  assert.match(ownerDoctrine.role, /customer acquisition and economic proof/i);
  assert.match(ownerDoctrine.role, /revenue generation and self-improvement run in parallel/i);

  const validated = validateUberBondMemoryIndex(reconciled.memoryIndex);
  assert.equal(validated.ok, true, `validation reasons: ${JSON.stringify(validated.reasonCodes || [])}`);
  assert.equal(validated.memoryIndex.namedInitiatives.find(item => item.id === 'owner-goals-2026-09-02')?.status, 'CURRENT_PROGRAM');
  assert.ok(validated.memoryIndex.antiForgettingRules.some(rule => /Customer acquisition and economic proof remain UberBond responsibilities/i.test(rule)));
  assert.ok(!validated.memoryIndex.namedInitiatives.some(item => item.status === 'CURRENT_OWNER_DOCTRINE'));
});
