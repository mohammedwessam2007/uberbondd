import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOpenModelSourceCoverageReceipt, OPEN_MODEL_CAPABILITY_COVERAGE } from '../src/open-model-source-coverage.mjs';

test('open model source coverage preserves the full universe/runtime contract', () => {
  const receipt = buildOpenModelSourceCoverageReceipt();
  assert.equal(receipt.ok, true);
  assert.equal(receipt.status, 'OPEN_MODEL_SOURCE_COVERAGE_COMPLETE');
  assert.equal(receipt.duplicateIds.length, 0);
  assert.ok(OPEN_MODEL_CAPABILITY_COVERAGE.length >= 18);
  const ids = new Set(receipt.capabilities.map(item => item.id));
  for (const required of [
    'model.universe-discovery',
    'model.registry-crawler',
    'model.license-classification',
    'model.runtime-selection',
    'model.openai-compatible-socket',
    'model.multimodal-universe',
    'model.task-tournament',
    'model.provider-neutrality',
    'model.frontier-refresh',
    'model.no-auto-promotion'
  ]) assert.equal(ids.has(required), true, `missing ${required}`);
  assert.ok(receipt.capabilities.every(item => item.executionAuthority === 'NONE'));
  assert.ok(receipt.invariants.includes('open-weight-does-not-mean-free-runtime'));
  assert.ok(receipt.invariants.includes('weights-present-does-not-mean-license-cleared'));
  assert.ok(receipt.invariants.includes('future-model-families-must-enter-through-the-same-foundry-admission-process'));
  assert.equal(receipt.businessEffectAuthority, 'NONE');
});
