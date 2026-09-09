import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../scripts/gamechanger-genesis-plan.mjs', import.meta.url), 'utf8');

test('Gamechanger GENESIS adapter has a real local-only operator caller', () => {
  assert.match(script, /import \{ compileGamechangerIntoGenesis \} from ['"]\.\.\/src\/gamechanger-genesis-adapter\.mjs['"]/);
  assert.match(script, /--candidate/);
  assert.match(script, /--extraction/);
  assert.match(script, /--peer-donors/);
  assert.match(script, /compileGamechangerIntoGenesis\(\{/);
});

test('planner cannot silently become a network or provider execution surface', () => {
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /https?:\/\//);
  assert.doesNotMatch(script, /providerCallAuthority\s*:\s*['"](?:YES|GRANTED|AUTHORIZED)['"]/i);
  assert.match(script, /networkCalls:\s*0/);
  assert.match(script, /providerCalls:\s*0/);
  assert.match(script, /businessEffectAuthority:\s*['"]NONE['"]/);
});

test('planner fails closed on missing or malformed typed evidence', () => {
  assert.match(script, /candidate-path-required/);
  assert.match(script, /extraction-path-required/);
  assert.match(script, /peer-donors-path-required/);
  assert.match(script, /process\.exitCode\s*=\s*2/);
});
