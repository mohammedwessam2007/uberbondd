import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const continuation = readFileSync(new URL('../scripts/execution-leaf-continuation-plan.mjs', import.meta.url), 'utf8');
const volitional = readFileSync(new URL('../scripts/volitional-integrity-review.mjs', import.meta.url), 'utf8');

test('execution continuation has a real local operator entry point over canonical graph', () => {
  assert.match(continuation, /execution-leaf-continuation\.mjs/);
  assert.match(continuation, /canonical-execution-leaf-graph\.json/);
  assert.match(continuation, /compileExecutionLeafContinuation\(\{/);
  assert.match(continuation, /buildExecutionLeafContinuationCheckpoint\(\{/);
  assert.doesNotMatch(continuation, /\bfetch\s*\(/);
  assert.match(continuation, /executionAuthority:\s*['"]NONE['"]/);
  assert.match(continuation, /businessEffectAuthority:\s*['"]NONE['"]/);
});

test('volitional review is callable without importing or opening founder private vault', () => {
  assert.match(volitional, /volitional-integrity\.mjs/);
  assert.match(volitional, /assessVolitionalIntegrity\(\{/);
  assert.match(volitional, /presentWillBoundary\(\{/);
  assert.doesNotMatch(volitional, /personal-civilization-private/);
  assert.doesNotMatch(volitional, /PRIVATE_LIFE_KEY|loadPrivateState|savePrivateState/);
  assert.doesNotMatch(volitional, /\bfetch\s*\(/);
  assert.match(volitional, /privateVaultAccess:\s*false/);
  assert.match(volitional, /choiceAuthority:\s*['"]FOUNDER_ONLY['"]/);
  assert.match(volitional, /businessEffectAuthority:\s*['"]NONE['"]/);
});
