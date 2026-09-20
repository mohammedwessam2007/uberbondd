import test from 'node:test';
import assert from 'node:assert/strict';
import canaries from '../config/moonshot-reality-canaries.json' with { type: 'json' };
import { compileCanaryProgram, compileCanaryWave } from '../src/moonshot-canary-compiler.mjs';

test('every configured canary compiles into a falsifiable no-authority research packet', () => {
  for (const canary of canaries.canaries) {
    const result = compileCanaryProgram(canary);
    assert.equal(result.ok, true, canary.id);
    assert.equal(result.moonshot.realityState, 'IMAGINED');
    assert.equal(result.executionAuthority, 'NONE');
    assert.ok(result.selectedProbe.falsifier);
    assert.match(result.claimBoundary, /NOT_AN_EXECUTED_EXPERIMENT/);
  }
});

test('canary wave ranks by bounded information value rather than fictional IQ', () => {
  const result = compileCanaryWave({ canaries: canaries.canaries });
  assert.equal(result.ok, true);
  assert.equal(result.compiledCount, 8);
  assert.equal(result.rejectedCount, 0);
  assert.equal(result.nextCandidate.id, 'ontological-computing');
  assert.match(result.law, /NOT_GRANDNESS_OR_FICTIONAL_IQ/);
});

test('missing falsifier is rejected instead of turned into hype', () => {
  const bad = { ...canaries.canaries[0], firstFalsifier: '' };
  const result = compileCanaryProgram(bad);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('first-falsifier-required'));
});
