import test from 'node:test';
import assert from 'node:assert/strict';
import { runOntologicalPrimitiveSynthesisCanaryV3 } from '../src/ontological-primitive-synthesis-canary-v3.mjs';

test('v3 never uses held-out or transfer labels to select the primitive', () => {
  const result = runOntologicalPrimitiveSynthesisCanaryV3();
  assert.equal(result.ok, true);
  assert.equal(result.heldOutUsedForPrimitiveSelection, false);
  assert.equal(result.transferLabelsUsedForPrimitiveSelection, false);
});

test('v3 records search and baseline burden even when the falsifier wins', () => {
  const result = runOntologicalPrimitiveSynthesisCanaryV3();
  assert.ok(result.synthesisGrammar.numericExpressionCount > 0);
  assert.ok(result.synthesisGrammar.booleanExpressionCount > 0);
  assert.ok(result.discovery.synthesisExpressionsEvaluated > 0);
  assert.ok(result.discovery.baseExpressionsEvaluated > 0);
  for (const transfer of result.transfers) {
    assert.ok(transfer.transferExpressionsEvaluated > 0);
    assert.ok(transfer.baselineExpressionsEvaluated > 0);
  }
});

test('v3 negative control cannot be silently omitted', () => {
  const result = runOntologicalPrimitiveSynthesisCanaryV3();
  assert.equal(result.negativeControl.taskId, 'NEGATIVE_HASH_CONTROL_V3');
  assert.equal(typeof result.negativeControlPassed, 'boolean');
});

test('v3 remains a narrow synthetic claim regardless of outcome', () => {
  const result = runOntologicalPrimitiveSynthesisCanaryV3();
  if (!result.falsifierTriggered) {
    assert.equal(result.promotionCandidate.authority, 'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  }
  assert.match(result.claimBoundary, /FIXED_META_GRAMMAR/);
  assert.equal(result.externalEffectAuthority, 'NONE');
});


test('v3 transfer benchmark is nondegenerate after numeric XOR normalization', () => {
  const result = runOntologicalPrimitiveSynthesisCanaryV3();
  const xor = result.transfers.find(row => row.taskId === 'TRANSFER_XOR_BIT3');
  assert.ok(xor.baselineScores.MAJORITY_CLASS < 0.90);
});
