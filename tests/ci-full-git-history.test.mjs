import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Canon freshness and source ancestry tests require real Git history.
// GitHub Actions checkout defaults to a shallow depth of 1, in which a real
// ancestor becomes unresolvable and produces two false CI failures.
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

function jobSource(name) {
  const needle = `  ${name}:\n`;
  const at = workflow.indexOf(needle);
  assert.ok(at >= 0, `missing CI job ${name}`);
  const source = workflow.slice(at + needle.length);
  const next = source.search(/^  [a-z][a-z0-9_-]*:\s*$/m);
  return next === -1 ? source : source.slice(0, next);
}

for (const name of ['deterministic', 'browser', 'postgres']) {
  test(`${name} gets complete Git history to support canon-ancestor evidence`, () => {
    const source = jobSource(name);
    const checkouts = source.match(/^[ ]{6}- uses: actions\/checkout@v4$/gm) || [];
    assert.equal(checkouts.length, 1, `exactly one checkout expected in ${name}`);
    assert.match(source, /^[ ]{6}- uses: actions\/checkout@v4\n[ ]{8}with:\n[ ]{10}fetch-depth: 0$/m,
      `${name} must not use GitHub checkout's default shallow history`);
  });
}

test('existing core test commands remain intact', () => {
  assert.match(jobSource('deterministic'), /npm run check/);
  assert.match(jobSource('browser'), /npm run test:browser/);
  assert.match(jobSource('postgres'), /npm run test:postgres-real/);
  assert.match(jobSource('postgres'), /postgres:16/);
  assert.doesNotMatch(workflow, /deploy-production|outbound\.send|send-prospect/);
});
