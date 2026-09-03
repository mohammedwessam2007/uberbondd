import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const memory = JSON.parse(fs.readFileSync(new URL('../artifacts/uberbond-memory-index.json', import.meta.url), 'utf8'));
const allowed = new Set(['CURRENT_PROGRAM','CANONICAL_LINEAGE','HISTORICAL_DONOR','HISTORICAL_CAPABILITY_SOURCE','HISTORICAL_GENERATED','SUPERSEDED_BY_CANON','OWNER_RECALLED_UNRESOLVED','REJECTED','ARCHIVED']);

function issuesFor(items) {
  const issues = [];
  if (!Array.isArray(items)) return [{ kind: 'not-array' }];
  if (items.length === 0) issues.push({ kind: 'empty-array' });
  if (items.length > 512) issues.push({ kind: 'too-many', count: items.length });
  const ids = new Map();
  const names = new Map();
  items.forEach((item, index) => {
    const id = String(item?.id ?? '').trim();
    const name = String(item?.name ?? '').trim();
    const status = String(item?.status ?? '').trim();
    const role = String(item?.role ?? '').trim();
    const reconciliation = String(item?.currentReconciliation ?? '').trim();
    if (!id || id.length > 120 || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) issues.push({ kind: 'invalid-id', index, id, length: id.length });
    if (!name || name.length > 240) issues.push({ kind: 'invalid-name', index, id, length: name.length });
    if (!allowed.has(status)) issues.push({ kind: 'invalid-status', index, id, status });
    if (!role || role.length > 1600) issues.push({ kind: 'invalid-role', index, id, length: role.length });
    if (!reconciliation || reconciliation.length > 1600) issues.push({ kind: 'invalid-reconciliation', index, id, length: reconciliation.length });
    const nameKey = name.toLowerCase();
    if (ids.has(id)) issues.push({ kind: 'duplicate-id', index, id, firstIndex: ids.get(id) }); else ids.set(id, index);
    if (names.has(nameKey)) issues.push({ kind: 'duplicate-name', index, id, name, firstIndex: names.get(nameKey) }); else names.set(nameKey, index);
  });
  return issues;
}

test('current UberBond named-initiative memory satisfies every granular validator invariant', () => {
  const issues = issuesFor(memory.namedInitiatives);
  assert.deepEqual(issues, [], `initiative diagnostics: ${JSON.stringify(issues)}`);
});
