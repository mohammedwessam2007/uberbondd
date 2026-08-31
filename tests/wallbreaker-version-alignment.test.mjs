import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wallbreakerSource = fs.readFileSync(new URL('../src/wallbreaker.mjs', import.meta.url), 'utf8');
const wallbreakerCanon = fs.readFileSync(new URL('../docs/WALLBREAKER_CANON.md', import.meta.url), 'utf8');
const brainBootstrap = fs.readFileSync(new URL('../scripts/uberbond-brain-bootstrap.mjs', import.meta.url), 'utf8');

function extract(pattern, source, label) {
  const match = source.match(pattern);
  assert.ok(match, `${label} version marker missing`);
  return match[1];
}

test('Wallbreaker kernel, canon, and repository brain advertise one policy version', () => {
  const kernel = extract(/WALLBREAKER_POLICY_VERSION\s*=\s*'([^']+)'/, wallbreakerSource, 'kernel');
  const canon = extract(/^Policy:\s*`([^`]+)`/m, wallbreakerCanon, 'canon');
  const brain = extract(/policyVersion:\s*'([^']+)'[\s\S]*?canon:\s*wallbreakerCanonRelative/, brainBootstrap, 'brain');
  assert.equal(kernel, 'wallbreaker-1.1.1');
  assert.equal(canon, kernel);
  assert.equal(brain, kernel);
});
