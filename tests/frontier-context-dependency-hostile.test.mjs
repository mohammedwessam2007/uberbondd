import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextPlan } from '../src/frontier-context-spine.mjs';

test('Context Spine identifies the tagged artifact as the unresolved root when its dependency is absent', () => {
  const result = buildContextPlan({
    taskId: 'dependency-root-hostile',
    requiredTags: ['frontier'],
    tokenBudget: 1000,
    artifacts: [
      { id: 'constitution', kind: 'CONSTITUTION', contentRef: 'docs/constitution', tags: ['all'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true },
      { id: 'contract', kind: 'CONTRACT', contentRef: 'docs/contract', tags: ['frontier'], dependencies: ['missing-contract-dependency'], estimatedTokens: 100, priority: 90 }
    ]
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'CONTEXT_PLAN_INVALID');
  assert.ok(result.reasonCodes.includes('dependency-would-be-omitted'));
  assert.deepEqual(result.unresolvedDependencyRoots, ['contract']);
});
