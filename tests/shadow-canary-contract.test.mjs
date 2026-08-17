import test from 'node:test';
import assert from 'node:assert/strict';
import { shadowCompare, canaryPromotionGate } from '../src/shadow-canary-contract.mjs';

test('shadowCompare reports agreement when both functions return identical results', () => {
  const result = shadowCompare(x => x * 2, x => x * 2, 5);
  assert.equal(result.agree, true);
  assert.equal(result.affectsProduction, false);
});

test('shadowCompare reports disagreement without throwing or picking a winner', () => {
  const result = shadowCompare(x => x * 2, x => x * 3, 5);
  assert.equal(result.agree, false);
  assert.equal(result.currentResult, 10);
  assert.equal(result.candidateResult, 15);
});

test('shadowCompare catches an exception in either function without crashing the comparison', () => {
  const result = shadowCompare(() => { throw new Error('boom'); }, () => 42, null);
  assert.equal(result.agree, false);
  assert.match(result.currentError, /boom/);
  assert.equal(result.candidateResult, 42);
});

test('shadowCompare invokes both functions with the exact same input', () => {
  const seen = [];
  shadowCompare(x => { seen.push(['current', x]); return x; }, x => { seen.push(['candidate', x]); return x; }, 'the-input');
  assert.deepEqual(seen, [['current', 'the-input'], ['candidate', 'the-input']]);
});

test('canaryPromotionGate denies with no owner approval and no economic proof', () => {
  const result = canaryPromotionGate({});
  assert.equal(result.canPromote, false);
  assert.ok(result.reasons.includes('owner-approval-missing'));
  assert.ok(result.reasons.includes('economic-proof-missing'));
  assert.equal(result.resultingStage, 'CANARY');
});

test('canaryPromotionGate denies with owner approval alone -- approval is necessary but not sufficient', () => {
  const result = canaryPromotionGate({ ownerApproved: true });
  assert.equal(result.canPromote, false);
});

test('canaryPromotionGate denies a SYNTHETIC economic proof even with owner approval -- no synthetic test can create ECONOMICALLY_PROVEN', () => {
  const result = canaryPromotionGate({ ownerApproved: true, economicProof: { isSynthetic: true, realClearedAmountUsd: 1000 } });
  assert.equal(result.canPromote, false);
  assert.ok(result.reasons.includes('economic-proof-is-synthetic-not-real'));
});

test('canaryPromotionGate denies a real but zero/negative cleared amount', () => {
  const result = canaryPromotionGate({ ownerApproved: true, economicProof: { isSynthetic: false, realClearedAmountUsd: 0 } });
  assert.equal(result.canPromote, false);
});

test('canaryPromotionGate allows promotion only with real owner approval AND real positive economic proof together', () => {
  const result = canaryPromotionGate({ ownerApproved: true, economicProof: { isSynthetic: false, realClearedAmountUsd: 49 } });
  assert.equal(result.canPromote, true);
  assert.equal(result.resultingStage, 'ECONOMICALLY_PROVEN');
  assert.deepEqual(result.reasons, []);
});

test('a non-true ownerApproved value (truthy but not === true) is still treated as not approved', () => {
  const result = canaryPromotionGate({ ownerApproved: 'yes', economicProof: { isSynthetic: false, realClearedAmountUsd: 49 } });
  assert.equal(result.canPromote, false);
});
