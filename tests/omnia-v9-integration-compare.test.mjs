import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyComparison, isCriticalDisagreement, COMPARISON_CATEGORIES } from '../src/omnia-v9/integrations/compare.mjs';

test('exactly six comparison categories are defined', () => {
  assert.deepEqual([...COMPARISON_CATEGORIES].sort(), [
    'BOTH_ALLOW', 'BOTH_DENY', 'LEGACY_ALLOW_V9_DENY', 'LEGACY_DENY_V9_ALLOW', 'V9_ERROR', 'V9_INCOMPLETE'
  ].sort());
});

test('BOTH_ALLOW: legacy allows, V9 allows', () => {
  assert.equal(classifyComparison({ legacyEligible: true, v9Status: 'OBSERVED', v9Decision: 'ALLOW' }), 'BOTH_ALLOW');
});

test('BOTH_DENY: legacy denies, V9 denies', () => {
  assert.equal(classifyComparison({ legacyEligible: false, v9Status: 'OBSERVED', v9Decision: 'DENY' }), 'BOTH_DENY');
});

test('LEGACY_ALLOW_V9_DENY: V9 stricter than legacy', () => {
  assert.equal(classifyComparison({ legacyEligible: true, v9Status: 'OBSERVED', v9Decision: 'DENY' }), 'LEGACY_ALLOW_V9_DENY');
});

test('LEGACY_DENY_V9_ALLOW: the critical, potentially dangerous case', () => {
  const category = classifyComparison({ legacyEligible: false, v9Status: 'OBSERVED', v9Decision: 'ALLOW' });
  assert.equal(category, 'LEGACY_DENY_V9_ALLOW');
  assert.equal(isCriticalDisagreement(category), true);
});

test('V9_INCOMPLETE: V9 returns REVIEW regardless of legacy decision', () => {
  assert.equal(classifyComparison({ legacyEligible: true, v9Status: 'OBSERVED', v9Decision: 'REVIEW' }), 'V9_INCOMPLETE');
  assert.equal(classifyComparison({ legacyEligible: false, v9Status: 'OBSERVED', v9Decision: 'REVIEW' }), 'V9_INCOMPLETE');
});

test('V9_INCOMPLETE: no hook configured', () => {
  assert.equal(classifyComparison({ legacyEligible: true, v9Status: 'NO_HOOK', v9Decision: undefined }), 'V9_INCOMPLETE');
});

test('V9_ERROR: the shadow hook itself failed', () => {
  const category = classifyComparison({ legacyEligible: true, v9Status: 'SHADOW_ERROR', v9Decision: undefined });
  assert.equal(category, 'V9_ERROR');
  assert.equal(isCriticalDisagreement(category), false);
});

test('only LEGACY_DENY_V9_ALLOW is a critical disagreement', () => {
  for (const category of COMPARISON_CATEGORIES) {
    assert.equal(isCriticalDisagreement(category), category === 'LEGACY_DENY_V9_ALLOW');
  }
});
