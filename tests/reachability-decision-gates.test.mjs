import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const classification = JSON.parse(
  readFileSync(join(repoRoot, 'config', 'reachability-classification.json'), 'utf8')
);

test('no reachability decision remains in NEEDS_TRIAGE after explicit archaeology', () => {
  const unresolved = Object.entries(classification.modules)
    .filter(([, entry]) => entry.category === 'NEEDS_TRIAGE')
    .map(([file]) => file);
  assert.deepEqual(unresolved, []);
});

test('self-upgrade remains gated on real mesh observation rather than being wired early', () => {
  assert.deepEqual(classification.modules['src/agent-evolution-wave.mjs'], {
    category: 'AWAITING_ACTIVATION',
    gate: 'MESH_LIVE_OBSERVATION_REQUIRED',
    reason: classification.modules['src/agent-evolution-wave.mjs'].reason
  });
  assert.ok(classification.modules['src/agent-evolution-wave.mjs'].reason.includes('real observed scheduler-cycle evidence'));
});

test('AI access registry remains preparation-only behind explicit external authorization', () => {
  assert.deepEqual(classification.modules['src/ai-access-opportunity-registry.mjs'], {
    category: 'AWAITING_ACTIVATION',
    gate: 'NO_AI_ACCESS_EXTERNAL_AUTHORIZATION',
    reason: classification.modules['src/ai-access-opportunity-registry.mjs'].reason
  });
  assert.ok(classification.modules['src/ai-access-opportunity-registry.mjs'].reason.includes('zero-external-effect boundary'));
});
